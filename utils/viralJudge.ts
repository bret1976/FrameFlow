/**
 * Viral Judge — deterministic heuristic scoring inspired by ClipperStudio /
 * clipper highlight-curation ideas (reimplement ideas only; no cloned code).
 * No external API keys.
 */

export type ViralOverall = "GO" | "WARN" | "NO-GO";

export type ViralJudgeReport = {
  ok: true;
  source: "viral-judge-1.0";
  overall: ViralOverall;
  scores: {
    hook: number;
    retention: number;
    shareability: number;
    clarity: number;
  };
  reasons: string[];
  caption_variants: [string, string, string];
  highlight_windows?: { start_sec: number; end_sec: number; label: string }[];
};

export type ViralJudgeParseResult =
  | { ok: true; report: ViralJudgeReport }
  | { ok: false; error: string };

const HOOK_WORDS = [
  "wait",
  "stop",
  "secret",
  "never",
  "always",
  "wrong",
  "mistake",
  "shock",
  "insane",
  "crazy",
  "you won't",
  "you will",
  "nobody",
  "everyone",
  "imagine",
  "watch",
  "listen",
  "here's",
  "heres",
  "this is why",
  "what if",
  "did you",
  "how to",
  "why",
  "truth",
  "exposed",
  "finally",
  "warning",
];

const CTA_SHARE = [
  "follow",
  "share",
  "comment",
  "like",
  "save",
  "tag",
  "send this",
  "duet",
  "stitch",
  "subscribe",
  "link in bio",
  "tell a friend",
  "drop a",
  "let me know",
  "what do you think",
];

const FLUFF = [
  "basically",
  "literally",
  "actually",
  "really",
  "very",
  "just",
  "kind of",
  "sort of",
  "um",
  "uh",
  "you know",
  "i mean",
  "anyway",
  "stuff",
  "things",
];

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const readNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const countMatches = (haystack: string, needles: string[]) => {
  const lower = haystack.toLowerCase();
  let hits = 0;
  for (const needle of needles) {
    if (lower.includes(needle)) hits += 1;
  }
  return hits;
};

const wordTokens = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const concreteNounHint = (tokens: string[]) => {
  // Crude heuristic: longer uncommon tokens without fluff markers tend to be more concrete.
  let concrete = 0;
  for (const token of tokens) {
    if (token.length < 4) continue;
    if (FLUFF.includes(token)) continue;
    if (/ing$|ly$|ness$|tion$/.test(token) && token.length < 8) continue;
    concrete += 1;
  }
  return concrete;
};

const overallFromScores = (avg: number): ViralOverall => {
  if (avg >= 72) return "GO";
  if (avg >= 48) return "WARN";
  return "NO-GO";
};

const buildCaptions = (title: string, hookText: string, transcript: string): [string, string, string] => {
  const base =
    title ||
    hookText.slice(0, 80) ||
    transcript.slice(0, 80).replace(/\s+/g, " ").trim() ||
    "This clip hits hard";
  const clean = base.replace(/#\w+/g, "").trim() || "This clip hits hard";
  return [
    `${clean} — watch till the end. #6FrameStudio #AIFilmmaking`,
    `POV: ${clean}. Save this for later. #AICinema #6FrameStudio`,
    `Stop scrolling. ${clean.slice(0, 90)}. Share if this is you. #AIFilmmaking #AICinema`,
  ];
};

const buildHighlightWindows = (
  durationSec: number | null,
  transcript: string,
): { start_sec: number; end_sec: number; label: string }[] | undefined => {
  if (durationSec == null || !(durationSec > 0)) return undefined;
  const windows: { start_sec: number; end_sec: number; label: string }[] = [];
  const hookEnd = Math.min(durationSec, Math.max(3, Math.min(8, durationSec * 0.2)));
  windows.push({ start_sec: 0, end_sec: Math.round(hookEnd * 10) / 10, label: "hook" });

  const midStart = Math.max(0, durationSec * 0.35);
  const midEnd = Math.min(durationSec, midStart + Math.min(12, durationSec * 0.25));
  if (midEnd - midStart >= 2) {
    windows.push({
      start_sec: Math.round(midStart * 10) / 10,
      end_sec: Math.round(midEnd * 10) / 10,
      label: "payoff",
    });
  }

  const ctaStart = Math.max(0, durationSec - Math.min(8, durationSec * 0.25));
  if (ctaStart > hookEnd + 1) {
    windows.push({
      start_sec: Math.round(ctaStart * 10) / 10,
      end_sec: Math.round(durationSec * 10) / 10,
      label: "cta",
    });
  }

  // If transcript has a question mark late, mark a retention beat.
  const qIdx = transcript.indexOf("?");
  if (qIdx > 0 && durationSec >= 10) {
    const approx = Math.min(durationSec - 2, Math.max(2, (qIdx / Math.max(transcript.length, 1)) * durationSec));
    windows.push({
      start_sec: Math.round(approx * 10) / 10,
      end_sec: Math.round(Math.min(durationSec, approx + 4) * 10) / 10,
      label: "question-beat",
    });
  }

  return windows.slice(0, 4);
};

export const parseViralJudgeRequest = (body: unknown = {}): ViralJudgeParseResult => {
  const root = isRecord(body) ? body : {};
  const transcript = readString(root.transcript);
  const title = readString(root.title);
  const hookText = readString(root.hook_text);
  const durationRaw = readNumber(root.duration_sec);
  const durationSec = durationRaw != null && durationRaw > 0 ? durationRaw : null;
  const captions = Array.isArray(root.captions)
    ? root.captions.map((c) => readString(c)).filter(Boolean)
    : [];

  const useful =
    Boolean(transcript) ||
    Boolean(title) ||
    Boolean(hookText) ||
    durationSec != null ||
    captions.length > 0;

  if (!useful) {
    return {
      ok: false,
      error:
        "Send at least one of { transcript, title, duration_sec, hook_text, captions }.",
    };
  }

  const combined = [title, hookText, transcript, captions.join(" ")].filter(Boolean).join("\n");
  const opening = (hookText || transcript || title || captions[0] || "").slice(0, 120);
  const tokens = wordTokens(combined);
  const reasons: string[] = [];

  // --- Hook (0-100) ---
  let hook = 42;
  const hookHits = countMatches(opening, HOOK_WORDS);
  hook += Math.min(28, hookHits * 9);
  if (/\?/.test(opening)) {
    hook += 10;
    reasons.push("Opening poses a question — strong curiosity hook.");
  }
  if (hookHits > 0) {
    reasons.push(`Early hook language detected (${hookHits} cue${hookHits === 1 ? "" : "s"}).`);
  } else if (opening.length > 0) {
    reasons.push("Opening lacks punchy hook words in the first ~120 characters.");
    hook -= 8;
  }
  if (opening.length >= 20 && opening.length <= 90) hook += 6;
  if (opening.length > 0 && opening.length < 12) {
    hook -= 10;
    reasons.push("Hook text is too short to land.");
  }

  // --- Retention ---
  let retention = 48;
  if (durationSec != null) {
    if (durationSec >= 15 && durationSec <= 60) {
      retention += 22;
      reasons.push(`Duration ${durationSec}s sits in the 15–60s sweet spot.`);
    } else if (durationSec >= 8 && durationSec < 15) {
      retention += 8;
      reasons.push(`Duration ${durationSec}s is short — works for Shorts but thin for story.`);
    } else if (durationSec > 60 && durationSec <= 90) {
      retention += 4;
      reasons.push(`Duration ${durationSec}s is long — retention risk after 60s.`);
    } else if (durationSec > 90) {
      retention -= 18;
      reasons.push(`Duration ${durationSec}s is well over the viral short window.`);
    } else {
      retention -= 12;
      reasons.push(`Duration ${durationSec}s is under ~8s — hard to retain.`);
    }
  } else {
    retention -= 4;
    reasons.push("Duration unknown — retention scored without length context.");
  }
  const questionCount = (combined.match(/\?/g) || []).length;
  if (questionCount >= 1) retention += Math.min(12, questionCount * 5);
  if (tokens.length >= 40) retention += 6;
  if (tokens.length > 0 && tokens.length < 12) {
    retention -= 10;
    reasons.push("Copy is very thin — little to hold attention.");
  }

  // --- Shareability ---
  let shareability = 40;
  const ctaHits = countMatches(combined, CTA_SHARE);
  shareability += Math.min(30, ctaHits * 10);
  if (ctaHits > 0) {
    reasons.push(`Share/CTA language present (${ctaHits}).`);
  } else {
    reasons.push("No clear share/CTA language — add follow/share/save.");
    shareability -= 6;
  }
  if (/\byou\b/i.test(combined)) shareability += 8;
  if (/#\w+/.test(combined) || captions.some((c) => /#\w+/.test(c))) shareability += 6;

  // --- Clarity ---
  let clarity = 50;
  const fluffHits = countMatches(combined, FLUFF);
  const concrete = concreteNounHint(tokens);
  if (tokens.length > 0) {
    const fluffRatio = fluffHits / Math.max(tokens.length / 8, 1);
    clarity -= Math.min(24, Math.round(fluffRatio * 10));
    clarity += Math.min(24, concrete * 2);
  }
  if (fluffHits >= 3) reasons.push("High fluff density — trim filler words.");
  if (concrete >= 6) reasons.push("Concrete nouns / specifics support clarity.");
  if (transcript.length > 0 && transcript.length < 40) {
    clarity -= 8;
    reasons.push("Transcript is very short — clarity hard to judge.");
  }
  if (/^[A-Z]/.test(title) || title.split(/\s+/).length >= 3) clarity += 4;

  const scores = {
    hook: clampScore(hook),
    retention: clampScore(retention),
    shareability: clampScore(shareability),
    clarity: clampScore(clarity),
  };
  const avg = (scores.hook + scores.retention + scores.shareability + scores.clarity) / 4;
  const overall = overallFromScores(avg);
  if (overall === "GO") reasons.unshift("Heuristic viral profile looks strong enough to ship.");
  else if (overall === "WARN") reasons.unshift("Mixed viral profile — tighten hook or CTA before publish.");
  else reasons.unshift("Weak viral profile — rewrite hook and add share language.");

  return {
    ok: true,
    report: {
      ok: true,
      source: "viral-judge-1.0",
      overall,
      scores,
      reasons: reasons.slice(0, 8),
      caption_variants: buildCaptions(title, hookText, transcript),
      highlight_windows: buildHighlightWindows(durationSec, transcript),
    },
  };
};
