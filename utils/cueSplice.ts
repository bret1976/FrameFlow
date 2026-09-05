/**
 * CueSplice — retime SRT/WebVTT subtitles after video cuts.
 * Idea inspired by Yougan001/cuesplice (reimplement only; original FrameFlow code).
 * Pure functions, millisecond-accurate, local-first, no network.
 */

export type CueTimeRange = { start_s: number; end_s: number };

export type SubtitleFormat = "srt" | "vtt";

export type ParsedCue = {
  start_s: number;
  end_s: number;
  text: string;
  settings?: string;
};

export type CueChangeKind = "unchanged" | "shifted" | "trimmed" | "removed" | "split";

export type CueChangeReport = {
  kind: CueChangeKind;
  original_index: number;
  original_start_s: number;
  original_end_s: number;
  text_preview: string;
  new_start_s?: number;
  new_end_s?: number;
  parts?: number;
  note?: string;
};

export type CueSpliceCounts = {
  input: number;
  output: number;
  unchanged: number;
  shifted: number;
  trimmed: number;
  removed: number;
  split: number;
};

export type CueSpliceResult = {
  ok: true;
  format: SubtitleFormat;
  text: string;
  counts: CueSpliceCounts;
  report: CueChangeReport[];
  deleted_s: number;
  deleted: CueTimeRange[];
};

export type CueSpliceRequest = {
  text: string;
  format?: "srt" | "vtt" | "auto";
  deleted?: CueTimeRange[];
  keep?: CueTimeRange[];
  duration_s?: number;
};

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

const previewText = (text: string, max = 60): string => {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
};

/** Parse HH:MM:SS.mmm / HH:MM:SS,mmm / MM:SS.mmm / bare seconds → seconds. */
export const parseTimestamp = (raw: string): number | null => {
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
  if (parts.length === 3) {
    return nums[0] * 3600 + nums[1] * 60 + nums[2];
  }
  return nums[0] * 60 + nums[1];
};

export const formatSrtTimestamp = (seconds: number): string => {
  const t = Math.max(0, seconds);
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const milli = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(milli).padStart(3, "0")}`;
};

export const formatVttTimestamp = (seconds: number): string => {
  return formatSrtTimestamp(seconds).replace(",", ".");
};

const cleanRanges = (ranges: CueTimeRange[]): CueTimeRange[] => {
  const cleaned = ranges
    .map((r) => ({
      start_s: round3(Math.max(0, Number(r.start_s))),
      end_s: round3(Math.max(0, Number(r.end_s))),
    }))
    .filter((r) => Number.isFinite(r.start_s) && Number.isFinite(r.end_s) && r.end_s > r.start_s + 0.0005)
    .sort((a, b) => a.start_s - b.start_s);

  const merged: CueTimeRange[] = [];
  for (const r of cleaned) {
    const last = merged[merged.length - 1];
    if (!last || r.start_s > last.end_s + 0.0005) merged.push({ ...r });
    else last.end_s = Math.max(last.end_s, r.end_s);
  }
  return merged.map((r) => ({ start_s: round3(r.start_s), end_s: round3(r.end_s) }));
};

/** Invert keep ranges against [0, duration_s] → deleted ranges. */
export const invertKeepRanges = (duration_s: number, keep: CueTimeRange[]): CueTimeRange[] => {
  const dur = Math.max(0, duration_s);
  const kept = cleanRanges(
    keep.map((k) => ({
      start_s: Math.max(0, Math.min(dur, k.start_s)),
      end_s: Math.max(0, Math.min(dur, k.end_s)),
    })),
  );
  const deleted: CueTimeRange[] = [];
  let cursor = 0;
  for (const k of kept) {
    if (k.start_s > cursor + 0.0005) {
      deleted.push({ start_s: round3(cursor), end_s: round3(k.start_s) });
    }
    cursor = Math.max(cursor, k.end_s);
  }
  if (dur > cursor + 0.0005) {
    deleted.push({ start_s: round3(cursor), end_s: round3(dur) });
  }
  return deleted;
};

/** Total deleted duration strictly before time t (plus partial overlap into t). */
export const deletedDurationBefore = (t: number, deleted: CueTimeRange[]): number => {
  let sum = 0;
  for (const d of deleted) {
    if (d.end_s <= t) sum += d.end_s - d.start_s;
    else if (d.start_s < t) sum += t - d.start_s;
    else break;
  }
  return sum;
};

export const mapOriginalToEdited = (t: number, deleted: CueTimeRange[]): number =>
  round3(Math.max(0, t - deletedDurationBefore(t, deleted)));

/** Subtract deleted ranges from [start, end] → surviving intervals on original timeline. */
export const survivingIntervals = (
  start_s: number,
  end_s: number,
  deleted: CueTimeRange[],
): CueTimeRange[] => {
  let parts: CueTimeRange[] = [{ start_s, end_s }];
  for (const d of deleted) {
    const next: CueTimeRange[] = [];
    for (const p of parts) {
      if (d.end_s <= p.start_s || d.start_s >= p.end_s) {
        next.push(p);
        continue;
      }
      if (p.start_s < d.start_s) next.push({ start_s: p.start_s, end_s: d.start_s });
      if (p.end_s > d.end_s) next.push({ start_s: d.end_s, end_s: p.end_s });
    }
    parts = next;
  }
  return parts
    .map((p) => ({ start_s: round3(p.start_s), end_s: round3(p.end_s) }))
    .filter((p) => p.end_s - p.start_s > 0.001);
};

export const detectSubtitleFormat = (text: string, hint?: "srt" | "vtt" | "auto"): SubtitleFormat => {
  if (hint === "srt" || hint === "vtt") return hint;
  const head = text.slice(0, 200).trimStart();
  if (/^WEBVTT\b/i.test(head)) return "vtt";
  if (/-->/.test(text) && /,/.test(text) && !/^WEBVTT\b/i.test(head)) return "srt";
  if (/-->/.test(text) && /\d:\d{2}:\d{2}\./.test(text)) return "vtt";
  return "srt";
};

const TIME_ARROW =
  /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})/;

export const parseSubtitles = (text: string, format: SubtitleFormat): ParsedCue[] => {
  const raw = String(text || "").replace(/^\uFEFF/, "");
  if (format === "vtt") {
    // Drop header / NOTE / STYLE blocks; keep cue blocks.
    const body = raw.replace(/^WEBVTT[^\n]*\n?/i, "");
    const blocks = body.split(/\n\s*\n+/);
    const cues: ParsedCue[] = [];
    for (const block of blocks) {
      const lines = block.split(/\r?\n/).map((l) => l.trimEnd()).filter((l, i, arr) => !(i === 0 && !l) || arr.some(Boolean));
      const nonempty = lines.filter((l) => l.trim().length > 0);
      if (!nonempty.length) continue;
      if (/^(NOTE|STYLE|REGION)\b/i.test(nonempty[0])) continue;
      let timeLineIdx = nonempty.findIndex((l) => TIME_ARROW.test(l));
      if (timeLineIdx < 0) continue;
      const timeLine = nonempty[timeLineIdx];
      const m = timeLine.match(TIME_ARROW);
      if (!m) continue;
      const start_s = parseTimestamp(m[1]);
      const end_s = parseTimestamp(m[2]);
      if (start_s == null || end_s == null || end_s <= start_s) continue;
      const settingsMatch = timeLine.slice(timeLine.indexOf("-->") + 3).replace(m[2], "").trim();
      const textLines = nonempty.slice(timeLineIdx + 1);
      cues.push({
        start_s: round3(start_s),
        end_s: round3(end_s),
        text: textLines.join("\n").trimEnd(),
        settings: settingsMatch || undefined,
      });
    }
    return cues;
  }

  // SRT
  const blocks = raw.trim().split(/\n\s*\n+/);
  const cues: ParsedCue[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trimEnd());
    if (!lines.length) continue;
    let idx = 0;
    if (/^\d+$/.test(lines[0].trim())) idx = 1;
    if (idx >= lines.length) continue;
    const m = lines[idx].match(TIME_ARROW);
    if (!m) continue;
    const start_s = parseTimestamp(m[1]);
    const end_s = parseTimestamp(m[2]);
    if (start_s == null || end_s == null || end_s <= start_s) continue;
    const text = lines.slice(idx + 1).join("\n").trimEnd();
    cues.push({
      start_s: round3(start_s),
      end_s: round3(end_s),
      text,
    });
  }
  return cues;
};

export const serializeSrt = (cues: ParsedCue[]): string => {
  if (!cues.length) return "";
  return (
    cues
      .map((c, i) => {
        const body = c.text.trimEnd();
        return `${i + 1}\n${formatSrtTimestamp(c.start_s)} --> ${formatSrtTimestamp(c.end_s)}\n${body}`;
      })
      .join("\n\n") + "\n"
  );
};

export const serializeVtt = (cues: ParsedCue[]): string => {
  const blocks = cues.map((c) => {
    const settings = c.settings ? ` ${c.settings}` : "";
    const body = c.text.trimEnd();
    return `${formatVttTimestamp(c.start_s)} --> ${formatVttTimestamp(c.end_s)}${settings}\n${body}`;
  });
  return `WEBVTT\n\n${blocks.join("\n\n")}${blocks.length ? "\n" : ""}`;
};

export const retimeSubtitles = (
  inputText: string,
  deletedRanges: CueTimeRange[],
  formatHint?: "srt" | "vtt" | "auto",
): CueSpliceResult => {
  const format = detectSubtitleFormat(inputText, formatHint);
  const cues = parseSubtitles(inputText, format);
  const deleted = cleanRanges(deletedRanges || []);
  const deleted_s = round3(deleted.reduce((sum, d) => sum + (d.end_s - d.start_s), 0));

  const outCues: ParsedCue[] = [];
  const report: CueChangeReport[] = [];
  const counts: CueSpliceCounts = {
    input: cues.length,
    output: 0,
    unchanged: 0,
    shifted: 0,
    trimmed: 0,
    removed: 0,
    split: 0,
  };

  cues.forEach((cue, original_index) => {
    const survivors = survivingIntervals(cue.start_s, cue.end_s, deleted);
    const base = {
      original_index: original_index + 1,
      original_start_s: cue.start_s,
      original_end_s: cue.end_s,
      text_preview: previewText(cue.text),
    };

    if (!survivors.length) {
      counts.removed += 1;
      report.push({ kind: "removed", ...base, note: "fully inside deleted range(s)" });
      return;
    }

    const mapped = survivors.map((s) => ({
      start_s: mapOriginalToEdited(s.start_s, deleted),
      end_s: mapOriginalToEdited(s.end_s, deleted),
      text: cue.text,
      settings: cue.settings,
    }));

    const fullyIntact =
      survivors.length === 1 &&
      Math.abs(survivors[0].start_s - cue.start_s) < 0.001 &&
      Math.abs(survivors[0].end_s - cue.end_s) < 0.001;

    if (survivors.length > 1) {
      counts.split += 1;
      report.push({
        kind: "split",
        ...base,
        parts: survivors.length,
        new_start_s: mapped[0].start_s,
        new_end_s: mapped[mapped.length - 1].end_s,
        note: `split into ${survivors.length} cues across cut(s)`,
      });
    } else if (!fullyIntact) {
      counts.trimmed += 1;
      report.push({
        kind: "trimmed",
        ...base,
        new_start_s: mapped[0].start_s,
        new_end_s: mapped[0].end_s,
        note: "overlap with deleted range trimmed",
      });
    } else {
      const shifted =
        Math.abs(mapped[0].start_s - cue.start_s) > 0.001 ||
        Math.abs(mapped[0].end_s - cue.end_s) > 0.001;
      if (shifted) {
        counts.shifted += 1;
        report.push({
          kind: "shifted",
          ...base,
          new_start_s: mapped[0].start_s,
          new_end_s: mapped[0].end_s,
          note: `shifted by ${round3(cue.start_s - mapped[0].start_s)}s`,
        });
      } else {
        counts.unchanged += 1;
        report.push({
          kind: "unchanged",
          ...base,
          new_start_s: mapped[0].start_s,
          new_end_s: mapped[0].end_s,
        });
      }
    }

    for (const m of mapped) {
      if (m.end_s - m.start_s > 0.001) outCues.push(m);
    }
  });

  counts.output = outCues.length;
  const text = format === "vtt" ? serializeVtt(outCues) : serializeSrt(outCues);

  return {
    ok: true,
    format,
    text,
    counts,
    report,
    deleted_s,
    deleted,
  };
};

const asRangeList = (value: unknown): CueTimeRange[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const list = (value as any[])
    .map((row) => ({
      start_s: Number(row?.start_s ?? row?.start ?? row?.[0]),
      end_s: Number(row?.end_s ?? row?.end ?? row?.[1]),
    }))
    .filter((r) => Number.isFinite(r.start_s) && Number.isFinite(r.end_s) && r.end_s > r.start_s);
  return list.length ? list : [];
};

export const parseCueSpliceRequest = (
  body: Record<string, unknown>,
): { ok: true; request: CueSpliceRequest } | { ok: false; error: string } => {
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return { ok: false, error: "Pass subtitle text as { text: string } (SRT or WebVTT)." };
  }
  const formatRaw = typeof body.format === "string" ? body.format.trim().toLowerCase() : "auto";
  if (formatRaw !== "srt" && formatRaw !== "vtt" && formatRaw !== "auto") {
    return { ok: false, error: "format must be srt, vtt, or auto." };
  }
  const deleted = asRangeList(body.deleted);
  const keep = asRangeList(body.keep);
  const duration_s = Number.isFinite(Number(body.duration_s)) ? Number(body.duration_s) : undefined;

  if ((!deleted || !deleted.length) && keep && keep.length) {
    if (duration_s == null || duration_s <= 0) {
      return { ok: false, error: "When using keep ranges, pass duration_s to invert into deleted cuts." };
    }
  }
  if ((!deleted || !deleted.length) && (!keep || !keep.length)) {
    return { ok: false, error: "Pass deleted: [{start_s,end_s}] or keep ranges plus duration_s." };
  }

  return {
    ok: true,
    request: {
      text,
      format: formatRaw as "srt" | "vtt" | "auto",
      deleted: deleted?.length ? deleted : undefined,
      keep: keep?.length ? keep : undefined,
      duration_s,
    },
  };
};

export const runCueSplice = (request: CueSpliceRequest): CueSpliceResult => {
  let deleted = request.deleted ? cleanRanges(request.deleted) : [];
  if (!deleted.length && request.keep?.length) {
    deleted = invertKeepRanges(request.duration_s || 0, request.keep);
  }
  return retimeSubtitles(request.text, deleted, request.format);
};
