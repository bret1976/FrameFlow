/**
 * PromoteGate — multi-gate refuse-to-ship before a clip is promoted.
 * Idea inspired by jayemaoFYNO/clip-factory (MIT; reimplement only —
 * original FrameFlow TypeScript, no cloned Python scripts). Thin slice
 * of the 13-gate verification loop: duration window, loudness, word
 * integrity, boundary words, filler check, evidence freshness → promote
 * or block. Pure functions, no API keys.
 */

export type PromoteVerdict = "PASS" | "WARN" | "FAIL";
export type PromoteAction = "check" | "demo" | "defaults";

export type WordSpan = {
  word: string;
  start_sec: number;
  end_sec: number;
};

export type CutJunction = {
  /** Cut time in the finished clip (seconds). */
  at_sec: number;
  /** Last word before the cut (expected audible). */
  prev_word?: string;
  /** First word after the cut (expected audible). */
  next_word?: string;
  /** Seconds of a word eaten by the cut (hard fail if > 0.10). */
  eaten_sec?: number;
};

export type EvidenceStamp = {
  name: string;
  /** Unix ms or ISO string; compared to candidate_mtime. */
  mtime?: number | string;
};

export type PromoteGateRequest = {
  action?: PromoteAction;
  demo?: boolean;
  slug?: string;
  duration_sec?: number;
  /** Integrated loudness in LUFS (from ffmpeg loudnorm print). */
  lufs?: number;
  /** True peak in dBTP. */
  true_peak_dbtp?: number;
  /** Word-level transcript of the finished clip. */
  words?: WordSpan[];
  /** Optional finished-clip transcript string (filler scan). */
  transcript?: string;
  /** Cut junctions for boundary + integrity gates. */
  junctions?: CutJunction[];
  /** Candidate render mtime (unix ms or ISO). */
  candidate_mtime?: number | string;
  /** Evidence file stamps that must be ≥ candidate. */
  evidence?: EvidenceStamp[];
  /** Override duration window (defaults match clip-factory 45–58s). */
  min_duration_sec?: number;
  max_duration_sec?: number;
};

export type GateResult = {
  id: string;
  label: string;
  verdict: PromoteVerdict;
  evidence: string;
  notes: string[];
};

export type PromoteGateResult = {
  ok: true;
  source: "promote-gate-1.0";
  action: string;
  slug: string;
  verdict: PromoteVerdict;
  promote: "PROMOTE-OK" | "PROMOTE-BLOCKED";
  summary: string;
  gates: GateResult[];
  blocked_reasons: string[];
  defaults?: {
    min_duration_sec: number;
    max_duration_sec: number;
    loudness_target_lufs: number;
    loudness_tolerance_lufs: number;
    true_peak_max_dbtp: number;
    max_eaten_word_sec: number;
    filler_window_sec: number;
  };
};

export type PromoteGateParseResult =
  | { ok: true; request: PromoteGateRequest }
  | { ok: false; error: string };

const DEFAULT_MIN_DUR = 45;
const DEFAULT_MAX_DUR = 58;
const LOUDNESS_TARGET = -16;
const LOUDNESS_TOL = 1.0;
const TRUE_PEAK_MAX = -1.0;
const MAX_EATEN = 0.1;
const FILLER_WINDOW = 0.45;
const FILLER_RE = /^(uh+|um+|erm+|ah+|hmm+)$/i;

const DEMO_BLOCK: PromoteGateRequest = {
  action: "check",
  slug: "02-half-word",
  duration_sec: 61.2,
  lufs: -12.4,
  true_peak_dbtp: 0.2,
  transcript: "uh so yeah the uh product then ships um tomorrow",
  words: [
    { word: "uh", start_sec: 0.0, end_sec: 0.2 },
    { word: "so", start_sec: 0.25, end_sec: 0.4 },
    { word: "yeah", start_sec: 0.45, end_sec: 0.7 },
    { word: "the", start_sec: 12.0, end_sec: 12.15 },
    { word: "uh", start_sec: 12.2, end_sec: 12.35 },
    { word: "product", start_sec: 12.4, end_sec: 12.8 },
  ],
  junctions: [
    { at_sec: 12.1, prev_word: "the", next_word: "product", eaten_sec: 0.18 },
    { at_sec: 30.0, prev_word: "ships", next_word: "tomorrow", eaten_sec: 0.02 },
  ],
  candidate_mtime: 1_700_000_100_000,
  evidence: [
    { name: "built.json", mtime: 1_700_000_050_000 },
    { name: "loudness.json", mtime: 1_700_000_090_000 },
  ],
};

const DEMO_PASS: PromoteGateRequest = {
  action: "check",
  slug: "01-hook-clean",
  duration_sec: 52.4,
  lufs: -15.7,
  true_peak_dbtp: -1.4,
  transcript: "Stop scrolling. Three mistakes every creator makes on day one. Fix two: show the proof first. Subscribe if this saved you an hour.",
  words: [
    { word: "Stop", start_sec: 0.05, end_sec: 0.28 },
    { word: "scrolling", start_sec: 0.3, end_sec: 0.7 },
    { word: "Three", start_sec: 0.85, end_sec: 1.1 },
    { word: "mistakes", start_sec: 1.15, end_sec: 1.55 },
    { word: "Subscribe", start_sec: 48.0, end_sec: 48.4 },
    { word: "if", start_sec: 48.45, end_sec: 48.55 },
    { word: "this", start_sec: 48.6, end_sec: 48.8 },
    { word: "saved", start_sec: 48.85, end_sec: 49.15 },
    { word: "you", start_sec: 49.2, end_sec: 49.35 },
    { word: "an", start_sec: 49.4, end_sec: 49.5 },
    { word: "hour", start_sec: 49.55, end_sec: 49.9 },
  ],
  junctions: [
    { at_sec: 18.2, prev_word: "one", next_word: "Fix", eaten_sec: 0.02 },
    { at_sec: 36.5, prev_word: "first", next_word: "Subscribe", eaten_sec: 0.04 },
  ],
  candidate_mtime: 1_700_000_000_000,
  evidence: [
    { name: "built.json", mtime: 1_700_000_010_000 },
    { name: "loudness.json", mtime: 1_700_000_020_000 },
    { name: "boundary_check.json", mtime: 1_700_000_030_000 },
    { name: "filler_gate.json", mtime: 1_700_000_040_000 },
  ],
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function toMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const asNum = Number(value);
    if (Number.isFinite(asNum)) return asNum < 1e12 ? asNum * 1000 : asNum;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function worst(a: PromoteVerdict, b: PromoteVerdict): PromoteVerdict {
  const rank = { PASS: 0, WARN: 1, FAIL: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

function parseWords(raw: unknown): WordSpan[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: WordSpan[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const word = readString(row.word ?? row.text);
    const start = readNumber(row.start_sec ?? row.start);
    const end = readNumber(row.end_sec ?? row.end);
    if (!word || start === undefined || end === undefined || end < start) return null;
    out.push({ word, start_sec: round3(start), end_sec: round3(end) });
  }
  return out;
}

function parseJunctions(raw: unknown): CutJunction[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: CutJunction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const at = readNumber(row.at_sec ?? row.at ?? row.time_sec);
    if (at === undefined) return null;
    const eaten = readNumber(row.eaten_sec ?? row.eaten);
    out.push({
      at_sec: round3(at),
      prev_word: readString(row.prev_word ?? row.prev) || undefined,
      next_word: readString(row.next_word ?? row.next) || undefined,
      eaten_sec: eaten,
    });
  }
  return out;
}

function parseEvidence(raw: unknown): EvidenceStamp[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: EvidenceStamp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const name = readString(row.name ?? row.file ?? row.path);
    if (!name) return null;
    out.push({ name, mtime: (row.mtime ?? row.updated_at) as number | string | undefined });
  }
  return out;
}

export function parsePromoteGateRequest(
  body: Record<string, unknown>
): PromoteGateParseResult {
  if (body.demo === true || body.action === "demo") {
    const mode = readString(body.demo_mode).toLowerCase();
    return {
      ok: true,
      request: {
        ...(mode === "pass" ? DEMO_PASS : DEMO_BLOCK),
        action: "demo",
        demo: true,
      },
    };
  }

  const actionRaw = readString(body.action).toLowerCase() || "check";
  if (!["check", "demo", "defaults"].includes(actionRaw)) {
    return { ok: false, error: "action must be check | demo | defaults." };
  }
  const action = actionRaw as PromoteAction;

  if (action === "defaults") {
    return { ok: true, request: { action: "defaults" } };
  }

  const words = parseWords(body.words);
  if (words === null) return { ok: false, error: "words must be an array of {word,start_sec,end_sec}." };
  const junctions = parseJunctions(body.junctions);
  if (junctions === null) {
    return { ok: false, error: "junctions must be an array of {at_sec,prev_word?,next_word?,eaten_sec?}." };
  }
  const evidence = parseEvidence(body.evidence);
  if (evidence === null) {
    return { ok: false, error: "evidence must be an array of {name,mtime?}." };
  }

  return {
    ok: true,
    request: {
      action,
      slug: readString(body.slug) || "clip",
      duration_sec: readNumber(body.duration_sec),
      lufs: readNumber(body.lufs ?? body.loudness_lufs),
      true_peak_dbtp: readNumber(body.true_peak_dbtp ?? body.peak_dbtp ?? body.tp),
      words,
      transcript: readString(body.transcript) || undefined,
      junctions,
      candidate_mtime: body.candidate_mtime as number | string | undefined,
      evidence,
      min_duration_sec: readNumber(body.min_duration_sec),
      max_duration_sec: readNumber(body.max_duration_sec),
    },
  };
}

function gateDuration(req: PromoteGateRequest): GateResult {
  const min = req.min_duration_sec ?? DEFAULT_MIN_DUR;
  const max = req.max_duration_sec ?? DEFAULT_MAX_DUR;
  const d = req.duration_sec;
  const notes: string[] = [];
  if (d === undefined) {
    return {
      id: "duration_window",
      label: "Duration window (45–58s)",
      verdict: "WARN",
      evidence: "missing duration_sec",
      notes: ["Supply duration_sec so the promote gate can enforce the publishable window."],
    };
  }
  if (d < 5) {
    return {
      id: "duration_window",
      label: "Duration window (45–58s)",
      verdict: "FAIL",
      evidence: `${round3(d)}s`,
      notes: ["Clip shorter than 5s — not a publishable short."],
    };
  }
  if (d > 90) {
    return {
      id: "duration_window",
      label: "Duration window (45–58s)",
      verdict: "FAIL",
      evidence: `${round3(d)}s`,
      notes: ["Clip longer than 90s — trim before promote."],
    };
  }
  if (d >= min && d <= max) {
    notes.push(`Inside the ${min}–${max}s publishable window.`);
    return {
      id: "duration_window",
      label: "Duration window (45–58s)",
      verdict: "PASS",
      evidence: `${round3(d)}s`,
      notes,
    };
  }
  notes.push(
    `Outside ${min}–${max}s window (ad-creative baseline). Trim or extend before promote.`
  );
  return {
    id: "duration_window",
    label: "Duration window (45–58s)",
    verdict: "FAIL",
    evidence: `${round3(d)}s`,
    notes,
  };
}

function gateLoudness(req: PromoteGateRequest): GateResult {
  const notes: string[] = [];
  if (req.lufs === undefined && req.true_peak_dbtp === undefined) {
    return {
      id: "loudness",
      label: "Loudness (−16±1 LUFS / TP ≤ −1.0)",
      verdict: "WARN",
      evidence: "missing lufs / true_peak_dbtp",
      notes: ["Run ffmpeg loudnorm print_format=json and pass input_i / input_tp."],
    };
  }
  let verdict: PromoteVerdict = "PASS";
  const parts: string[] = [];
  if (req.lufs !== undefined) {
    parts.push(`${round3(req.lufs)} LUFS`);
    if (Math.abs(req.lufs - LOUDNESS_TARGET) <= LOUDNESS_TOL) {
      notes.push("Integrated loudness within −16 ±1 LUFS.");
    } else {
      verdict = "FAIL";
      notes.push(
        `Integrated loudness ${round3(req.lufs)} LUFS is outside −16 ±1 (target ${LOUDNESS_TARGET}).`
      );
    }
  }
  if (req.true_peak_dbtp !== undefined) {
    parts.push(`TP ${round3(req.true_peak_dbtp)} dBTP`);
    if (req.true_peak_dbtp <= TRUE_PEAK_MAX) {
      notes.push("True peak at or under −1.0 dBTP.");
    } else {
      verdict = "FAIL";
      notes.push(`True peak ${round3(req.true_peak_dbtp)} dBTP exceeds −1.0.`);
    }
  }
  return {
    id: "loudness",
    label: "Loudness (−16±1 LUFS / TP ≤ −1.0)",
    verdict,
    evidence: parts.join(" · ") || "n/a",
    notes,
  };
}

function gateWordIntegrity(req: PromoteGateRequest): GateResult {
  const junctions = req.junctions ?? [];
  if (!junctions.length) {
    return {
      id: "word_integrity",
      label: "Word integrity (≤0.10s eaten)",
      verdict: "WARN",
      evidence: "no junctions",
      notes: ["Provide junctions[].eaten_sec from word-boundary cut planner."],
    };
  }
  const notes: string[] = [];
  let worstEaten = 0;
  let failCount = 0;
  for (const j of junctions) {
    const eaten = j.eaten_sec ?? 0;
    worstEaten = Math.max(worstEaten, eaten);
    if (eaten > MAX_EATEN) {
      failCount += 1;
      notes.push(
        `Cut @ ${round3(j.at_sec)}s eats ${round3(eaten)}s of a word (> ${MAX_EATEN}s).`
      );
    }
  }
  if (failCount === 0) {
    notes.push(`All ${junctions.length} cuts land within ${MAX_EATEN}s word-eat budget.`);
  }
  return {
    id: "word_integrity",
    label: "Word integrity (≤0.10s eaten)",
    verdict: failCount ? "FAIL" : "PASS",
    evidence: `worst_eaten=${round3(worstEaten)}s · junctions=${junctions.length}`,
    notes,
  };
}

function gateBoundaryWords(req: PromoteGateRequest): GateResult {
  const junctions = req.junctions ?? [];
  const words = req.words ?? [];
  if (!junctions.length) {
    return {
      id: "boundary_words",
      label: "Boundary words (±0.45s)",
      verdict: "WARN",
      evidence: "no junctions",
      notes: ["Provide cut junctions with prev_word / next_word for boundary checks."],
    };
  }
  const notes: string[] = [];
  let fails = 0;
  for (const j of junctions) {
    if (!j.prev_word || !j.next_word) {
      fails += 1;
      notes.push(`Cut @ ${round3(j.at_sec)}s missing prev/next word labels.`);
      continue;
    }
    const near = words.filter(
      (w) => Math.abs(((w.start_sec + w.end_sec) / 2) - j.at_sec) <= FILLER_WINDOW
    );
    const orphanFillers = near.filter((w) => FILLER_RE.test(w.word.replace(/[^\w']/g, "")));
    if (orphanFillers.length) {
      fails += 1;
      notes.push(
        `Cut @ ${round3(j.at_sec)}s has orphan filler "${orphanFillers[0].word}" within ±${FILLER_WINDOW}s.`
      );
    } else {
      notes.push(
        `Cut @ ${round3(j.at_sec)}s: "${j.prev_word}" → "${j.next_word}" clean.`
      );
    }
  }
  return {
    id: "boundary_words",
    label: "Boundary words (±0.45s)",
    verdict: fails ? "FAIL" : "PASS",
    evidence: `junctions=${junctions.length} · fails=${fails}`,
    notes,
  };
}

function gateFiller(req: PromoteGateRequest): GateResult {
  const transcript = readString(req.transcript);
  const words = req.words ?? [];
  const tokens: string[] = transcript
    ? transcript.split(/\s+/).map((t) => t.replace(/[^\w']/g, "")).filter(Boolean)
    : words.map((w) => w.word.replace(/[^\w']/g, "")).filter(Boolean);

  if (!tokens.length) {
    return {
      id: "filler_final",
      label: "Filler final (zero uh/um)",
      verdict: "WARN",
      evidence: "no transcript/words",
      notes: ["Pass transcript or words[] so the finished clip can be scanned for fillers."],
    };
  }
  const fillers = tokens.filter((t) => FILLER_RE.test(t));
  if (fillers.length === 0) {
    return {
      id: "filler_final",
      label: "Filler final (zero uh/um)",
      verdict: "PASS",
      evidence: `tokens=${tokens.length}`,
      notes: ["No uh/um/erm fillers in finished speech."],
    };
  }
  return {
    id: "filler_final",
    label: "Filler final (zero uh/um)",
    verdict: "FAIL",
    evidence: `fillers=${fillers.length} (${fillers.slice(0, 5).join(", ")})`,
    notes: [
      "Finished clip still carries audible fillers — smooth splices or re-cut before promote.",
    ],
  };
}

function gateFreshness(req: PromoteGateRequest): GateResult {
  const cand = toMs(req.candidate_mtime);
  const evidence = req.evidence ?? [];
  if (cand === undefined) {
    return {
      id: "evidence_freshness",
      label: "Evidence freshness",
      verdict: "WARN",
      evidence: "missing candidate_mtime",
      notes: ["Pass candidate_mtime so stale checks cannot promote a newer render."],
    };
  }
  if (!evidence.length) {
    return {
      id: "evidence_freshness",
      label: "Evidence freshness",
      verdict: "WARN",
      evidence: `candidate=${cand}`,
      notes: ["No evidence stamps provided — promote still needs gate files after rebuild."],
    };
  }
  const notes: string[] = [];
  let fails = 0;
  for (const e of evidence) {
    const mt = toMs(e.mtime);
    if (mt === undefined) {
      fails += 1;
      notes.push(`STALE/MISSING mtime: ${e.name}`);
      continue;
    }
    if (mt < cand) {
      fails += 1;
      notes.push(`STALE: ${e.name} earlier than candidate — re-run that gate.`);
    } else {
      notes.push(`${e.name} fresh.`);
    }
  }
  return {
    id: "evidence_freshness",
    label: "Evidence freshness",
    verdict: fails ? "FAIL" : "PASS",
    evidence: `candidate_ms=${cand} · files=${evidence.length}`,
    notes,
  };
}

export function runPromoteGate(request: PromoteGateRequest): PromoteGateResult {
  if (request.action === "defaults") {
    return {
      ok: true,
      source: "promote-gate-1.0",
      action: "defaults",
      slug: "defaults",
      verdict: "PASS",
      promote: "PROMOTE-OK",
      summary: "PromoteGate defaults (clip-factory thin slice).",
      gates: [],
      blocked_reasons: [],
      defaults: {
        min_duration_sec: DEFAULT_MIN_DUR,
        max_duration_sec: DEFAULT_MAX_DUR,
        loudness_target_lufs: LOUDNESS_TARGET,
        loudness_tolerance_lufs: LOUDNESS_TOL,
        true_peak_max_dbtp: TRUE_PEAK_MAX,
        max_eaten_word_sec: MAX_EATEN,
        filler_window_sec: FILLER_WINDOW,
      },
    };
  }

  const gates: GateResult[] = [
    gateDuration(request),
    gateLoudness(request),
    gateWordIntegrity(request),
    gateBoundaryWords(request),
    gateFiller(request),
    gateFreshness(request),
  ];

  let verdict: PromoteVerdict = "PASS";
  for (const g of gates) verdict = worst(verdict, g.verdict);

  const blocked = gates
    .filter((g) => g.verdict === "FAIL")
    .flatMap((g) => g.notes.map((n) => `${g.id}: ${n}`));

  const promote = verdict === "FAIL" ? "PROMOTE-BLOCKED" : "PROMOTE-OK";
  const slug = request.slug || "clip";
  const summary =
    promote === "PROMOTE-OK"
      ? `${slug}: all hard gates green → eligible to promote .cand → .mp4`
      : `${slug}: PROMOTE-BLOCKED — ${blocked.length} reason(s); fix and re-run ONLY=${slug}`;

  return {
    ok: true,
    source: "promote-gate-1.0",
    action: request.action || "check",
    slug,
    verdict,
    promote,
    summary,
    gates,
    blocked_reasons: blocked,
    defaults: {
      min_duration_sec: request.min_duration_sec ?? DEFAULT_MIN_DUR,
      max_duration_sec: request.max_duration_sec ?? DEFAULT_MAX_DUR,
      loudness_target_lufs: LOUDNESS_TARGET,
      loudness_tolerance_lufs: LOUDNESS_TOL,
      true_peak_max_dbtp: TRUE_PEAK_MAX,
      max_eaten_word_sec: MAX_EATEN,
      filler_window_sec: FILLER_WINDOW,
    },
  };
}
