/**
 * StylePack — ASS caption style catalog + burn-in readiness checklist.
 *
 * Idea inspired by muneebkhan08/Capite (MIT): shared caption-style packs
 * with categories, animation types, and ASS-oriented export readiness.
 * This is an original FrameFlow TypeScript implementation (no vendored
 * Capite config/Python/frontend). Pure functions, local-first, no API keys.
 *
 * Complementary to: SafeKit (UI safe zones / SRT contrast), StickyCue
 * (caption timing), FinishKit (ffmpeg finish / LUFS), CapCutGate (draft
 * handoff). StylePack answers: "which ASS style fits this niche, and is
 * the burn-in package ready (format, outline, contrast, margins)?"
 */

export type StylePackAction =
  | "check"
  | "demo"
  | "defaults"
  | "list"
  | "pick"
  | "plan"
  | "styles";

export type StylePackVerdict = "READY" | "FIX" | "BLOCKED";

export type StyleCategory =
  | "trending"
  | "clean_tech"
  | "editorial"
  | "pop";

export type StyleAnim =
  | "highlight"
  | "karaoke"
  | "scale"
  | "bounce"
  | "pop"
  | "glow"
  | "box";

export type StyleEntry = {
  id: string;
  name: string;
  category: StyleCategory;
  animation: StyleAnim;
  font: string;
  font_fallback: string;
  font_size: number;
  primary: string;
  highlight: string;
  outline: string;
  outline_px: number;
  shadow_px: number;
  bold: boolean;
  best_for: string;
  /** Rough relative luminance of primary on black (0–1). */
  contrast_hint: number;
};

export type StyleCheckId =
  | "style_selected"
  | "export_format"
  | "outline_weight"
  | "contrast"
  | "safe_margin"
  | "animation"
  | "font_fallback"
  | "canvas"
  | "word_timing"
  | "line_budget";

export type StyleCheck = {
  id: StyleCheckId;
  ok: boolean;
  severity: "block" | "fix" | "info";
  label: string;
  detail: string;
};

export type StylePlanStep = {
  id: string;
  label: string;
  purpose: string;
  in_ass: string;
};

export type StylePackRequest = {
  action?: StylePackAction;
  demo?: boolean;
  /** Style id from STYLE_CATALOG. */
  style_id?: string;
  /** Niche / topic hint for pick. */
  niche?: string;
  category?: StyleCategory | string;
  animation?: StyleAnim | string;
  /** Caption export: ass | srt | vtt | burned | none */
  export_format?: string;
  /** Declared outline thickness (px). Falls back to style default. */
  outline_px?: number;
  /** Caption vertical margin from bottom (px) on 1080×1920. */
  margin_v?: number;
  /** Canvas. */
  width?: number;
  height?: number;
  /** Word-level timing available (Whisper/word timestamps). */
  word_timing?: boolean;
  /** Max chars per caption line. */
  max_chars_per_line?: number;
  /** Primary hex override for contrast check. */
  primary?: string;
};

export type StylePackDefaults = {
  canvas: { width: number; height: number };
  export_formats_ok: string[];
  outline_min_px: number;
  margin_v_min: number;
  margin_v_max: number;
  max_chars_per_line: number;
  categories: StyleCategory[];
  animations: StyleAnim[];
  style_count: number;
};

export type StylePackResult = {
  ok: true;
  source: "style-pack-1.0";
  action: string;
  summary: string;
  verdict?: StylePackVerdict;
  score?: number;
  style?: StyleEntry;
  styles?: StyleEntry[];
  checks?: StyleCheck[];
  failing?: string[];
  plan?: StylePlanStep[];
  defaults?: StylePackDefaults;
  notes?: string[];
  ass_preview?: string;
};

export type StylePackParseResult =
  | { ok: true; request: StylePackRequest }
  | { ok: false; error: string };

export const TARGET_W = 1080;
export const TARGET_H = 1920;
export const OUTLINE_MIN = 3.5;
export const MARGIN_V_MIN = 180;
export const MARGIN_V_MAX = 420;
export const MAX_CHARS = 28;

/** Original FrameFlow catalog — Capite-inspired categories/animations only. */
export const STYLE_CATALOG: StyleEntry[] = [
  {
    id: "pulse_cyan",
    name: "Pulse Cyan",
    category: "trending",
    animation: "highlight",
    font: "Montserrat",
    font_fallback: "Arial",
    font_size: 92,
    primary: "#FFFFFF",
    highlight: "#22D3EE",
    outline: "#0A0A0A",
    outline_px: 5,
    shadow_px: 3,
    bold: true,
    best_for: "Business hooks, motivation, founder shorts",
    contrast_hint: 0.95,
  },
  {
    id: "amber_blast",
    name: "Amber Blast",
    category: "trending",
    animation: "highlight",
    font: "Bebas Neue",
    font_fallback: "Impact",
    font_size: 108,
    primary: "#FFE566",
    highlight: "#FF7A18",
    outline: "#000000",
    outline_px: 7,
    shadow_px: 5,
    bold: true,
    best_for: "Entertainment, challenges, high-energy Shorts",
    contrast_hint: 0.88,
  },
  {
    id: "crimson_box",
    name: "Crimson Box",
    category: "trending",
    animation: "box",
    font: "Montserrat",
    font_fallback: "Arial",
    font_size: 96,
    primary: "#FFFFFF",
    highlight: "#E11D48",
    outline: "#000000",
    outline_px: 8,
    shadow_px: 0,
    bold: true,
    best_for: "Story reels, retention hooks, viral openers",
    contrast_hint: 0.95,
  },
  {
    id: "karaoke_wave",
    name: "Karaoke Wave",
    category: "pop",
    animation: "karaoke",
    font: "Montserrat",
    font_fallback: "Arial",
    font_size: 90,
    primary: "#F8FAFC",
    highlight: "#3B82F6",
    outline: "#020617",
    outline_px: 4,
    shadow_px: 3,
    bold: true,
    best_for: "Music, sing-alongs, lyric-led clips",
    contrast_hint: 0.93,
  },
  {
    id: "swiss_min",
    name: "Swiss Min",
    category: "clean_tech",
    animation: "scale",
    font: "Inter",
    font_fallback: "Helvetica",
    font_size: 86,
    primary: "#F1F5F9",
    highlight: "#FFFFFF",
    outline: "#0F172A",
    outline_px: 3.5,
    shadow_px: 2.5,
    bold: true,
    best_for: "SaaS, product demos, executive explainers",
    contrast_hint: 0.92,
  },
  {
    id: "spring_pop",
    name: "Spring Pop",
    category: "pop",
    animation: "bounce",
    font: "Bangers",
    font_fallback: "Comic Sans MS",
    font_size: 100,
    primary: "#4ADE80",
    highlight: "#E879F9",
    outline: "#000000",
    outline_px: 5,
    shadow_px: 4,
    bold: true,
    best_for: "Comedy, kids-adjacent fun, energetic edits",
    contrast_hint: 0.72,
  },
  {
    id: "essay_gold",
    name: "Essay Gold",
    category: "editorial",
    animation: "highlight",
    font: "Syne",
    font_fallback: "Arial",
    font_size: 88,
    primary: "#FFFFFF",
    highlight: "#FACC15",
    outline: "#000000",
    outline_px: 5,
    shadow_px: 3.5,
    bold: true,
    best_for: "Video essays, documentaries, explainers",
    contrast_hint: 0.95,
  },
  {
    id: "luxe_serif",
    name: "Luxe Serif",
    category: "editorial",
    animation: "scale",
    font: "Playfair Display",
    font_fallback: "Georgia",
    font_size: 84,
    primary: "#FBF7F0",
    highlight: "#D4A574",
    outline: "#1A1A1A",
    outline_px: 4,
    shadow_px: 3,
    bold: true,
    best_for: "Luxury, finance mindset, brand storytelling",
    contrast_hint: 0.9,
  },
  {
    id: "neon_duo",
    name: "Neon Duo",
    category: "pop",
    animation: "glow",
    font: "Orbitron",
    font_fallback: "Arial",
    font_size: 82,
    primary: "#22D3EE",
    highlight: "#FB7185",
    outline: "#050515",
    outline_px: 5,
    shadow_px: 6,
    bold: true,
    best_for: "AI demos, gaming, cyber / tech tutorials",
    contrast_hint: 0.7,
  },
  {
    id: "podcast_mark",
    name: "Podcast Mark",
    category: "trending",
    animation: "pop",
    font: "Inter",
    font_fallback: "Arial",
    font_size: 88,
    primary: "#F8FAFC",
    highlight: "#FDE047",
    outline: "#0F172A",
    outline_px: 4,
    shadow_px: 3,
    bold: true,
    best_for: "Podcasts, interviews, founder clips",
    contrast_hint: 0.93,
  },
  {
    id: "terminal_green",
    name: "Terminal Green",
    category: "clean_tech",
    animation: "pop",
    font: "JetBrains Mono",
    font_fallback: "Courier New",
    font_size: 78,
    primary: "#86EFAC",
    highlight: "#F0FDF4",
    outline: "#052E16",
    outline_px: 3.5,
    shadow_px: 2,
    bold: true,
    best_for: "Coding tutorials, CLI demos, dev content",
    contrast_hint: 0.75,
  },
  {
    id: "noir_type",
    name: "Noir Type",
    category: "editorial",
    animation: "highlight",
    font: "IBM Plex Sans",
    font_fallback: "Arial",
    font_size: 86,
    primary: "#E2E8F0",
    highlight: "#F87171",
    outline: "#020617",
    outline_px: 4.5,
    shadow_px: 3,
    bold: true,
    best_for: "True crime, drama, investigative essays",
    contrast_hint: 0.85,
  },
];

export const DEFAULTS: StylePackDefaults = {
  canvas: { width: TARGET_W, height: TARGET_H },
  export_formats_ok: ["ass", "burned"],
  outline_min_px: OUTLINE_MIN,
  margin_v_min: MARGIN_V_MIN,
  margin_v_max: MARGIN_V_MAX,
  max_chars_per_line: MAX_CHARS,
  categories: ["trending", "clean_tech", "editorial", "pop"],
  animations: ["highlight", "karaoke", "scale", "bounce", "pop", "glow", "box"],
  style_count: STYLE_CATALOG.length,
};

const asString = (v: unknown): string =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

const asNum = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
};

const asBool = (v: unknown): boolean | undefined => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(s)) return true;
    if (["0", "false", "no", "n"].includes(s)) return false;
  }
  return undefined;
};

const normalizeCategory = (raw?: string): StyleCategory | undefined => {
  if (!raw) return undefined;
  const s = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "trending") return "trending";
  if (s === "clean_tech" || s === "cleantech" || s === "tech") return "clean_tech";
  if (s === "editorial" || s === "editorial_film" || s === "film") return "editorial";
  if (s === "pop" || s === "pop_expressive" || s === "expressive") return "pop";
  return undefined;
};

const normalizeAnim = (raw?: string): StyleAnim | undefined => {
  if (!raw) return undefined;
  const s = raw.toLowerCase().trim();
  const allowed: StyleAnim[] = [
    "highlight",
    "karaoke",
    "scale",
    "bounce",
    "pop",
    "glow",
    "box",
  ];
  return allowed.includes(s as StyleAnim) ? (s as StyleAnim) : undefined;
};

export const findStyle = (id?: string): StyleEntry | undefined => {
  if (!id) return undefined;
  const key = id.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STYLE_CATALOG.find((s) => s.id === key);
};

const nicheScore = (style: StyleEntry, niche: string): number => {
  const n = niche.toLowerCase();
  let score = 0;
  const hay = `${style.best_for} ${style.name} ${style.category} ${style.animation}`.toLowerCase();
  for (const token of n.split(/[\s,/|]+/).filter(Boolean)) {
    if (hay.includes(token)) score += 2;
  }
  // Light priors by niche keywords
  if (/business|motivat|founder|hustle/.test(n) && style.id === "pulse_cyan") score += 3;
  if (/game|entertain|challenge|hype/.test(n) && style.id === "amber_blast") score += 3;
  if (/story|viral|hook|retention/.test(n) && style.id === "crimson_box") score += 3;
  if (/music|lyric|sing|karaoke/.test(n) && style.id === "karaoke_wave") score += 3;
  if (/saas|product|exec|b2b/.test(n) && style.id === "swiss_min") score += 3;
  if (/comedy|fun|kids|meme/.test(n) && style.id === "spring_pop") score += 3;
  if (/essay|doc|explain/.test(n) && style.id === "essay_gold") score += 3;
  if (/luxury|finance|brand/.test(n) && style.id === "luxe_serif") score += 3;
  if (/ai|cyber|game|tech tutorial/.test(n) && style.id === "neon_duo") score += 3;
  if (/podcast|interview|founder/.test(n) && style.id === "podcast_mark") score += 3;
  if (/code|dev|cli|terminal/.test(n) && style.id === "terminal_green") score += 3;
  if (/crime|drama|investigat|noir/.test(n) && style.id === "noir_type") score += 3;
  return score;
};

export const pickStyle = (opts: {
  niche?: string;
  category?: StyleCategory;
  animation?: StyleAnim;
}): StyleEntry => {
  let pool = [...STYLE_CATALOG];
  if (opts.category) {
    pool = pool.filter((s) => s.category === opts.category);
  }
  if (opts.animation) {
    pool = pool.filter((s) => s.animation === opts.animation);
  }
  if (!pool.length) pool = [...STYLE_CATALOG];
  if (opts.niche && opts.niche.trim()) {
    pool = [...pool].sort(
      (a, b) => nicheScore(b, opts.niche!) - nicheScore(a, opts.niche!)
    );
  }
  return pool[0];
};

/** Tiny ASS Dialogue preview (style header + one line). Original template. */
export const buildAssPreview = (style: StyleEntry, text = "WATCH THIS"): string => {
  const primary = style.primary.replace("#", "");
  // ASS uses &HAABBGGRR — leave as readable hex comment + Style line
  return [
    "[Script Info]",
    "Title: FrameFlow StylePack preview",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: ${style.id},${style.font},${style.font_size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,${style.bold ? -1 : 0},0,1,${style.outline_px},${style.shadow_px},2,60,60,240,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    `Dialogue: 0,0:00:00.00,0:00:02.50,${style.id},,0,0,0,,{\\c&H${primary.slice(4, 6)}${primary.slice(2, 4)}${primary.slice(0, 2)}&}${text}`,
    `; animation=${style.animation} highlight=${style.highlight} fallback=${style.font_fallback}`,
  ].join("\n");
};

export const parseStylePackRequest = (
  body: Record<string, unknown>
): StylePackParseResult => {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const actionRaw = asString(body.action) || "check";
  const allowed: StylePackAction[] = [
    "check",
    "demo",
    "defaults",
    "list",
    "pick",
    "plan",
    "styles",
  ];
  if (!allowed.includes(actionRaw as StylePackAction)) {
    return {
      ok: false,
      error: `action must be one of: ${allowed.join(", ")}`,
    };
  }
  const request: StylePackRequest = {
    action: actionRaw as StylePackAction,
    demo: asBool(body.demo),
    style_id: asString(body.style_id) || asString(body.style) || undefined,
    niche: asString(body.niche) || asString(body.topic) || undefined,
    category: normalizeCategory(asString(body.category)),
    animation: normalizeAnim(asString(body.animation)),
    export_format: asString(body.export_format) || asString(body.format) || undefined,
    outline_px: asNum(body.outline_px),
    margin_v: asNum(body.margin_v),
    width: asNum(body.width),
    height: asNum(body.height),
    word_timing: asBool(body.word_timing),
    max_chars_per_line: asNum(body.max_chars_per_line),
    primary: asString(body.primary) || undefined,
  };
  return { ok: true, request };
};

const runChecks = (req: StylePackRequest): {
  checks: StyleCheck[];
  style?: StyleEntry;
  verdict: StylePackVerdict;
  score: number;
} => {
  const style =
    findStyle(req.style_id) ||
    (req.niche || req.category || req.animation
      ? pickStyle({
          niche: req.niche,
          category: req.category as StyleCategory | undefined,
          animation: req.animation as StyleAnim | undefined,
        })
      : undefined);

  const exportFmt = (req.export_format || "ass").toLowerCase();
  const outline = req.outline_px ?? style?.outline_px ?? 0;
  const marginV = req.margin_v ?? 240;
  const w = req.width ?? TARGET_W;
  const h = req.height ?? TARGET_H;
  const wordTiming = req.word_timing ?? true;
  const maxChars = req.max_chars_per_line ?? MAX_CHARS;
  const contrast = style?.contrast_hint ?? 0;

  const checks: StyleCheck[] = [
    {
      id: "style_selected",
      ok: !!style,
      severity: "block",
      label: "Style selected",
      detail: style
        ? `${style.name} (${style.id}) · ${style.category}/${style.animation}`
        : "No style_id / niche — pick or list first.",
    },
    {
      id: "export_format",
      ok: DEFAULTS.export_formats_ok.includes(exportFmt),
      severity: exportFmt === "srt" || exportFmt === "vtt" ? "fix" : "block",
      label: "Export format",
      detail:
        exportFmt === "ass" || exportFmt === "burned"
          ? `${exportFmt} keeps styled ASS / burn-in`
          : `${exportFmt || "none"} loses word-highlight styles — prefer ASS or burned`,
    },
    {
      id: "outline_weight",
      ok: outline >= OUTLINE_MIN,
      severity: "fix",
      label: "Outline weight",
      detail:
        outline >= OUTLINE_MIN
          ? `${outline}px ≥ ${OUTLINE_MIN}px min for busy backgrounds`
          : `${outline}px too thin — bump outline to ≥ ${OUTLINE_MIN}px`,
    },
    {
      id: "contrast",
      ok: contrast >= 0.7,
      severity: contrast < 0.55 ? "block" : "fix",
      label: "Primary contrast",
      detail: style
        ? `hint ${contrast.toFixed(2)} on dark canvas (${style.primary})`
        : "No style for contrast hint",
    },
    {
      id: "safe_margin",
      ok: marginV >= MARGIN_V_MIN && marginV <= MARGIN_V_MAX,
      severity: "fix",
      label: "Caption MarginV",
      detail:
        marginV >= MARGIN_V_MIN && marginV <= MARGIN_V_MAX
          ? `${marginV}px within ${MARGIN_V_MIN}–${MARGIN_V_MAX} (UI chrome clear)`
          : `${marginV}px outside safe band ${MARGIN_V_MIN}–${MARGIN_V_MAX}`,
    },
    {
      id: "animation",
      ok: !!style?.animation,
      severity: "info",
      label: "Animation mode",
      detail: style
        ? `${style.animation} — word highlight / ${style.highlight}`
        : "Pick a style to lock animation",
    },
    {
      id: "font_fallback",
      ok: !!(style?.font && style?.font_fallback),
      severity: "fix",
      label: "Font + fallback",
      detail: style
        ? `${style.font} → ${style.font_fallback}`
        : "Missing font pair",
    },
    {
      id: "canvas",
      ok: w === TARGET_W && h === TARGET_H,
      severity: "fix",
      label: "Canvas 9:16",
      detail:
        w === TARGET_W && h === TARGET_H
          ? `${w}×${h}`
          : `${w}×${h} — StylePack assumes ${TARGET_W}×${TARGET_H}`,
    },
    {
      id: "word_timing",
      ok: wordTiming,
      severity: "fix",
      label: "Word timing",
      detail: wordTiming
        ? "Word timestamps available for karaoke/highlight"
        : "No word timing — highlight/karaoke will look flat",
    },
    {
      id: "line_budget",
      ok: maxChars > 0 && maxChars <= MAX_CHARS + 6,
      severity: "info",
      label: "Line budget",
      detail: `≤${maxChars} chars/line (target ≤${MAX_CHARS} for vertical)`,
    },
  ];

  const failing = checks.filter((c) => !c.ok);
  const blocked = failing.some((c) => c.severity === "block");
  const score = Math.round(
    (checks.filter((c) => c.ok).length / checks.length) * 100
  );
  const verdict: StylePackVerdict = blocked
    ? "BLOCKED"
    : failing.length
      ? "FIX"
      : "READY";

  return { checks, style, verdict, score };
};

const buildPlan = (style?: StyleEntry): StylePlanStep[] => {
  const sid = style?.id || "pulse_cyan";
  return [
    {
      id: "pick",
      label: "Lock style",
      purpose: "Choose one catalog style for the whole short",
      in_ass: `StylePack pick → ${sid}`,
    },
    {
      id: "format",
      label: "Export ASS (or burn)",
      purpose: "Keep word-highlight / karaoke; SRT drops styles",
      in_ass: "Write .ass with PlayResX=1080 PlayResY=1920",
    },
    {
      id: "outline",
      label: "Outline ≥ 3.5px",
      purpose: "Readable over busy B-roll and UI chrome",
      in_ass: `Style Outline=${style?.outline_px ?? 5}`,
    },
    {
      id: "margin",
      label: "MarginV 180–420",
      purpose: "Clear Shorts / Reels bottom UI",
      in_ass: "Dialogue MarginV ≈ 240 (tweak per platform)",
    },
    {
      id: "timing",
      label: "Word timestamps",
      purpose: "Drive highlight / karaoke / box animations",
      in_ass: `animation=${style?.animation || "highlight"}`,
    },
    {
      id: "fallback",
      label: "Font fallback",
      purpose: "Non-Latin / missing glyph safety",
      in_ass: `${style?.font || "Montserrat"} → ${style?.font_fallback || "Arial"}`,
    },
  ];
};

export const runStylePack = (req: StylePackRequest): StylePackResult => {
  const action = req.action || "check";

  if (action === "defaults") {
    return {
      ok: true,
      source: "style-pack-1.0",
      action,
      summary: "StylePack defaults — ASS style catalog + burn-in gates.",
      defaults: DEFAULTS,
      notes: [
        "Inspired by Capite (MIT) style-pack idea; original FrameFlow catalog.",
        "Complementary to SafeKit / StickyCue / CapCutGate — does not replace them.",
      ],
    };
  }

  if (action === "list" || action === "styles") {
    return {
      ok: true,
      source: "style-pack-1.0",
      action,
      summary: `${STYLE_CATALOG.length} ASS caption styles across ${DEFAULTS.categories.length} categories.`,
      styles: STYLE_CATALOG,
      defaults: DEFAULTS,
    };
  }

  if (action === "pick") {
    const style = pickStyle({
      niche: req.niche,
      category: req.category as StyleCategory | undefined,
      animation: req.animation as StyleAnim | undefined,
    });
    return {
      ok: true,
      source: "style-pack-1.0",
      action,
      summary: `Picked ${style.name} for ${req.niche || req.category || "general"}.`,
      style,
      ass_preview: buildAssPreview(style),
      notes: [`best_for: ${style.best_for}`],
    };
  }

  if (action === "plan") {
    const style =
      findStyle(req.style_id) ||
      pickStyle({
        niche: req.niche,
        category: req.category as StyleCategory | undefined,
        animation: req.animation as StyleAnim | undefined,
      });
    return {
      ok: true,
      source: "style-pack-1.0",
      action,
      summary: `ASS burn-in plan for ${style.name}.`,
      style,
      plan: buildPlan(style),
      ass_preview: buildAssPreview(style),
    };
  }

  if (action === "demo") {
    const good = runChecks({
      action: "check",
      style_id: "pulse_cyan",
      export_format: "ass",
      outline_px: 5,
      margin_v: 240,
      width: TARGET_W,
      height: TARGET_H,
      word_timing: true,
      max_chars_per_line: 24,
    });
    return {
      ok: true,
      source: "style-pack-1.0",
      action,
      summary: `Demo READY — ${good.style?.name} ASS pack.`,
      verdict: good.verdict,
      score: good.score,
      style: good.style,
      checks: good.checks,
      failing: good.checks.filter((c) => !c.ok).map((c) => c.id),
      plan: buildPlan(good.style),
      ass_preview: good.style ? buildAssPreview(good.style) : undefined,
      styles: STYLE_CATALOG.slice(0, 4),
      notes: ["demo uses pulse_cyan + ASS + word timing"],
    };
  }

  // check (default)
  const { checks, style, verdict, score } = runChecks(req);
  return {
    ok: true,
    source: "style-pack-1.0",
    action: "check",
    summary:
      verdict === "READY"
        ? `READY ${score}/100 — ${style?.name || "style"} burn-in pack`
        : verdict === "BLOCKED"
          ? `BLOCKED ${score}/100 — fix blocking ASS gates`
          : `FIX ${score}/100 — tighten outline / margin / format`,
    verdict,
    score,
    style,
    checks,
    failing: checks.filter((c) => !c.ok).map((c) => c.id),
    plan: buildPlan(style),
    ass_preview: style ? buildAssPreview(style) : undefined,
  };
};
