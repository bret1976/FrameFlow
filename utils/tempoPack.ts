/**
 * TempoPack — caption timing audit + repair checklist.
 *
 * Idea inspired by Wsh7Ash/cue-tempo (MIT): caption timing QA for
 * duration, gaps, CPS, line count, overlap / order. This is an original
 * FrameFlow TypeScript reimplementation (no vendored cue-tempo Python).
 * Pure functions, local-first, no API keys.
 *
 * Complementary to: StickyCue (word highlight), CueSplice (cut retime),
 * StylePack (ASS styles), SafeKit (SRT WPM / contrast). TempoPack answers:
 * "are these cue timings readable (duration, gap, CPS, lines, order)?"
 */

export type TempoPackAction =
  | "check"
  | "repair"
  | "plan"
  | "demo"
  | "defaults"
  | "audit";

export type TempoPackVerdict = "READY" | "FIX" | "BLOCKED";

export type TempoFindingId =
  | "overlap"
  | "tiny_gap"
  | "short_duration"
  | "high_cps"
  | "too_many_lines"
  | "blank_text"
  | "out_of_order";

export type TempoSeverity = "block" | "fix" | "info";

export type TempoCue = {
  start_ms: number;
  end_ms: number;
  text: string;
};

export type TempoFinding = {
  id: TempoFindingId;
  ok: boolean;
  severity: TempoSeverity;
  label: string;
  detail: string;
  cue_index?: number;
  cue_index_b?: number;
  hint?: string;
};

export type TempoPlanStep = {
  id: string;
  label: string;
  purpose: string;
  finding_ids: TempoFindingId[];
};

export type TempoRepairChange = {
  cue_index: number;
  field: "start_ms" | "end_ms" | "order";
  from: number;
  to: number;
  reason: string;
};

export type TempoPackDefaults = {
  min_duration_ms: number;
  min_gap_ms: number;
  max_lines: number;
  max_cps: number;
  finding_catalog: Array<{
    id: TempoFindingId;
    severity: TempoSeverity;
    label: string;
    description: string;
  }>;
};

export type TempoPackRequest = {
  action?: TempoPackAction;
  demo?: boolean;
  cues?: TempoCue[];
  srt?: string;
  min_duration_ms?: number;
  min_gap_ms?: number;
  max_lines?: number;
  max_cps?: number;
};

export type TempoPackResult = {
  ok: true;
  source: "tempo-pack-1.0";
  action: string;
  summary: string;
  verdict?: TempoPackVerdict;
  score?: number;
  findings?: TempoFinding[];
  failing?: string[];
  plan?: TempoPlanStep[];
  defaults?: TempoPackDefaults;
  cues?: TempoCue[];
  repaired_cues?: TempoCue[];
  changes?: TempoRepairChange[];
  notes?: string[];
  cue_count?: number;
};

export type TempoPackParseResult =
  | { ok: true; request: TempoPackRequest }
  | { ok: false; error: string };

export const MIN_DURATION_MS = 1000;
export const MIN_GAP_MS = 40;
export const MAX_LINES = 2;
export const MAX_CPS = 20;

export const FINDING_CATALOG: TempoPackDefaults["finding_catalog"] = [
  {
    id: "overlap",
    severity: "block",
    label: "Overlap",
    description: "Cue end is after the next cue start (timings collide).",
  },
  {
    id: "tiny_gap",
    severity: "fix",
    label: "Tiny gap",
    description: `Gap between consecutive cues is under ${MIN_GAP_MS}ms.`,
  },
  {
    id: "short_duration",
    severity: "fix",
    label: "Short duration",
    description: `Cue on-screen time is under ${MIN_DURATION_MS}ms.`,
  },
  {
    id: "high_cps",
    severity: "fix",
    label: "High CPS",
    description: `Characters per second exceed ${MAX_CPS} (hard to read).`,
  },
  {
    id: "too_many_lines",
    severity: "fix",
    label: "Too many lines",
    description: `Caption has more than ${MAX_LINES} lines (newlines).`,
  },
  {
    id: "blank_text",
    severity: "block",
    label: "Blank text",
    description: "Cue text is empty or whitespace-only.",
  },
  {
    id: "out_of_order",
    severity: "block",
    label: "Out of order",
    description: "Cue starts before the previous cue start (not chronological).",
  },
];

export const DEFAULTS: TempoPackDefaults = {
  min_duration_ms: MIN_DURATION_MS,
  min_gap_ms: MIN_GAP_MS,
  max_lines: MAX_LINES,
  max_cps: MAX_CPS,
  finding_catalog: FINDING_CATALOG,
};

/** Built-in messy demo — triggers overlap, short, tiny gap, high CPS, lines, blank, order. */
export const DEMO_CUES: TempoCue[] = [
  { start_ms: 0, end_ms: 800, text: "Wait for it…" }, // short_duration
  { start_ms: 820, end_ms: 1800, text: "Tiny gap above" }, // tiny_gap (20ms)
  {
    start_ms: 1700,
    end_ms: 2600,
    text: "This overlaps previous and packs too many characters into a short window for CPS",
  }, // overlap + high_cps
  {
    start_ms: 3000,
    end_ms: 4200,
    text: "Line one\nLine two\nLine three too many",
  }, // too_many_lines
  { start_ms: 4500, end_ms: 5500, text: "   " }, // blank_text
  { start_ms: 5200, end_ms: 6000, text: "Starts before previous end + out of order vs next" }, // overlap w/ blank
  { start_ms: 4800, end_ms: 5900, text: "Out of order — starts before cue 5" }, // out_of_order
];

const asString = (v: unknown): string =>
  typeof v === "string" ? v.trim() : "";

const asNum = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
};

const asBool = (v: unknown): boolean => v === true || v === "true" || v === 1;

const roundMs = (n: number): number => Math.round(n);

const lineCount = (text: string): number => {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
};

const cpsOf = (text: string, durationMs: number): number => {
  if (durationMs <= 0) return Infinity;
  const chars = text.replace(/\s+/g, " ").trim().length;
  return chars / (durationMs / 1000);
};

/** Parse simple SRT → TempoCue[] (index lines ignored; comma or dot ms). */
export const parseSrtToCues = (srt: string): TempoCue[] => {
  const blocks = String(srt || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n\n+/);
  const cues: TempoCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd());
    if (lines.length < 2) continue;
    let timeLine = lines[0];
    let textStart = 1;
    if (/^\d+$/.test(lines[0].trim()) && lines.length >= 3) {
      timeLine = lines[1];
      textStart = 2;
    }
    const m = timeLine.match(
      /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/
    );
    if (!m) continue;
    const toMs = (
      h: string,
      mi: string,
      s: string,
      ms: string
    ): number =>
      (Number(h) * 3600 + Number(mi) * 60 + Number(s)) * 1000 +
      Number(ms.padEnd(3, "0").slice(0, 3));
    const start_ms = toMs(m[1], m[2], m[3], m[4]);
    const end_ms = toMs(m[5], m[6], m[7], m[8]);
    const text = lines.slice(textStart).join("\n").trimEnd();
    cues.push({ start_ms, end_ms, text });
  }
  return cues;
};

const normalizeCue = (raw: unknown, index: number): TempoCue | null => {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  let start = asNum(o.start_ms);
  let end = asNum(o.end_ms);
  if (start === undefined && asNum(o.start_s) !== undefined) {
    start = Math.round((asNum(o.start_s) as number) * 1000);
  }
  if (end === undefined && asNum(o.end_s) !== undefined) {
    end = Math.round((asNum(o.end_s) as number) * 1000);
  }
  if (start === undefined && asNum(o.start) !== undefined) {
    const s = asNum(o.start) as number;
    start = s < 1000 && s !== Math.floor(s) ? Math.round(s * 1000) : Math.round(s);
  }
  if (end === undefined && asNum(o.end) !== undefined) {
    const e = asNum(o.end) as number;
    end = e < 1000 && e !== Math.floor(e) ? Math.round(e * 1000) : Math.round(e);
  }
  if (start === undefined || end === undefined) return null;
  const text =
    typeof o.text === "string"
      ? o.text
      : typeof o.content === "string"
        ? o.content
        : "";
  return { start_ms: roundMs(start), end_ms: roundMs(end), text };
};

export const resolveCues = (req: TempoPackRequest): TempoCue[] => {
  if (Array.isArray(req.cues) && req.cues.length > 0) {
    return req.cues
      .map((c, i) => normalizeCue(c, i))
      .filter((c): c is TempoCue => Boolean(c));
  }
  if (typeof req.srt === "string" && req.srt.trim()) {
    return parseSrtToCues(req.srt);
  }
  return [];
};

type Thresholds = {
  min_duration_ms: number;
  min_gap_ms: number;
  max_lines: number;
  max_cps: number;
};

const thresholdsOf = (req: TempoPackRequest): Thresholds => ({
  min_duration_ms: req.min_duration_ms ?? MIN_DURATION_MS,
  min_gap_ms: req.min_gap_ms ?? MIN_GAP_MS,
  max_lines: req.max_lines ?? MAX_LINES,
  max_cps: req.max_cps ?? MAX_CPS,
});

export const auditCues = (
  cues: TempoCue[],
  thr: Thresholds = DEFAULTS
): { findings: TempoFinding[]; verdict: TempoPackVerdict; score: number } => {
  const findings: TempoFinding[] = [];

  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const dur = c.end_ms - c.start_ms;
    const blank = !String(c.text || "").trim();

    if (blank) {
      findings.push({
        id: "blank_text",
        ok: false,
        severity: "block",
        label: "Blank text",
        detail: `Cue ${i} has empty / whitespace-only text`,
        cue_index: i,
        hint: "Fill cue text or drop the cue before publish",
      });
    }

    if (dur < thr.min_duration_ms) {
      findings.push({
        id: "short_duration",
        ok: false,
        severity: "fix",
        label: "Short duration",
        detail: `Cue ${i} lasts ${dur}ms < ${thr.min_duration_ms}ms min`,
        cue_index: i,
        hint: `Extend end_ms so duration ≥ ${thr.min_duration_ms}ms`,
      });
    }

    if (!blank && dur > 0) {
      const cps = cpsOf(c.text, dur);
      if (cps > thr.max_cps) {
        findings.push({
          id: "high_cps",
          ok: false,
          severity: "fix",
          label: "High CPS",
          detail: `Cue ${i} is ${cps.toFixed(1)} cps > ${thr.max_cps} max`,
          cue_index: i,
          hint: "Lengthen duration or shorten text (TempoPack does not rewrite text)",
        });
      }
    }

    const lines = lineCount(String(c.text || ""));
    if (lines > thr.max_lines) {
      findings.push({
        id: "too_many_lines",
        ok: false,
        severity: "fix",
        label: "Too many lines",
        detail: `Cue ${i} has ${lines} lines > ${thr.max_lines} max`,
        cue_index: i,
        hint: `Collapse to ≤ ${thr.max_lines} lines (manual text edit)`,
      });
    }

    if (i > 0) {
      const prev = cues[i - 1];
      if (c.start_ms < prev.start_ms) {
        findings.push({
          id: "out_of_order",
          ok: false,
          severity: "block",
          label: "Out of order",
          detail: `Cue ${i} starts at ${c.start_ms}ms before cue ${i - 1} at ${prev.start_ms}ms`,
          cue_index: i,
          cue_index_b: i - 1,
          hint: "Sort cues chronologically, then re-gap",
        });
      }
      if (c.start_ms < prev.end_ms) {
        findings.push({
          id: "overlap",
          ok: false,
          severity: "block",
          label: "Overlap",
          detail: `Cue ${i} overlaps cue ${i - 1} by ${prev.end_ms - c.start_ms}ms`,
          cue_index: i,
          cue_index_b: i - 1,
          hint: `Pull start_ms to ≥ previous end + ${thr.min_gap_ms}ms gap`,
        });
      } else {
        const gap = c.start_ms - prev.end_ms;
        if (gap < thr.min_gap_ms) {
          findings.push({
            id: "tiny_gap",
            ok: false,
            severity: "fix",
            label: "Tiny gap",
            detail: `Gap between cue ${i - 1} and ${i} is ${gap}ms < ${thr.min_gap_ms}ms`,
            cue_index: i,
            cue_index_b: i - 1,
            hint: `Push start_ms (or pull previous end) to open ≥ ${thr.min_gap_ms}ms`,
          });
        }
      }
    }
  }

  // Pass markers for clean runs (summary UX)
  if (cues.length === 0) {
    findings.push({
      id: "blank_text",
      ok: false,
      severity: "block",
      label: "No cues",
      detail: "Provide cues[] or srt — empty input cannot be audited",
      hint: "POST cues or srt, or action=demo",
    });
  }

  const blocked = findings.some((f) => !f.ok && f.severity === "block");
  const fixes = findings.filter((f) => !f.ok && f.severity === "fix");
  const failCount = findings.filter((f) => !f.ok).length;

  // Score: start 100, −18 block, −8 fix (floor 0)
  let score = 100;
  for (const f of findings) {
    if (f.ok) continue;
    if (f.severity === "block") score -= 18;
    else if (f.severity === "fix") score -= 8;
  }
  score = Math.max(0, Math.min(100, score));

  const verdict: TempoPackVerdict = blocked
    ? "BLOCKED"
    : fixes.length > 0
      ? "FIX"
      : "READY";

  // Ignore unused failCount lint-wise
  void failCount;

  return { findings, verdict, score };
};

export const repairCues = (
  cuesIn: TempoCue[],
  thr: Thresholds = DEFAULTS
): { repaired: TempoCue[]; changes: TempoRepairChange[] } => {
  // Stable chronological sort by start, then end; keep text untouched
  const indexed = cuesIn.map((c, i) => ({ ...c, __i: i }));
  indexed.sort((a, b) => {
    if (a.start_ms !== b.start_ms) return a.start_ms - b.start_ms;
    return a.end_ms - b.end_ms;
  });

  const changes: TempoRepairChange[] = [];
  for (let i = 0; i < indexed.length; i++) {
    if (indexed[i].__i !== i) {
      changes.push({
        cue_index: indexed[i].__i,
        field: "order",
        from: indexed[i].__i,
        to: i,
        reason: "Reordered to chronological start_ms",
      });
    }
  }

  const repaired: TempoCue[] = indexed.map(({ start_ms, end_ms, text }) => ({
    start_ms,
    end_ms,
    text,
  }));

  for (let i = 0; i < repaired.length; i++) {
    const c = repaired[i];
    // Ensure end > start
    if (c.end_ms <= c.start_ms) {
      const to = c.start_ms + thr.min_duration_ms;
      changes.push({
        cue_index: i,
        field: "end_ms",
        from: c.end_ms,
        to,
        reason: "end_ms ≤ start_ms — set to min duration",
      });
      c.end_ms = to;
    }
    // Enforce min duration
    const dur = c.end_ms - c.start_ms;
    if (dur < thr.min_duration_ms) {
      const to = c.start_ms + thr.min_duration_ms;
      changes.push({
        cue_index: i,
        field: "end_ms",
        from: c.end_ms,
        to,
        reason: `Extend to min_duration_ms (${thr.min_duration_ms})`,
      });
      c.end_ms = to;
    }
    // Enforce gap / no-overlap vs previous
    if (i > 0) {
      const prev = repaired[i - 1];
      const minStart = prev.end_ms + thr.min_gap_ms;
      if (c.start_ms < minStart) {
        const shift = minStart - c.start_ms;
        const fromStart = c.start_ms;
        const fromEnd = c.end_ms;
        c.start_ms = minStart;
        c.end_ms = Math.max(c.end_ms + shift, c.start_ms + thr.min_duration_ms);
        changes.push({
          cue_index: i,
          field: "start_ms",
          from: fromStart,
          to: c.start_ms,
          reason: `Push start to clear previous end + ${thr.min_gap_ms}ms gap`,
        });
        if (c.end_ms !== fromEnd) {
          changes.push({
            cue_index: i,
            field: "end_ms",
            from: fromEnd,
            to: c.end_ms,
            reason: "Shift end with start to keep duration",
          });
        }
      }
    }
  }

  return { repaired, changes };
};

export const buildPlan = (findings: TempoFinding[]): TempoPlanStep[] => {
  const failed = findings.filter((f) => !f.ok);
  const has = (id: TempoFindingId) => failed.some((f) => f.id === id);
  const steps: TempoPlanStep[] = [];

  if (has("blank_text")) {
    steps.push({
      id: "fill_or_drop_blank",
      label: "Fill or drop blank cues",
      purpose: "Blocking empty text must be resolved before timing repair.",
      finding_ids: ["blank_text"],
    });
  }
  if (has("out_of_order")) {
    steps.push({
      id: "sort_chronological",
      label: "Sort cues by start_ms",
      purpose: "Stabilize order so gap/overlap math is meaningful.",
      finding_ids: ["out_of_order"],
    });
  }
  if (has("overlap") || has("tiny_gap")) {
    steps.push({
      id: "re_gap",
      label: "Clear overlaps + open min gaps",
      purpose: "Push starts (or pull previous ends) so cues never collide.",
      finding_ids: ["overlap", "tiny_gap"],
    });
  }
  if (has("short_duration")) {
    steps.push({
      id: "extend_short",
      label: "Extend short cues to min duration",
      purpose: "Keep each cue on screen long enough to read.",
      finding_ids: ["short_duration"],
    });
  }
  if (has("high_cps")) {
    steps.push({
      id: "ease_cps",
      label: "Ease high CPS (lengthen or shorten text)",
      purpose: "TempoPack can lengthen timings; text edits stay manual.",
      finding_ids: ["high_cps"],
    });
  }
  if (has("too_many_lines")) {
    steps.push({
      id: "collapse_lines",
      label: "Collapse to max lines",
      purpose: "Manual text edit — TempoPack never rewrites caption copy.",
      finding_ids: ["too_many_lines"],
    });
  }
  if (steps.length === 0) {
    steps.push({
      id: "ready",
      label: "Timing READY",
      purpose: "No timing findings — proceed to StylePack / StickyCue / burn-in.",
      finding_ids: [],
    });
  }
  return steps;
};

export const parseTempoPackRequest = (
  body: Record<string, unknown>
): TempoPackParseResult => {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }
  let actionRaw = (asString(body.action) || (asBool(body.demo) ? "demo" : "check")).toLowerCase();
  const allowed: TempoPackAction[] = [
    "check",
    "repair",
    "plan",
    "demo",
    "defaults",
    "audit",
  ];
  if (!allowed.includes(actionRaw as TempoPackAction)) {
    return {
      ok: false,
      error: `action must be one of: ${allowed.join(", ")}`,
    };
  }
  // audit is an alias of check
  if (actionRaw === "audit") actionRaw = "check";

  const cuesRaw = body.cues;
  let cues: TempoCue[] | undefined;
  if (Array.isArray(cuesRaw)) {
    cues = cuesRaw
      .map((c, i) => normalizeCue(c, i))
      .filter((c): c is TempoCue => Boolean(c));
  }

  const request: TempoPackRequest = {
    action: actionRaw as TempoPackAction,
    demo: asBool(body.demo),
    cues,
    srt: asString(body.srt) || undefined,
    min_duration_ms: asNum(body.min_duration_ms),
    min_gap_ms: asNum(body.min_gap_ms),
    max_lines: asNum(body.max_lines),
    max_cps: asNum(body.max_cps),
  };
  return { ok: true, request };
};

export const runTempoPack = (req: TempoPackRequest): TempoPackResult => {
  const action = (req.action || "check") === "audit" ? "check" : req.action || "check";
  const thr = thresholdsOf(req);

  if (action === "defaults") {
    return {
      ok: true,
      source: "tempo-pack-1.0",
      action: "defaults",
      summary: `TempoPack defaults — min ${thr.min_duration_ms}ms · gap ${thr.min_gap_ms}ms · ≤${thr.max_lines} lines · ≤${thr.max_cps} cps`,
      defaults: {
        ...DEFAULTS,
        min_duration_ms: thr.min_duration_ms,
        min_gap_ms: thr.min_gap_ms,
        max_lines: thr.max_lines,
        max_cps: thr.max_cps,
      },
      notes: [
        "Inspired by Wsh7Ash/cue-tempo (MIT) — original FrameFlow TS, no vendored Python.",
        "Complementary to StickyCue / CueSplice / StylePack / SafeKit.",
      ],
    };
  }

  const usingDemo = action === "demo" || (req.demo === true && resolveCues(req).length === 0);
  const cues = usingDemo ? DEMO_CUES.map((c) => ({ ...c })) : resolveCues(req);

  if (action === "plan") {
    const { findings, verdict, score } = auditCues(cues, thr);
    const plan = buildPlan(findings);
    return {
      ok: true,
      source: "tempo-pack-1.0",
      action: "plan",
      summary:
        verdict === "READY"
          ? `READY ${score}/100 — timing plan clear`
          : `${verdict} ${score}/100 — ${plan.length} repair step(s)`,
      verdict,
      score,
      findings,
      failing: findings.filter((f) => !f.ok).map((f) => f.id),
      plan,
      cue_count: cues.length,
      notes: usingDemo ? ["plan ran on built-in DEMO_CUES"] : undefined,
    };
  }

  if (action === "repair" || action === "demo") {
    const before = auditCues(cues, thr);
    const { repaired, changes } = repairCues(cues, thr);
    const after = auditCues(repaired, thr);
    const plan = buildPlan(before.findings);

    if (action === "demo") {
      return {
        ok: true,
        source: "tempo-pack-1.0",
        action: "demo",
        summary: `Demo: ${before.verdict} ${before.score}/100 → repair → ${after.verdict} ${after.score}/100 (${changes.length} change(s))`,
        verdict: after.verdict,
        score: after.score,
        findings: before.findings,
        failing: before.findings.filter((f) => !f.ok).map((f) => f.id),
        plan,
        cues,
        repaired_cues: repaired,
        changes,
        cue_count: cues.length,
        notes: [
          "Built-in messy DEMO_CUES (overlap, short, tiny gap, high CPS, lines, blank, order).",
          "Repair fixes timings only — blank text / line count / CPS-from-text still need manual copy edits.",
          `Post-repair remaining fails: ${after.findings.filter((f) => !f.ok).map((f) => f.id).join(", ") || "none"}`,
        ],
      };
    }

    return {
      ok: true,
      source: "tempo-pack-1.0",
      action: "repair",
      summary: `Repair: ${before.verdict} ${before.score} → ${after.verdict} ${after.score} · ${changes.length} change(s)`,
      verdict: after.verdict,
      score: after.score,
      findings: after.findings,
      failing: after.findings.filter((f) => !f.ok).map((f) => f.id),
      plan,
      cues,
      repaired_cues: repaired,
      changes,
      cue_count: repaired.length,
      notes: [
        "Text left unchanged. Re-run check after manual blank/line/CPS text fixes.",
      ],
    };
  }

  // check (default)
  const { findings, verdict, score } = auditCues(cues, thr);
  const plan = buildPlan(findings);
  return {
    ok: true,
    source: "tempo-pack-1.0",
    action: "check",
    summary:
      verdict === "READY"
        ? `READY ${score}/100 — caption timing clean`
        : verdict === "BLOCKED"
          ? `BLOCKED ${score}/100 — fix overlaps / order / blank text`
          : `FIX ${score}/100 — tighten duration / gap / CPS / lines`,
    verdict,
    score,
    findings,
    failing: findings.filter((f) => !f.ok).map((f) => f.id),
    plan,
    cues,
    cue_count: cues.length,
    notes: usingDemo ? ["check used DEMO_CUES"] : undefined,
  };
};
