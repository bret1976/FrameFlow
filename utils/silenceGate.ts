/**
 * SilenceGate — dead-air detect + keep-range cut plan for shorts.
 * Idea inspired by wa2l2025/WVideoFlow Smart Silence Removal (MIT;
 * reimplemented only — original FrameFlow TypeScript, no cloned
 * Python/Flask). Uses silencedetect-style thresholds (−35 dB /
 * 0.7s min / 0.15s pad) and returns keep ranges + an ffmpeg filter hint.
 * Pure functions, no API keys.
 */

export type SilenceVerdict = "PASS" | "WARN" | "FAIL";

export type TimeRange = {
  start_sec: number;
  end_sec: number;
};

export type SilenceGateRequest = {
  action?: "plan" | "demo" | "defaults";
  demo?: boolean;
  duration_sec?: number;
  /** Explicit silence windows (from ffmpeg silencedetect or UI). */
  silence_segments?: TimeRange[];
  /**
   * Optional evenly spaced dBFS samples (e.g. every hop_sec).
   * Values at or below threshold_db count as silence.
   */
  energy_db?: number[];
  hop_sec?: number;
  threshold_db?: number;
  min_silence_sec?: number;
  padding_sec?: number;
  /** Soft cap: speech ratio below this → FAIL. */
  min_speech_ratio?: number;
};

export type KeepRange = TimeRange & {
  duration_sec: number;
  label: string;
};

export type SilenceGap = TimeRange & {
  duration_sec: number;
  trim: boolean;
  reason: string;
};

export type SilenceGateResult = {
  ok: true;
  source: "silence-gate-1.0";
  action: string;
  verdict: SilenceVerdict;
  summary: string;
  duration_sec: number;
  threshold_db: number;
  min_silence_sec: number;
  padding_sec: number;
  silence_gaps: SilenceGap[];
  keep_ranges: KeepRange[];
  silence_total_sec: number;
  keep_total_sec: number;
  speech_ratio: number;
  trim_sec: number;
  ffmpeg_hint: string;
  notes: string[];
  defaults?: {
    threshold_db: number;
    min_silence_sec: number;
    padding_sec: number;
    min_speech_ratio: number;
  };
};

export type SilenceGateParseResult =
  | { ok: true; request: SilenceGateRequest }
  | { ok: false; error: string };

const DEFAULT_THRESHOLD_DB = -35;
const DEFAULT_MIN_SILENCE = 0.7;
const DEFAULT_PADDING = 0.15;
const DEFAULT_MIN_SPEECH = 0.55;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clampRange(
  start: number,
  end: number,
  duration: number
): TimeRange | null {
  const s = Math.max(0, Math.min(duration, start));
  const e = Math.max(0, Math.min(duration, end));
  if (e - s < 0.001) return null;
  return { start_sec: round3(s), end_sec: round3(e) };
}

function parseRanges(raw: unknown): TimeRange[] | null {
  if (!Array.isArray(raw)) return null;
  const out: TimeRange[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const start = Number(o.start_sec ?? o.start ?? o.begin);
    const end = Number(o.end_sec ?? o.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }
    out.push({ start_sec: start, end_sec: end });
  }
  return out;
}

/** Merge overlapping / adjacent silence windows. */
function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start_sec - b.start_sec);
  const merged: TimeRange[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];
    if (cur.start_sec <= last.end_sec + 0.001) {
      last.end_sec = Math.max(last.end_sec, cur.end_sec);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

function energyToSilence(
  energy: number[],
  hop: number,
  threshold: number,
  duration: number
): TimeRange[] {
  const gaps: TimeRange[] = [];
  let start: number | null = null;
  for (let i = 0; i < energy.length; i++) {
    const t0 = i * hop;
    const silent = energy[i] <= threshold;
    if (silent && start === null) start = t0;
    if ((!silent || i === energy.length - 1) && start !== null) {
      const end = silent && i === energy.length - 1 ? duration : t0;
      const clamped = clampRange(start, Math.max(start + hop, end), duration);
      if (clamped) gaps.push(clamped);
      start = null;
    }
  }
  return mergeRanges(gaps);
}

function invertToKeep(
  duration: number,
  silence: TimeRange[],
  padding: number
): KeepRange[] {
  // Expand silence by −padding at edges when carving keep windows
  // (retain a little breath around speech, matching WVideoFlow pad).
  const carved = silence
    .map((g) =>
      clampRange(g.start_sec + padding, g.end_sec - padding, duration)
    )
    .filter((g): g is TimeRange => !!g && g.end_sec - g.start_sec >= 0.05);

  const keep: KeepRange[] = [];
  let cursor = 0;
  let idx = 1;
  for (const gap of carved) {
    if (gap.start_sec > cursor + 0.02) {
      const start = cursor;
      const end = gap.start_sec;
      keep.push({
        start_sec: round3(start),
        end_sec: round3(end),
        duration_sec: round3(end - start),
        label: `keep-${idx++}`,
      });
    }
    cursor = Math.max(cursor, gap.end_sec);
  }
  if (duration > cursor + 0.02) {
    keep.push({
      start_sec: round3(cursor),
      end_sec: round3(duration),
      duration_sec: round3(duration - cursor),
      label: `keep-${idx++}`,
    });
  }
  return keep;
}

function buildFfmpegHint(keep: KeepRange[]): string {
  if (keep.length === 0) {
    return "# no keep ranges — check threshold / source audio";
  }
  if (keep.length === 1) {
    const k = keep[0];
    return `ffmpeg -i input.mp4 -ss ${k.start_sec} -to ${k.end_sec} -c copy output.mp4`;
  }
  const filters = keep
    .map(
      (k, i) =>
        `[0:v]trim=start=${k.start_sec}:end=${k.end_sec},setpts=PTS-STARTPTS[v${i}];` +
        `[0:a]atrim=start=${k.start_sec}:end=${k.end_sec},asetpts=PTS-STARTPTS[a${i}]`
    )
    .join(";");
  const n = keep.length;
  const concatInputs = Array.from({ length: n }, (_, i) => `[v${i}][a${i}]`).join(
    ""
  );
  return `ffmpeg -i input.mp4 -filter_complex "${filters};${concatInputs}concat=n=${n}:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" output.mp4`;
}

function grade(
  speechRatio: number,
  trimSec: number,
  minSpeech: number,
  duration: number
): { verdict: SilenceVerdict; summary: string; notes: string[] } {
  const notes: string[] = [];
  if (trimSec < 0.05) {
    notes.push("No trim-worthy silence above min_silence — clip already tight.");
    return {
      verdict: "PASS",
      summary: "No dead-air gaps to trim.",
      notes,
    };
  }
  if (speechRatio < minSpeech) {
    notes.push(
      `Speech ratio ${round3(speechRatio)} below floor ${minSpeech} — likely too much dead air or bad threshold.`
    );
    return {
      verdict: "FAIL",
      summary: `Heavy silence: trim ~${round3(trimSec)}s of ${round3(duration)}s (${Math.round(
        (1 - speechRatio) * 100
      )}% air).`,
      notes,
    };
  }
  if (trimSec / Math.max(duration, 0.001) >= 0.12) {
    notes.push("Meaningful dead air found — apply keep ranges before publish.");
    return {
      verdict: "WARN",
      summary: `Trim ~${round3(trimSec)}s silence (${Math.round(
        (trimSec / duration) * 100
      )}% of runtime).`,
      notes,
    };
  }
  notes.push("Light silence cleanup recommended.");
  return {
    verdict: "PASS",
    summary: `Light trim: ~${round3(trimSec)}s silence removable.`,
    notes,
  };
}

export function parseSilenceGateRequest(
  body: Record<string, unknown>
): SilenceGateParseResult {
  const actionRaw = String(body.action ?? "").toLowerCase();
  const demo = body.demo === true || actionRaw === "demo";
  const action =
    demo ? "demo" : actionRaw === "defaults" ? "defaults" : actionRaw === "plan" || !actionRaw ? "plan" : actionRaw;

  if (action === "defaults") {
    return { ok: true, request: { action: "defaults" } };
  }
  if (demo) {
    return { ok: true, request: { action: "demo", demo: true } };
  }

  const duration = Number(body.duration_sec ?? body.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    return {
      ok: false,
      error: "duration_sec (positive number) is required for plan.",
    };
  }

  const silence_segments = parseRanges(body.silence_segments ?? body.silences);
  const energy_db = Array.isArray(body.energy_db)
    ? (body.energy_db as unknown[])
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n))
    : undefined;

  if (
    (!silence_segments || silence_segments.length === 0) &&
    (!energy_db || energy_db.length === 0)
  ) {
    return {
      ok: false,
      error:
        "Provide silence_segments [{start_sec,end_sec}] or energy_db[] samples.",
    };
  }

  return {
    ok: true,
    request: {
      action: "plan",
      duration_sec: duration,
      silence_segments: silence_segments ?? undefined,
      energy_db,
      hop_sec: Number(body.hop_sec) || undefined,
      threshold_db: Number(body.threshold_db) || undefined,
      min_silence_sec: Number(body.min_silence_sec) || undefined,
      padding_sec: Number(body.padding_sec) || undefined,
      min_speech_ratio: Number(body.min_speech_ratio) || undefined,
    },
  };
}

export function runSilenceGate(request: SilenceGateRequest): SilenceGateResult {
  const threshold =
    Number.isFinite(request.threshold_db) && request.threshold_db !== undefined
      ? Number(request.threshold_db)
      : DEFAULT_THRESHOLD_DB;
  const minSilence =
    Number.isFinite(request.min_silence_sec) &&
    request.min_silence_sec !== undefined
      ? Number(request.min_silence_sec)
      : DEFAULT_MIN_SILENCE;
  const padding =
    Number.isFinite(request.padding_sec) && request.padding_sec !== undefined
      ? Number(request.padding_sec)
      : DEFAULT_PADDING;
  const minSpeech =
    Number.isFinite(request.min_speech_ratio) &&
    request.min_speech_ratio !== undefined
      ? Number(request.min_speech_ratio)
      : DEFAULT_MIN_SPEECH;

  if (request.action === "defaults") {
    return {
      ok: true,
      source: "silence-gate-1.0",
      action: "defaults",
      verdict: "PASS",
      summary: "Default silence-detect knobs (WVideoFlow-inspired).",
      duration_sec: 0,
      threshold_db: threshold,
      min_silence_sec: minSilence,
      padding_sec: padding,
      silence_gaps: [],
      keep_ranges: [],
      silence_total_sec: 0,
      keep_total_sec: 0,
      speech_ratio: 1,
      trim_sec: 0,
      ffmpeg_hint: "",
      notes: [
        "threshold_db −35, min_silence 0.7s, padding 0.15s — match WVideoFlow defaults.",
      ],
      defaults: {
        threshold_db: DEFAULT_THRESHOLD_DB,
        min_silence_sec: DEFAULT_MIN_SILENCE,
        padding_sec: DEFAULT_PADDING,
        min_speech_ratio: DEFAULT_MIN_SPEECH,
      },
    };
  }

  if (request.action === "demo" || request.demo) {
    return runSilenceGate({
      action: "plan",
      duration_sec: 24,
      threshold_db: DEFAULT_THRESHOLD_DB,
      min_silence_sec: DEFAULT_MIN_SILENCE,
      padding_sec: DEFAULT_PADDING,
      // Long dead air mid + trailing silence (classic shorts bloat)
      silence_segments: [
        { start_sec: 3.2, end_sec: 6.8 },
        { start_sec: 11.0, end_sec: 14.5 },
        { start_sec: 20.5, end_sec: 24.0 },
      ],
    });
  }

  const duration = Number(request.duration_sec) || 0;
  let rawSilence: TimeRange[] = [];
  if (request.silence_segments && request.silence_segments.length > 0) {
    rawSilence = mergeRanges(
      request.silence_segments
        .map((g) => clampRange(g.start_sec, g.end_sec, duration))
        .filter((g): g is TimeRange => !!g)
    );
  } else if (request.energy_db && request.energy_db.length > 0) {
    const hop =
      Number.isFinite(request.hop_sec) && (request.hop_sec as number) > 0
        ? (request.hop_sec as number)
        : duration / request.energy_db.length;
    rawSilence = energyToSilence(
      request.energy_db,
      hop,
      threshold,
      duration
    );
  }

  const silence_gaps: SilenceGap[] = rawSilence.map((g) => {
    const dur = round3(g.end_sec - g.start_sec);
    const trim = dur >= minSilence;
    return {
      ...g,
      duration_sec: dur,
      trim,
      reason: trim
        ? `≥ ${minSilence}s below ${threshold} dB — trim candidate`
        : `short gap (${dur}s) — keep as breath`,
    };
  });

  const trimGaps = silence_gaps
    .filter((g) => g.trim)
    .map((g) => ({ start_sec: g.start_sec, end_sec: g.end_sec }));

  const keep_ranges = invertToKeep(duration, trimGaps, padding);
  const silence_total_sec = round3(
    silence_gaps.reduce((acc, g) => acc + g.duration_sec, 0)
  );
  const keep_total_sec = round3(
    keep_ranges.reduce((acc, k) => acc + k.duration_sec, 0)
  );
  const trim_sec = round3(Math.max(0, duration - keep_total_sec));
  const speech_ratio =
    duration > 0 ? round3(keep_total_sec / duration) : 1;

  const { verdict, summary, notes } = grade(
    speech_ratio,
    trim_sec,
    minSpeech,
    duration
  );

  return {
    ok: true,
    source: "silence-gate-1.0",
    action: "plan",
    verdict,
    summary,
    duration_sec: round3(duration),
    threshold_db: threshold,
    min_silence_sec: minSilence,
    padding_sec: padding,
    silence_gaps,
    keep_ranges,
    silence_total_sec,
    keep_total_sec,
    speech_ratio,
    trim_sec,
    ffmpeg_hint: buildFfmpegHint(keep_ranges),
    notes,
  };
}

export function demoFailResult(): SilenceGateResult {
  return runSilenceGate({ action: "demo", demo: true });
}
