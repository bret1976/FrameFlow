/**
 * SafeKit — vertical-video preflight: platform UI safe zones, WCAG thumbnail
 * contrast, and WPM-estimated SRT captions.
 *
 * Idea inspired by yuvraj99776600/shorts-kit (MIT). This is an original
 * FrameFlow TypeScript implementation (no vendored package, no clone of their
 * source tree). WCAG luminance maths follow the public WCAG 2.1 formula;
 * safe-zone margins are conservative community-measured floors, not platform
 * published constants. Local-first, no API keys.
 */

export type SafeKitAction = "safe-zone" | "contrast" | "srt" | "demo" | "defaults";

export type PlatformKey = "shorts" | "tiktok" | "reels" | "all";

export type Margins = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PlatformSpec = {
  key: PlatformKey;
  label: string;
  margins: Margins;
  occupies: { top: string; bottom: string; right: string };
};

export type ContrastGrade = "excellent" | "good" | "borderline" | "fail";

export type ContrastResult = {
  ratio: number;
  grade: ContrastGrade;
  wcagAA: boolean;
  wcagAAA: boolean;
  foreground: string;
  background: string;
};

export type ColorPair = {
  label: string;
  foreground: string;
  background: string;
};

export type SrtOptions = {
  wordsPerCaption?: number;
  maxLineLength?: number;
  wordsPerMinute?: number;
};

export type SrtStats = {
  count: number;
  avgChars: number;
  durationSeconds: number;
};

export type SafeKitRequest = {
  action?: SafeKitAction;
  platform?: PlatformKey | string;
  foreground?: string;
  background?: string;
  transcript?: string;
  wordsPerCaption?: number;
  maxLineLength?: number;
  wordsPerMinute?: number;
  rect?: Rect;
  image_width?: number;
  image_height?: number;
  demo?: boolean;
};

export type SafeKitDefaults = {
  frame_width: number;
  frame_height: number;
  wordsPerCaption: number;
  maxLineLength: number;
  wordsPerMinute: number;
  platforms: PlatformKey[];
};

export type SafeKitResult = {
  ok: true;
  source: "safe-kit-1.0";
  action: SafeKitAction;
  summary: string;
  defaults?: SafeKitDefaults;
  platform?: PlatformSpec;
  safe_area?: Rect;
  caption_band?: Rect;
  rect_inside?: boolean | null;
  cover?: { sx: number; sy: number; sw: number; sh: number } | null;
  contrast?: ContrastResult;
  high_contrast_pairs?: ColorPair[];
  srt?: string;
  srt_stats?: SrtStats;
  platforms?: PlatformSpec[];
};

export type SafeKitParseResult =
  | { ok: true; request: SafeKitRequest }
  | { ok: false; error: string };

export const FRAME_WIDTH = 1080;
export const FRAME_HEIGHT = 1920;

const DEFAULT_SRT: Required<SrtOptions> = {
  wordsPerCaption: 6,
  maxLineLength: 32,
  wordsPerMinute: 150,
};

const PLATFORM_TABLE: Record<PlatformKey, PlatformSpec> = {
  shorts: {
    key: "shorts",
    label: "YouTube Shorts",
    margins: { top: 180, bottom: 380, left: 60, right: 140 },
    occupies: {
      top: "Search, Shorts label, progress bar",
      bottom: "Title, channel, sound, subscribe",
      right: "Like · Comment · Share · Remix",
    },
  },
  tiktok: {
    key: "tiktok",
    label: "TikTok",
    margins: { top: 130, bottom: 480, left: 60, right: 140 },
    occupies: {
      top: "Following / For You, search",
      bottom: "Handle, caption, sound ticker, nav",
      right: "Avatar · Like · Comment · Share",
    },
  },
  reels: {
    key: "reels",
    label: "Instagram Reels",
    margins: { top: 180, bottom: 420, left: 60, right: 160 },
    occupies: {
      top: "Reels label, camera",
      bottom: "Handle, caption, audio, nav",
      right: "Like · Comment · Share · Save",
    },
  },
  all: {
    key: "all",
    label: "Safe on all three",
    margins: { top: 180, bottom: 480, left: 60, right: 160 },
    occupies: {
      top: "Worst-case across Shorts / TikTok / Reels",
      bottom: "Worst-case across Shorts / TikTok / Reels",
      right: "Worst-case across Shorts / TikTok / Reels",
    },
  },
};

export const HIGH_CONTRAST_PAIRS: readonly ColorPair[] = [
  { label: "Black on Yellow", foreground: "#000000", background: "#ffee00" },
  { label: "White on Dark Blue", foreground: "#ffffff", background: "#0a1628" },
  { label: "Yellow on Black", foreground: "#ffee00", background: "#000000" },
  { label: "White on Red", foreground: "#ffffff", background: "#cc0000" },
  { label: "Black on White", foreground: "#000000", background: "#ffffff" },
];

const DEMO_TRANSCRIPT =
  "Why most vertical crops fail in the first two seconds — keep titles inside the middle third and leave the bottom UI alone.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const readNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const parsePlatform = (value: unknown): PlatformKey | null => {
  const raw = readString(value).toLowerCase();
  if (!raw) return "all";
  if (raw === "shorts" || raw === "youtube" || raw === "youtube_shorts") return "shorts";
  if (raw === "tiktok") return "tiktok";
  if (raw === "reels" || raw === "instagram" || raw === "instagram_reels") return "reels";
  if (raw === "all" || raw === "worst") return "all";
  return null;
};

const parseRect = (value: unknown): Rect | null => {
  if (!isRecord(value)) return null;
  const x = readNumber(value.x);
  const y = readNumber(value.y);
  const width = readNumber(value.width);
  const height = readNumber(value.height);
  if (x === null || y === null || width === null || height === null) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
};

export function getSafeArea(platform: PlatformKey): Rect {
  const m = PLATFORM_TABLE[platform].margins;
  return {
    x: m.left,
    y: m.top,
    width: FRAME_WIDTH - m.left - m.right,
    height: FRAME_HEIGHT - m.top - m.bottom,
  };
}

export function isInsideSafeZone(rect: Rect, platform: PlatformKey): boolean {
  const safe = getSafeArea(platform);
  return (
    rect.x >= safe.x &&
    rect.y >= safe.y &&
    rect.x + rect.width <= safe.x + safe.width &&
    rect.y + rect.height <= safe.y + safe.height
  );
}

export function getCaptionBand(platform: PlatformKey = "all"): Rect {
  const safe = getSafeArea(platform);
  return {
    x: safe.x,
    y: Math.round(FRAME_HEIGHT * 0.35),
    width: safe.width,
    height: Math.round(FRAME_HEIGHT * 0.25),
  };
}

export function coverRect(
  imageWidth: number,
  imageHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (!(imageWidth > 0) || !(imageHeight > 0)) {
    throw new RangeError(`coverRect expects positive dimensions, got ${imageWidth}x${imageHeight}`);
  }
  const targetRatio = FRAME_WIDTH / FRAME_HEIGHT;
  const sourceRatio = imageWidth / imageHeight;
  if (sourceRatio > targetRatio) {
    const w = imageHeight * targetRatio;
    return { sx: (imageWidth - w) / 2, sy: 0, sw: w, sh: imageHeight };
  }
  const h = imageWidth / targetRatio;
  return { sx: 0, sy: (imageHeight - h) / 2, sw: imageWidth, sh: h };
}

export function isValidHex(hex: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex.trim());
}

export function normaliseHex(raw: string): string {
  const trimmed = raw.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (withHash.length === 4) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return withHash.toLowerCase();
}

export function relativeLuminance(hex: string): number {
  const normalised = normaliseHex(hex);
  if (!isValidHex(normalised)) {
    throw new SyntaxError(`Not a hex colour: "${hex}"`);
  }
  const toLinear = (channel: number) =>
    channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  const body = normalised.slice(1);
  const r = toLinear(parseInt(body.slice(0, 2), 16) / 255);
  const g = toLinear(parseInt(body.slice(2, 4), 16) / 255);
  const b = toLinear(parseInt(body.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function gradeContrast(foreground: string, background: string): ContrastResult {
  const fg = normaliseHex(foreground);
  const bg = normaliseHex(background);
  const ratio = contrastRatio(fg, bg);
  const grade: ContrastGrade =
    ratio >= 7 ? "excellent" : ratio >= 4.5 ? "good" : ratio >= 3 ? "borderline" : "fail";
  return {
    ratio: Math.round(ratio * 100) / 100,
    grade,
    wcagAA: ratio >= 4.5,
    wcagAAA: ratio >= 7,
    foreground: fg,
    background: bg,
  };
}

export function formatTimecode(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    throw new RangeError(`formatTimecode expects a non-negative finite number, got ${totalSeconds}`);
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds % 1) * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(ms, 3)}`;
}

export function parseTimecode(timecode: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(timecode.trim());
  if (!match) throw new SyntaxError(`Not an SRT timecode: "${timecode}"`);
  const [, h, m, s, ms] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

export function wrapLine(text: string, maxLen: number): string {
  if (maxLen <= 0) throw new RangeError(`wrapLine expects a positive maxLen, got ${maxLen}`);
  if (text.length <= maxLen) return text;
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

export function generateSrt(text: string, options: SrtOptions = {}): string {
  const cfg: Required<SrtOptions> = {
    wordsPerCaption: options.wordsPerCaption ?? DEFAULT_SRT.wordsPerCaption,
    maxLineLength: options.maxLineLength ?? DEFAULT_SRT.maxLineLength,
    wordsPerMinute: options.wordsPerMinute ?? DEFAULT_SRT.wordsPerMinute,
  };
  if (cfg.wordsPerCaption <= 0) throw new RangeError("wordsPerCaption must be positive");
  if (cfg.wordsPerMinute <= 0) throw new RangeError("wordsPerMinute must be positive");
  if (cfg.maxLineLength <= 0) throw new RangeError("maxLineLength must be positive");

  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  const secondsPerWord = 60 / cfg.wordsPerMinute;
  const blocks: string[] = [];
  let elapsed = 0;

  for (let i = 0; i < words.length; i += cfg.wordsPerCaption) {
    const chunk = words.slice(i, i + cfg.wordsPerCaption);
    const duration = chunk.length * secondsPerWord;
    const start = formatTimecode(elapsed);
    const end = formatTimecode(elapsed + duration);
    blocks.push(
      `${blocks.length + 1}\n${start} --> ${end}\n${wrapLine(chunk.join(" "), cfg.maxLineLength)}`,
    );
    elapsed += duration;
  }

  return `${blocks.join("\n\n")}\n`;
}

export function getSrtStats(srt: string): SrtStats {
  if (!srt.trim()) return { count: 0, avgChars: 0, durationSeconds: 0 };
  const blocks = srt.trim().split(/\n\n+/);
  const totalChars = blocks.reduce((sum, block) => {
    return sum + block.split("\n").slice(2).join(" ").length;
  }, 0);
  const lastEnd = blocks[blocks.length - 1]?.split("\n")[1]?.split(" --> ")[1];
  return {
    count: blocks.length,
    avgChars: Math.round(totalChars / blocks.length),
    durationSeconds: lastEnd ? parseTimecode(lastEnd) : 0,
  };
}

const defaultsPayload = (): SafeKitDefaults => ({
  frame_width: FRAME_WIDTH,
  frame_height: FRAME_HEIGHT,
  wordsPerCaption: DEFAULT_SRT.wordsPerCaption,
  maxLineLength: DEFAULT_SRT.maxLineLength,
  wordsPerMinute: DEFAULT_SRT.wordsPerMinute,
  platforms: ["shorts", "tiktok", "reels", "all"],
});

export function parseSafeKitRequest(body: Record<string, unknown>): SafeKitParseResult {
  const demo = body.demo === true;
  let action = readString(body.action).toLowerCase() as SafeKitAction | "";
  if (demo && !action) action = "demo";
  if (!action) action = "demo";

  const allowed: SafeKitAction[] = ["safe-zone", "contrast", "srt", "demo", "defaults"];
  if (!allowed.includes(action as SafeKitAction)) {
    return {
      ok: false,
      error: `Unknown action "${action}". Use safe-zone | contrast | srt | demo | defaults.`,
    };
  }

  const request: SafeKitRequest = {
    action: action as SafeKitAction,
    demo,
  };

  if (body.platform !== undefined) {
    const platform = parsePlatform(body.platform);
    if (!platform) {
      return { ok: false, error: 'platform must be "shorts" | "tiktok" | "reels" | "all".' };
    }
    request.platform = platform;
  }

  if (body.foreground !== undefined) request.foreground = readString(body.foreground);
  if (body.background !== undefined) request.background = readString(body.background);
  if (body.transcript !== undefined) request.transcript = readString(body.transcript);

  const wpc = readNumber(body.wordsPerCaption ?? body.words_per_caption);
  if (wpc !== null) request.wordsPerCaption = wpc;
  const mll = readNumber(body.maxLineLength ?? body.max_line_length);
  if (mll !== null) request.maxLineLength = mll;
  const wpm = readNumber(body.wordsPerMinute ?? body.words_per_minute);
  if (wpm !== null) request.wordsPerMinute = wpm;

  if (body.rect !== undefined) {
    const rect = parseRect(body.rect);
    if (!rect) return { ok: false, error: "rect must be {x,y,width,height} with positive size." };
    request.rect = rect;
  }

  const iw = readNumber(body.image_width ?? body.imageWidth);
  if (iw !== null) request.image_width = iw;
  const ih = readNumber(body.image_height ?? body.imageHeight);
  if (ih !== null) request.image_height = ih;

  return { ok: true, request };
}

export function runSafeKit(request: SafeKitRequest): SafeKitResult {
  const action = request.action || (request.demo ? "demo" : "demo");

  if (action === "defaults") {
    return {
      ok: true,
      source: "safe-kit-1.0",
      action,
      summary: "SafeKit defaults: 1080×1920 frame, WPM SRT, WCAG contrast, platform safe zones.",
      defaults: defaultsPayload(),
      platforms: Object.values(PLATFORM_TABLE),
      high_contrast_pairs: [...HIGH_CONTRAST_PAIRS],
    };
  }

  if (action === "demo") {
    const platform: PlatformKey = "all";
    const safe_area = getSafeArea(platform);
    const caption_band = getCaptionBand(platform);
    const contrast = gradeContrast("#ffffff", "#0a1628");
    const srt = generateSrt(DEMO_TRANSCRIPT, { wordsPerCaption: 5, maxLineLength: 32 });
    const buried: Rect = { x: 80, y: 1720, width: 900, height: 100 };
    return {
      ok: true,
      source: "safe-kit-1.0",
      action,
      summary: `Demo: ${PLATFORM_TABLE[platform].label} safe ${safe_area.width}×${safe_area.height}; contrast ${contrast.grade} ${contrast.ratio}:1; SRT ${getSrtStats(srt).count} cues; buried title FAIL.`,
      platform: PLATFORM_TABLE[platform],
      safe_area,
      caption_band,
      rect_inside: isInsideSafeZone(buried, platform),
      cover: coverRect(1920, 1080),
      contrast,
      high_contrast_pairs: [...HIGH_CONTRAST_PAIRS],
      srt,
      srt_stats: getSrtStats(srt),
      defaults: defaultsPayload(),
    };
  }

  if (action === "safe-zone") {
    const platform = (request.platform as PlatformKey) || "all";
    const spec = PLATFORM_TABLE[platform];
    const safe_area = getSafeArea(platform);
    const caption_band = getCaptionBand(platform);
    let rect_inside: boolean | null = null;
    if (request.rect) rect_inside = isInsideSafeZone(request.rect, platform);
    let cover: SafeKitResult["cover"] = null;
    if (
      typeof request.image_width === "number" &&
      typeof request.image_height === "number" &&
      request.image_width > 0 &&
      request.image_height > 0
    ) {
      cover = coverRect(request.image_width, request.image_height);
    }
    return {
      ok: true,
      source: "safe-kit-1.0",
      action,
      summary: `${spec.label}: safe ${safe_area.width}×${safe_area.height} inside 1080×1920 (margins T${spec.margins.top}/B${spec.margins.bottom}/L${spec.margins.left}/R${spec.margins.right}).`,
      platform: spec,
      safe_area,
      caption_band,
      rect_inside,
      cover,
      platforms: Object.values(PLATFORM_TABLE),
    };
  }

  if (action === "contrast") {
    const foreground = request.foreground || "#ffffff";
    const background = request.background || "#0a1628";
    try {
      const contrast = gradeContrast(foreground, background);
      return {
        ok: true,
        source: "safe-kit-1.0",
        action,
        summary: `Contrast ${contrast.ratio}:1 → ${contrast.grade} (AA ${contrast.wcagAA ? "pass" : "fail"} / AAA ${contrast.wcagAAA ? "pass" : "fail"}).`,
        contrast,
        high_contrast_pairs: [...HIGH_CONTRAST_PAIRS],
      };
    } catch (error: any) {
      throw new Error(typeof error?.message === "string" ? error.message : "Invalid colours.");
    }
  }

  // action === "srt"
  const transcript = request.transcript || "";
  if (!transcript) {
    throw new Error("transcript is required for action=srt.");
  }
  const srt = generateSrt(transcript, {
    wordsPerCaption: request.wordsPerCaption,
    maxLineLength: request.maxLineLength ?? DEFAULT_SRT.maxLineLength,
    wordsPerMinute: request.wordsPerMinute,
  });
  const srt_stats = getSrtStats(srt);
  return {
    ok: true,
    source: "safe-kit-1.0",
    action: "srt",
    summary: `SRT ${srt_stats.count} cues · ~${srt_stats.durationSeconds.toFixed(1)}s · avg ${srt_stats.avgChars} chars (WPM estimate, not forced-aligned).`,
    srt,
    srt_stats,
  };
}
