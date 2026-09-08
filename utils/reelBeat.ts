/**
 * ReelBeat — beat-sync cut plans + smart-crop framing + loudness + kinetic overlays.
 * Idea inspired by Tamoghna12/videofy (MIT; reimplement only —
 * original FrameFlow TypeScript, no clone of their Python editor).
 * Emits planning metadata and ffmpeg filter/command hints. Pure functions, local-first, no API keys.
 */

export type ReelBeatAction = "list" | "plan" | "demo" | "loudness" | "overlays";

export type BeatLabel = "intro" | "drop" | "hold" | "outro";

export type FocusPoint = {
  t: number;
  x: number;
  y: number;
};

export type CutPoint = {
  t: number;
  label: BeatLabel;
  snapped_from?: number;
  note?: string;
};

export type CropWindow = {
  t: number;
  x_pct: number;
  y_pct: number;
  zoom: number;
  note?: string;
};

export type LoudnessTarget = {
  slug: "reels" | "landscape";
  label: string;
  lufs: number;
  true_peak_dbtp: number;
  platforms: string[];
  ffmpeg_loudnorm: string;
  notes: string[];
};

export type OverlayPreset = {
  slug: string;
  label: string;
  css_hint: string;
  canvas_hint: string;
  when_to_use: string;
  avoid_when: string;
};

export type ReelBeatRequest = {
  action?: ReelBeatAction;
  beats_s?: number[];
  duration_s?: number;
  bpm?: number;
  source_width?: number;
  source_height?: number;
  target_aspect?: string;
  focus_points?: FocusPoint[];
  loudness?: "reels" | "landscape" | string;
  demo?: boolean;
};

export type BeatPlan = {
  duration_s: number;
  bpm: number;
  beats_s: number[];
  cuts: CutPoint[];
  concat_notes: string[];
  ffmpeg_cut_list: string;
  ffmpeg_example: string;
};

export type SmartCropPlan = {
  source: { width: number; height: number };
  target: { width: number; height: number; aspect: string };
  windows: CropWindow[];
  crop_filter_hint: string;
  zoompan_filter_hint: string;
  notes: string[];
};

export type ReelBeatResult = {
  ok: true;
  action: string;
  source: "reel-beat-1.0";
  plan?: BeatPlan;
  smart_crop?: SmartCropPlan;
  loudness?: LoudnessTarget[];
  overlays?: OverlayPreset[];
  summary: string;
};

const OVERLAYS: OverlayPreset[] = [
  {
    slug: "progress-bar",
    label: "Progress Bar",
    css_hint:
      "position:absolute; left:8%; right:8%; bottom:4%; height:3px; background:rgba(255,255,255,.25); border-radius:999px; overflow:hidden; ::after { width:var(--p); height:100%; background:#FACC15 }",
    canvas_hint: "fillRect bottom strip; animate width from 0→1 over clip duration",
    when_to_use: "Short educational / tips reels where retention benefit from a visible end.",
    avoid_when: "Music videos or cinematic pieces where UI chrome fights the image.",
  },
  {
    slug: "location-pill",
    label: "Lower-Third Location Pill",
    css_hint:
      "position:absolute; left:5%; bottom:12%; padding:6px 14px; border-radius:999px; background:rgba(0,0,0,.55); backdrop-filter:blur(8px); color:#fff; font:600 13px/1.2 system-ui; letter-spacing:.04em",
    canvas_hint: "roundedRect + fillText for city/venue; fade in after 0.4s",
    when_to_use: "Travel, event, or on-location clips that need place context.",
    avoid_when: "Talking-head close-ups where the chin sits in the lower third.",
  },
  {
    slug: "glass-title",
    label: "Glass Title Badge",
    css_hint:
      "position:absolute; top:8%; left:50%; transform:translateX(-50%); padding:10px 18px; border-radius:16px; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.25); backdrop-filter:blur(12px); color:#fff; font:800 18px/1.1 system-ui; text-align:center",
    canvas_hint: "semi-transparent rounded badge + bold title; hold 1.5–2.5s then fade",
    when_to_use: "Hook title card in the first 2s without a hard cut to black.",
    avoid_when: "Busy sky/horizon where glass contrast collapses.",
  },
  {
    slug: "outro-cta",
    label: "Outro CTA",
    css_hint:
      "position:absolute; inset:auto 8% 10% 8%; padding:14px 16px; border-radius:14px; background:linear-gradient(135deg,#FACC15,#F97316); color:#111; font:800 15px/1.2 system-ui; text-align:center",
    canvas_hint: "solid CTA block last 1.5–2s; optional arrow bounce",
    when_to_use: "End cards asking follow / link-in-bio / watch next.",
    avoid_when: "Mid-clip — keep CTA for the final beat only.",
  },
];

const LOUDNESS: LoudnessTarget[] = [
  {
    slug: "reels",
    label: "Reels / Shorts (−16 LUFS)",
    lufs: -16,
    true_peak_dbtp: -1.5,
    platforms: ["TikTok", "Instagram Reels", "YouTube Shorts", "Facebook Reels"],
    ffmpeg_loudnorm:
      'ffmpeg -y -i input.mp4 -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:v copy -c:a aac -b:a 192k out_reels_loudnorm.mp4',
    notes: [
      "Target integrated −16 LUFS for vertical social.",
      "True peak ceiling ≈ −1.5 dBTP to leave encoder headroom.",
      "Prefer two-pass loudnorm when you need measured params (print_format=json).",
    ],
  },
  {
    slug: "landscape",
    label: "Landscape / Long-form (−14 LUFS)",
    lufs: -14,
    true_peak_dbtp: -1.0,
    platforms: ["YouTube", "LinkedIn", "X/Twitter", "desktop"],
    ffmpeg_loudnorm:
      'ffmpeg -y -i input.mp4 -af "loudnorm=I=-14:TP=-1.0:LRA=11" -c:v copy -c:a aac -b:a 192k out_landscape_loudnorm.mp4',
    notes: [
      "EBU R128-style −14 LUFS suits landscape / podcasts / YouTube.",
      "True peak ≈ −1.0 dBTP; avoid hard limiting that pumps dialogue.",
    ],
  },
];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function parseAspect(raw?: string): { slug: string; width: number; height: number } {
  const s = String(raw || "9:16").toLowerCase().replace("x", ":");
  if (s.includes("1:1") || s.includes("square")) return { slug: "1:1", width: 1080, height: 1080 };
  if (s.includes("4:5")) return { slug: "4:5", width: 1080, height: 1350 };
  if (s.includes("16:9") || s.includes("landscape") || s.includes("wide"))
    return { slug: "16:9", width: 1920, height: 1080 };
  return { slug: "9:16", width: 1080, height: 1920 };
}

function generateBeats(duration_s: number, bpm: number): number[] {
  const interval = 60 / bpm;
  const beats: number[] = [];
  for (let t = 0; t < duration_s - 0.05; t += interval) {
    beats.push(round3(t));
  }
  if (beats.length === 0) beats.push(0);
  return beats;
}

function labelForCut(t: number, duration_s: number, index: number, total: number): BeatLabel {
  const ratio = duration_s > 0 ? t / duration_s : 0;
  if (index === 0 || ratio < 0.12) return "intro";
  if (ratio >= 0.82 || index === total - 1) return "outro";
  // Emphasize drops near quarter / half / three-quarter marks
  const nearDrop =
    Math.abs(ratio - 0.25) < 0.06 ||
    Math.abs(ratio - 0.5) < 0.06 ||
    Math.abs(ratio - 0.75) < 0.06;
  if (nearDrop) return "drop";
  return "hold";
}

function snapCuts(beats: number[], duration_s: number): CutPoint[] {
  // Prefer ~6–10 cuts for a short; thin dense beat grids
  const targetCount = clamp(Math.round(duration_s / 2.2), 5, 10);
  if (beats.length === 0) {
    return [{ t: 0, label: "intro", note: "start" }];
  }
  const step = Math.max(1, Math.floor(beats.length / targetCount));
  const picked: number[] = [];
  for (let i = 0; i < beats.length; i += step) {
    picked.push(beats[i]);
  }
  if (picked[0] !== 0) picked.unshift(0);
  const lastBeat = beats[beats.length - 1];
  if (picked[picked.length - 1] < lastBeat && duration_s - lastBeat > 0.3) {
    picked.push(lastBeat);
  }
  // Ensure we end near duration for concat planning
  if (duration_s - picked[picked.length - 1] > 1.2) {
    picked.push(round3(Math.max(0, duration_s - 0.05)));
  }
  const unique = Array.from(new Set(picked.map(round3))).sort((a, b) => a - b);
  return unique.map((t, i) => {
    const nearest = beats.reduce((best, b) => (Math.abs(b - t) < Math.abs(best - t) ? b : best), beats[0]);
    const label = labelForCut(t, duration_s, i, unique.length);
    return {
      t,
      label,
      snapped_from: nearest !== t ? nearest : undefined,
      note: label === "drop" ? "energy hit — keep cut tight" : label === "outro" ? "leave room for CTA" : undefined,
    };
  });
}

function buildBeatPlan(request: ReelBeatRequest): BeatPlan {
  const bpm = clamp(Number(request.bpm ?? 120) || 120, 60, 200);
  let duration_s = Number(request.duration_s);
  let beats_s =
    Array.isArray(request.beats_s) && request.beats_s.length
      ? request.beats_s.map((n) => round3(Number(n))).filter((n) => Number.isFinite(n) && n >= 0)
      : [];

  if (!Number.isFinite(duration_s) || duration_s <= 0) {
    duration_s = beats_s.length ? Math.max(...beats_s) + 60 / bpm : 16;
  }
  duration_s = clamp(duration_s, 2, 180);

  if (!beats_s.length) {
    beats_s = generateBeats(duration_s, bpm);
  } else {
    beats_s = beats_s.filter((t) => t <= duration_s + 0.01).sort((a, b) => a - b);
  }

  const cuts = snapCuts(beats_s, duration_s);
  const segments: string[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const start = cuts[i].t;
    const end = i + 1 < cuts.length ? cuts[i + 1].t : duration_s;
    if (end - start < 0.05) continue;
    segments.push(`file 'seg_${String(i).padStart(2, "0")}_${cuts[i].label}.mp4'`);
  }

  const cutLines = cuts
    .map((c, i) => {
      const end = i + 1 < cuts.length ? cuts[i + 1].t : duration_s;
      return `# ${c.label}  ${c.t.toFixed(3)}s → ${end.toFixed(3)}s`;
    })
    .join("\n");

  const ffmpeg_example = [
    "# Per-segment extract (example first cut):",
    `ffmpeg -y -ss ${cuts[0]?.t.toFixed(3) || "0"} -to ${(cuts[1]?.t ?? duration_s).toFixed(3)} -i input.mp4 -c copy seg_00_${cuts[0]?.label || "intro"}.mp4`,
    "# Then concat:",
    "ffmpeg -y -f concat -safe 0 -i cuts.txt -c copy out_beat_sync.mp4",
  ].join("\n");

  return {
    duration_s: round3(duration_s),
    bpm,
    beats_s,
    cuts,
    concat_notes: [
      "Write each cut as its own segment file, then ffmpeg concat demuxer.",
      "Snap edits to nearest beat; keep intro short and outro free for CTA overlay.",
      `cuts.txt lines:\n${segments.slice(0, 12).join("\n")}`,
    ],
    ffmpeg_cut_list: cutLines,
    ffmpeg_example,
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function buildSmartCrop(request: ReelBeatRequest, duration_s: number): SmartCropPlan {
  const srcW = clamp(Number(request.source_width ?? 1920) || 1920, 16, 7680);
  const srcH = clamp(Number(request.source_height ?? 1080) || 1080, 16, 4320);
  const target = parseAspect(request.target_aspect);
  const focus =
    Array.isArray(request.focus_points) && request.focus_points.length
      ? request.focus_points
          .map((p) => ({
            t: round3(Number(p.t) || 0),
            x: clamp(Number(p.x) || 50, 0, 100),
            y: clamp(Number(p.y) || 50, 0, 100),
          }))
          .sort((a, b) => a.t - b.t)
      : null;

  const windows: CropWindow[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const t = round3(u * duration_s);
    if (focus && focus.length) {
      // Piecewise hold nearest focus; light ease between neighbors
      let a = focus[0];
      let b = focus[focus.length - 1];
      for (let f = 0; f < focus.length - 1; f++) {
        if (t >= focus[f].t && t <= focus[f + 1].t) {
          a = focus[f];
          b = focus[f + 1];
          break;
        }
      }
      const span = Math.max(0.001, b.t - a.t);
      const local = clamp((t - a.t) / span, 0, 1);
      const e = easeInOut(local);
      windows.push({
        t,
        x_pct: round3(a.x + (b.x - a.x) * e),
        y_pct: round3(a.y + (b.y - a.y) * e),
        zoom: round3(1.0 + 0.08 * Math.sin(Math.PI * u)),
        note: "focus_points path",
      });
    } else {
      // Demo saliency: ease center (50,50) → rule-of-thirds (33,40) → (66,45) → center
      const path = [
        { x: 50, y: 50 },
        { x: 33, y: 40 },
        { x: 66, y: 45 },
        { x: 50, y: 48 },
      ];
      const seg = Math.min(path.length - 2, Math.floor(u * (path.length - 1)));
      const local = (u * (path.length - 1)) % 1;
      const e = easeInOut(local);
      const p0 = path[seg];
      const p1 = path[seg + 1];
      windows.push({
        t,
        x_pct: round3(p0.x + (p1.x - p0.x) * e),
        y_pct: round3(p0.y + (p1.y - p0.y) * e),
        zoom: round3(1.05 + 0.1 * u),
        note: "demo saliency center→rule-of-thirds",
      });
    }
  }

  const mid = windows[Math.floor(windows.length / 2)] || windows[0];
  // crop after scale-to-cover: x/y as percent of excess
  const crop_filter_hint = `scale=${target.width}:${target.height}:force_original_aspect_ratio=increase,crop=${target.width}:${target.height}:x='(iw-${target.width})*${(mid.x_pct / 100).toFixed(4)}':y='(ih-${target.height})*${(mid.y_pct / 100).toFixed(4)}'`;
  const zp = windows
    .map((w) => {
      const z = w.zoom.toFixed(3);
      return `${w.t.toFixed(2)}s → x=${w.x_pct}% y=${w.y_pct}% z=${z}`;
    })
    .join(" | ");
  const zoompan_filter_hint = `zoompan=z='min(zoom+0.0015,${mid.zoom.toFixed(3)})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${target.width}x${target.height}:fps=30  /* keyframes: ${zp} */`;

  return {
    source: { width: srcW, height: srcH },
    target: { width: target.width, height: target.height, aspect: target.slug },
    windows,
    crop_filter_hint,
    zoompan_filter_hint,
    notes: [
      focus
        ? "Framing follows client focus_points (percent of frame)."
        : "No focus_points — demo path eases center toward rule-of-thirds.",
      `Source ${srcW}x${srcH} → ${target.width}x${target.height} (${target.slug}).`,
      "Hints are templates for ffmpeg crop/zoompan; client renders final media.",
    ],
  };
}

function pickLoudness(raw?: string): LoudnessTarget[] {
  const s = String(raw || "").toLowerCase();
  if (s.includes("land") || s.includes("14") || s.includes("youtube") || s.includes("wide")) {
    return [LOUDNESS[1]];
  }
  if (s.includes("reel") || s.includes("short") || s.includes("16") || s.includes("tiktok")) {
    return [LOUDNESS[0]];
  }
  return LOUDNESS;
}

export function parseReelBeatRequest(
  body: Record<string, unknown>
): { ok: true; request: ReelBeatRequest } | { ok: false; error: string } {
  const demo = body.demo === true;
  const actionRaw =
    typeof body.action === "string" ? body.action.toLowerCase() : demo ? "demo" : "plan";
  const allowed = new Set(["list", "plan", "demo", "loudness", "overlays"]);
  if (!allowed.has(actionRaw)) {
    return { ok: false, error: "action must be list | plan | demo | loudness | overlays" };
  }

  let beats_s: number[] | undefined;
  if (Array.isArray(body.beats_s)) {
    beats_s = body.beats_s.map((n) => Number(n)).filter((n) => Number.isFinite(n));
    if (beats_s.length !== body.beats_s.length) {
      return { ok: false, error: "beats_s must be an array of numbers (seconds)." };
    }
  }

  let focus_points: FocusPoint[] | undefined;
  if (Array.isArray(body.focus_points)) {
    focus_points = [];
    for (const raw of body.focus_points) {
      if (!raw || typeof raw !== "object") {
        return { ok: false, error: "focus_points entries must be {t,x,y} objects." };
      }
      const o = raw as Record<string, unknown>;
      const t = Number(o.t);
      const x = Number(o.x);
      const y = Number(o.y);
      if (![t, x, y].every(Number.isFinite)) {
        return { ok: false, error: "focus_points need numeric t,x,y (x/y as %)." };
      }
      focus_points.push({ t, x, y });
    }
  }

  const request: ReelBeatRequest = {
    action: actionRaw as ReelBeatAction,
    beats_s,
    duration_s: typeof body.duration_s === "number" ? body.duration_s : undefined,
    bpm: typeof body.bpm === "number" ? body.bpm : undefined,
    source_width: typeof body.source_width === "number" ? body.source_width : undefined,
    source_height: typeof body.source_height === "number" ? body.source_height : undefined,
    target_aspect: typeof body.target_aspect === "string" ? body.target_aspect : undefined,
    focus_points,
    loudness: typeof body.loudness === "string" ? body.loudness : undefined,
    demo,
  };

  return { ok: true, request };
}

export function runReelBeat(request: ReelBeatRequest): ReelBeatResult {
  const action = request.demo ? "demo" : request.action || "plan";

  if (action === "list" || action === "overlays") {
    return {
      ok: true,
      action: action === "overlays" ? "overlays" : "list",
      source: "reel-beat-1.0",
      overlays: OVERLAYS,
      loudness: LOUDNESS,
      summary: `${OVERLAYS.length} overlays · ${LOUDNESS.length} loudness targets`,
    };
  }

  if (action === "loudness") {
    const targets = pickLoudness(request.loudness);
    return {
      ok: true,
      action: "loudness",
      source: "reel-beat-1.0",
      loudness: targets,
      summary: targets.map((t) => `${t.label}`).join(" · "),
    };
  }

  // plan + demo
  const planReq: ReelBeatRequest =
    action === "demo"
      ? {
          duration_s: 16,
          bpm: 128,
          source_width: 1920,
          source_height: 1080,
          target_aspect: "9:16",
          loudness: "reels",
        }
      : request;

  const plan = buildBeatPlan(planReq);
  const smart_crop = buildSmartCrop(planReq, plan.duration_s);
  const loudness = pickLoudness(planReq.loudness || (action === "demo" ? "reels" : undefined));
  // Suggest overlays by beat labels present
  const labels = new Set(plan.cuts.map((c) => c.label));
  const overlays = OVERLAYS.filter((o) => {
    if (o.slug === "glass-title" && labels.has("intro")) return true;
    if (o.slug === "outro-cta" && labels.has("outro")) return true;
    if (o.slug === "progress-bar") return true;
    if (o.slug === "location-pill" && action === "demo") return true;
    return action === "plan" && (o.slug === "glass-title" || o.slug === "outro-cta" || o.slug === "progress-bar");
  });

  return {
    ok: true,
    action: action === "demo" ? "demo" : "plan",
    source: "reel-beat-1.0",
    plan,
    smart_crop,
    loudness,
    overlays,
    summary: `${plan.cuts.length} cuts @ ${plan.bpm}bpm · ${smart_crop.target.aspect} crop · ${loudness[0]?.lufs ?? -16} LUFS · ${overlays.length} overlays`,
  };
}
