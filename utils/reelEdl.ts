import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkMediaTools, mediaToolsMissingMessage, prepareScrubSource } from "./agentScrub";

const execFileAsync = promisify(execFile);

export type ReelEdlAction = "silence" | "build";

export type TimeRange = {
  id: string;
  start_s: number;
  end_s: number;
  duration_s: number;
};

export type ReelEdlRequest = {
  action: ReelEdlAction;
  source?: string;
  duration_s?: number;
  noise_db?: number;
  min_silence_s?: number;
  pad_s?: number;
  min_keep_s?: number;
  keep?: { start_s: number; end_s: number }[];
};

export type ReelEdlDocument = {
  version: 1;
  kind: "reel";
  source: string | null;
  duration_s: number;
  proxy: { width: 540; height: 960 };
  final: { width: 1080; height: 1920 };
  segments: TimeRange[];
  dropped_s: number;
  kept_s: number;
  saved_pct: number;
};

export type ReelEdlResult = {
  ok: true;
  action: ReelEdlAction;
  source: string | null;
  duration_s: number;
  has_audio: boolean;
  noise_db: number;
  min_silence_s: number;
  pad_s: number;
  min_keep_s: number;
  silences: TimeRange[];
  keep: TimeRange[];
  dropped_s: number;
  kept_s: number;
  saved_pct: number;
  edl: ReelEdlDocument;
  ffmpeg_proxy: string;
  ffmpeg_final: string;
  message?: string;
};

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

const clampNum = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const rangeId = (prefix: string, index: number): string => `${prefix}${String(index + 1).padStart(2, "0")}`;

const toRange = (prefix: string, index: number, start: number, end: number): TimeRange => {
  const start_s = round3(Math.max(0, start));
  const end_s = round3(Math.max(start_s, end));
  return { id: rangeId(prefix, index), start_s, end_s, duration_s: round3(end_s - start_s) };
};

export const invertSilences = (
  duration_s: number,
  silences: { start_s: number; end_s: number }[],
  pad_s: number,
  min_keep_s: number,
): TimeRange[] => {
  const dur = Math.max(0, duration_s);
  const pad = Math.max(0, pad_s);
  const minKeep = Math.max(0, min_keep_s);
  const cleaned = silences
    .map((s) => ({
      start_s: Math.max(0, Math.min(dur, s.start_s)),
      end_s: Math.max(0, Math.min(dur, s.end_s)),
    }))
    .filter((s) => s.end_s - s.start_s > 0.01)
    .sort((a, b) => a.start_s - b.start_s);

  const merged: { start_s: number; end_s: number }[] = [];
  for (const s of cleaned) {
    const last = merged[merged.length - 1];
    if (!last || s.start_s > last.end_s + 0.01) merged.push({ ...s });
    else last.end_s = Math.max(last.end_s, s.end_s);
  }

  const keep: TimeRange[] = [];
  let cursor = 0;
  for (const silence of merged) {
    const keepStart = cursor;
    const keepEnd = Math.max(keepStart, silence.start_s + pad);
    if (keepEnd - keepStart >= minKeep) {
      keep.push(toRange("k", keep.length, keepStart, Math.min(dur, keepEnd)));
    }
    cursor = Math.min(dur, Math.max(cursor, silence.end_s - pad));
  }
  if (dur - cursor >= minKeep) {
    keep.push(toRange("k", keep.length, cursor, dur));
  }
  return keep;
};

const parseSilenceLog = (log: string, duration_s: number): TimeRange[] => {
  const starts: number[] = [];
  const ends: number[] = [];
  const startRe = /silence_start:\s*([0-9.]+)/g;
  const endRe = /silence_end:\s*([0-9.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = startRe.exec(log))) starts.push(Number(match[1]));
  while ((match = endRe.exec(log))) ends.push(Number(match[1]));

  const silences: TimeRange[] = [];
  let ei = 0;
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    let end = duration_s;
    if (ei < ends.length && ends[ei] >= start) {
      end = ends[ei];
      ei += 1;
    }
    silences.push(toRange("s", silences.length, start, end));
  }
  return silences;
};

const probeDuration = async (input: string): Promise<{ duration_s: number; has_audio: boolean }> => {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      input,
    ],
    { timeout: 20000, maxBuffer: 2 * 1024 * 1024 },
  );
  const json = JSON.parse(stdout || "{}");
  const formatDur = Number(json?.format?.duration);
  const streams: any[] = Array.isArray(json?.streams) ? json.streams : [];
  const streamDur = streams
    .map((s) => Number(s?.duration))
    .filter((n) => Number.isFinite(n) && n > 0);
  const duration_s = Number.isFinite(formatDur) && formatDur > 0
    ? formatDur
    : streamDur.length
      ? Math.max(...streamDur)
      : 0;
  const has_audio = streams.some((s) => s?.codec_type === "audio");
  return { duration_s: round3(duration_s), has_audio };
};

const detectSilences = async (
  input: string,
  noise_db: number,
  min_silence_s: number,
): Promise<string> => {
  try {
    const { stderr } = await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-i", input,
        "-vn",
        "-af", `silencedetect=noise=${noise_db}dB:d=${min_silence_s}`,
        "-f", "null",
        "-",
      ],
      { timeout: 90000, maxBuffer: 8 * 1024 * 1024 },
    );
    return `${stderr || ""}`;
  } catch (error: any) {
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    if (stderr.includes("silence_start") || stderr.includes("silence_end")) return stderr;
    throw new Error(stderr.trim() || error?.message || "silencedetect failed");
  }
};

const ffmpegCutCommand = (
  source: string,
  keep: TimeRange[],
  size: { width: number; height: number },
  outfile: string,
): string => {
  if (!keep.length) {
    return `# no keep ranges — nothing to render for ${outfile}`;
  }
  const vParts: string[] = [];
  const aParts: string[] = [];
  const concat: string[] = [];
  keep.forEach((seg, i) => {
    vParts.push(
      `[0:v]trim=start=${seg.start_s}:end=${seg.end_s},setpts=PTS-STARTPTS,scale=${size.width}:${size.height}:force_original_aspect_ratio=increase,crop=${size.width}:${size.height}[v${i}]`,
    );
    aParts.push(
      `[0:a]atrim=start=${seg.start_s}:end=${seg.end_s},asetpts=PTS-STARTPTS[a${i}]`,
    );
    concat.push(`[v${i}][a${i}]`);
  });
  const filter = `${vParts.join(";")};${aParts.join(";")};${concat.join("")}concat=n=${keep.length}:v=1:a=1[outv][outa]`;
  return `ffmpeg -y -i ${JSON.stringify(source)} -filter_complex ${JSON.stringify(filter)} -map "[outv]" -map "[outa]" -movflags +faststart ${JSON.stringify(outfile)}`;
};

const buildEdl = (source: string | null, duration_s: number, keep: TimeRange[]): ReelEdlDocument => {
  const kept_s = round3(keep.reduce((sum, k) => sum + k.duration_s, 0));
  const dropped_s = round3(Math.max(0, duration_s - kept_s));
  const saved_pct = duration_s > 0 ? round3((dropped_s / duration_s) * 100) : 0;
  return {
    version: 1,
    kind: "reel",
    source,
    duration_s,
    proxy: { width: 540, height: 960 },
    final: { width: 1080, height: 1920 },
    segments: keep,
    dropped_s,
    kept_s,
    saved_pct,
  };
};

export const parseReelEdlRequest = (
  body: Record<string, unknown>,
): { ok: true; request: ReelEdlRequest } | { ok: false; error: string } => {
  const actionRaw = typeof body.action === "string" ? body.action.trim().toLowerCase() : "silence";
  if (actionRaw !== "silence" && actionRaw !== "build") {
    return { ok: false, error: "action must be silence or build." };
  }
  const source = typeof body.source === "string" ? body.source.trim() : "";
  if (actionRaw === "silence" && !source) {
    return { ok: false, error: "Pass a video URL, data URL, or local path as source." };
  }
  const keepIn = Array.isArray(body.keep)
    ? (body.keep as any[])
        .map((row) => ({
          start_s: Number(row?.start_s),
          end_s: Number(row?.end_s),
        }))
        .filter((row) => Number.isFinite(row.start_s) && Number.isFinite(row.end_s) && row.end_s > row.start_s)
    : undefined;
  if (actionRaw === "build" && !source && !keepIn?.length && !Number.isFinite(Number(body.duration_s))) {
    return { ok: false, error: "build needs source, or duration_s plus keep ranges." };
  }
  return {
    ok: true,
    request: {
      action: actionRaw,
      source: source || undefined,
      duration_s: Number.isFinite(Number(body.duration_s)) ? Number(body.duration_s) : undefined,
      noise_db: clampNum(body.noise_db, -30, -60, -10),
      min_silence_s: clampNum(body.min_silence_s, 0.4, 0.15, 5),
      pad_s: clampNum(body.pad_s, 0.08, 0, 1),
      min_keep_s: clampNum(body.min_keep_s, 0.35, 0.05, 5),
      keep: keepIn,
    },
  };
};

export { checkMediaTools, mediaToolsMissingMessage };

export const runReelEdl = async (
  request: ReelEdlRequest,
  resolveUrl?: (url: string) => Promise<string>,
): Promise<ReelEdlResult> => {
  const noise_db = request.noise_db ?? -30;
  const min_silence_s = request.min_silence_s ?? 0.4;
  const pad_s = request.pad_s ?? 0.08;
  const min_keep_s = request.min_keep_s ?? 0.35;

  if (request.action === "build" && !request.source) {
    const duration_s = round3(Math.max(0, request.duration_s || 0));
    const keep = (request.keep || []).map((k, i) => toRange("k", i, k.start_s, k.end_s));
    const edl = buildEdl(null, duration_s, keep);
    return {
      ok: true,
      action: "build",
      source: null,
      duration_s,
      has_audio: true,
      noise_db,
      min_silence_s,
      pad_s,
      min_keep_s,
      silences: [],
      keep,
      dropped_s: edl.dropped_s,
      kept_s: edl.kept_s,
      saved_pct: edl.saved_pct,
      edl,
      ffmpeg_proxy: ffmpegCutCommand("SOURCE.mp4", keep, edl.proxy, "proxy-540x960.mp4"),
      ffmpeg_final: ffmpegCutCommand("SOURCE.mp4", keep, edl.final, "final-1080x1920.mp4"),
      message: keep.length ? `EDL with ${keep.length} keep range(s).` : "EDL has no keep ranges.",
    };
  }

  const source = String(request.source || "").trim();
  const prepared = await prepareScrubSource(source, resolveUrl);
  try {
    const probe = await probeDuration(prepared.input);
    const duration_s = probe.duration_s > 0 ? probe.duration_s : round3(request.duration_s || 0);
    if (duration_s <= 0) throw new Error("Could not read duration from this source.");

    let silences: TimeRange[] = [];
    if (request.action === "silence") {
      if (!probe.has_audio) {
        const keepAll = [toRange("k", 0, 0, duration_s)];
        const edl = buildEdl(source, duration_s, keepAll);
        return {
          ok: true,
          action: "silence",
          source,
          duration_s,
          has_audio: false,
          noise_db,
          min_silence_s,
          pad_s,
          min_keep_s,
          silences: [],
          keep: keepAll,
          dropped_s: 0,
          kept_s: duration_s,
          saved_pct: 0,
          edl,
          ffmpeg_proxy: ffmpegCutCommand(source, keepAll, edl.proxy, "proxy-540x960.mp4"),
          ffmpeg_final: ffmpegCutCommand(source, keepAll, edl.final, "final-1080x1920.mp4"),
          message: "No audio stream — nothing to silence-trim. EDL keeps the full clip.",
        };
      }
      const log = await detectSilences(prepared.input, noise_db, min_silence_s);
      silences = parseSilenceLog(log, duration_s);
    }

    const keep = request.keep?.length
      ? request.keep.map((k, i) => toRange("k", i, k.start_s, k.end_s))
      : invertSilences(duration_s, silences, pad_s, min_keep_s);
    const edl = buildEdl(source, duration_s, keep);
    return {
      ok: true,
      action: request.action,
      source,
      duration_s,
      has_audio: probe.has_audio,
      noise_db,
      min_silence_s,
      pad_s,
      min_keep_s,
      silences,
      keep,
      dropped_s: edl.dropped_s,
      kept_s: edl.kept_s,
      saved_pct: edl.saved_pct,
      edl,
      ffmpeg_proxy: ffmpegCutCommand(source, keep, edl.proxy, "proxy-540x960.mp4"),
      ffmpeg_final: ffmpegCutCommand(source, keep, edl.final, "final-1080x1920.mp4"),
      message: silences.length
        ? `Cut ${silences.length} silent gap(s); kept ${keep.length} range(s), saved ${edl.saved_pct}%.`
        : keep.length
          ? `No silence gaps at ${noise_db}dB / ${min_silence_s}s. EDL keeps the full clip.`
          : "No keep ranges.",
    };
  } finally {
    await prepared.cleanup();
  }
};
