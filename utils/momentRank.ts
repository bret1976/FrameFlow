/**
 * MomentRank — multi-candidate viral-moment scoring + diversity pick.
 * Idea inspired by tospakX/MediaViralClipper (MIT; reimplement only —
 * original FrameFlow TypeScript, no clone of their Python pipeline).
 * Differs from Viral Judge: ranks many timed windows, suppresses overlap
 * and lexical near-dupes, and picks an automatic clip count from duration.
 * Pure functions, local-first, no network / API keys.
 */

export type MomentCandidate = {
  id?: string;
  start_sec: number;
  end_sec: number;
  transcript: string;
  features?: {
    scene_changes?: number;
    audio_peak?: number;
    dialogue_density?: number;
    pause_mean?: number;
  };
};

export type MomentAxes = {
  humor: number;
  punchline: number;
  surprise: number;
  quotability: number;
  hook: number;
  standalone: number;
  pacing: number;
  reaction: number;
  retention: number;
  overall: number;
};

export type RankedMoment = {
  id: string;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  transcript: string;
  scores: MomentAxes;
  strongest: keyof Omit<MomentAxes, "overall">;
  explanation: string;
};

export type MomentRankRequest = {
  action?: "rank" | "demo";
  candidates?: MomentCandidate[];
  media_duration_sec?: number;
  count?: number;
  min_duration_sec?: number;
  max_duration_sec?: number;
  demo?: boolean;
};

export type MomentRankResult = {
  ok: true;
  action: string;
  source: "moment-rank-1.0";
  media_duration_sec: number | null;
  candidate_count: number;
  auto_count: number;
  selected: RankedMoment[];
  ranked: RankedMoment[];
  summary: string;
};

const SURPRISE = new Set([
  "what",
  "wait",
  "impossible",
  "suddenly",
  "actually",
  "seriously",
  "why",
  "how",
  "never",
  "shock",
]);
const HUMOR = new Set([
  "haha",
  "ha",
  "joke",
  "ridiculous",
  "weird",
  "absurd",
  "lol",
  "lmao",
  "funny",
]);
const REACTION = new Set([
  "wow",
  "what",
  "no",
  "yes",
  "oh",
  "whoa",
  "really",
  "seriously",
  "omg",
]);
const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "in",
  "is",
  "it",
  "that",
  "this",
  "for",
  "on",
  "with",
]);

const DEMO_CANDIDATES: MomentCandidate[] = [
  {
    id: "demo-1",
    start_sec: 12,
    end_sec: 28,
    transcript: "Wait — what if the whole playbook was wrong? Watch this.",
    features: { scene_changes: 2, audio_peak: 0.7, dialogue_density: 0.8 },
  },
  {
    id: "demo-2",
    start_sec: 45,
    end_sec: 61,
    transcript: "And then she said the budget was fine. No. Seriously. No.",
    features: { scene_changes: 1, audio_peak: 0.9, dialogue_density: 0.6 },
  },
  {
    id: "demo-3",
    start_sec: 90,
    end_sec: 108,
    transcript: "Here are three mistakes every creator makes on day one.",
    features: { scene_changes: 0, audio_peak: 0.4, dialogue_density: 0.7 },
  },
  {
    id: "demo-4",
    start_sec: 50,
    end_sec: 66,
    transcript: "And then she said the budget was fine. Wait — seriously?",
    features: { scene_changes: 1, audio_peak: 0.85, dialogue_density: 0.55 },
  },
  {
    id: "demo-5",
    start_sec: 140,
    end_sec: 155,
    transcript: "Subscribe if this saved you an hour. Link in the description.",
    features: { scene_changes: 0, audio_peak: 0.3, dialogue_density: 0.4 },
  },
];

const cap = (value: number) => Math.max(0, Math.min(1, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

const tokens = (text: string) =>
  (text.toLowerCase().match(/[\w']+/g) || []).filter(Boolean);

function scoreCandidate(c: MomentCandidate): RankedMoment {
  const text = (c.transcript || "").trim();
  const words = tokens(text);
  const wordSet = new Set(words);
  const questions = (text.match(/\?/g) || []).length;
  const exclamations = (text.match(/!/g) || []).length;
  const turns = Math.max(1, (text.match(/\./g) || []).length + questions + exclamations);
  const features = c.features || {};
  const visualChange = Math.min(1, (features.scene_changes ?? 0) / 3);
  const audioPeak = Math.min(1, features.audio_peak ?? 0);
  const density =
    features.dialogue_density ?? Math.min(1, words.length / 50);
  const pauseMean = features.pause_mean ?? 0;

  const humor = cap(
    0.12 + 0.18 * [...wordSet].filter((w) => HUMOR.has(w)).length + 0.08 * exclamations
  );
  const surprise = cap(
    0.08 +
      0.16 * [...wordSet].filter((w) => SURPRISE.has(w)).length +
      0.1 * questions +
      0.08 * visualChange
  );
  const punchline = cap(0.12 + 0.2 * exclamations + 0.12 * questions + 0.25 * humor);
  const quotability = cap(words.length >= 4 && words.length <= 45 ? 0.65 : 0.35);
  const hook = cap(
    0.15 +
      0.2 * ([...wordSet].some((w) => SURPRISE.has(w)) ? 1 : 0) +
      0.12 * (text.slice(0, 40).match(/\?/g) || []).length
  );
  const standalone = cap(
    0.35 + 0.1 * turns - (text.toLowerCase().startsWith("and ") || text.toLowerCase().startsWith("but ") ? 0.15 : 0)
  );
  const pacing = cap(0.25 + 0.6 * density - 0.1 * Math.max(0, pauseMean - 1));
  const reaction = cap(
    0.1 +
      0.13 * [...wordSet].filter((w) => REACTION.has(w)).length +
      0.08 * exclamations +
      0.18 * audioPeak
  );
  const retention = cap(
    0.23 * hook + 0.23 * punchline + 0.22 * pacing + 0.22 * surprise + 0.1 * visualChange
  );
  const overall = cap(
    0.18 * humor +
      0.16 * punchline +
      0.1 * surprise +
      0.08 * quotability +
      0.14 * hook +
      0.13 * standalone +
      0.08 * pacing +
      0.05 * reaction +
      0.08 * retention
  );

  const axes: Omit<MomentAxes, "overall"> = {
    humor: round2(humor),
    punchline: round2(punchline),
    surprise: round2(surprise),
    quotability: round2(quotability),
    hook: round2(hook),
    standalone: round2(standalone),
    pacing: round2(pacing),
    reaction: round2(reaction),
    retention: round2(retention),
  };
  const strongest = (Object.keys(axes) as (keyof typeof axes)[]).reduce((best, key) =>
    axes[key] > axes[best] ? key : best
  );

  const start = Number(c.start_sec) || 0;
  const end = Math.max(start + 0.1, Number(c.end_sec) || start + 0.1);
  const id =
    (typeof c.id === "string" && c.id.trim()) ||
    `m-${Math.round(start * 10)}-${Math.round(end * 10)}`;

  return {
    id,
    start_sec: round2(start),
    end_sec: round2(end),
    duration_sec: round2(end - start),
    transcript: text,
    scores: { ...axes, overall: round2(overall) },
    strongest,
    explanation: `Selected for strong ${strongest}; scored locally from dialogue, timing, and punctuation.`,
  };
}

function lexicalOverlap(a: string, b: string): number {
  const aw = new Set(tokens(a).filter((w) => !STOP.has(w)));
  const bw = new Set(tokens(b).filter((w) => !STOP.has(w)));
  if (!aw.size || !bw.size) return 0;
  let inter = 0;
  for (const w of aw) if (bw.has(w)) inter += 1;
  return inter / Math.max(aw.size, bw.size);
}

function timeOverlap(a: RankedMoment, b: RankedMoment): number {
  const overlap = Math.max(0, Math.min(a.end_sec, b.end_sec) - Math.max(a.start_sec, b.start_sec));
  const shorter = Math.max(0.1, Math.min(a.duration_sec, b.duration_sec));
  return overlap / shorter;
}

function similarity(a: RankedMoment, b: RankedMoment): number {
  return Math.max(timeOverlap(a, b), lexicalOverlap(a.transcript, b.transcript));
}

export function chooseDiverse(
  ranked: RankedMoment[],
  count: number,
  minimum = 1
): RankedMoment[] {
  const chosen: RankedMoment[] = [];
  const remaining = [...ranked];
  while (remaining.length && chosen.length < count) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      const penalty =
        chosen.length === 0
          ? 0
          : Math.max(...chosen.map((old) => similarity(item, old)));
      const adjusted = item.scores.overall - 0.75 * penalty;
      if (adjusted > bestScore) {
        bestScore = adjusted;
        bestIdx = i;
      }
    }
    const best = remaining[bestIdx];
    const penalty =
      chosen.length === 0 ? 0 : Math.max(...chosen.map((old) => similarity(best, old)));
    if (penalty < 0.72 || chosen.length < Math.min(minimum, count)) {
      chosen.push(best);
    }
    remaining.splice(bestIdx, 1);
  }
  return chosen;
}

export function automaticClipCount(
  ranked: RankedMoment[],
  mediaDuration: number | null
): number {
  if (!ranked.length) return 0;
  const minimum = Math.min(2, ranked.length);
  const duration = mediaDuration && mediaDuration > 0 ? mediaDuration : 600;
  const runtimeTarget = Math.max(2, Math.min(8, Math.ceil(duration / 600) + 1));
  const qualityFloor = Math.max(0.25, ranked[0].scores.overall * 0.65);
  const viable = ranked.filter((r) => r.scores.overall >= qualityFloor).length;
  return Math.min(ranked.length, runtimeTarget, Math.max(minimum, viable));
}

function windowTranscript(full: string, start: number, end: number, media: number): string {
  if (!full.trim() || !(media > 0)) return full.trim();
  const a = Math.max(0, Math.min(1, start / media));
  const b = Math.max(a, Math.min(1, end / media));
  const i0 = Math.floor(a * full.length);
  const i1 = Math.max(i0 + 1, Math.ceil(b * full.length));
  return full.slice(i0, i1).trim();
}

/** Build sliding dialogue windows from a single transcript when candidates are absent. */
export function buildWindowsFromTranscript(
  transcript: string,
  mediaDurationSec: number,
  minDur = 8,
  maxDur = 45
): MomentCandidate[] {
  const text = transcript.trim();
  if (!text || !(mediaDurationSec > 0)) return [];
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length === 0) return [];
  const out: MomentCandidate[] = [];
  const step = Math.max(minDur, Math.min(20, (minDur + maxDur) / 2));
  for (let t = 0; t < mediaDurationSec - minDur; t += step) {
    const end = Math.min(mediaDurationSec, t + maxDur);
    const slice = windowTranscript(text, t, end, mediaDurationSec);
    if (slice.length < 12) continue;
    out.push({
      id: `win-${Math.round(t)}-${Math.round(end)}`,
      start_sec: round2(t),
      end_sec: round2(end),
      transcript: slice,
      features: {
        dialogue_density: Math.min(1, tokens(slice).length / 50),
        scene_changes: slice.includes("?") || slice.includes("!") ? 1 : 0,
      },
    });
    if (out.length >= 24) break;
  }
  return out;
}

export function parseMomentRankRequest(
  body: Record<string, unknown>
): { ok: true; request: MomentRankRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const demo = Boolean(body.demo);
  const actionRaw =
    typeof body.action === "string" ? body.action : demo ? "demo" : "rank";
  if (actionRaw !== "rank" && actionRaw !== "demo") {
    return { ok: false, error: `Unknown action “${actionRaw}”.` };
  }

  const candidates: MomentCandidate[] = [];
  if (Array.isArray(body.candidates)) {
    for (const raw of body.candidates.slice(0, 80)) {
      if (!raw || typeof raw !== "object") continue;
      const c = raw as Record<string, unknown>;
      const start = Number(c.start_sec);
      const end = Number(c.end_sec);
      const transcript = typeof c.transcript === "string" ? c.transcript.trim() : "";
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      if (!transcript) continue;
      const features =
        c.features && typeof c.features === "object"
          ? (c.features as MomentCandidate["features"])
          : undefined;
      candidates.push({
        id: typeof c.id === "string" ? c.id : undefined,
        start_sec: start,
        end_sec: end,
        transcript,
        features,
      });
    }
  }

  const media =
    typeof body.media_duration_sec === "number" && body.media_duration_sec > 0
      ? body.media_duration_sec
      : undefined;
  const transcriptOnly =
    typeof body.transcript === "string" ? body.transcript.trim() : "";

  if (
    !demo &&
    actionRaw === "rank" &&
    candidates.length === 0 &&
    transcriptOnly &&
    media
  ) {
    // allow transcript+duration shorthand
    (body as any)._auto = true;
  }

  if (!demo && actionRaw === "rank" && candidates.length === 0 && !(transcriptOnly && media)) {
    return {
      ok: false,
      error:
        "Send candidates[{start_sec,end_sec,transcript}] or {transcript, media_duration_sec}, or demo:true.",
    };
  }

  return {
    ok: true,
    request: {
      action: actionRaw,
      candidates:
        candidates.length > 0
          ? candidates
          : transcriptOnly && media
            ? buildWindowsFromTranscript(
                transcriptOnly,
                media,
                typeof body.min_duration_sec === "number" ? body.min_duration_sec : 8,
                typeof body.max_duration_sec === "number" ? body.max_duration_sec : 45
              )
            : undefined,
      media_duration_sec: media,
      count:
        typeof body.count === "number" && body.count > 0
          ? Math.min(20, Math.floor(body.count))
          : undefined,
      min_duration_sec:
        typeof body.min_duration_sec === "number" ? body.min_duration_sec : undefined,
      max_duration_sec:
        typeof body.max_duration_sec === "number" ? body.max_duration_sec : undefined,
      demo,
    },
  };
}

export function runMomentRank(request: MomentRankRequest): MomentRankResult {
  const action = request.demo ? "demo" : request.action || "rank";
  const pool =
    action === "demo"
      ? DEMO_CANDIDATES
      : request.candidates && request.candidates.length
        ? request.candidates
        : DEMO_CANDIDATES;

  const minD = request.min_duration_sec ?? 5;
  const maxD = request.max_duration_sec ?? 90;
  const filtered = pool.filter((c) => {
    const dur = (c.end_sec || 0) - (c.start_sec || 0);
    return dur >= minD && dur <= maxD && (c.transcript || "").trim().length >= 8;
  });

  const ranked = filtered
    .map(scoreCandidate)
    .sort((a, b) => b.scores.overall - a.scores.overall || a.start_sec - b.start_sec);

  const media = request.media_duration_sec ?? (action === "demo" ? 180 : null);
  const auto = automaticClipCount(ranked, media);
  const count = request.count ?? auto;
  const selected = chooseDiverse(ranked, count, 1);

  const top = selected[0];
  const summary =
    action === "demo"
      ? `Demo: picked ${selected.length}/${ranked.length} diverse moments · top ${top?.id || "—"} overall ${top?.scores.overall ?? 0} (${top?.strongest || "n/a"}).`
      : selected.length
        ? `Selected ${selected.length} of ${ranked.length} candidates (auto ${auto}) · top ${top.id} @ ${top.start_sec}s–${top.end_sec}s overall ${top.scores.overall}.`
        : "No viable moments — widen duration bounds or send richer transcripts.";

  return {
    ok: true,
    action,
    source: "moment-rank-1.0",
    media_duration_sec: media,
    candidate_count: ranked.length,
    auto_count: auto,
    selected,
    ranked: ranked.slice(0, 40),
    summary,
  };
}
