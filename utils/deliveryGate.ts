/**
 * DeliveryGate — shorts delivery preflight before publish.
 * Idea inspired by roz2-bit/short-form-video-editing-kit (MIT; reimplement
 * only — original FrameFlow TypeScript, no cloned docs/scripts).
 * Combines platform export-matrix targets, metadata completeness, and
 * open/mid/close retention checkpoints. Pure functions, no API keys.
 */

export type DeliveryVerdict = "PASS" | "WARN" | "FAIL";

export type DeliveryPlatform =
  | "tiktok"
  | "instagram-reels"
  | "youtube-shorts";

export type RetentionCheckpointId = "open" | "mid" | "close";

export type ExportSpec = {
  platform: DeliveryPlatform;
  width: number;
  height: number;
  fps: number;
  video_codec: string;
  audio_codec: string;
  audio_sample_rate_hz: number;
  peak_target_dbtp: number;
  filename_pattern: string;
};

export type DeliveryGateRequest = {
  action?: "check" | "demo" | "matrix";
  demo?: boolean;
  platform?: DeliveryPlatform | string;
  /** Declared export / container facts (optional — missing fields become WARN). */
  width?: number;
  height?: number;
  fps?: number;
  video_codec?: string;
  audio_codec?: string;
  audio_sample_rate_hz?: number;
  peak_dbtp?: number;
  filename?: string;
  /** Publish metadata. */
  project_slug?: string;
  title?: string;
  hook?: string;
  hashtags?: string[] | string;
  version?: string;
  approval_status?: string;
  /** Clip timing + speech windows for retention checkpoints. */
  duration_sec?: number;
  transcript?: string;
  open_text?: string;
  mid_text?: string;
  close_text?: string;
  captions_readable?: boolean;
};

export type CheckpointResult = {
  id: RetentionCheckpointId;
  label: string;
  verdict: DeliveryVerdict;
  score: number;
  evidence: string;
  notes: string[];
};

export type MetaFieldStatus = {
  field: string;
  present: boolean;
  value_preview?: string;
};

export type ExportCheck = {
  platform: DeliveryPlatform;
  target: ExportSpec;
  verdict: DeliveryVerdict;
  issues: string[];
  matches: string[];
};

export type DeliveryGateResult = {
  ok: true;
  source: "delivery-gate-1.0";
  action: string;
  verdict: DeliveryVerdict;
  summary: string;
  export_check?: ExportCheck;
  metadata: MetaFieldStatus[];
  checkpoints: CheckpointResult[];
  matrix?: ExportSpec[];
};

export type DeliveryGateParseResult =
  | { ok: true; request: DeliveryGateRequest }
  | { ok: false; error: string };

const EXPORT_MATRIX: ExportSpec[] = [
  {
    platform: "tiktok",
    width: 1080,
    height: 1920,
    fps: 30,
    video_codec: "H.264",
    audio_codec: "AAC-LC",
    audio_sample_rate_hz: 48000,
    peak_target_dbtp: -1.0,
    filename_pattern: "YYYYMMDD_slug_tiktok_master_vNN.mp4",
  },
  {
    platform: "instagram-reels",
    width: 1080,
    height: 1920,
    fps: 30,
    video_codec: "H.264",
    audio_codec: "AAC-LC",
    audio_sample_rate_hz: 48000,
    peak_target_dbtp: -1.0,
    filename_pattern: "YYYYMMDD_slug_reels_master_vNN.mp4",
  },
  {
    platform: "youtube-shorts",
    width: 1080,
    height: 1920,
    fps: 30,
    video_codec: "H.264",
    audio_codec: "AAC-LC",
    audio_sample_rate_hz: 48000,
    peak_target_dbtp: -1.0,
    filename_pattern: "YYYYMMDD_slug_shorts_master_vNN.mp4",
  },
];

const PLATFORMS = new Set<string>([
  "tiktok",
  "instagram-reels",
  "youtube-shorts",
]);

const HOOK_PATTERN =
  /\b(here is|here's|watch|stop|wait|mistake|secret|why|how to|before|after|you need|don't|never|always|result|proof)\b|[?？]/i;

const CTA_PATTERN =
  /\b(subscribe|follow|comment|share|save this|link in|tap|dm me|join|download|try this)\b/i;

const PROMISE_PATTERN =
  /\b(i('ll| will)|you('ll| will)|this (will|shows|proves)|learn|fix|avoid|save|make|build)\b/i;

const DEMO_FAIL: DeliveryGateRequest = {
  action: "check",
  platform: "tiktok",
  width: 1920,
  height: 1080,
  fps: 24,
  video_codec: "ProRes",
  audio_codec: "PCM",
  audio_sample_rate_hz: 44100,
  peak_dbtp: 0.5,
  filename: "final.mov",
  title: "",
  hook: "um so yeah",
  hashtags: [],
  version: "",
  duration_sec: 42,
  open_text: "um so yeah today I wanted to talk a little bit about stuff",
  mid_text: "and then there is more context that kind of goes on",
  close_text: "okay bye",
  captions_readable: false,
};

const DEMO_PASS: DeliveryGateRequest = {
  action: "check",
  platform: "youtube-shorts",
  width: 1080,
  height: 1920,
  fps: 30,
  video_codec: "H.264",
  audio_codec: "AAC-LC",
  audio_sample_rate_hz: 48000,
  peak_dbtp: -1.2,
  filename: "20260920_hookgate_shorts_master_v01.mp4",
  project_slug: "hookgate",
  title: "Three day-one creator mistakes",
  hook: "Stop scrolling — three mistakes every creator makes on day one.",
  hashtags: ["#6FrameStudio", "#AIFilmmaking", "#Shorts"],
  version: "v01",
  approval_status: "approved",
  duration_sec: 38,
  open_text: "Stop scrolling — three mistakes every creator makes on day one.",
  mid_text: "Mistake two: you bury the proof. Show the result before the lecture.",
  close_text: "That is the fix. Subscribe if this saved you an hour.",
  captions_readable: true,
};

function normalizeSpeech(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHashtags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => readString(item))
      .filter(Boolean)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  }
  if (typeof value === "string") {
    return value
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  }
  return [];
}

function normalizeCodec(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function codecMatches(actual: string | undefined, want: string): boolean {
  if (!actual?.trim()) return false;
  const a = normalizeCodec(actual);
  const w = normalizeCodec(want);
  if (a === w) return true;
  if (w.includes("h.264") || w.includes("h264")) {
    return /h\.?264|avc1|avc/.test(a);
  }
  if (w.includes("aac")) {
    return /aac/.test(a);
  }
  return a.includes(w) || w.includes(a);
}

function worstVerdict(a: DeliveryVerdict, b: DeliveryVerdict): DeliveryVerdict {
  const rank = { PASS: 0, WARN: 1, FAIL: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

function sliceWindow(
  transcript: string,
  duration: number,
  startRatio: number,
  endRatio: number
): string {
  const words = normalizeSpeech(transcript).split(/\s+/).filter(Boolean);
  if (!words.length || duration <= 0) return "";
  const start = Math.floor(words.length * startRatio);
  const end = Math.max(start + 1, Math.ceil(words.length * endRatio));
  return words.slice(start, end).join(" ");
}

function scoreOpen(text: string): CheckpointResult {
  const t = normalizeSpeech(text);
  const notes: string[] = [];
  let score = 40;
  if (!t) {
    return {
      id: "open",
      label: "Open (0–3s)",
      verdict: "FAIL",
      score: 0,
      evidence: "",
      notes: ["Missing opening speech — cold viewer cannot identify the promise."],
    };
  }
  if (HOOK_PATTERN.test(t)) {
    score += 25;
    notes.push("Opening hits a hook pattern (question / command / reveal).");
  } else {
    notes.push("Opening lacks a clear question, promise, or tension cue.");
  }
  if (PROMISE_PATTERN.test(t)) {
    score += 15;
    notes.push("States a benefit or outcome early.");
  }
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 4 && words.length <= 22) {
    score += 15;
    notes.push("Length fits a spoken 1–3s hook.");
  } else if (words.length < 4) {
    score -= 10;
    notes.push("Opening is too thin for a cold viewer.");
  } else {
    score -= 5;
    notes.push("Opening runs long — trim to one sentence.");
  }
  if (/^(um+|uh+|so+|okay|yeah|hi|hello)\b/i.test(t)) {
    score -= 20;
    notes.push("Starts with filler / greeting — bury it after the hook.");
  }
  score = Math.max(0, Math.min(100, score));
  const verdict: DeliveryVerdict =
    score >= 70 ? "PASS" : score >= 45 ? "WARN" : "FAIL";
  return {
    id: "open",
    label: "Open (0–3s)",
    verdict,
    score,
    evidence: t.slice(0, 140),
    notes,
  };
}

function scoreMid(text: string): CheckpointResult {
  const t = normalizeSpeech(text);
  const notes: string[] = [];
  let score = 45;
  if (!t) {
    return {
      id: "mid",
      label: "Midpoint",
      verdict: "WARN",
      score: 30,
      evidence: "",
      notes: ["No midpoint speech supplied — treat as soft gap."],
    };
  }
  if (/\b(because|proof|result|example|watch|see|step|mistake|fix)\b/i.test(t)) {
    score += 20;
    notes.push("Midpoint advances proof / escalation.");
  } else {
    notes.push("Midpoint does not clearly escalate proof or curiosity.");
  }
  if (/\b(um+|you know|kind of|sort of|basically)\b/i.test(t)) {
    score -= 15;
    notes.push("Filler density hurts retention at midpoint.");
  }
  if (t.split(/\s+/).filter(Boolean).length >= 6) {
    score += 10;
  }
  score = Math.max(0, Math.min(100, score));
  const verdict: DeliveryVerdict =
    score >= 65 ? "PASS" : score >= 40 ? "WARN" : "FAIL";
  return {
    id: "mid",
    label: "Midpoint",
    verdict,
    score,
    evidence: t.slice(0, 140),
    notes,
  };
}

function scoreClose(text: string, captionsReadable?: boolean): CheckpointResult {
  const t = normalizeSpeech(text);
  const notes: string[] = [];
  let score = 40;
  if (!t) {
    return {
      id: "close",
      label: "Close (final ~2s)",
      verdict: "FAIL",
      score: 0,
      evidence: "",
      notes: ["Missing closing beat — no payoff / next action."],
    };
  }
  if (PROMISE_PATTERN.test(t) || /\b(that('s| is) (it|the)|result|fixed|done)\b/i.test(t)) {
    score += 20;
    notes.push("Payoff language present before exit.");
  } else {
    notes.push("Payoff not obvious before the end card.");
  }
  if (CTA_PATTERN.test(t)) {
    score += 15;
    notes.push("Natural CTA after payoff.");
  } else {
    notes.push("No clear next action in the closing beat.");
  }
  if (/[.!?…]["'")\]]*\s*$/.test(t)) {
    score += 10;
    notes.push("Closes on a complete sentence.");
  }
  if (captionsReadable === false) {
    score -= 15;
    notes.push("Captions flagged unreadable at phone distance.");
  } else if (captionsReadable === true) {
    score += 10;
    notes.push("Captions marked readable.");
  }
  if (/^(okay bye|thanks|bye|peace)\b/i.test(t)) {
    score -= 20;
    notes.push("Soft exit without payoff.");
  }
  score = Math.max(0, Math.min(100, score));
  const verdict: DeliveryVerdict =
    score >= 70 ? "PASS" : score >= 45 ? "WARN" : "FAIL";
  return {
    id: "close",
    label: "Close (final ~2s)",
    verdict,
    score,
    evidence: t.slice(0, 140),
    notes,
  };
}

function checkExport(request: DeliveryGateRequest): ExportCheck {
  const platform = (request.platform || "tiktok") as DeliveryPlatform;
  const target =
    EXPORT_MATRIX.find((row) => row.platform === platform) || EXPORT_MATRIX[0];
  const issues: string[] = [];
  const matches: string[] = [];

  if (request.width == null || request.height == null) {
    issues.push("width/height not declared — cannot confirm 1080×1920 master.");
  } else if (request.width === target.width && request.height === target.height) {
    matches.push(`${request.width}×${request.height} matches ${platform} master.`);
  } else {
    issues.push(
      `Got ${request.width}×${request.height}; want ${target.width}×${target.height} for ${platform}.`
    );
  }

  if (request.fps == null) {
    issues.push("fps not declared.");
  } else if (Math.abs(request.fps - target.fps) <= 1) {
    matches.push(`fps ${request.fps} near target ${target.fps}.`);
  } else {
    issues.push(`fps ${request.fps} vs target ${target.fps}.`);
  }

  if (!request.video_codec?.trim()) {
    issues.push("video_codec not declared.");
  } else if (codecMatches(request.video_codec, target.video_codec)) {
    matches.push(`video_codec ${request.video_codec} ok.`);
  } else {
    issues.push(
      `video_codec ${request.video_codec} — prefer ${target.video_codec} for platform upload.`
    );
  }

  if (!request.audio_codec?.trim()) {
    issues.push("audio_codec not declared.");
  } else if (codecMatches(request.audio_codec, target.audio_codec)) {
    matches.push(`audio_codec ${request.audio_codec} ok.`);
  } else {
    issues.push(
      `audio_codec ${request.audio_codec} — prefer ${target.audio_codec}.`
    );
  }

  if (request.audio_sample_rate_hz == null) {
    issues.push("audio_sample_rate_hz not declared.");
  } else if (request.audio_sample_rate_hz === target.audio_sample_rate_hz) {
    matches.push(`sample rate ${request.audio_sample_rate_hz} Hz ok.`);
  } else {
    issues.push(
      `sample rate ${request.audio_sample_rate_hz} vs ${target.audio_sample_rate_hz}.`
    );
  }

  if (request.peak_dbtp == null) {
    issues.push("peak_dbtp not declared — aim ≤ -1.0 dBTP.");
  } else if (request.peak_dbtp <= target.peak_target_dbtp + 0.05) {
    matches.push(`peak ${request.peak_dbtp} dBTP within target.`);
  } else {
    issues.push(
      `peak ${request.peak_dbtp} dBTP exceeds ${target.peak_target_dbtp} dBTP target.`
    );
  }

  if (!request.filename?.trim()) {
    issues.push("filename missing — use dated slug master pattern.");
  } else if (/\.mp4$/i.test(request.filename) && /_v\d+/i.test(request.filename)) {
    matches.push("filename looks versioned .mp4 master.");
  } else {
    issues.push(
      `filename "${request.filename}" — prefer pattern like ${target.filename_pattern}.`
    );
  }

  const hardFail = issues.some((i) =>
    /want 1080|prefer H\.264|exceeds|ProRes|PCM|1920×1080|Got \d+×\d+/i.test(i)
  );
  const verdict: DeliveryVerdict = hardFail
    ? "FAIL"
    : issues.length
      ? "WARN"
      : "PASS";

  return { platform, target, verdict, issues, matches };
}

function checkMetadata(request: DeliveryGateRequest): MetaFieldStatus[] {
  const tags = normalizeHashtags(request.hashtags);
  const fields: Array<[string, string]> = [
    ["project_slug", readString(request.project_slug)],
    ["title", readString(request.title)],
    ["hook", readString(request.hook)],
    ["hashtags", tags.join(" ")],
    ["version", readString(request.version)],
    ["approval_status", readString(request.approval_status)],
    ["platform", readString(request.platform)],
    ["final_export_filename", readString(request.filename)],
  ];
  return fields.map(([field, value]) => ({
    field,
    present: Boolean(value),
    value_preview: value ? value.slice(0, 80) : undefined,
  }));
}

export function parseDeliveryGateRequest(
  body: Record<string, unknown>
): DeliveryGateParseResult {
  if (body.demo === true || body.action === "demo") {
    return { ok: true, request: { demo: true, action: "demo" } };
  }
  if (body.action === "matrix") {
    return { ok: true, request: { action: "matrix" } };
  }

  const platformRaw = readString(body.platform) || "tiktok";
  if (!PLATFORMS.has(platformRaw)) {
    return {
      ok: false,
      error: "platform must be tiktok | instagram-reels | youtube-shorts (or demo/matrix).",
    };
  }

  const num = (key: string): number | undefined => {
    if (body[key] == null || body[key] === "") return undefined;
    const n = Number(body[key]);
    return Number.isFinite(n) ? n : NaN;
  };

  for (const key of [
    "width",
    "height",
    "fps",
    "audio_sample_rate_hz",
    "peak_dbtp",
    "duration_sec",
  ]) {
    const n = num(key);
    if (n !== undefined && Number.isNaN(n)) {
      return { ok: false, error: `${key} must be a finite number when provided.` };
    }
  }

  return {
    ok: true,
    request: {
      action: "check",
      platform: platformRaw as DeliveryPlatform,
      width: num("width"),
      height: num("height"),
      fps: num("fps"),
      video_codec: readString(body.video_codec) || undefined,
      audio_codec: readString(body.audio_codec) || undefined,
      audio_sample_rate_hz: num("audio_sample_rate_hz"),
      peak_dbtp: num("peak_dbtp"),
      filename: readString(body.filename) || undefined,
      project_slug: readString(body.project_slug) || undefined,
      title: readString(body.title) || undefined,
      hook: readString(body.hook) || undefined,
      hashtags: body.hashtags as string[] | string | undefined,
      version: readString(body.version) || undefined,
      approval_status: readString(body.approval_status) || undefined,
      duration_sec: num("duration_sec"),
      transcript: readString(body.transcript) || undefined,
      open_text: readString(body.open_text) || undefined,
      mid_text: readString(body.mid_text) || undefined,
      close_text: readString(body.close_text) || undefined,
      captions_readable:
        typeof body.captions_readable === "boolean"
          ? body.captions_readable
          : undefined,
    },
  };
}

export function runDeliveryGate(
  request: DeliveryGateRequest
): DeliveryGateResult {
  if (request.action === "matrix") {
    return {
      ok: true,
      source: "delivery-gate-1.0",
      action: "matrix",
      verdict: "PASS",
      summary: "Export matrix for TikTok / Reels / Shorts masters.",
      metadata: [],
      checkpoints: [],
      matrix: EXPORT_MATRIX,
    };
  }

  if (request.demo) {
    return runDeliveryGate({ ...DEMO_FAIL, demo: false, action: "check" });
  }

  const duration = request.duration_sec ?? 30;
  const transcript = request.transcript ?? "";
  const openText =
    request.open_text ||
    request.hook ||
    (transcript ? sliceWindow(transcript, duration, 0, 0.12) : "");
  const midText =
    request.mid_text ||
    (transcript ? sliceWindow(transcript, duration, 0.4, 0.6) : "");
  const closeText =
    request.close_text ||
    (transcript ? sliceWindow(transcript, duration, 0.85, 1) : "");

  const export_check = checkExport(request);
  const metadata = checkMetadata(request);
  const checkpoints = [
    scoreOpen(openText),
    scoreMid(midText),
    scoreClose(closeText, request.captions_readable),
  ];

  const missingMeta = metadata.filter((m) => !m.present).map((m) => m.field);
  let verdict: DeliveryVerdict = export_check.verdict;
  for (const cp of checkpoints) {
    verdict = worstVerdict(verdict, cp.verdict);
  }
  if (missingMeta.includes("hook") || missingMeta.includes("title")) {
    verdict = worstVerdict(verdict, "FAIL");
  } else if (missingMeta.length >= 3) {
    verdict = worstVerdict(verdict, "WARN");
  }

  const failBits = [
    ...export_check.issues.slice(0, 2),
    ...checkpoints.filter((c) => c.verdict !== "PASS").map((c) => `${c.id}:${c.verdict}`),
    ...(missingMeta.length ? [`meta missing: ${missingMeta.slice(0, 4).join(", ")}`] : []),
  ];

  const summary =
    verdict === "PASS"
      ? `Delivery READY for ${export_check.platform} — export + retention checkpoints clear.`
      : `Delivery ${verdict} for ${export_check.platform} — ${failBits.join(" · ") || "review required"}.`;

  return {
    ok: true,
    source: "delivery-gate-1.0",
    action: "check",
    verdict,
    summary,
    export_check,
    metadata,
    checkpoints,
  };
}

/** Exported for panel / tests — known PASS control. */
export function demoPassDeliveryGate(): DeliveryGateResult {
  return runDeliveryGate({ ...DEMO_PASS, demo: false, action: "check" });
}

export function listExportMatrix(): ExportSpec[] {
  return EXPORT_MATRIX.map((row) => ({ ...row }));
}
