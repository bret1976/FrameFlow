/**
 * FinishKit — feed-ready short-form finish planner.
 *
 * Idea inspired by reelsmith/reelkit (MIT). This is an original FrameFlow
 * TypeScript implementation (no vendored package, no clone of their source).
 * Spec targets follow common TikTok / Reels / Shorts feed playback practice
 * (−14 LUFS / −1.5 dBTP, 1080×1920, clean metadata, faststart). Pure
 * functions + ffmpeg command templates — local-first, no API keys.
 *
 * Complementary to: SafeKit (UI zones/contrast/SRT), PromoteGate (−16 promote
 * loudness gate), DeliveryGate (publish metadata / retention), ReelBeat
 * (beat/crop loudness hints).
 */

export type FinishKitAction = "check" | "plan" | "commands" | "demo" | "defaults";

export type FinishVerdict = "READY" | "NEEDS_FINISH" | "BLOCKED";

export type FinishCheckId =
  | "resolution"
  | "duration"
  | "loudness"
  | "true_peak"
  | "metadata"
  | "faststart"
  | "audio"
  | "codec";

export type FinishCheck = {
  id: FinishCheckId;
  ok: boolean;
  label: string;
  detail: string;
};

export type FinishStep = {
  id: "vertical" | "loud" | "strip" | "faststart" | "thumb";
  label: string;
  purpose: string;
  ffmpeg: string;
};

export type FinishKitRequest = {
  action?: FinishKitAction;
  demo?: boolean;
  /** Declared probe facts (optional — missing → fail/warn in checklist). */
  width?: number;
  height?: number;
  duration_sec?: number;
  /** Integrated loudness in LUFS (from ffmpeg loudnorm print_format=json). */
  lufs?: number;
  /** True peak in dBTP. */
  true_peak_dbtp?: number;
  /** Container/format tag keys (excluding brand atoms is handled here). */
  tags?: string[] | string;
  /** Whether moov is at the front (faststart). */
  faststart?: boolean;
  has_audio?: boolean;
  video_codec?: string;
  audio_codec?: string;
  pix_fmt?: string;
  /** Punch-in zoom for vertical cover-crop (≥1). */
  zoom?: number;
  crf?: number;
  input_path?: string;
  output_path?: string;
  thumb_at_sec?: number;
};

export type FinishTargets = {
  width: number;
  height: number;
  lufs: number;
  lufs_tolerance: number;
  true_peak_dbtp: number;
  lra: number;
  max_duration_sec: number;
  video_codec: string;
  audio_codec: string;
  audio_bitrate: string;
  sample_rate_hz: number;
  crf: number;
  pix_fmt: string;
};

export type FinishKitResult = {
  ok: true;
  source: "finish-kit-1.0";
  action: FinishKitAction;
  verdict: FinishVerdict;
  ready: boolean;
  exit_hint: 0 | 2;
  summary: string;
  targets: FinishTargets;
  checks: FinishCheck[];
  failing: string[];
  pipeline?: FinishStep[];
  commands?: Record<string, string>;
  notes: string[];
};

export type FinishKitParseResult =
  | { ok: true; request: FinishKitRequest }
  | { ok: false; error: string };

export const TARGET_W = 1080;
export const TARGET_H = 1920;
export const TARGET_LUFS = -14;
export const TARGET_TP = -1.5;
export const TARGET_LRA = 11;
export const LUFS_TOLERANCE = 1;
export const MAX_DURATION_SEC = 180;
export const DEFAULT_CRF = 18;
export const DEFAULT_ZOOM = 1;

/** MP4 brand atoms every muxer writes — not identifying metadata. */
export const BRAND_TAGS = new Set([
  "major_brand",
  "minor_version",
  "compatible_brands",
]);

export const DEFAULT_TARGETS: FinishTargets = {
  width: TARGET_W,
  height: TARGET_H,
  lufs: TARGET_LUFS,
  lufs_tolerance: LUFS_TOLERANCE,
  true_peak_dbtp: TARGET_TP,
  lra: TARGET_LRA,
  max_duration_sec: MAX_DURATION_SEC,
  video_codec: "libx264",
  audio_codec: "aac",
  audio_bitrate: "192k",
  sample_rate_hz: 48000,
  crf: DEFAULT_CRF,
  pix_fmt: "yuv420p",
};

const DEMO_PROBE: Required<
  Pick<
    FinishKitRequest,
    | "width"
    | "height"
    | "duration_sec"
    | "lufs"
    | "true_peak_dbtp"
    | "tags"
    | "faststart"
    | "has_audio"
    | "video_codec"
    | "audio_codec"
    | "pix_fmt"
    | "zoom"
    | "crf"
    | "input_path"
  >
> = {
  width: 1920,
  height: 1080,
  duration_sec: 42,
  lufs: -19.4,
  true_peak_dbtp: -0.3,
  tags: ["major_brand", "minor_version", "compatible_brands", "encoder", "title", "comment"],
  faststart: false,
  has_audio: true,
  video_codec: "h264",
  audio_codec: "aac",
  pix_fmt: "yuv420p",
  zoom: 1.05,
  crf: 18,
  input_path: "raw.mp4",
};

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function normalizeTags(tags: string[] | string | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags.map((t) => String(t).trim()).filter(Boolean);
  }
  return String(tags)
    .split(/[,|\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function extraMetaTags(tags: string[]): string[] {
  return [...new Set(tags.filter((t) => !BRAND_TAGS.has(t)))].sort();
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function shellQuote(path: string): string {
  if (/^[A-Za-z0-9._/@+-]+$/.test(path)) return path;
  return JSON.stringify(path);
}

export function parseFinishKitRequest(
  body: Record<string, unknown>
): FinishKitParseResult {
  const actionRaw = asString(body.action)?.toLowerCase();
  const demo = asBool(body.demo) === true || actionRaw === "demo";

  let action: FinishKitAction;
  if (demo) action = "demo";
  else if (
    actionRaw === "check" ||
    actionRaw === "plan" ||
    actionRaw === "commands" ||
    actionRaw === "defaults"
  ) {
    action = actionRaw;
  } else if (!actionRaw) {
    action = "check";
  } else {
    return {
      ok: false,
      error: "action must be one of: check | plan | commands | demo | defaults",
    };
  }

  const zoom = asNumber(body.zoom);
  if (zoom !== undefined && (zoom < 1 || zoom > 2)) {
    return { ok: false, error: "zoom must be between 1 and 2 (punch-in scale)." };
  }
  const crf = asNumber(body.crf);
  if (crf !== undefined && (crf < 12 || crf > 28)) {
    return { ok: false, error: "crf must be between 12 and 28." };
  }

  const tagsVal = body.tags;
  let tags: string[] | string | undefined;
  if (Array.isArray(tagsVal) || typeof tagsVal === "string") tags = tagsVal as string[] | string;
  else if (tagsVal !== undefined && tagsVal !== null) {
    return { ok: false, error: "tags must be a string or string array." };
  }

  return {
    ok: true,
    request: {
      action,
      demo,
      width: asNumber(body.width),
      height: asNumber(body.height),
      duration_sec: asNumber(body.duration_sec),
      lufs: asNumber(body.lufs),
      true_peak_dbtp: asNumber(body.true_peak_dbtp),
      tags,
      faststart: asBool(body.faststart),
      has_audio: asBool(body.has_audio),
      video_codec: asString(body.video_codec),
      audio_codec: asString(body.audio_codec),
      pix_fmt: asString(body.pix_fmt),
      zoom,
      crf,
      input_path: asString(body.input_path) || "input.mp4",
      output_path: asString(body.output_path),
      thumb_at_sec: asNumber(body.thumb_at_sec),
    },
  };
}

export function buildFinishCommands(opts: {
  input: string;
  output?: string;
  zoom?: number;
  crf?: number;
  thumbAt?: number;
}): Record<string, string> {
  const input = shellQuote(opts.input);
  const base = opts.input.replace(/\.[^.]+$/, "") || "clip";
  const finalOut = shellQuote(opts.output || `${base}.final.mp4`);
  const zoom = opts.zoom && opts.zoom >= 1 ? opts.zoom : DEFAULT_ZOOM;
  const crf = opts.crf ?? DEFAULT_CRF;
  const sw = Math.round(TARGET_W * zoom);
  const sh = Math.round(TARGET_H * zoom);
  const vf = `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${TARGET_W}:${TARGET_H},setsar=1`;
  const loudMeasure = `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`;
  const loudApply =
    `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=${TARGET_LRA}` +
    `:measured_I=<input_i>:measured_TP=<input_tp>:measured_LRA=<input_lra>` +
    `:measured_thresh=<input_thresh>:offset=<target_offset>:linear=true`;
  const at = opts.thumbAt ?? 1.0;

  return {
    vertical:
      `ffmpeg -y -i ${input} -vf "${vf}" -c:v libx264 -preset slow -crf ${crf} ` +
      `-pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart ${shellQuote(`${base}.9x16.mp4`)}`,
    loud_measure:
      `ffmpeg -hide_banner -i ${input} -af "${loudMeasure}" -vn -f null -`,
    loud_apply:
      `ffmpeg -y -i ${input} -af "${loudApply}" -c:v copy -c:a aac -b:a 192k -ar 48000 ` +
      `-movflags +faststart ${shellQuote(`${base}.loud.mp4`)}`,
    strip:
      `ffmpeg -y -i ${input} -map 0 -map_metadata -1 -map_chapters -1 ` +
      `-fflags +bitexact -c copy -movflags +faststart ${shellQuote(`${base}.clean.mp4`)}`,
    faststart:
      `ffmpeg -y -i ${input} -c copy -movflags +faststart ${shellQuote(`${base}.fs.mp4`)}`,
    thumb:
      `ffmpeg -y -ss ${at.toFixed(3)} -i ${input} -frames:v 1 -q:v 2 -map_metadata -1 ` +
      `${shellQuote(`${base}.cover.jpg`)}`,
    finish_chain:
      `# vertical → two-pass loud (−14 LUFS) → strip+faststart → ${finalOut}\n` +
      `# 1) vertical cover-crop to 1080x1920 (zoom=${zoom})\n` +
      `# 2) loudnorm measure then linear apply\n` +
      `# 3) strip metadata + chapters, movflags +faststart`,
  };
}

export function buildPipeline(opts: {
  input: string;
  zoom?: number;
  crf?: number;
  thumbAt?: number;
}): FinishStep[] {
  const cmds = buildFinishCommands(opts);
  return [
    {
      id: "vertical",
      label: "Vertical 9:16",
      purpose: "Scale/cover-crop to 1080×1920 (optional punch-in zoom).",
      ffmpeg: cmds.vertical,
    },
    {
      id: "loud",
      label: "Loudness −14 LUFS",
      purpose: "Two-pass EBU R128 loudnorm to feed playback level (−14 / −1.5 dBTP).",
      ffmpeg: `${cmds.loud_measure}\n${cmds.loud_apply}`,
    },
    {
      id: "strip",
      label: "Strip metadata",
      purpose: "Remove container/stream tags and chapters without re-encoding.",
      ffmpeg: cmds.strip,
    },
    {
      id: "faststart",
      label: "Faststart",
      purpose: "Move moov atom to the front for instant playback.",
      ffmpeg: cmds.faststart,
    },
    {
      id: "thumb",
      label: "Cover frame",
      purpose: "Grab a full-quality JPG cover at a timestamp.",
      ffmpeg: cmds.thumb,
    },
  ];
}

export function runChecklist(req: FinishKitRequest): FinishCheck[] {
  const checks: FinishCheck[] = [];
  const w = req.width;
  const h = req.height;

  if (w === undefined || h === undefined) {
    checks.push({
      id: "resolution",
      ok: false,
      label: "Resolution 1080×1920",
      detail: "width/height not provided — pass probe facts or run demo.",
    });
  } else {
    const ok = w === TARGET_W && h === TARGET_H;
    checks.push({
      id: "resolution",
      ok,
      label: "Resolution 1080×1920",
      detail: ok
        ? `${w}×${h} matches feed canvas.`
        : `${w}×${h} (want ${TARGET_W}×${TARGET_H}) — run vertical cover-crop.`,
    });
  }

  if (req.duration_sec === undefined) {
    checks.push({
      id: "duration",
      ok: false,
      label: `Duration ≤ ${MAX_DURATION_SEC}s`,
      detail: "duration_sec not provided.",
    });
  } else {
    const ok = req.duration_sec > 0 && req.duration_sec <= MAX_DURATION_SEC;
    checks.push({
      id: "duration",
      ok,
      label: `Duration ≤ ${MAX_DURATION_SEC}s`,
      detail: ok
        ? `${round1(req.duration_sec)}s within Shorts/Reels window.`
        : `${round1(req.duration_sec)}s outside 0–${MAX_DURATION_SEC}s.`,
    });
  }

  const hasAudio = req.has_audio;
  if (hasAudio === false) {
    checks.push({
      id: "audio",
      ok: false,
      label: "Audio track",
      detail: "No audio track — feed posts need AAC dialogue/music.",
    });
  } else if (hasAudio === undefined && req.lufs === undefined) {
    checks.push({
      id: "audio",
      ok: false,
      label: "Audio track",
      detail: "has_audio / lufs not provided.",
    });
  } else {
    checks.push({
      id: "audio",
      ok: true,
      label: "Audio track",
      detail: "Audio present (or LUFS supplied).",
    });
  }

  if (req.lufs === undefined) {
    checks.push({
      id: "loudness",
      ok: false,
      label: `Loudness ${TARGET_LUFS}±${LUFS_TOLERANCE} LUFS`,
      detail: "lufs not provided — measure with ffmpeg loudnorm print_format=json.",
    });
  } else {
    const ok = Math.abs(req.lufs - TARGET_LUFS) <= LUFS_TOLERANCE;
    checks.push({
      id: "loudness",
      ok,
      label: `Loudness ${TARGET_LUFS}±${LUFS_TOLERANCE} LUFS`,
      detail: ok
        ? `${round1(req.lufs)} LUFS within feed target.`
        : `${round1(req.lufs)} LUFS (want ${TARGET_LUFS}±${LUFS_TOLERANCE}) — platforms normalize quiet/loud uploads unevenly.`,
    });
  }

  if (req.true_peak_dbtp === undefined) {
    checks.push({
      id: "true_peak",
      ok: false,
      label: `True peak ≤ ${TARGET_TP} dBTP`,
      detail: "true_peak_dbtp not provided.",
    });
  } else {
    const ok = req.true_peak_dbtp <= TARGET_TP;
    checks.push({
      id: "true_peak",
      ok,
      label: `True peak ≤ ${TARGET_TP} dBTP`,
      detail: ok
        ? `${round1(req.true_peak_dbtp)} dBTP under ceiling.`
        : `${round1(req.true_peak_dbtp)} dBTP exceeds ${TARGET_TP} — leave encoder headroom.`,
    });
  }

  if (req.tags === undefined) {
    checks.push({
      id: "metadata",
      ok: false,
      label: "Metadata clean",
      detail: "tags not provided — pass format tag keys from ffprobe.",
    });
  } else {
    const extra = extraMetaTags(normalizeTags(req.tags));
    const ok = extra.length === 0;
    checks.push({
      id: "metadata",
      ok,
      label: "Metadata clean",
      detail: ok
        ? "Only brand atoms present (or none)."
        : `Extra tags: ${extra.join(", ")} — strip before upload.`,
    });
  }

  if (req.faststart === undefined) {
    checks.push({
      id: "faststart",
      ok: false,
      label: "Faststart (moov front)",
      detail: "faststart not provided — prefer -movflags +faststart.",
    });
  } else {
    checks.push({
      id: "faststart",
      ok: req.faststart,
      label: "Faststart (moov front)",
      detail: req.faststart
        ? "moov at front — instant start."
        : "moov not front-loaded — remux with +faststart.",
    });
  }

  const codec = (req.video_codec || "").toLowerCase();
  if (!codec) {
    checks.push({
      id: "codec",
      ok: false,
      label: "H.264 / yuv420p",
      detail: "video_codec not provided.",
    });
  } else {
    const h264 = codec.includes("264") || codec.includes("avc");
    const pixOk = !req.pix_fmt || req.pix_fmt.toLowerCase() === "yuv420p";
    const ok = h264 && pixOk;
    checks.push({
      id: "codec",
      ok,
      label: "H.264 / yuv420p",
      detail: ok
        ? `${req.video_codec}${req.pix_fmt ? ` / ${req.pix_fmt}` : ""} compatible.`
        : `${req.video_codec || "?"}${req.pix_fmt ? ` / ${req.pix_fmt}` : ""} — prefer libx264 + yuv420p.`,
    });
  }

  return checks;
}

function verdictFrom(checks: FinishCheck[]): {
  verdict: FinishVerdict;
  ready: boolean;
  exit_hint: 0 | 2;
} {
  const failing = checks.filter((c) => !c.ok);
  if (failing.length === 0) {
    return { verdict: "READY", ready: true, exit_hint: 0 };
  }
  const blockedIds = new Set(["audio", "duration"]);
  const blocked = failing.some((c) => blockedIds.has(c.id) && c.detail.includes("No audio"));
  if (blocked || failing.some((c) => c.id === "duration" && c.detail.includes("outside"))) {
    return { verdict: "BLOCKED", ready: false, exit_hint: 2 };
  }
  return { verdict: "NEEDS_FINISH", ready: false, exit_hint: 2 };
}

export function runFinishKit(request: FinishKitRequest): FinishKitResult {
  const action = request.action || "check";

  if (action === "defaults") {
    return {
      ok: true,
      source: "finish-kit-1.0",
      action: "defaults",
      verdict: "READY",
      ready: true,
      exit_hint: 0,
      summary: "FinishKit defaults: 1080×1920 · −14 LUFS / −1.5 dBTP · strip · faststart.",
      targets: DEFAULT_TARGETS,
      checks: [],
      failing: [],
      notes: [
        "Feed loudness (−14) differs from PromoteGate’s −16±1 promote gate — use both.",
        "Pass ffprobe width/height/tags + loudnorm input_i / input_tp into action=check.",
        "Brand atoms (major_brand, minor_version, compatible_brands) are ignored.",
      ],
    };
  }

  const effective: FinishKitRequest =
    action === "demo"
      ? { ...DEMO_PROBE, action: "demo", input_path: DEMO_PROBE.input_path }
      : request;

  const checks = runChecklist(effective);
  const { verdict, ready, exit_hint } = verdictFrom(checks);
  const failing = checks.filter((c) => !c.ok).map((c) => c.id);
  const zoom = effective.zoom ?? DEFAULT_ZOOM;
  const crf = effective.crf ?? DEFAULT_CRF;
  const input = effective.input_path || "input.mp4";
  const pipeline = buildPipeline({
    input,
    zoom,
    crf,
    thumbAt: effective.thumb_at_sec,
  });
  const commands = buildFinishCommands({
    input,
    output: effective.output_path,
    zoom,
    crf,
    thumbAt: effective.thumb_at_sec,
  });

  const summaryParts: string[] = [];
  if (ready) summaryParts.push("READY to post");
  else summaryParts.push(`${verdict}: ${failing.length} check(s) failing`);
  if (effective.width && effective.height) {
    summaryParts.push(`${effective.width}×${effective.height}`);
  }
  if (effective.lufs !== undefined) summaryParts.push(`${round1(effective.lufs)} LUFS`);

  const notes: string[] = [
    "Finish chain: vertical → two-pass loudnorm (−14) → strip metadata → faststart.",
    "Complementary to SafeKit (zones) and PromoteGate (−16 promote) — do not duplicate those.",
  ];
  if (action === "demo") {
    notes.push(
      "Demo probe is a landscape −19 LUFS export with metadata — expect NEEDS_FINISH."
    );
  }

  const includePlan = action === "plan" || action === "commands" || action === "demo" || !ready;
  const includeCommands = action === "commands" || action === "demo" || action === "plan";

  return {
    ok: true,
    source: "finish-kit-1.0",
    action: action === "demo" ? "demo" : action,
    verdict,
    ready,
    exit_hint,
    summary: summaryParts.join(" · "),
    targets: DEFAULT_TARGETS,
    checks,
    failing,
    pipeline: includePlan ? pipeline : undefined,
    commands: includeCommands ? commands : undefined,
    notes,
  };
}
