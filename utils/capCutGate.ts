/**
 * CapCutGate — CapCut draft / export handoff checklist.
 *
 * Idea inspired by Hao0321/video-autopilot-kit (MIT) shorts_gate +
 * publish/export readiness (platform-aware duration, first-cut ≤2s,
 * caption binding). This is an original FrameFlow TypeScript
 * implementation (no vendored Python, no cloned docs/scripts). Pure
 * functions, local-first, no API keys.
 *
 * Complementary to: FinishKit (ffmpeg loudness/resolution finish),
 * DeliveryGate (publish metadata / retention), SafeKit (UI safe zones /
 * SRT contrast), StickyCue (caption timing burn). CapCutGate answers:
 * "is this package ready to open / export from CapCut without a
 * watermark surprise or a dead-zone duration?"
 */

export type CapCutGateAction =
  | "check"
  | "demo"
  | "defaults"
  | "checklist"
  | "plan";

export type CapCutVerdict = "READY" | "FIX" | "BLOCKED";

export type CapCutPlatform =
  | "yt_shorts"
  | "ig_reels"
  | "tiktok"
  | "capcut_generic";

export type CapCutCheckId =
  | "aspect"
  | "duration"
  | "first_cut"
  | "caption_source"
  | "draft_name"
  | "fps"
  | "export_preset"
  | "audio"
  | "watermark_risk"
  | "template_intent"
  | "loop_seam";

export type CapCutCheck = {
  id: CapCutCheckId;
  ok: boolean;
  severity: "block" | "fix" | "info";
  label: string;
  detail: string;
};

export type CapCutPlanStep = {
  id: string;
  label: string;
  purpose: string;
  in_capcut: string;
};

export type CapCutGateRequest = {
  action?: CapCutGateAction;
  demo?: boolean;
  platform?: CapCutPlatform | string;
  /** Declared canvas / project facts (optional). */
  width?: number;
  height?: number;
  duration_sec?: number;
  first_cut_sec?: number;
  fps?: number;
  /** CapCut draft / project name. */
  draft_name?: string;
  /** Caption handoff: srt | ass | burned | none | auto */
  caption_source?: string;
  caption_path?: string;
  has_audio?: boolean;
  /** CapCut free-tier watermark risk (true = risk). */
  watermark_risk?: boolean;
  /** Export quality preset label, e.g. "1080p" | "720p" | "4k". */
  export_preset?: string;
  /** blank | template | auto_beat | unknown */
  template_intent?: string;
  /** For loop templates: last frame aligns to first within tolerance. */
  loop_aligned?: boolean;
  wants_loop?: boolean;
};

export type CapCutDefaults = {
  aspect: string;
  width: number;
  height: number;
  fps_ok: number[];
  first_cut_max_sec: number;
  platforms: Record<
    CapCutPlatform,
    { dur_min: number; dur_max: number; deadzone: [number, number] | null }
  >;
  caption_sources_ok: string[];
  export_presets_ok: string[];
};

export type CapCutGateResult = {
  ok: true;
  source: "cap-cut-gate-1.0";
  action: string;
  summary: string;
  verdict?: CapCutVerdict;
  score?: number;
  platform?: CapCutPlatform;
  checks?: CapCutCheck[];
  failing?: string[];
  plan?: CapCutPlanStep[];
  defaults?: CapCutDefaults;
  checklist?: Array<{ id: string; label: string; why: string }>;
  notes?: string[];
};

export type CapCutGateParseResult =
  | { ok: true; request: CapCutGateRequest }
  | { ok: false; error: string };

export const TARGET_W = 1080;
export const TARGET_H = 1920;
export const FIRST_CUT_MAX = 2.05;

export const PLATFORM_BANDS: CapCutDefaults["platforms"] = {
  yt_shorts: { dur_min: 13, dur_max: 25, deadzone: [25.001, 44.999] },
  ig_reels: { dur_min: 7, dur_max: 60, deadzone: null },
  tiktok: { dur_min: 7, dur_max: 60, deadzone: null },
  capcut_generic: { dur_min: 7, dur_max: 60, deadzone: null },
};

export const DEFAULTS: CapCutDefaults = {
  aspect: "9:16",
  width: TARGET_W,
  height: TARGET_H,
  fps_ok: [24, 25, 30, 60],
  first_cut_max_sec: FIRST_CUT_MAX,
  platforms: PLATFORM_BANDS,
  caption_sources_ok: ["srt", "ass", "burned", "auto"],
  export_presets_ok: ["1080p", "1080", "2k", "4k", "original"],
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

const normalizePlatform = (raw?: string): CapCutPlatform => {
  const s = (raw || "yt_shorts").toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "youtube" || s === "shorts" || s === "yt" || s === "youtube_shorts") {
    return "yt_shorts";
  }
  if (s === "ig" || s === "instagram" || s === "reels" || s === "instagram_reels") {
    return "ig_reels";
  }
  if (s === "tt" || s === "tik_tok") return "tiktok";
  if (s === "capcut" || s === "generic" || s === "capcut_generic") {
    return "capcut_generic";
  }
  if (
    s === "yt_shorts" ||
    s === "ig_reels" ||
    s === "tiktok" ||
    s === "capcut_generic"
  ) {
    return s;
  }
  return "yt_shorts";
};

export const parseCapCutGateRequest = (
  body: Record<string, unknown>
): CapCutGateParseResult => {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const actionRaw = asString(body.action) || "check";
  const allowed: CapCutGateAction[] = [
    "check",
    "demo",
    "defaults",
    "checklist",
    "plan",
  ];
  if (!allowed.includes(actionRaw as CapCutGateAction)) {
    return {
      ok: false,
      error: `action must be one of: ${allowed.join("|")}`,
    };
  }
  const request: CapCutGateRequest = {
    action: actionRaw as CapCutGateAction,
    demo: asBool(body.demo),
    platform: asString(body.platform) || undefined,
    width: asNum(body.width),
    height: asNum(body.height),
    duration_sec: asNum(body.duration_sec),
    first_cut_sec: asNum(body.first_cut_sec),
    fps: asNum(body.fps),
    draft_name: asString(body.draft_name) || undefined,
    caption_source: asString(body.caption_source) || undefined,
    caption_path: asString(body.caption_path) || undefined,
    has_audio: asBool(body.has_audio),
    watermark_risk: asBool(body.watermark_risk),
    export_preset: asString(body.export_preset) || undefined,
    template_intent: asString(body.template_intent) || undefined,
    loop_aligned: asBool(body.loop_aligned),
    wants_loop: asBool(body.wants_loop),
  };
  return { ok: true, request };
};

const STATIC_CHECKLIST: CapCutGateResult["checklist"] = [
  {
    id: "aspect",
    label: "9:16 CapCut project",
    why: "Vertical canvas before any template or auto-beat",
  },
  {
    id: "duration",
    label: "Platform duration band",
    why: "YT Shorts dead zone 26–44s is not a universal CapCut rule",
  },
  {
    id: "first_cut",
    label: "First cut ≤2s",
    why: "Something must change before the scroll thumb lifts",
  },
  {
    id: "caption_source",
    label: "Caption handoff",
    why: "SRT/ASS import or intentional burn — not an empty Auto Captions hope",
  },
  {
    id: "draft_name",
    label: "Named CapCut draft",
    why: "Untitled drafts get overwritten in CapCut cloud sync",
  },
  {
    id: "fps",
    label: "CapCut-friendly FPS",
    why: "24/25/30/60 — odd rates break some CapCut templates",
  },
  {
    id: "export_preset",
    label: "1080p+ export preset",
    why: "720p soft-exports look soft after platform recompress",
  },
  {
    id: "audio",
    label: "Audio track present",
    why: "CapCut ducking / auto-captions need a real track",
  },
  {
    id: "watermark_risk",
    label: "No free-tier watermark",
    why: "CapCut free exports can stamp a logo — declare Pro/export path",
  },
  {
    id: "template_intent",
    label: "Template intent",
    why: "Blank vs template vs auto-beat must be deliberate",
  },
  {
    id: "loop_seam",
    label: "Loop seam (optional)",
    why: "Loop templates need last→first alignment or they hitch",
  },
];

export function runCapCutChecks(req: CapCutGateRequest): {
  platform: CapCutPlatform;
  checks: CapCutCheck[];
  score: number;
  verdict: CapCutVerdict;
  failing: string[];
} {
  const platform = normalizePlatform(
    typeof req.platform === "string" ? req.platform : undefined
  );
  const band = PLATFORM_BANDS[platform];
  const checks: CapCutCheck[] = [];

  // aspect
  const w = req.width;
  const h = req.height;
  if (w == null || h == null) {
    checks.push({
      id: "aspect",
      ok: false,
      severity: "fix",
      label: "Aspect 9:16",
      detail: "Declare width×height (expect 1080×1920 or any 9:16)",
    });
  } else {
    const ratio = w / h;
    const target = 9 / 16;
    const ok = Math.abs(ratio - target) < 0.02 && h >= w;
    checks.push({
      id: "aspect",
      ok,
      severity: ok ? "info" : "block",
      label: "Aspect 9:16",
      detail: ok
        ? `${w}×${h} is vertical 9:16`
        : `${w}×${h} is not 9:16 — open a CapCut vertical project first`,
    });
  }

  // duration (platform-aware)
  const dur = req.duration_sec;
  if (dur == null) {
    checks.push({
      id: "duration",
      ok: false,
      severity: "fix",
      label: "Duration band",
      detail: `Declare duration_sec for ${platform} (target ${band.dur_min}–${band.dur_max}s)`,
    });
  } else {
    const inDead =
      band.deadzone != null &&
      dur >= band.deadzone[0] &&
      dur <= band.deadzone[1];
    const inBand = dur >= band.dur_min && dur <= band.dur_max;
    if (inDead) {
      checks.push({
        id: "duration",
        ok: false,
        severity: "block",
        label: "Duration band",
        detail: `${dur}s sits in the ${platform} dead zone ${band.deadzone![0]}–${band.deadzone![1]}s — trim or extend before CapCut export`,
      });
    } else if (!inBand) {
      checks.push({
        id: "duration",
        ok: false,
        severity: "fix",
        label: "Duration band",
        detail: `${dur}s outside ${platform} band ${band.dur_min}–${band.dur_max}s`,
      });
    } else {
      checks.push({
        id: "duration",
        ok: true,
        severity: "info",
        label: "Duration band",
        detail: `${dur}s inside ${platform} ${band.dur_min}–${band.dur_max}s`,
      });
    }
  }

  // first cut
  const fc = req.first_cut_sec;
  if (fc == null) {
    checks.push({
      id: "first_cut",
      ok: false,
      severity: "fix",
      label: "First cut ≤2s",
      detail: `Declare first_cut_sec (CapCut timeline: something must change by ${FIRST_CUT_MAX}s)`,
    });
  } else {
    const ok = fc <= FIRST_CUT_MAX && fc >= 0;
    checks.push({
      id: "first_cut",
      ok,
      severity: ok ? "info" : "block",
      label: "First cut ≤2s",
      detail: ok
        ? `First cut at ${fc}s ≤ ${FIRST_CUT_MAX}s`
        : `First cut at ${fc}s is too slow — cut or punch-in before ${FIRST_CUT_MAX}s in CapCut`,
    });
  }

  // caption source
  const cap = (req.caption_source || "").toLowerCase();
  if (!cap) {
    checks.push({
      id: "caption_source",
      ok: false,
      severity: "fix",
      label: "Caption handoff",
      detail: "Set caption_source: srt | ass | burned | auto | none",
    });
  } else if (cap === "none") {
    checks.push({
      id: "caption_source",
      ok: false,
      severity: "fix",
      label: "Caption handoff",
      detail: "No captions planned — CapCut Auto Captions still needs a deliberate pass",
    });
  } else if (DEFAULTS.caption_sources_ok.includes(cap)) {
    const pathNote = req.caption_path ? ` (${req.caption_path})` : "";
    checks.push({
      id: "caption_source",
      ok: true,
      severity: "info",
      label: "Caption handoff",
      detail: `caption_source=${cap}${pathNote}`,
    });
  } else {
    checks.push({
      id: "caption_source",
      ok: false,
      severity: "fix",
      label: "Caption handoff",
      detail: `Unknown caption_source "${cap}" — use srt|ass|burned|auto|none`,
    });
  }

  // draft name
  const name = req.draft_name || "";
  if (!name) {
    checks.push({
      id: "draft_name",
      ok: false,
      severity: "fix",
      label: "Named CapCut draft",
      detail: "Untitled CapCut drafts collide in cloud sync — set draft_name",
    });
  } else if (/^(untitled|draft|new\s*project|project\s*\d+)$/i.test(name)) {
    checks.push({
      id: "draft_name",
      ok: false,
      severity: "fix",
      label: "Named CapCut draft",
      detail: `"${name}" looks generic — rename before export`,
    });
  } else {
    checks.push({
      id: "draft_name",
      ok: true,
      severity: "info",
      label: "Named CapCut draft",
      detail: `draft_name="${name}"`,
    });
  }

  // fps
  const fps = req.fps;
  if (fps == null) {
    checks.push({
      id: "fps",
      ok: false,
      severity: "fix",
      label: "FPS",
      detail: "Declare fps (24/25/30/60 preferred for CapCut templates)",
    });
  } else {
    const ok = DEFAULTS.fps_ok.some((f) => Math.abs(f - fps) < 0.6);
    checks.push({
      id: "fps",
      ok,
      severity: ok ? "info" : "fix",
      label: "FPS",
      detail: ok
        ? `${fps} fps is CapCut-friendly`
        : `${fps} fps is unusual — CapCut templates prefer 24/25/30/60`,
    });
  }

  // export preset
  const preset = (req.export_preset || "").toLowerCase().replace(/\s+/g, "");
  if (!preset) {
    checks.push({
      id: "export_preset",
      ok: false,
      severity: "fix",
      label: "Export preset",
      detail: "Set export_preset (1080p / 2k / 4k / original)",
    });
  } else if (
    preset.includes("720") ||
    preset === "480p" ||
    preset === "sd"
  ) {
    checks.push({
      id: "export_preset",
      ok: false,
      severity: "block",
      label: "Export preset",
      detail: `${req.export_preset} is too soft after platform recompress — bump to 1080p+`,
    });
  } else {
    checks.push({
      id: "export_preset",
      ok: true,
      severity: "info",
      label: "Export preset",
      detail: `export_preset=${req.export_preset}`,
    });
  }

  // audio
  if (req.has_audio == null) {
    checks.push({
      id: "audio",
      ok: false,
      severity: "fix",
      label: "Audio track",
      detail: "Declare has_audio true|false",
    });
  } else if (!req.has_audio) {
    checks.push({
      id: "audio",
      ok: false,
      severity: "block",
      label: "Audio track",
      detail: "No audio track — CapCut ducking and auto-captions will fail",
    });
  } else {
    checks.push({
      id: "audio",
      ok: true,
      severity: "info",
      label: "Audio track",
      detail: "Audio present for CapCut ducking / captions",
    });
  }

  // watermark risk
  if (req.watermark_risk == null) {
    checks.push({
      id: "watermark_risk",
      ok: false,
      severity: "fix",
      label: "Watermark risk",
      detail: "Declare watermark_risk false only when Pro/export path is confirmed",
    });
  } else if (req.watermark_risk) {
    checks.push({
      id: "watermark_risk",
      ok: false,
      severity: "block",
      label: "Watermark risk",
      detail: "CapCut free-tier watermark risk is ON — export via Pro or strip path",
    });
  } else {
    checks.push({
      id: "watermark_risk",
      ok: true,
      severity: "info",
      label: "Watermark risk",
      detail: "watermark_risk=false — clean export path declared",
    });
  }

  // template intent
  const intent = (req.template_intent || "").toLowerCase();
  if (!intent) {
    checks.push({
      id: "template_intent",
      ok: false,
      severity: "fix",
      label: "Template intent",
      detail: "Set template_intent: blank | template | auto_beat",
    });
  } else if (["blank", "template", "auto_beat"].includes(intent)) {
    checks.push({
      id: "template_intent",
      ok: true,
      severity: "info",
      label: "Template intent",
      detail: `template_intent=${intent}`,
    });
  } else {
    checks.push({
      id: "template_intent",
      ok: false,
      severity: "fix",
      label: "Template intent",
      detail: `Unknown template_intent "${intent}" — use blank|template|auto_beat`,
    });
  }

  // loop seam (only when wants_loop)
  if (req.wants_loop) {
    if (req.loop_aligned == null) {
      checks.push({
        id: "loop_seam",
        ok: false,
        severity: "fix",
        label: "Loop seam",
        detail: "wants_loop=true but loop_aligned not declared",
      });
    } else if (!req.loop_aligned) {
      checks.push({
        id: "loop_seam",
        ok: false,
        severity: "block",
        label: "Loop seam",
        detail: "Loop template selected but last→first frames are not aligned",
      });
    } else {
      checks.push({
        id: "loop_seam",
        ok: true,
        severity: "info",
        label: "Loop seam",
        detail: "Loop seam aligned for CapCut loop template",
      });
    }
  } else {
    checks.push({
      id: "loop_seam",
      ok: true,
      severity: "info",
      label: "Loop seam",
      detail: "Loop not requested — seam check skipped",
    });
  }

  const failing = checks.filter((c) => !c.ok).map((c) => c.id);
  const blocks = checks.filter((c) => !c.ok && c.severity === "block").length;
  const fixes = checks.filter((c) => !c.ok && c.severity === "fix").length;
  const passed = checks.filter((c) => c.ok).length;
  const score = Math.max(
    0,
    Math.min(100, Math.round((passed / checks.length) * 100 - blocks * 8 - fixes * 3))
  );

  let verdict: CapCutVerdict = "READY";
  if (blocks > 0) verdict = "BLOCKED";
  else if (fixes > 0) verdict = "FIX";

  return { platform, checks, score, verdict, failing };
}

export function buildCapCutPlan(req: CapCutGateRequest): CapCutPlanStep[] {
  const { checks, verdict } = runCapCutChecks(req);
  const steps: CapCutPlanStep[] = [
    {
      id: "open",
      label: "Open vertical CapCut project",
      purpose: "Lock 9:16 before templates",
      in_capcut: "New project → 9:16 / 1080×1920",
    },
    {
      id: "import",
      label: "Import media + caption file",
      purpose: "SRT/ASS on a dedicated caption track",
      in_capcut: "Add media → Captions → Import",
    },
    {
      id: "cut",
      label: "Force first change ≤2s",
      purpose: "Beat the scroll thumb",
      in_capcut: "Split / punch-in / overlay before 2.0s",
    },
    {
      id: "name",
      label: "Rename draft",
      purpose: "Survive CapCut cloud sync",
      in_capcut: "Draft name → slug + date",
    },
    {
      id: "export",
      label: "Export 1080p+ clean",
      purpose: "No free watermark, hard enough for recompress",
      in_capcut: "Export → 1080p / 30fps → Pro if needed",
    },
  ];

  if (verdict !== "READY") {
    const failIds = new Set(checks.filter((c) => !c.ok).map((c) => c.id));
    if (failIds.has("watermark_risk")) {
      steps.push({
        id: "watermark",
        label: "Clear watermark path",
        purpose: "Free-tier logo kills CTR",
        in_capcut: "Use Pro export or FinishKit strip after CapCut",
      });
    }
    if (failIds.has("duration")) {
      steps.push({
        id: "trim",
        label: "Fix duration band",
        purpose: "Escape platform dead zone",
        in_capcut: "Trim timeline or split into two CapCut drafts",
      });
    }
  }
  return steps;
}

const DEMO_GOOD: CapCutGateRequest = {
  action: "check",
  platform: "yt_shorts",
  width: 1080,
  height: 1920,
  duration_sec: 18,
  first_cut_sec: 1.2,
  fps: 30,
  draft_name: "retention-cut-0918",
  caption_source: "srt",
  caption_path: "retention-cut.srt",
  has_audio: true,
  watermark_risk: false,
  export_preset: "1080p",
  template_intent: "blank",
  wants_loop: false,
};

const DEMO_BAD: CapCutGateRequest = {
  action: "check",
  platform: "yt_shorts",
  width: 1920,
  height: 1080,
  duration_sec: 32,
  first_cut_sec: 4.5,
  fps: 23.976,
  draft_name: "Untitled",
  caption_source: "none",
  has_audio: false,
  watermark_risk: true,
  export_preset: "720p",
  template_intent: "unknown",
  wants_loop: true,
  loop_aligned: false,
};

export function runCapCutGate(request: CapCutGateRequest): CapCutGateResult {
  const action = request.action || "check";

  if (action === "defaults") {
    return {
      ok: true,
      source: "cap-cut-gate-1.0",
      action: "defaults",
      summary: "CapCutGate defaults — platform bands, FPS, caption sources",
      defaults: DEFAULTS,
      notes: [
        "YT Shorts dead zone 26–44s does NOT apply to IG/TikTok",
        "Complementary to FinishKit (ffmpeg) and DeliveryGate (publish meta)",
      ],
    };
  }

  if (action === "checklist") {
    return {
      ok: true,
      source: "cap-cut-gate-1.0",
      action: "checklist",
      summary: "Static CapCut handoff checklist (11 items)",
      checklist: STATIC_CHECKLIST,
      defaults: DEFAULTS,
    };
  }

  if (action === "demo") {
    const good = runCapCutChecks(DEMO_GOOD);
    const bad = runCapCutChecks(DEMO_BAD);
    return {
      ok: true,
      source: "cap-cut-gate-1.0",
      action: "demo",
      summary: `Demo: good=${good.verdict} ${good.score}/100 · bad=${bad.verdict} ${bad.score}/100`,
      verdict: good.verdict,
      score: good.score,
      platform: good.platform,
      checks: good.checks,
      failing: good.failing,
      notes: [
        `Bad fixture: ${bad.verdict} ${bad.score}/100 — fails [${bad.failing.join(", ")}]`,
        "Original FrameFlow checklist inspired by Hao0321/video-autopilot-kit (MIT) gate ideas",
      ],
    };
  }

  if (action === "plan") {
    const scored = runCapCutChecks(request);
    const plan = buildCapCutPlan(request);
    return {
      ok: true,
      source: "cap-cut-gate-1.0",
      action: "plan",
      summary: `${scored.verdict} ${scored.score}/100 — ${plan.length} CapCut steps`,
      verdict: scored.verdict,
      score: scored.score,
      platform: scored.platform,
      checks: scored.checks,
      failing: scored.failing,
      plan,
    };
  }

  // check
  const scored = runCapCutChecks(request);
  return {
    ok: true,
    source: "cap-cut-gate-1.0",
    action: "check",
    summary: `${scored.verdict} ${scored.score}/100 on ${scored.platform} (${scored.failing.length} failing)`,
    verdict: scored.verdict,
    score: scored.score,
    platform: scored.platform,
    checks: scored.checks,
    failing: scored.failing,
    notes:
      scored.verdict === "READY"
        ? ["Ready for CapCut export handoff"]
        : [
            "Fix failing checks before CapCut export",
            "Then run FinishKit for ffmpeg loudness/faststart if needed",
          ],
  };
}
