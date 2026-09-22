/**
 * TopicTile — local lexical topic segmentation for transcript-first clip proposals.
 *
 * The approach is inspired by Hearst-style TextTiling as used by
 * luis-henrique-carvalho/viralforge (MIT), but this is an original TypeScript
 * implementation: tokenize -> block vectors -> gap similarity -> smoothing ->
 * depth peaks -> timed segments. It does not copy or vendor upstream Python.
 */

export type TopicTileAction = "segment" | "demo" | "defaults";

export type TopicTileWord = {
  word: string;
  start_sec: number;
  end_sec: number;
};

export type TopicTileRequest = {
  action?: TopicTileAction;
  transcript?: string;
  words?: TopicTileWord[];
  media_duration_sec?: number;
  block_size?: number;
  window_k?: number;
  min_segment_sec?: number;
  max_segment_sec?: number;
  demo?: boolean;
};

export type TopicTileBoundary = {
  at_sec: number;
  char_index: number;
  gap_similarity: number;
  depth_score: number;
  reason: "topic-shift" | "max-duration";
};

export type TopicTileSegment = {
  id: string;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  transcript: string;
  cohesion: number;
  label: string;
};

export type TopicTileDefaults = {
  block_size: number;
  window_k: number;
  min_segment_sec: number;
  max_segment_sec: number;
};

export type TopicTileResult = {
  ok: true;
  source: "topic-tile-1.0";
  action: TopicTileAction;
  media_duration_sec: number | null;
  token_count: number;
  block_count: number;
  boundaries: TopicTileBoundary[];
  segments: TopicTileSegment[];
  defaults: TopicTileDefaults;
  summary: string;
};

export type TopicTileParseResult =
  | { ok: true; request: TopicTileRequest }
  | { ok: false; error: string };

type LexicalToken = {
  text: string;
  term: string;
  start: number;
  end: number;
  allIndex: number;
  sentenceEnd: boolean;
};

type TokenBlock = {
  startToken: number;
  endToken: number;
  startChar: number;
  endChar: number;
  counts: Map<string, number>;
};

type GapScore = {
  index: number;
  charIndex: number;
  similarity: number;
  smoothed: number;
  depth: number;
  time: number;
};

const DEFAULTS: TopicTileDefaults = {
  block_size: 10,
  window_k: 2,
  min_segment_sec: 8,
  max_segment_sec: 45,
};

const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "as", "at", "be", "because", "been", "before", "being", "below",
  "between", "both", "but", "by", "can", "could", "did", "do", "does", "doing",
  "down", "during", "each", "few", "for", "from", "further", "had", "has", "have",
  "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "how",
  "i", "if", "in", "into", "is", "it", "its", "itself", "just", "me", "more",
  "most", "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once",
  "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own", "same",
  "she", "should", "so", "some", "such", "than", "that", "the", "their", "theirs",
  "them", "themselves", "then", "there", "these", "they", "this", "those", "through",
  "to", "too", "under", "until", "up", "very", "was", "we", "were", "what", "when",
  "where", "which", "while", "who", "whom", "why", "will", "with", "would", "you",
  "your", "yours", "yourself", "yourselves", "yeah", "okay", "ok", "um", "uh",
]);

const DEMO_TRANSCRIPT = [
  "A camera crew prepares the studio camera for a product shoot. The camera operator compares a wide lens with a portrait lens, adjusts the key light, and checks the soft light on the backdrop. The director repeats the lighting test and locks the final camera angle before recording.",
  "In the kitchen garden, tomato seedlings need rich soil and steady water. The gardener mixes compost into each garden bed, trims basil leaves, and moves the tomato pots into morning sun. Healthy roots, moist soil, and regular watering keep the vegetable harvest growing.",
  "Space weather begins when a solar flare erupts from the sun. Charged particles race through space toward Earth, where satellites measure the radiation and scientists forecast an aurora. The solar storm can disturb radio signals, so mission teams protect satellites and monitor the magnetic field.",
].join(" ");

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stem(value: string): string {
  let term = value.toLowerCase().replace(/[’]/g, "'");
  if (term.length > 6 && term.endsWith("ing")) term = term.slice(0, -3);
  else if (term.length > 5 && term.endsWith("ed")) term = term.slice(0, -2);
  else if (term.length > 5 && term.endsWith("es")) term = term.slice(0, -2);
  else if (term.length > 4 && term.endsWith("s") && !term.endsWith("ss")) term = term.slice(0, -1);
  return term;
}

function tokenize(transcript: string): { all: LexicalToken[]; content: LexicalToken[] } {
  const all: LexicalToken[] = [];
  const matcher = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(transcript)) !== null) {
    const text = match[0].toLowerCase().replace(/[’]/g, "'");
    const start = match.index;
    const end = start + match[0].length;
    const punctuation = transcript.slice(end, Math.min(transcript.length, end + 5));
    all.push({
      text,
      term: stem(text),
      start,
      end,
      allIndex: all.length,
      sentenceEnd: /^[\s]*[.!?]/.test(punctuation),
    });
  }
  return {
    all,
    content: all.filter((token) => token.term.length > 1 && !STOPWORDS.has(token.text)),
  };
}

function countTerms(tokens: LexicalToken[], start: number, end: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = start; i < end; i += 1) {
    counts.set(tokens[i].term, (counts.get(tokens[i].term) || 0) + 1);
  }
  return counts;
}

function buildBlocks(tokens: LexicalToken[], blockSize: number): TokenBlock[] {
  const blocks: TokenBlock[] = [];
  let start = 0;
  while (start < tokens.length) {
    const nominal = Math.min(tokens.length, start + blockSize);
    let end = nominal;
    if (nominal < tokens.length) {
      const radius = Math.max(1, Math.floor(blockSize / 3));
      const low = Math.max(start + Math.ceil(blockSize * 0.6), nominal - radius);
      const high = Math.min(tokens.length - 1, nominal + radius);
      let best = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let i = low; i <= high; i += 1) {
        if (!tokens[i - 1]?.sentenceEnd) continue;
        const distance = Math.abs(i - nominal);
        if (distance < bestDistance) {
          best = i;
          bestDistance = distance;
        }
      }
      if (best > start) end = best;
    }
    blocks.push({
      startToken: start,
      endToken: end,
      startChar: tokens[start].start,
      endChar: tokens[end - 1].end,
      counts: countTerms(tokens, start, end),
    });
    start = end;
  }
  return blocks;
}

function documentFrequency(blocks: TokenBlock[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const block of blocks) {
    for (const term of block.counts.keys()) df.set(term, (df.get(term) || 0) + 1);
  }
  return df;
}

function poolVector(
  blocks: TokenBlock[],
  start: number,
  end: number,
  df: Map<string, number>
): Map<string, number> {
  const pooled = new Map<string, number>();
  for (let i = start; i < end; i += 1) {
    for (const [term, count] of blocks[i].counts) {
      const idf = Math.log((blocks.length + 1) / ((df.get(term) || 0) + 1)) + 1;
      pooled.set(term, (pooled.get(term) || 0) + count * idf);
    }
  }
  return pooled;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, value] of a) {
    normA += value * value;
    dot += value * (b.get(term) || 0);
  }
  for (const value of b.values()) normB += value * value;
  if (normA === 0 || normB === 0) return 0;
  return clamp(dot / Math.sqrt(normA * normB), 0, 1);
}

function timeAtChar(
  charIndex: number,
  transcriptLength: number,
  allTokens: LexicalToken[],
  words: TopicTileWord[],
  duration: number
): number {
  if (words.length > 0 && allTokens.length > 0) {
    const tokenBefore = [...allTokens].reverse().find((token) => token.end <= charIndex);
    const tokenRatio = tokenBefore
      ? (tokenBefore.allIndex + 1) / allTokens.length
      : clamp(charIndex / Math.max(1, transcriptLength), 0, 1);
    const nextIndex = clamp(Math.round(tokenRatio * words.length), 0, words.length);
    if (nextIndex <= 0) return 0;
    if (nextIndex >= words.length) return duration;
    return clamp((words[nextIndex - 1].end_sec + words[nextIndex].start_sec) / 2, 0, duration);
  }
  return clamp((charIndex / Math.max(1, transcriptLength)) * duration, 0, duration);
}

function computeGapScores(
  blocks: TokenBlock[],
  windowK: number,
  transcriptLength: number,
  allTokens: LexicalToken[],
  words: TopicTileWord[],
  duration: number
): GapScore[] {
  if (blocks.length < 2) return [];
  const df = documentFrequency(blocks);
  const raw = blocks.slice(0, -1).map((block, index) => {
    const left = poolVector(blocks, Math.max(0, index - windowK + 1), index + 1, df);
    const right = poolVector(blocks, index + 1, Math.min(blocks.length, index + 1 + windowK), df);
    return {
      index,
      charIndex: block.endChar,
      similarity: cosine(left, right),
    };
  });

  const smoothed = raw.map((gap, index) => {
    const previous = raw[index - 1]?.similarity ?? gap.similarity;
    const next = raw[index + 1]?.similarity ?? gap.similarity;
    return previous * 0.25 + gap.similarity * 0.5 + next * 0.25;
  });
  const depthWindow = Math.max(2, windowK + 1);

  return raw.map((gap, index) => {
    const leftValues = smoothed.slice(Math.max(0, index - depthWindow), index);
    const rightValues = smoothed.slice(index + 1, Math.min(smoothed.length, index + depthWindow + 1));
    const leftPeak = leftValues.length ? Math.max(...leftValues) : smoothed[index];
    const rightPeak = rightValues.length ? Math.max(...rightValues) : smoothed[index];
    const depth = Math.max(0, leftPeak - smoothed[index]) + Math.max(0, rightPeak - smoothed[index]);
    return {
      ...gap,
      smoothed: smoothed[index],
      depth,
      time: timeAtChar(gap.charIndex, transcriptLength, allTokens, words, duration),
    };
  });
}

function localDepthCandidates(gaps: GapScore[]): GapScore[] {
  if (!gaps.length) return [];
  const positive = gaps.map((gap) => gap.depth).filter((value) => value > 0);
  if (!positive.length) return [];
  const mean = positive.reduce((sum, value) => sum + value, 0) / positive.length;
  const variance = positive.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / positive.length;
  const threshold = mean + Math.sqrt(variance) * 0.2;
  const candidates = gaps.filter((gap, index) => {
    const previous = gaps[index - 1]?.depth ?? -1;
    const next = gaps[index + 1]?.depth ?? -1;
    return gap.depth >= threshold && gap.depth >= previous && gap.depth >= next;
  });
  if (candidates.length) return candidates;
  const strongest = [...gaps].sort((a, b) => b.depth - a.depth)[0];
  return strongest.depth > 0.02 ? [strongest] : [];
}

function snapCharToToken(charIndex: number, tokens: LexicalToken[], transcriptLength: number): number {
  if (!tokens.length) return clamp(Math.round(charIndex), 1, Math.max(1, transcriptLength - 1));
  let best = tokens[0].end;
  let distance = Math.abs(best - charIndex);
  for (const token of tokens) {
    const nextDistance = Math.abs(token.end - charIndex);
    if (nextDistance < distance) {
      best = token.end;
      distance = nextDistance;
    }
  }
  return clamp(best, 1, Math.max(1, transcriptLength - 1));
}

function chooseBoundaries(
  gaps: GapScore[],
  allTokens: LexicalToken[],
  transcriptLength: number,
  words: TopicTileWord[],
  duration: number,
  minSegment: number,
  maxSegment: number
): TopicTileBoundary[] {
  const selected: TopicTileBoundary[] = [];
  const candidates = localDepthCandidates(gaps).sort((a, b) => b.depth - a.depth);
  for (const gap of candidates) {
    const times = [0, ...selected.map((item) => item.at_sec), duration].sort((a, b) => a - b);
    const insertion = times.findIndex((time) => time > gap.time);
    const left = times[Math.max(0, insertion - 1)];
    const right = times[insertion < 0 ? times.length - 1 : insertion];
    if (gap.time - left < minSegment || right - gap.time < minSegment) continue;
    selected.push({
      at_sec: round3(gap.time),
      char_index: gap.charIndex,
      gap_similarity: round3(gap.similarity),
      depth_score: round3(gap.depth),
      reason: "topic-shift",
    });
  }

  let guard = 0;
  while (guard < 100) {
    guard += 1;
    const ordered = [
      { at_sec: 0, char_index: 0 },
      ...selected.sort((a, b) => a.at_sec - b.at_sec),
      { at_sec: duration, char_index: transcriptLength },
    ];
    const longIndex = ordered.findIndex((item, index) => (
      index < ordered.length - 1 && ordered[index + 1].at_sec - item.at_sec > maxSegment + 0.001
    ));
    if (longIndex < 0) break;
    const left = ordered[longIndex];
    const right = ordered[longIndex + 1];
    const low = left.at_sec + minSegment;
    const high = Math.min(left.at_sec + maxSegment, right.at_sec - minSegment);
    if (high < low) break;

    const available = gaps
      .filter((gap) => gap.time >= low && gap.time <= high)
      .filter((gap) => !selected.some((item) => Math.abs(item.at_sec - gap.time) < 0.01))
      .sort((a, b) => (b.depth - a.depth) || (a.similarity - b.similarity));
    const gap = available[0];
    if (gap) {
      selected.push({
        at_sec: round3(gap.time),
        char_index: gap.charIndex,
        gap_similarity: round3(gap.similarity),
        depth_score: round3(gap.depth),
        reason: "max-duration",
      });
      continue;
    }

    const targetTime = high;
    const rawChar = (targetTime / Math.max(0.001, duration)) * transcriptLength;
    const charIndex = snapCharToToken(rawChar, allTokens, transcriptLength);
    const atSec = timeAtChar(charIndex, transcriptLength, allTokens, words, duration);
    if (atSec <= left.at_sec + 0.01 || atSec >= right.at_sec - 0.01) break;
    selected.push({
      at_sec: round3(atSec),
      char_index: charIndex,
      gap_similarity: 0,
      depth_score: 0,
      reason: "max-duration",
    });
  }

  return selected.sort((a, b) => a.at_sec - b.at_sec);
}

function segmentLabel(tokens: LexicalToken[], start: number, end: number, index: number): string {
  const counts = new Map<string, { count: number; surface: string; first: number }>();
  for (const token of tokens) {
    if (token.start < start || token.end > end) continue;
    const current = counts.get(token.term);
    counts.set(token.term, {
      count: (current?.count || 0) + 1,
      surface: current?.surface || token.text,
      first: current?.first ?? token.start,
    });
  }
  const top = [...counts.values()]
    .sort((a, b) => (b.count - a.count) || (a.first - b.first))
    .slice(0, 3)
    .map((item) => item.surface);
  return top.length ? `Topic ${index + 1} · ${top.join(" / ")}` : `Topic ${index + 1}`;
}

function segmentCohesion(gaps: GapScore[], start: number, end: number): number {
  const internal = gaps.filter((gap) => gap.charIndex > start && gap.charIndex < end);
  if (!internal.length) return 0.65;
  const average = internal.reduce((sum, gap) => sum + gap.similarity, 0) / internal.length;
  return round3(clamp(average, 0, 1));
}

function parseWords(raw: unknown): TopicTileWord[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const words: TopicTileWord[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    const word = readString(row.word ?? row.text);
    const start = readNumber(row.start_sec ?? row.start);
    const end = readNumber(row.end_sec ?? row.end);
    if (!word || start === undefined || end === undefined || start < 0 || end < start) return null;
    words.push({ word, start_sec: round3(start), end_sec: round3(end) });
  }
  return words.sort((a, b) => a.start_sec - b.start_sec);
}

export function parseTopicTileRequest(body: Record<string, unknown>): TopicTileParseResult {
  const actionRaw = body.demo === true ? "demo" : (readString(body.action).toLowerCase() || "segment");
  if (!(["segment", "demo", "defaults"] as string[]).includes(actionRaw)) {
    return { ok: false, error: "action must be segment | demo | defaults." };
  }
  const action = actionRaw as TopicTileAction;
  if (action === "defaults") return { ok: true, request: { action } };
  if (action === "demo") return { ok: true, request: { action, demo: true } };

  const words = parseWords(body.words);
  if (words === null) {
    return { ok: false, error: "words must be an array of {word,start_sec,end_sec}." };
  }
  const transcript = readString(body.transcript) || words.map((item) => item.word).join(" ");
  if (!transcript) return { ok: false, error: "Pass transcript or timed words[]." };

  const blockSize = readNumber(body.block_size) ?? DEFAULTS.block_size;
  const windowK = readNumber(body.window_k) ?? DEFAULTS.window_k;
  const minSegment = readNumber(body.min_segment_sec) ?? DEFAULTS.min_segment_sec;
  const maxSegment = readNumber(body.max_segment_sec) ?? DEFAULTS.max_segment_sec;
  const duration = readNumber(body.media_duration_sec);
  if (!Number.isInteger(blockSize) || blockSize < 4 || blockSize > 80) {
    return { ok: false, error: "block_size must be an integer from 4 to 80." };
  }
  if (!Number.isInteger(windowK) || windowK < 1 || windowK > 8) {
    return { ok: false, error: "window_k must be an integer from 1 to 8." };
  }
  if (minSegment <= 0 || maxSegment <= minSegment) {
    return { ok: false, error: "Use min_segment_sec > 0 and max_segment_sec > min_segment_sec." };
  }
  if (duration !== undefined && duration <= 0) {
    return { ok: false, error: "media_duration_sec must be greater than zero." };
  }

  return {
    ok: true,
    request: {
      action,
      transcript,
      words,
      media_duration_sec: duration,
      block_size: blockSize,
      window_k: windowK,
      min_segment_sec: minSegment,
      max_segment_sec: maxSegment,
    },
  };
}

export function runTopicTile(request: TopicTileRequest): TopicTileResult {
  const action: TopicTileAction = request.demo || request.action === "demo"
    ? "demo"
    : request.action || "segment";
  if (action === "defaults") {
    return {
      ok: true,
      source: "topic-tile-1.0",
      action,
      media_duration_sec: null,
      token_count: 0,
      block_count: 0,
      boundaries: [],
      segments: [],
      defaults: { ...DEFAULTS },
      summary: "Recommended TopicTile lexical segmentation defaults.",
    };
  }

  const transcript = action === "demo"
    ? DEMO_TRANSCRIPT
    : readString(request.transcript) || (request.words || []).map((item) => item.word).join(" ");
  const words = action === "demo" ? [] : (request.words || []);
  const blockSize = Math.round(request.block_size ?? DEFAULTS.block_size);
  const windowK = Math.round(request.window_k ?? DEFAULTS.window_k);
  const minSegment = request.min_segment_sec ?? DEFAULTS.min_segment_sec;
  const maxSegment = request.max_segment_sec ?? DEFAULTS.max_segment_sec;
  const tokenized = tokenize(transcript);
  const inferredDuration = Math.max(1, tokenized.all.length / 2.4);
  const lastWordEnd = words.length ? words[words.length - 1].end_sec : 0;
  const duration = action === "demo"
    ? 96
    : Math.max(request.media_duration_sec ?? lastWordEnd ?? inferredDuration, lastWordEnd, inferredDuration);

  if (!tokenized.all.length) {
    return {
      ok: true,
      source: "topic-tile-1.0",
      action,
      media_duration_sec: round3(duration),
      token_count: 0,
      block_count: 0,
      boundaries: [],
      segments: [],
      defaults: { block_size: blockSize, window_k: windowK, min_segment_sec: minSegment, max_segment_sec: maxSegment },
      summary: "No lexical tokens were available to segment.",
    };
  }

  const lexical = tokenized.content.length ? tokenized.content : tokenized.all;
  const blocks = buildBlocks(lexical, blockSize);
  const gaps = computeGapScores(
    blocks,
    windowK,
    transcript.length,
    tokenized.all,
    words,
    duration
  );
  const boundaries = chooseBoundaries(
    gaps,
    tokenized.all,
    transcript.length,
    words,
    duration,
    minSegment,
    maxSegment
  );
  const points = [
    { at_sec: 0, char_index: 0 },
    ...boundaries,
    { at_sec: duration, char_index: transcript.length },
  ];
  const segments: TopicTileSegment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const slice = transcript
      .slice(start.char_index, end.char_index)
      .replace(/^[\s,;:.!?–—-]+/, "")
      .trim();
    if (!slice) continue;
    segments.push({
      id: `topic-${String(segments.length + 1).padStart(2, "0")}`,
      start_sec: round3(start.at_sec),
      end_sec: round3(end.at_sec),
      duration_sec: round3(end.at_sec - start.at_sec),
      transcript: slice,
      cohesion: segmentCohesion(gaps, start.char_index, end.char_index),
      label: segmentLabel(lexical, start.char_index, end.char_index, segments.length),
    });
  }

  return {
    ok: true,
    source: "topic-tile-1.0",
    action,
    media_duration_sec: round3(duration),
    token_count: tokenized.all.length,
    block_count: blocks.length,
    boundaries,
    segments,
    defaults: {
      block_size: blockSize,
      window_k: windowK,
      min_segment_sec: minSegment,
      max_segment_sec: maxSegment,
    },
    summary: `TopicTile proposed ${segments.length} topic-coherent clip window${segments.length === 1 ? "" : "s"} from ${blocks.length} lexical blocks without AI.`,
  };
}
