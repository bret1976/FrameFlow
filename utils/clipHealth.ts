export type ClipHealthVerdict = "OK" | "STATIC" | "MORPH" | "JITTER";

export type ClipHealthIssue = {
  code: string;
  severity: "warn" | "fail";
  message: string;
  timestamp?: number;
};

export type ClipHealthReport = {
  ok: boolean;
  verdict: ClipHealthVerdict;
  mean: number;
  variance: number;
  issues: ClipHealthIssue[];
  summary: string;
};

const STATIC_MEAN = 0.014;
const STATIC_MAX = 0.03;
const MORPH_ABS = 0.075;
const JITTER_CV = 0.7;
const JITTER_STD = 0.022;

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const meanOf = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const varianceOf = (values: number[], mean = meanOf(values)) => {
  if (values.length === 0) return 0;
  return meanOf(values.map((value) => (value - mean) ** 2));
};
const medianOf = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const stdOf = (values: number[], mean = meanOf(values)) => Math.sqrt(varianceOf(values, mean));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const readNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeMotionValues = (values: number[]) => {
  if (values.length === 0) return [];
  const peak = values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  if (peak > 1.5) return values.map((value) => clamp01(Math.abs(value) / 255));
  return values.map((value) => clamp01(Math.abs(value)));
};

const countDirectionChanges = (values: number[]) => {
  if (values.length < 3) return 0;
  let swings = 0;
  let prev = 0;
  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    if (Math.abs(delta) < 4e-3) continue;
    const sign = delta > 0 ? 1 : -1;
    if (prev !== 0 && sign !== prev) swings += 1;
    prev = sign;
  }
  return swings;
};

type Classified = {
  verdict: ClipHealthVerdict;
  reason: string;
  spikeAt?: number;
};

const classifyMotions = (motions: number[]): Classified => {
  if (motions.length === 0) {
    return {
      verdict: "STATIC",
      reason: "Need at least two sampled frames to measure consecutive-frame motion.",
    };
  }
  const avg = meanOf(motions);
  const peak = motions.reduce((max, value) => Math.max(max, value), 0);
  const peakIndex = motions.indexOf(peak);
  const std = stdOf(motions, avg);
  const cv = avg > 1e-6 ? std / avg : 0;
  const swings = countDirectionChanges(motions);
  if (avg <= STATIC_MEAN && peak <= STATIC_MAX) {
    return {
      verdict: "STATIC",
      reason: "Near-zero luma change across the run — footage looks frozen or static.",
    };
  }
  const others = motions.filter((_, index) => index !== peakIndex);
  const baseMed = others.length ? medianOf(others) : 0;
  const baseMean = others.length ? meanOf(others) : 0;
  const restStd = others.length ? stdOf(others, baseMean) : 0;
  const prefix = motions.slice(0, Math.max(0, peakIndex));
  const prefixMean = prefix.length ? meanOf(prefix) : 0;
  const prefixStd = prefix.length ? stdOf(prefix, prefixMean) : 0;
  const isolatedSpike =
    peak >= MORPH_ABS && peak >= Math.max(0.055, baseMed * 3.1, baseMean * 2.6);
  const restAreStable = others.length >= 2 && restStd <= 0.04 && baseMean < peak * 0.45;
  const stablePrefix = prefix.length >= 2 && prefixMean < peak * 0.5 && prefixStd <= 0.045;
  if (isolatedSpike && restAreStable && (stablePrefix || prefix.length < 2)) {
    return {
      verdict: "MORPH",
      reason: "Sudden motion spike after a stable run — likely a morph or scene-change cut.",
      spikeAt: peakIndex,
    };
  }
  const thrash =
    (cv >= JITTER_CV && std >= JITTER_STD) ||
    (swings >= Math.max(3, Math.floor(motions.length * 0.45)) && std >= 0.028);
  if (thrash && peak > STATIC_MAX) {
    return {
      verdict: "JITTER",
      reason: "Motion variance is high — frames thrash instead of tracking smoothly.",
    };
  }
  return {
    verdict: "OK",
    reason:
      "Consecutive-frame motion sits in a healthy mid range with no freeze, thrash, or cut spike.",
  };
};

const issuesForVerdict = (
  verdict: ClipHealthVerdict,
  reason: string,
  spikeTimestamp?: number,
): ClipHealthIssue[] => {
  if (verdict === "OK") return [];
  return [
    {
      code: verdict,
      severity: verdict === "MORPH" ? "warn" : "fail",
      message: reason,
      timestamp: spikeTimestamp,
    },
  ];
};

const scoreMotionSeries = (rawMotions: number[], timestamps: number[] = []) => {
  const motions = normalizeMotionValues(rawMotions);
  const classified = classifyMotions(motions);
  const avg = meanOf(motions);
  const variance = varianceOf(motions, avg);
  const spikeTimestamp =
    classified.spikeAt != null
      ? timestamps[classified.spikeAt] ?? timestamps[classified.spikeAt + 1]
      : undefined;
  const issues = issuesForVerdict(classified.verdict, classified.reason, spikeTimestamp);
  if (motions.length === 0) {
    issues.splice(0, issues.length, {
      code: "INSUFFICIENT_SAMPLES",
      severity: "fail",
      message: classified.reason,
    });
  }
  return {
    verdict: classified.verdict,
    mean: round6(avg),
    variance: round6(variance),
    summary: classified.reason,
    issues,
  };
};

export const scoreClipHealth = (body: Record<string, unknown> = {}): ClipHealthReport => {
  const fromSamples: { motion: number; timestamp?: number }[] = [];
  if (Array.isArray(body.samples)) {
    for (const item of body.samples) {
      if (!isRecord(item)) continue;
      const motion = readNumber(item.motion) ?? readNumber(item.diff);
      if (motion == null) continue;
      const timestamp = readNumber(item.timestamp) ?? undefined;
      fromSamples.push({ motion, timestamp });
    }
  }
  const fromDiffs = Array.isArray(body.diffs)
    ? (body.diffs.map((value) => readNumber(value)).filter((value) => value != null) as number[])
    : [];
  const rawMotions = fromSamples.length > 0 ? fromSamples.map((item) => item.motion) : fromDiffs;
  const timestamps =
    fromSamples.length > 0
      ? fromSamples.map((item, index) => item.timestamp ?? index + 1)
      : fromDiffs.map((_, index) => index + 1);
  const scored = scoreMotionSeries(rawMotions, timestamps);
  return {
    ok: scored.verdict === "OK",
    verdict: scored.verdict,
    mean: scored.mean,
    variance: scored.variance,
    issues: scored.issues,
    summary: scored.summary,
  };
};
