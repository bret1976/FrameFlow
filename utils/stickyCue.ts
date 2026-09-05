/**
 * StickyCue — sticky-note word-highlight captions for HyperFrames / vertical shorts.
 * Idea inspired by nutllwhy/whiteboard-book-video-skill make_subtitles
 * (reimplement only; original FrameFlow TypeScript).
 * Pure functions, local-first, no network.
 */

export type StickySeg = {
  text: string;
  highlight?: boolean;
};

export type StickyCueIn = {
  start: number;
  end: number;
  group?: number;
  segs: StickySeg[];
};

export type StickyCueStyle = {
  left_pct?: number;
  right_pct?: number;
  bottom_pct?: number;
  font_px?: number;
  highlight_color?: string;
  pill_bg?: string;
  border_color?: string;
  text_color?: string;
};

export type StickyCueResult = {
  ok: true;
  cue_count: number;
  html: string;
  js: string;
  css: string;
  cues: StickyCueIn[];
  preview_html: string;
};

export type StickyCueRequest = {
  cues?: StickyCueIn[];
  /** Optional SRT/WebVTT; each cue becomes one sticky pill (whole line, or word-split). */
  text?: string;
  format?: "srt" | "vtt" | "auto";
  /** Case-insensitive words/phrases to highlight when converting from subtitles. */
  highlight_words?: string[];
  /** Split subtitle lines into word segs (default true when text is used). */
  split_words?: boolean;
  style?: StickyCueStyle;
  demo?: boolean;
};

const DEFAULT_STYLE: Required<StickyCueStyle> = {
  left_pct: 18,
  right_pct: 18,
  bottom_pct: 4.5,
  font_px: 56,
  highlight_color: "#d0341f",
  pill_bg: "rgba(255,253,248,.94)",
  border_color: "#333333",
  text_color: "#2b2b2b",
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

const escHtml = (t: string): string =>
  String(t || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const parseTimestamp = (raw: string): number | null => {
  const s = String(raw || "").trim().replace(",", ".");
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const parts = s.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return nums[0] * 60 + nums[1];
};

const TIME_ARROW =
  /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})/;

const detectFormat = (text: string, hint?: "srt" | "vtt" | "auto"): "srt" | "vtt" => {
  if (hint === "srt" || hint === "vtt") return hint;
  const head = text.slice(0, 200).trimStart();
  if (/^WEBVTT\b/i.test(head)) return "vtt";
  return "srt";
};

type ParsedSub = { start: number; end: number; text: string };

const parseSubtitles = (text: string, format: "srt" | "vtt"): ParsedSub[] => {
  const raw = String(text || "").replace(/^\uFEFF/, "");
  const cues: ParsedSub[] = [];
  if (format === "vtt") {
    const body = raw.replace(/^WEBVTT[^\n]*\n?/i, "");
    for (const block of body.split(/\n\s*\n+/)) {
      const nonempty = block
        .split(/\r?\n/)
        .map((l) => l.trimEnd())
        .filter((l) => l.trim().length > 0);
      if (!nonempty.length || /^(NOTE|STYLE|REGION)\b/i.test(nonempty[0])) continue;
      const timeLineIdx = nonempty.findIndex((l) => TIME_ARROW.test(l));
      if (timeLineIdx < 0) continue;
      const m = nonempty[timeLineIdx].match(TIME_ARROW);
      if (!m) continue;
      const start = parseTimestamp(m[1]);
      const end = parseTimestamp(m[2]);
      if (start == null || end == null || end <= start) continue;
      cues.push({
        start: round2(start),
        end: round2(end),
        text: nonempty.slice(timeLineIdx + 1).join(" ").trim(),
      });
    }
    return cues;
  }

  for (const block of raw.trim().split(/\n\s*\n+/)) {
    const lines = block.split(/\r?\n/).map((l) => l.trimEnd());
    if (!lines.length) continue;
    let idx = 0;
    if (/^\d+$/.test(lines[0].trim())) idx = 1;
    if (idx >= lines.length) continue;
    const m = lines[idx].match(TIME_ARROW);
    if (!m) continue;
    const start = parseTimestamp(m[1]);
    const end = parseTimestamp(m[2]);
    if (start == null || end == null || end <= start) continue;
    cues.push({
      start: round2(start),
      end: round2(end),
      text: lines.slice(idx + 1).join(" ").trim(),
    });
  }
  return cues;
};

const normalizeHighlights = (words?: string[]): string[] =>
  (words || [])
    .map((w) => String(w || "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

/** Mark highlight spans inside a plain caption line. */
export const segmentLine = (
  line: string,
  highlightWords: string[],
  splitWords: boolean,
): StickySeg[] => {
  const text = String(line || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  if (!splitWords && !highlightWords.length) {
    return [{ text }];
  }

  if (!highlightWords.length) {
    if (!splitWords) return [{ text }];
    return text.split(/\s+/).map((w, i, arr) => ({
      text: i < arr.length - 1 ? `${w} ` : w,
    }));
  }

  const lower = text.toLowerCase();
  const marks: { start: number; end: number }[] = [];
  for (const word of highlightWords) {
    const needle = word.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      marks.push({ start: at, end: at + needle.length });
      from = at + Math.max(1, needle.length);
    }
  }
  marks.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: { start: number; end: number }[] = [];
  for (const m of marks) {
    const last = merged[merged.length - 1];
    if (!last || m.start >= last.end) merged.push({ ...m });
    else last.end = Math.max(last.end, m.end);
  }

  const segs: StickySeg[] = [];
  let cursor = 0;
  for (const m of merged) {
    if (m.start > cursor) {
      const chunk = text.slice(cursor, m.start);
      if (splitWords) {
        for (const part of chunk.split(/(\s+)/)) {
          if (part) segs.push({ text: part });
        }
      } else if (chunk) {
        segs.push({ text: chunk });
      }
    }
    const hit = text.slice(m.start, m.end);
    if (hit) segs.push({ text: hit, highlight: true });
    cursor = m.end;
  }
  if (cursor < text.length) {
    const chunk = text.slice(cursor);
    if (splitWords) {
      for (const part of chunk.split(/(\s+)/)) {
        if (part) segs.push({ text: part });
      }
    } else if (chunk) {
      segs.push({ text: chunk });
    }
  }
  return segs.length ? segs : [{ text }];
};

export const DEMO_CUES: StickyCueIn[] = [
  {
    start: 0,
    end: 2.68,
    group: 1,
    segs: [
      { text: "You ever notice " },
      { text: "the harder you grind", highlight: true },
      { text: " the stucker you feel?" },
    ],
  },
  {
    start: 2.68,
    end: 4.2,
    group: 1,
    segs: [{ text: "Naval drops a line that hits:" }],
  },
  {
    start: 4.24,
    end: 6.34,
    group: 1,
    segs: [
      { text: "Specific knowledge" },
      { text: " compounds", highlight: true },
      { text: "." },
    ],
  },
];

const cleanCue = (raw: any, index: number): StickyCueIn | null => {
  const start = Number(raw?.start ?? raw?.start_s);
  const end = Number(raw?.end ?? raw?.end_s);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  let segs: StickySeg[] = [];
  if (Array.isArray(raw?.segs)) {
    segs = raw.segs
      .map((s: any) => {
        if (Array.isArray(s) && s.length >= 1) {
          return {
            text: String(s[0] ?? ""),
            highlight: Boolean(s[1]),
          };
        }
        return {
          text: String(s?.text ?? ""),
          highlight: Boolean(s?.highlight ?? s?.hl),
        };
      })
      .filter((s: StickySeg) => s.text.length > 0);
  } else if (typeof raw?.text === "string" && raw.text.trim()) {
    segs = [{ text: raw.text.trim() }];
  }
  if (!segs.length) return null;
  const group = Number.isFinite(Number(raw?.group)) ? Number(raw.group) : index + 1;
  return {
    start: round2(start),
    end: round2(end),
    group,
    segs,
  };
};

export const buildStickyCss = (style?: StickyCueStyle): string => {
  const s = { ...DEFAULT_STYLE, ...(style || {}) };
  return [
    "/* StickyCue — HyperFrames sticky-note captions */",
    ".subpill {",
    `  position: absolute; left: ${s.left_pct}%; right: ${s.right_pct}%; bottom: ${s.bottom_pct}%;`,
    `  background: ${s.pill_bg}; border: 3px solid ${s.border_color}; border-radius: 26px;`,
    "  padding: 22px 32px; text-align: center; box-sizing: border-box;",
    "}",
    ".subtext {",
    `  color: ${s.text_color}; font-size: ${s.font_px}px; font-weight: 800; line-height: 1.32;`,
    "  font-family: system-ui, -apple-system, Segoe UI, sans-serif;",
    "}",
    `.subtext .hl { color: ${s.highlight_color}; }`,
    ".subclip { position: absolute; inset: 0; pointer-events: none; }",
  ].join("\n");
};

export const renderStickyCue = (
  cuesIn: StickyCueIn[],
  style?: StickyCueStyle,
): StickyCueResult => {
  const cues = cuesIn
    .map((c, i) => cleanCue(c, i))
    .filter((c): c is StickyCueIn => Boolean(c));

  const htmlLines: string[] = [];
  const jsLines: string[] = [];

  cues.forEach((c, i) => {
    const cid = `sub${String(i + 1).padStart(2, "0")}`;
    const s = round2(c.start);
    const e = round2(c.end);
    const g = c.group ?? i + 1;
    const inner = c.segs
      .map((seg) =>
        seg.highlight
          ? `<span class="hl">${escHtml(seg.text)}</span>`
          : escHtml(seg.text),
      )
      .join("");
    const dur = round2(Math.max(0.01, e - s));
    htmlLines.push(
      [
        `      <div id="${cid}" class="clip subclip" data-g="${g}" data-start="${s.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="1">`,
        `        <div class="subpill"><span class="subtext">${inner}</span></div>`,
        `      </div>`,
      ].join("\n"),
    );
    const fadeOutAt = round2(Math.max(s, e - 0.16));
    jsLines.push(
      `      tl.fromTo("#${cid} .subpill", { opacity: 0, scale: 0.96, y: 12 }, { opacity: 1, scale: 1, y: 0, duration: 0.28, ease: "power2.out" }, ${s.toFixed(2)});`,
    );
    jsLines.push(
      `      tl.to("#${cid} .subpill", { opacity: 0, y: -8, duration: 0.16, ease: "power1.in" }, ${fadeOutAt.toFixed(2)});`,
    );
    jsLines.push(`      tl.set("#${cid} .subpill", { autoAlpha: 0 }, ${e.toFixed(2)});`);
  });

  const css = buildStickyCss(style);
  const html = htmlLines.join("\n");
  const js = jsLines.join("\n");
  const preview_html = [
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><style>",
    "body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;}",
    ".stage{position:relative;width:360px;height:640px;background:#f4f1ea;border-radius:16px;overflow:hidden;}",
    css,
    ".subclip{opacity:1!important}",
    ".subpill{opacity:1!important;transform:none!important}",
    "</style></head><body><div class=\"stage\">",
    cues.length
      ? htmlLines[0].replace(/class="clip subclip"/, 'class="clip subclip" style="opacity:1"')
      : "",
    "</div></body></html>",
  ].join("\n");

  return {
    ok: true,
    cue_count: cues.length,
    html,
    js,
    css,
    cues,
    preview_html,
  };
};

export const parseStickyCueRequest = (
  body: Record<string, unknown>,
): { ok: true; request: StickyCueRequest } | { ok: false; error: string } => {
  if (body.demo === true) {
    return { ok: true, request: { demo: true, style: (body.style as StickyCueStyle) || undefined } };
  }

  const style =
    body.style && typeof body.style === "object" && !Array.isArray(body.style)
      ? (body.style as StickyCueStyle)
      : undefined;

  if (Array.isArray(body.cues) && body.cues.length) {
    const cues = (body.cues as any[])
      .map((c, i) => cleanCue(c, i))
      .filter((c): c is StickyCueIn => Boolean(c));
    if (!cues.length) {
      return { ok: false, error: "cues array had no valid { start, end, segs|text } entries." };
    }
    return { ok: true, request: { cues, style } };
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return {
      ok: false,
      error:
        "Pass { cues: [...] } word-level sticky cues, or { text } SRT/VTT (+ optional highlight_words), or { demo: true }.",
    };
  }

  const formatRaw = typeof body.format === "string" ? body.format.trim().toLowerCase() : "auto";
  if (formatRaw !== "srt" && formatRaw !== "vtt" && formatRaw !== "auto") {
    return { ok: false, error: "format must be srt, vtt, or auto." };
  }

  const highlight_words = Array.isArray(body.highlight_words)
    ? (body.highlight_words as unknown[]).map((w) => String(w))
    : typeof body.highlight_words === "string"
      ? String(body.highlight_words)
          .split(/[,|\n]/)
          .map((w) => w.trim())
          .filter(Boolean)
      : [];

  const split_words =
    body.split_words === undefined ? true : Boolean(body.split_words);

  return {
    ok: true,
    request: {
      text,
      format: formatRaw as "srt" | "vtt" | "auto",
      highlight_words,
      split_words,
      style,
    },
  };
};

export const runStickyCue = (request: StickyCueRequest): StickyCueResult => {
  if (request.demo) {
    return renderStickyCue(DEMO_CUES, request.style);
  }

  if (request.cues?.length) {
    return renderStickyCue(request.cues, request.style);
  }

  const text = request.text || "";
  const format = detectFormat(text, request.format);
  const subs = parseSubtitles(text, format);
  if (!subs.length) {
    throw new Error("No subtitle cues parsed from text.");
  }
  const highlights = normalizeHighlights(request.highlight_words);
  const splitWords = request.split_words !== false;
  const cues: StickyCueIn[] = subs.map((sub, i) => ({
    start: sub.start,
    end: sub.end,
    group: i + 1,
    segs: segmentLine(sub.text, highlights, splitWords),
  }));
  return renderStickyCue(cues, request.style);
};
