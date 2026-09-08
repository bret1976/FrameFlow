/**
 * ShortFrame — aspect-ratio framing presets + hook text score + karaoke subtitle styles.
 * Idea inspired by egga-fx/xclips (MIT; reimplement only —
 * original FrameFlow TypeScript, no clone of their Tauri/Bun desktop app).
 * Emits ffmpeg filtergraphs and planning metadata. Pure functions, local-first, no API keys.
 */

export type AspectSlug = "9x16" | "1x1" | "4x5" | "16x9";
export type LayoutSlug = "center-crop" | "blur-fit" | "split-stack";
export type SubtitlePreset = "hormozi-neon" | "clean-box" | "plain";

export type AspectSpec = {
  slug: AspectSlug;
  label: string;
  width: number;
  height: number;
  platforms: string[];
};

export type LayoutSpec = {
  slug: LayoutSlug;
  label: string;
  description: string;
  /** Template uses {W} {H} for output size. */
  filter_template: string;
  when_to_use: string;
  avoid_when: string;
};

export type SubtitleStyle = {
  slug: SubtitlePreset;
  label: string;
  css_hint: string;
  ass_style_hint: string;
};

export type ShortFrameRequest = {
  action?: "list" | "plan" | "hook-score" | "demo";
  aspect?: AspectSlug | string;
  layout?: LayoutSlug | string;
  /** Horizontal pan for center-crop: -100..100 (percent of excess width). */
  pan_x?: number;
  source_width?: number;
  source_height?: number;
  /** Opening hook / first ~3s transcript for lexical hook score. */
  hook_text?: string;
  subtitle_preset?: SubtitlePreset | string;
  demo?: boolean;
};

export type HookScore = {
  score: number;
  band: "weak" | "okay" | "strong";
  axes: {
    question: number;
    urgency: number;
    specificity: number;
    emotion: number;
    length_fit: number;
  };
  reasons: string[];
  suggested_title?: string;
};

export type FramePlan = {
  aspect: AspectSpec;
  layout: LayoutSpec;
  pan_x: number;
  output: { width: number; height: number };
  ffmpeg_vf: string;
  ffmpeg_example: string;
  subtitle?: SubtitleStyle;
  notes: string[];
};

export type ShortFrameResult = {
  ok: true;
  action: string;
  source: "short-frame-1.0";
  aspects?: AspectSpec[];
  layouts?: LayoutSpec[];
  subtitles?: SubtitleStyle[];
  plan?: FramePlan;
  hook?: HookScore;
  summary: string;
};

const ASPECTS: AspectSpec[] = [
  {
    slug: "9x16",
    label: "9:16 Vertical",
    width: 1080,
    height: 1920,
    platforms: ["TikTok", "Instagram Reels", "YouTube Shorts", "Facebook Reels"],
  },
  {
    slug: "1x1",
    label: "1:1 Square",
    width: 1080,
    height: 1080,
    platforms: ["Instagram Feed", "Facebook Post", "LinkedIn"],
  },
  {
    slug: "4x5",
    label: "4:5 Portrait",
    width: 1080,
    height: 1350,
    platforms: ["Instagram Feed mobile", "Facebook mobile"],
  },
  {
    slug: "16x9",
    label: "16:9 Landscape",
    width: 1920,
    height: 1080,
    platforms: ["YouTube", "LinkedIn", "X/Twitter", "desktop"],
  },
];

const LAYOUTS: LayoutSpec[] = [
  {
    slug: "center-crop",
    label: "Center Crop + Pan",
    description: "Fill the frame by cropping; pan_x shifts the crop window for faces.",
    filter_template:
      "scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}",
    when_to_use: "Talking-head or single subject that survives a tight crop.",
    avoid_when: "Wide establishing shots where edges matter.",
  },
  {
    slug: "blur-fit",
    label: "Blurred Background Fit",
    description: "Letterbox the source centered; blurred scaled copy fills the canvas.",
    filter_template:
      "split[bg][fg];[bg]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=25:5[bg2];[fg]scale={W}:{H}:force_original_aspect_ratio=decrease[fg2];[bg2][fg2]overlay=(W-w)/2:(H-h)/2",
    when_to_use: "Keep full landscape content visible inside vertical shorts.",
    avoid_when: "Busy backgrounds that make the blur look noisy.",
  },
  {
    slug: "split-stack",
    label: "Split Stack",
    description: "Two stacked viewports (vertical) or side-by-side (landscape) of the same source.",
    filter_template:
      "split[top][bot];[top]scale={W}:{halfH}:force_original_aspect_ratio=increase,crop={W}:{halfH}[t];[bot]scale={W}:{halfH}:force_original_aspect_ratio=increase,crop={W}:{halfH}[b];[t][b]vstack=inputs=2",
    when_to_use: "Reaction / dual-angle / A-vs-B vertical storytelling.",
    avoid_when: "Single-subject close-ups (faces get tiny).",
  },
];

const SUBTITLES: SubtitleStyle[] = [
  {
    slug: "hormozi-neon",
    label: "Hormozi Neon Bold",
    css_hint: "font-weight:900; color:#fff; text-shadow:0 0 12px #FACC15; word highlight #FACC15",
    ass_style_hint: "Bold white, active word #FACC15, bottom-center, large size",
  },
  {
    slug: "clean-box",
    label: "Clean Box",
    css_hint: "background:rgba(0,0,0,.55); padding:6px 10px; border-radius:8px; color:#fff",
    ass_style_hint: "Semi-transparent box, white text, bottom-center",
  },
  {
    slug: "plain",
    label: "Plain",
    css_hint: "color:#fff; font-weight:600; text-shadow:0 1px 2px #000",
    ass_style_hint: "Simple white outline text",
  },
];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const normalizeAspect = (raw?: string): AspectSlug => {
  const s = String(raw || "9x16").toLowerCase().replace(":", "x").replace("/", "x");
  if (s === "9x16" || s === "1x1" || s === "4x5" || s === "16x9") return s;
  if (s.includes("vertical") || s.includes("short") || s.includes("reel")) return "9x16";
  if (s.includes("square")) return "1x1";
  if (s.includes("portrait") || s.includes("4x5")) return "4x5";
  if (s.includes("landscape") || s.includes("wide")) return "16x9";
  return "9x16";
};

const normalizeLayout = (raw?: string): LayoutSlug => {
  const s = String(raw || "center-crop").toLowerCase();
  if (s.includes("blur")) return "blur-fit";
  if (s.includes("split") || s.includes("stack")) return "split-stack";
  return "center-crop";
};

const normalizeSub = (raw?: string): SubtitlePreset => {
  const s = String(raw || "hormozi-neon").toLowerCase();
  if (s.includes("clean") || s.includes("box")) return "clean-box";
  if (s.includes("plain")) return "plain";
  return "hormozi-neon";
};

function buildVf(layout: LayoutSpec, aspect: AspectSpec, panX: number): string {
  const W = aspect.width;
  const H = aspect.height;
  const halfH = Math.floor(H / 2);
  let vf = layout.filter_template
    .replace(/\{W\}/g, String(W))
    .replace(/\{H\}/g, String(H))
    .replace(/\{halfH\}/g, String(halfH));

  // Center-crop pan: approximate with crop x offset after scale-to-cover.
  if (layout.slug === "center-crop" && panX !== 0) {
    const t = (panX + 100) / 200; // 0..1
    vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:x='(iw-${W})*${t.toFixed(4)}':y='(ih-${H})/2'`;
  }

  // Landscape split uses hstack halves instead of vstack.
  if (layout.slug === "split-stack" && aspect.slug === "16x9") {
    const halfW = Math.floor(W / 2);
    vf = `split[l][r];[l]scale=${halfW}:${H}:force_original_aspect_ratio=increase,crop=${halfW}:${H}[a];[r]scale=${halfW}:${H}:force_original_aspect_ratio=increase,crop=${halfW}:${H}[b];[a][b]hstack=inputs=2`;
  }

  return vf;
}

function scoreHook(text: string): HookScore {
  const t = text.trim();
  const lower = t.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const axes = {
    question: /[?]|(^\s*(what|why|how|who|when|which)\b)/i.test(t) ? 22 : /\b(ever|secret|truth)\b/i.test(t) ? 12 : 4,
    urgency: /\b(now|today|stop|don't|never|before|last chance|warning)\b/i.test(t) ? 20 : 6,
    specificity: /\d/.test(t) || /\b(percent|\$|minutes?|seconds?|#\d)\b/i.test(t) ? 20 : words.length >= 6 ? 10 : 4,
    emotion: /\b(shock|crazy|insane|love|hate|fear|fail|win|broke|rich)\b/i.test(t) ? 18 : 6,
    length_fit: (() => {
      const n = words.length;
      if (n >= 5 && n <= 14) return 20;
      if (n >= 3 && n <= 18) return 12;
      return 4;
    })(),
  };
  const score = clamp(Object.values(axes).reduce((a, b) => a + b, 0), 0, 100);
  const reasons: string[] = [];
  if (axes.question >= 12) reasons.push("Opens with curiosity / question energy");
  if (axes.urgency >= 12) reasons.push("Has urgency language");
  if (axes.specificity >= 12) reasons.push("Specific number or concrete detail");
  if (axes.emotion >= 12) reasons.push("Emotional charge words");
  if (axes.length_fit >= 12) reasons.push("Length fits a 1–3s spoken hook");
  if (!reasons.length) reasons.push("Flat open — add a question, number, or stakes");

  const band: HookScore["band"] = score >= 70 ? "strong" : score >= 45 ? "okay" : "weak";
  const suggested =
    words.length > 0
      ? t.replace(/\s+/g, " ").slice(0, 72) + (t.length > 72 ? "…" : "")
      : undefined;

  return { score, band, axes, reasons, suggested_title: suggested };
}

function planFrame(request: ShortFrameRequest): FramePlan {
  const aspect = ASPECTS.find((a) => a.slug === normalizeAspect(request.aspect)) || ASPECTS[0];
  const layout = LAYOUTS.find((l) => l.slug === normalizeLayout(request.layout)) || LAYOUTS[0];
  const pan_x = clamp(Number(request.pan_x ?? 0) || 0, -100, 100);
  const sub = SUBTITLES.find((s) => s.slug === normalizeSub(request.subtitle_preset)) || SUBTITLES[0];
  const vf = buildVf(layout, aspect, pan_x);
  const notes: string[] = [
    layout.when_to_use,
    `Avoid: ${layout.avoid_when}`,
    `Targets: ${aspect.platforms.join(", ")}`,
  ];
  if (request.source_width && request.source_height) {
    const srcAR = request.source_width / request.source_height;
    const outAR = aspect.width / aspect.height;
    notes.push(
      `Source ${request.source_width}x${request.source_height} (AR ${srcAR.toFixed(3)}) → ${aspect.width}x${aspect.height} (AR ${outAR.toFixed(3)})`
    );
  }
  const ffmpeg_example = `ffmpeg -y -i input.mp4 -vf "${vf}" -c:v libx264 -pix_fmt yuv420p -c:a aac out_${aspect.slug}_${layout.slug}.mp4`;
  return {
    aspect,
    layout,
    pan_x,
    output: { width: aspect.width, height: aspect.height },
    ffmpeg_vf: vf,
    ffmpeg_example,
    subtitle: sub,
    notes,
  };
}

export function parseShortFrameRequest(
  body: Record<string, unknown>
): { ok: true; request: ShortFrameRequest } | { ok: false; error: string } {
  const demo = body.demo === true;
  const actionRaw = typeof body.action === "string" ? body.action.toLowerCase() : demo ? "demo" : "plan";
  const allowed = new Set(["list", "plan", "hook-score", "demo"]);
  if (!allowed.has(actionRaw)) {
    return { ok: false, error: "action must be list | plan | hook-score | demo" };
  }
  const request: ShortFrameRequest = {
    action: actionRaw as ShortFrameRequest["action"],
    aspect: typeof body.aspect === "string" ? body.aspect : undefined,
    layout: typeof body.layout === "string" ? body.layout : undefined,
    pan_x: typeof body.pan_x === "number" ? body.pan_x : undefined,
    source_width: typeof body.source_width === "number" ? body.source_width : undefined,
    source_height: typeof body.source_height === "number" ? body.source_height : undefined,
    hook_text: typeof body.hook_text === "string" ? body.hook_text : undefined,
    subtitle_preset: typeof body.subtitle_preset === "string" ? body.subtitle_preset : undefined,
    demo,
  };
  if (actionRaw === "hook-score" && !request.hook_text?.trim() && !demo) {
    return { ok: false, error: "hook-score needs hook_text (or demo:true)." };
  }
  return { ok: true, request };
}

export function runShortFrame(request: ShortFrameRequest): ShortFrameResult {
  const action = request.demo ? "demo" : request.action || "plan";

  if (action === "list") {
    return {
      ok: true,
      action: "list",
      source: "short-frame-1.0",
      aspects: ASPECTS,
      layouts: LAYOUTS,
      subtitles: SUBTITLES,
      summary: `${ASPECTS.length} aspects · ${LAYOUTS.length} layouts · ${SUBTITLES.length} subtitle presets`,
    };
  }

  if (action === "hook-score") {
    const text =
      request.hook_text?.trim() ||
      "Why 90% of creators still cut vertical the hard way — and the 8-second fix";
    const hook = scoreHook(text);
    return {
      ok: true,
      action: "hook-score",
      source: "short-frame-1.0",
      hook,
      summary: `Hook ${hook.band} (${hook.score}/100): ${hook.reasons[0]}`,
    };
  }

  // plan + demo
  const plan = planFrame(
    action === "demo"
      ? {
          aspect: "9x16",
          layout: "blur-fit",
          pan_x: 0,
          source_width: 1920,
          source_height: 1080,
          subtitle_preset: "hormozi-neon",
          hook_text:
            request.hook_text ||
            "Stop cropping faces off — blur-fit keeps the whole shot in 9:16",
        }
      : request
  );
  const hook = scoreHook(
    request.hook_text?.trim() ||
      (action === "demo"
        ? "Stop cropping faces off — blur-fit keeps the whole shot in 9:16"
        : "")
  );

  return {
    ok: true,
    action: action === "demo" ? "demo" : "plan",
    source: "short-frame-1.0",
    aspects: ASPECTS,
    layouts: LAYOUTS,
    subtitles: SUBTITLES,
    plan,
    hook: request.hook_text || action === "demo" ? hook : undefined,
    summary: `${plan.aspect.label} · ${plan.layout.label} → ${plan.output.width}x${plan.output.height}${
      hook && (request.hook_text || action === "demo") ? ` · hook ${hook.band} ${hook.score}` : ""
    }`,
  };
}
