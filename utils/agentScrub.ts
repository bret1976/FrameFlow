import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

export type AgentScrubAction = "info" | "transcript" | "motion" | "frames";

export type AgentScrubRequest = {
  action: AgentScrubAction;
  source: string;
  start_s?: number;
  end_s?: number;
  query?: string;
  fps?: number;
  width?: number;
};

export type TranscriptLine = {
  start_s: number;
  end_s: number;
  text: string;
};

export type AgentScrubResult =
  | {
      ok: true;
      action: "info";
      title: string | null;
      duration_s: number | null;
      width: number | null;
      height: number | null;
      fps: number | null;
      has_audio: boolean;
      has_video: boolean;
      chapters: { start_s: number; title: string }[];
      transcript_status: "unavailable" | "embedded_captions_possible" | "needs_whisper";
      message?: string;
    }
  | {
      ok: true;
      action: "transcript";
      lines: TranscriptLine[];
      query: string | null;
      matched: number;
      source_kind: "embedded" | "stub" | "empty";
      message?: string;
    }
  | {
      ok: true;
      action: "motion";
      start_s: number;
      end_s: number;
      bucket_s: number;
      scores: number[];
      max: number;
      mean: number;
      message?: string;
    }
  | {
      ok: true;
      action: "frames";
      start_s: number;
      end_s: number;
      fps: number;
      frames: { t_s: number; mime: string; base64: string }[];
      message?: string;
    };

const FFMPEG_HINT =
  "Install ffmpeg/ffprobe (e.g. `brew install ffmpeg` or `apt-get install ffmpeg`) and restart the server.";

let toolsCache: { ffmpeg: boolean; ffprobe: boolean; checkedAt: number } | null = null;

export const checkMediaTools = async (): Promise<{ ffmpeg: boolean; ffprobe: boolean }> => {
  const now = Date.now();
  if (toolsCache && now - toolsCache.checkedAt < 30_000) {
    return { ffmpeg: toolsCache.ffmpeg, ffprobe: toolsCache.ffprobe };
  }
  const ffmpeg = await execFileAsync("ffmpeg", ["-version"], { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  const ffprobe = await execFileAsync("ffprobe", ["-version"], { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  toolsCache = { ffmpeg, ffprobe, checkedAt: now };
  return { ffmpeg, ffprobe };
};

export const mediaToolsMissingMessage = (): string =>
  `ffmpeg/ffprobe not found on PATH. ${FFMPEG_HINT}`;

const clampNum = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);
const isDataUrl = (value: string): boolean => /^data:/i.test(value);

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
};

/** Prepare a local path (or ffmpeg-readable URL) for scrub ops. Caller must cleanup(). */
export const prepareScrubSource = async (
  source: string,
  resolveUrl?: (url: string) => Promise<string>,
): Promise<{ input: string; cleanup: () => Promise<void> }> => {
  const trimmed = String(source || "").trim();
  if (!trimmed) throw new Error("source is required");

  const cleanups: Array<() => Promise<void>> = [];
  const cleanup = async () => {
    for (const fn of cleanups.reverse()) {
      await fn().catch(() => undefined);
    }
  };

  if (isDataUrl(trimmed)) {
    const match = trimmed.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/i);
    if (!match) throw new Error("Invalid data URL source.");
    const isB64 = Boolean(match[2]);
    const payload = match[3] || "";
    const buffer = isB64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
    if (buffer.length > 80 * 1024 * 1024) throw new Error("Source data is limited to 80 MB.");
    const dir = await mkdtemp(path.join(os.tmpdir(), "frameflow-scrub-"));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    const mime = (match[1] || "").toLowerCase();
    const ext = mime.includes("webm") ? "webm" : mime.includes("quicktime") || mime.includes("mov") ? "mov" : "mp4";
    const filePath = path.join(dir, `source.${ext}`);
    await writeFile(filePath, buffer);
    return { input: filePath, cleanup };
  }

  if (!isHttpUrl(trimmed) && (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("./") || trimmed.startsWith("../"))) {
    if (!(await pathExists(trimmed))) throw new Error(`Local path not found: ${trimmed}`);
    return { input: trimmed, cleanup };
  }

  if (isHttpUrl(trimmed)) {
    let playable = trimmed;
    if (resolveUrl) {
      try {
        playable = await resolveUrl(trimmed);
      } catch {
        playable = trimmed;
      }
    }
    // Prefer a Node fetch download so ffprobe always sees a local file.
    // Railway's ffmpeg/ffprobe often cannot probe remote http(s) URLs.
    const dir = await mkdtemp(path.join(os.tmpdir(), "frameflow-scrub-"));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    const outPath = path.join(dir, "source.mp4");
    const MAX_BYTES = 80 * 1024 * 1024;

    const downloadWithFetch = async (url: string): Promise<void> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      try {
        const res = await fetch(url, {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            Accept: "*/*",
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} downloading source`);
        const lenHeader = res.headers.get("content-length");
        if (lenHeader && Number(lenHeader) > MAX_BYTES) {
          throw new Error("Source download is limited to 80 MB.");
        }
        if (!res.body) throw new Error("Empty response body");
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          total += value.byteLength;
          if (total > MAX_BYTES) throw new Error("Source download is limited to 80 MB.");
          chunks.push(value);
        }
        await writeFile(outPath, Buffer.concat(chunks.map((c) => Buffer.from(c))));
      } finally {
        clearTimeout(timer);
      }
    };

    let fetchErr: unknown = null;
    try {
      await downloadWithFetch(playable);
      return { input: outPath, cleanup };
    } catch (err) {
      fetchErr = err;
      // Secondary: ffmpeg -i URL -c copy into the same temp path.
      try {
        await execFileAsync(
          "ffmpeg",
          ["-hide_banner", "-y", "-i", playable, "-c", "copy", "-movflags", "+faststart", outPath],
          { timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
        );
        return { input: outPath, cleanup };
      } catch {
        // Do not return the raw remote URL — Railway ffprobe cannot probe http(s).
        // Surface the download failure so callers get a clear error.
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        cleanups.length = 0;
        const msg =
          fetchErr instanceof Error
            ? fetchErr.message
            : "Failed to download http(s) source for scrub.";
        throw new Error(`Could not download source for local ffprobe: ${msg}`);
      }
    }
  }

  throw new Error("source must be an http(s) URL, data URL, or readable local path.");
};

const probeJson = async (input: string): Promise<any> => {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", "-show_chapters", input],
    { timeout: 60000, maxBuffer: 8 * 1024 * 1024 },
  );
  return JSON.parse(stdout || "{}");
};

const parseFps = (rate: string | undefined): number | null => {
  if (!rate) return null;
  if (rate.includes("/")) {
    const [a, b] = rate.split("/").map(Number);
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return Math.round((a / b) * 1000) / 1000;
  }
  const n = Number(rate);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const runInfo = async (input: string): Promise<AgentScrubResult> => {
  const probe = await probeJson(input);
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const video = streams.find((s: any) => s.codec_type === "video");
  const audio = streams.find((s: any) => s.codec_type === "audio");
  const subs = streams.filter((s: any) => s.codec_type === "subtitle");
  const duration = Number(probe.format?.duration);
  const chapters = Array.isArray(probe.chapters)
    ? probe.chapters.map((ch: any) => ({
        start_s: Number(ch.start_time) || 0,
        title: String(ch.tags?.title || ch.tags?.TITLE || `Chapter ${ch.id ?? ""}`).trim() || "Chapter",
      }))
    : [];

  const hasKey = Boolean(process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY);
  let transcript_status: "unavailable" | "embedded_captions_possible" | "needs_whisper" = "unavailable";
  if (subs.length > 0) transcript_status = "embedded_captions_possible";
  else if (!hasKey) transcript_status = "needs_whisper";
  else transcript_status = "needs_whisper";

  return {
    ok: true,
    action: "info",
    title: probe.format?.tags?.title || probe.format?.tags?.TITLE || null,
    duration_s: Number.isFinite(duration) ? duration : null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    fps: parseFps(video?.avg_frame_rate || video?.r_frame_rate),
    has_audio: Boolean(audio),
    has_video: Boolean(video),
    chapters,
    transcript_status,
    message:
      transcript_status === "needs_whisper" && !hasKey
        ? "No embedded captions detected. Set OPENAI_API_KEY (or Groq-compatible key) for Whisper transcription — optional."
        : undefined,
  };
};

const extractEmbeddedSubs = async (input: string): Promise<TranscriptLine[]> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "frameflow-subs-"));
  try {
    const srtPath = path.join(dir, "captions.srt");
    try {
      await execFileAsync(
        "ffmpeg",
        ["-hide_banner", "-y", "-i", input, "-map", "0:s:0?", "-f", "srt", srtPath],
        { timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
      );
    } catch {
      return [];
    }
    if (!(await pathExists(srtPath))) return [];
    const raw = await readFile(srtPath, "utf8");
    return parseSrt(raw);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const parseSrt = (raw: string): TranscriptLine[] => {
  const blocks = raw.replace(/\r\n/g, "\n").split(/\n\n+/);
  const lines: TranscriptLine[] = [];
  for (const block of blocks) {
    const parts = block.trim().split("\n");
    if (parts.length < 2) continue;
    const timeIdx = parts[0].includes("-->") ? 0 : 1;
    const timeLine = parts[timeIdx] || "";
    const m = timeLine.match(
      /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/,
    );
    if (!m) continue;
    const toSec = (h: string, mi: string, s: string, ms: string) =>
      Number(h) * 3600 + Number(mi) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
    const text = parts.slice(timeIdx + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    lines.push({
      start_s: toSec(m[1], m[2], m[3], m[4]),
      end_s: toSec(m[5], m[6], m[7], m[8]),
      text,
    });
  }
  return lines;
};

const filterTranscript = (
  lines: TranscriptLine[],
  start_s?: number,
  end_s?: number,
  query?: string,
): { lines: TranscriptLine[]; matched: number } => {
  let filtered = lines;
  if (typeof start_s === "number" && Number.isFinite(start_s)) {
    filtered = filtered.filter((l) => l.end_s >= start_s);
  }
  if (typeof end_s === "number" && Number.isFinite(end_s)) {
    filtered = filtered.filter((l) => l.start_s <= end_s);
  }
  const q = (query || "").trim().toLowerCase();
  if (!q) return { lines: filtered, matched: filtered.length };

  const hits: TranscriptLine[] = [];
  for (let i = 0; i < filtered.length; i++) {
    if (!filtered[i].text.toLowerCase().includes(q)) continue;
    const from = Math.max(0, i - 2);
    const to = Math.min(filtered.length - 1, i + 2);
    for (let j = from; j <= to; j++) hits.push(filtered[j]);
  }
  // de-dupe by start+text
  const seen = new Set<string>();
  const unique = hits.filter((l) => {
    const key = `${l.start_s}|${l.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { lines: unique, matched: unique.length };
};

const runTranscript = async (
  input: string,
  opts: { start_s?: number; end_s?: number; query?: string },
): Promise<AgentScrubResult> => {
  const embedded = await extractEmbeddedSubs(input);
  if (embedded.length) {
    const { lines, matched } = filterTranscript(embedded, opts.start_s, opts.end_s, opts.query);
    return {
      ok: true,
      action: "transcript",
      lines,
      query: opts.query?.trim() || null,
      matched,
      source_kind: "embedded",
    };
  }

  const hasKey = Boolean(process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY);
  return {
    ok: true,
    action: "transcript",
    lines: [],
    query: opts.query?.trim() || null,
    matched: 0,
    source_kind: "stub",
    message: hasKey
      ? "No embedded captions found. Whisper transcription is not wired in this build — paste captions or re-mux a file with subtitles."
      : "No embedded captions found. Whisper/OpenAI transcription is optional — set OPENAI_API_KEY (or Groq-compatible) later if you want ASR. For now, paste a transcript into Viral Judge or provide a video with captions.",
  };
};

const runMotion = async (
  input: string,
  opts: { start_s?: number; end_s?: number },
): Promise<AgentScrubResult> => {
  const probe = await probeJson(input);
  const duration = Number(probe.format?.duration);
  const start = clampNum(opts.start_s, 0, 0, Number.isFinite(duration) ? duration : 1e9);
  let end = clampNum(
    opts.end_s,
    Number.isFinite(duration) ? Math.min(duration, start + 60) : start + 60,
    start + 0.1,
    Number.isFinite(duration) ? duration : start + 600,
  );
  if (end - start > 600) end = start + 600;

  const span = Math.max(0.1, end - start);
  const sampleFps = span > 120 ? 1 : span > 30 ? 2 : 4;
  const width = 64;
  const video = (probe.streams || []).find((s: any) => s.codec_type === "video");
  const srcW = Number(video?.width) || width;
  const srcH = Number(video?.height) || width;
  const frameH = Math.max(2, Math.round(((srcH / Math.max(1, srcW)) * width) / 2) * 2);
  const frameBytes = width * frameH;

  const dir = await mkdtemp(path.join(os.tmpdir(), "frameflow-motion-"));
  let raw: Buffer = Buffer.alloc(0);
  try {
    const rawPath = path.join(dir, "gray.raw");
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-y",
        "-ss", String(start),
        "-to", String(end),
        "-i", input,
        "-an",
        "-vf", `scale=${width}:${frameH},format=gray,fps=${sampleFps}`,
        "-f", "rawvideo",
        rawPath,
      ],
      { timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
    );
    raw = await readFile(rawPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  if (frameBytes <= 0 || raw.length < frameBytes * 2) {
    return {
      ok: true,
      action: "motion",
      start_s: start,
      end_s: end,
      bucket_s: span,
      scores: [0],
      max: 0,
      mean: 0,
      message: "Not enough frames to compute motion.",
    };
  }

  const frameCount = Math.floor(raw.length / frameBytes);
  const diffs: number[] = [];
  for (let i = 1; i < frameCount; i++) {
    const a = i * frameBytes;
    const b = (i - 1) * frameBytes;
    let sum = 0;
    const step = Math.max(1, Math.floor(frameBytes / 512));
    let samples = 0;
    for (let p = 0; p < frameBytes; p += step) {
      sum += Math.abs(raw[a + p] - raw[b + p]);
      samples++;
    }
    const mean = samples ? sum / samples : 0;
    diffs.push(Math.min(255, Math.round(mean)));
  }

  const maxBuckets = 240;
  const bucketCount = Math.min(maxBuckets, Math.max(1, diffs.length));
  const scores: number[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const from = Math.floor((i / bucketCount) * diffs.length);
    const to = Math.floor(((i + 1) / bucketCount) * diffs.length);
    let peak = 0;
    for (let j = from; j < Math.max(from + 1, to); j++) {
      peak = Math.max(peak, diffs[j] || 0);
    }
    scores.push(peak);
  }

  const max = scores.reduce((m, v) => Math.max(m, v), 0);
  const mean = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;

  return {
    ok: true,
    action: "motion",
    start_s: start,
    end_s: end,
    bucket_s: Math.round((span / scores.length) * 1000) / 1000,
    scores,
    max,
    mean,
  };
};

const runFrames = async (
  input: string,
  opts: { start_s?: number; end_s?: number; fps?: number; width?: number },
): Promise<AgentScrubResult> => {
  const probe = await probeJson(input);
  const duration = Number(probe.format?.duration);
  const start = clampNum(opts.start_s, 0, 0, Number.isFinite(duration) ? duration : 1e9);
  let end = clampNum(
    opts.end_s,
    Number.isFinite(duration) ? Math.min(duration, start + 8) : start + 8,
    start + 0.05,
    Number.isFinite(duration) ? duration : start + 120,
  );
  const fps = clampNum(opts.fps, 1, 0.2, 8);
  const width = clampNum(opts.width, 320, 64, 1280);
  const maxFrames = 48;
  const span = end - start;
  const expected = Math.ceil(span * fps);
  const effectiveFps = expected > maxFrames ? maxFrames / span : fps;

  const dir = await mkdtemp(path.join(os.tmpdir(), "frameflow-frames-"));
  try {
    const pattern = path.join(dir, "frame_%03d.jpg");
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-y",
        "-ss", String(start),
        "-to", String(end),
        "-i", input,
        "-an",
        "-vf", `fps=${effectiveFps},scale=${width}:-1`,
        "-frames:v", String(maxFrames),
        "-q:v", "5",
        pattern,
      ],
      { timeout: 120000, maxBuffer: 8 * 1024 * 1024 },
    );

    const frames: { t_s: number; mime: string; base64: string }[] = [];
    for (let i = 1; i <= maxFrames; i++) {
      const filePath = path.join(dir, `frame_${String(i).padStart(3, "0")}.jpg`);
      if (!(await pathExists(filePath))) break;
      const buf = await readFile(filePath);
      const t = start + (i - 1) / effectiveFps;
      frames.push({
        t_s: Math.round(t * 1000) / 1000,
        mime: "image/jpeg",
        base64: buf.toString("base64"),
      });
    }

    return {
      ok: true,
      action: "frames",
      start_s: start,
      end_s: end,
      fps: Math.round(effectiveFps * 1000) / 1000,
      frames,
      message: frames.length === 0 ? "No frames extracted for that range." : undefined,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

export const parseAgentScrubRequest = (
  body: Record<string, unknown>,
): { ok: true; request: AgentScrubRequest } | { ok: false; error: string } => {
  const action = String(body.action || "").trim() as AgentScrubAction;
  if (!["info", "transcript", "motion", "frames"].includes(action)) {
    return { ok: false, error: 'action must be "info" | "transcript" | "motion" | "frames".' };
  }
  const source = typeof body.source === "string" ? body.source.trim() : "";
  if (!source) return { ok: false, error: "source (http URL, data URL, or local path) is required." };

  const request: AgentScrubRequest = { action, source };
  if (body.start_s !== undefined) request.start_s = Number(body.start_s);
  if (body.end_s !== undefined) request.end_s = Number(body.end_s);
  if (typeof body.query === "string") request.query = body.query;
  if (body.fps !== undefined) request.fps = Number(body.fps);
  if (body.width !== undefined) request.width = Number(body.width);
  return { ok: true, request };
};

export const runAgentScrub = async (
  request: AgentScrubRequest,
  resolveUrl?: (url: string) => Promise<string>,
): Promise<AgentScrubResult> => {
  const tools = await checkMediaTools();
  if (!tools.ffmpeg || !tools.ffprobe) {
    const err: any = new Error(mediaToolsMissingMessage());
    err.status = 501;
    throw err;
  }

  const prepared = await prepareScrubSource(request.source, resolveUrl);
  try {
    switch (request.action) {
      case "info":
        return await runInfo(prepared.input);
      case "transcript":
        return await runTranscript(prepared.input, request);
      case "motion":
        return await runMotion(prepared.input, request);
      case "frames":
        return await runFrames(prepared.input, request);
      default: {
        const err: any = new Error("Invalid action");
        err.status = 400;
        throw err;
      }
    }
  } finally {
    await prepared.cleanup();
  }
};
