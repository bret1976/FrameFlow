/**
 * FormatBoard — short-form retention format catalog with honesty rules.
 * Idea inspired by msertdev/keepwatching (MIT; reimplement only —
 * original FrameFlow TypeScript, no clone of their renderer/engine).
 * Formats are data. Measurements stay separated: format structure vs content axis.
 * Pure functions, local-first, no network.
 */

export type MeasurementStatus = "untested" | "direction" | "result";

export type FormatMeasurement = {
  n: number;
  status: MeasurementStatus;
  avg_retention_pct?: number | null;
  notes?: string | null;
};

export type ContentAxisMeasurement = {
  n: number;
  status: MeasurementStatus;
  avg_retention_pct?: number | null;
  notes?: string | null;
  axes: string[];
};

export type ShortFormFormat = {
  slug: string;
  name: string;
  hypothesis: string;
  avoid_when: string;
  beats: string[];
  duration_sec: number;
  tags: string[];
  format: FormatMeasurement;
  content_axis: ContentAxisMeasurement;
};

export type FormatBoardRequest = {
  action?: "list" | "match" | "score" | "record" | "honesty" | "demo";
  query?: string;
  topic?: string;
  brief?: string;
  tags?: string[];
  limit?: number;
  /** Apply a measurement to a format slug (never invents numbers). */
  record?: {
    slug: string;
    kind: "format" | "content_axis";
    n: number;
    avg_retention_pct?: number | null;
    notes?: string | null;
    axes?: string[];
  };
  /** Optional overlay of prior measurements keyed by slug. */
  overlays?: Record<
    string,
    {
      format?: Partial<FormatMeasurement>;
      content_axis?: Partial<ContentAxisMeasurement>;
    }
  >;
  demo?: boolean;
};

export type FormatMatch = {
  format: ShortFormFormat;
  score: number;
  reasons: string[];
  honesty_label: string;
};

export type FormatBoardResult = {
  ok: true;
  action: string;
  formats?: ShortFormFormat[];
  matches?: FormatMatch[];
  honesty?: {
    rules: string[];
    violations: string[];
    ok: boolean;
  };
  summary: string;
};

const HONESTY_RULES = [
  "n: 0 means untested — never round up to promising.",
  "Under n=5 is a direction, not a result.",
  "Losing formats stay listed with their numbers.",
  "Only record writes measurements — never invent retention %.",
  "A format number and a content-axis number are never averaged.",
  "Every number carries a source note, or is labelled filler.",
];

/** Seed catalog — original FrameFlow copy; structure inspired by keepwatching. */
const SEED: ShortFormFormat[] = [
  {
    slug: "ranking-suspense",
    name: "Ranking Suspense",
    hypothesis: "Withhold #1 until the final beat so completion rises among stayers.",
    avoid_when: "Audience already knows the likely #1 — feels like padding.",
    beats: ["tease list size", "count down mid ranks", "near-miss", "reveal #1", "cta"],
    duration_sec: 30,
    tags: ["ranking", "list", "suspense", "retention"],
    format: { n: 0, status: "untested" },
    content_axis: { n: 0, status: "untested", axes: [] },
  },
  {
    slug: "stat-counter-rise",
    name: "Stat Counter Rise",
    hypothesis: "A climbing counter keeps eyes on screen until the number lands.",
    avoid_when: "Number is soft or unsourced — looks like filler hype.",
    beats: ["pose question", "counter starts", "context line", "number lands", "so-what"],
    duration_sec: 20,
    tags: ["stat", "counter", "data", "hook"],
    format: { n: 0, status: "untested" },
    content_axis: { n: 0, status: "untested", axes: [] },
  },
  {
    slug: "cold-open-question",
    name: "Cold Open Question",
    hypothesis: "Open on an unanswered question so swipe-away costs curiosity.",
    avoid_when: "Question is clickbait with no payoff in the same clip.",
    beats: ["question on frame 0", "partial answer", "twist", "full answer", "cta"],
    duration_sec: 25,
    tags: ["hook", "question", "cold-open"],
    format: { n: 0, status: "untested" },
    content_axis: { n: 0, status: "untested", axes: [] },
  },
  {
    slug: "myth-vs-fact",
    name: "Myth vs Fact",
    hypothesis: "Label a myth then flip it — pattern interrupt plus teaching payoff.",
    avoid_when: "Audience already treats the myth as false.",
    beats: ["myth card", "pause", "fact flip", "why it matters", "cta"],
    duration_sec: 28,
    tags: ["myth", "education", "contrast"],
    format: { n: 0, status: "untested" },
    content_axis: { n: 0, status: "untested", axes: [] },
  },
  {
    slug: "before-after",
    name: "Before / After",
    hypothesis: "Split reveal sells transformation faster than narration alone.",
    avoid_when: "Change is subtle on phone screens.",
    beats: ["before lock", "wipe / split", "after", "one tip that caused it", "cta"],
    duration_sec: 22,
    tags: ["transformation", "split", "demo"],
    format: { n: 0, status: "untested" },
    content_axis: { n: 0, status: "untested", axes: [] },
  },
  {
    slug: "countdown-list",
    name: "Countdown List",
    hypothesis: "Numbered countdown sets expectations and rewards staying for #1.",
    avoid_when: "Items are uneven length — early drop-off mid list.",
    beats: ["title + count", "item N", "…", "item 1", "recap + cta"],
    duration_sec: 45,
    tags: ["list", "countdown", "tips"],
    format: { n: 0, status: "untested" },
    content_axis: { n: 0, status: "untested", axes: [] },
  },
  {
    slug: "pattern-interrupt",
    name: "Pattern Interrupt",
    hypothesis: "Break expected rhythm in first 1.5s to reset the scroll reflex.",
    avoid_when: "Interrupt has no story link — feels random.",
    beats: ["interrupt visual", "label what broke", "bridge", "payoff", "cta"],
    duration_sec: 18,
    tags: ["hook", "interrupt", "scroll-stop"],
    format: { n: 0, status: "untested" },
    content_axis: { n: 0, status: "untested", axes: [] },
  },
  {
    slug: "split-verdict",
    name: "Split Verdict",
    hypothesis: "Two options side-by-side force a pick and raise comments.",
    avoid_when: "Options are false dichotomy or brand-unsafe.",
    beats: ["A vs B frame", "criteria", "lean", "verdict", "invite reply"],
    duration_sec: 24,
    tags: ["debate", "split", "engagement"],
    format: { n: 0, status: "untested" },
    content_axis: { n: 0, status: "untested", axes: [] },
  },
  {
    slug: "escalation-ladder",
    name: "Escalation Ladder",
    hypothesis: "Each beat raises stakes so mid-watch drop feels unfinished.",
    avoid_when: "Ladder peaks too early with nowhere to go.",
    beats: ["floor", "step up", "bigger step", "peak", "land + cta"],
    duration_sec: 32,
    tags: ["story", "escalation", "drama"],
    format: { n: 0, status: "untested" },
    content_axis: { n: 0, status: "untested", axes: [] },
  },
  {
    slug: "redacted-reveal",
    name: "Redacted Reveal",
    hypothesis: "Blur / black-bar a key word so viewers wait for the uncover.",
    avoid_when: "Reveal is obvious from context before uncover.",
    beats: ["redacted claim", "build", "uncover", "proof beat", "cta"],
    duration_sec: 20,
    tags: ["reveal", "curiosity", "hook"],
    format: { n: 0, status: "untested" },
    content_axis: { n: 0, status: "untested", axes: [] },
  },
  {
    slug: "loop-seam",
    name: "Loop Seam",
    hypothesis: "End frame matches start so auto-replay feels intentional.",
    avoid_when: "Platform kills loops or audio bed breaks the seam.",
    beats: ["open on seam frame", "middle payoffs", "return to seam", "soft cta"],
    duration_sec: 15,
    tags: ["loop", "rewatch", "seam"],
    format: { n: 0, status: "untested" },
    content_axis: { n: 0, status: "untested", axes: [] },
  },
  {
    slug: "checklist-run",
    name: "Checklist Run",
    hypothesis: "Ticking boxes creates micro-completions that pad watch time.",
    avoid_when: "Checklist is longer than attention budget.",
    beats: ["show list", "tick 1", "tick 2", "tick final", "save reminder"],
    duration_sec: 35,
    tags: ["checklist", "howto", "process"],
    format: { n: 0, status: "untested" },
    content_axis: { n: 0, status: "untested", axes: [] },
  },
];

function statusForN(n: number): MeasurementStatus {
  if (!n || n <= 0) return "untested";
  if (n < 5) return "direction";
  return "result";
}

function honestyLabel(m: FormatMeasurement): string {
  if (m.status === "untested" || m.n === 0) return `untested (n=0)`;
  if (m.status === "direction" || m.n < 5) {
    const pct =
      typeof m.avg_retention_pct === "number"
        ? ` · ~${m.avg_retention_pct}% (direction only)`
        : " · direction only";
    return `n=${m.n}${pct}`;
  }
  const pct =
    typeof m.avg_retention_pct === "number" ? ` · ${m.avg_retention_pct}% retention` : "";
  return `n=${m.n}${pct} · result`;
}

function cloneSeed(overlays?: FormatBoardRequest["overlays"]): ShortFormFormat[] {
  return SEED.map((f) => {
    const o = overlays?.[f.slug];
    const format: FormatMeasurement = {
      ...f.format,
      ...(o?.format || {}),
    };
    format.n = Math.max(0, Math.floor(Number(format.n) || 0));
    format.status = statusForN(format.n);
    const content_axis: ContentAxisMeasurement = {
      ...f.content_axis,
      axes: [...(f.content_axis.axes || [])],
      ...(o?.content_axis || {}),
    };
    content_axis.n = Math.max(0, Math.floor(Number(content_axis.n) || 0));
    content_axis.status = statusForN(content_axis.n);
    if (Array.isArray(o?.content_axis?.axes)) {
      content_axis.axes = o!.content_axis!.axes as string[];
    }
    return { ...f, beats: [...f.beats], tags: [...f.tags], format, content_axis };
  });
}

function tokenize(s: string): string[] {
  return String(s || "")
    .toLowerCase()
    .split(/[^a-z0-9+#]+/g)
    .filter((t) => t.length > 1);
}

function scoreFormat(
  f: ShortFormFormat,
  query: string,
  tags: string[]
): { score: number; reasons: string[] } {
  const qTokens = new Set([...tokenize(query), ...tags.map((t) => t.toLowerCase())]);
  if (qTokens.size === 0) return { score: 0, reasons: ["no query"] };
  const hay = new Set([
    ...tokenize(f.name),
    ...tokenize(f.hypothesis),
    ...tokenize(f.avoid_when),
    ...f.tags.map((t) => t.toLowerCase()),
    ...f.beats.flatMap((b) => tokenize(b)),
  ]);
  let hit = 0;
  const reasons: string[] = [];
  for (const t of qTokens) {
    if (hay.has(t)) {
      hit += 1;
      reasons.push(`matched “${t}”`);
    }
  }
  // Mild boost for measured formats, never inventing numbers
  if (f.format.status === "result") {
    hit += 0.35;
    reasons.push("has result-level format n");
  } else if (f.format.status === "direction") {
    hit += 0.15;
    reasons.push("has direction-level format n");
  }
  const score = Math.round((hit / Math.max(1, qTokens.size)) * 1000) / 10;
  return { score, reasons: reasons.slice(0, 6) };
}

function checkHonesty(formats: ShortFormFormat[]): {
  rules: string[];
  violations: string[];
  ok: boolean;
} {
  const violations: string[] = [];
  for (const f of formats) {
    if (f.format.n === 0 && f.format.status !== "untested") {
      violations.push(`${f.slug}: n=0 must be untested`);
    }
    if (f.format.n > 0 && f.format.n < 5 && f.format.status === "result") {
      violations.push(`${f.slug}: n<5 cannot be result`);
    }
    if (
      typeof f.format.avg_retention_pct === "number" &&
      f.format.n === 0
    ) {
      violations.push(`${f.slug}: retention % with n=0 looks invented`);
    }
    if (f.content_axis.n === 0 && f.content_axis.status !== "untested") {
      violations.push(`${f.slug}: content_axis n=0 must be untested`);
    }
  }
  return { rules: HONESTY_RULES, violations, ok: violations.length === 0 };
}

export function parseFormatBoardRequest(
  body: Record<string, unknown>
): { ok: true; request: FormatBoardRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const demo = Boolean(body.demo);
  const actionRaw = typeof body.action === "string" ? body.action : demo ? "demo" : "list";
  const allowed = new Set(["list", "match", "score", "record", "honesty", "demo"]);
  if (!allowed.has(actionRaw)) {
    return { ok: false, error: `Unknown action “${actionRaw}”.` };
  }
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === "string").slice(0, 24)
    : [];
  const limit =
    typeof body.limit === "number" && body.limit > 0
      ? Math.min(50, Math.floor(body.limit))
      : 8;
  let record: FormatBoardRequest["record"];
  if (body.record && typeof body.record === "object") {
    const r = body.record as Record<string, unknown>;
    if (typeof r.slug !== "string" || !r.slug.trim()) {
      return { ok: false, error: "record.slug is required." };
    }
    if (r.kind !== "format" && r.kind !== "content_axis") {
      return { ok: false, error: "record.kind must be format or content_axis." };
    }
    const n = Number(r.n);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "record.n must be a non-negative number." };
    }
    record = {
      slug: r.slug.trim(),
      kind: r.kind,
      n: Math.floor(n),
      avg_retention_pct:
        typeof r.avg_retention_pct === "number" ? r.avg_retention_pct : null,
      notes: typeof r.notes === "string" ? r.notes : null,
      axes: Array.isArray(r.axes)
        ? r.axes.filter((a): a is string => typeof a === "string")
        : undefined,
    };
  }
  let overlays: FormatBoardRequest["overlays"];
  if (body.overlays && typeof body.overlays === "object") {
    overlays = body.overlays as FormatBoardRequest["overlays"];
  }
  return {
    ok: true,
    request: {
      action: actionRaw as FormatBoardRequest["action"],
      query: typeof body.query === "string" ? body.query : undefined,
      topic: typeof body.topic === "string" ? body.topic : undefined,
      brief: typeof body.brief === "string" ? body.brief : undefined,
      tags,
      limit,
      record,
      overlays,
      demo,
    },
  };
}

export function runFormatBoard(request: FormatBoardRequest): FormatBoardResult {
  const action = request.demo ? "demo" : request.action || "list";
  let formats = cloneSeed(request.overlays);

  if (action === "record" && request.record) {
    const hit = formats.find((f) => f.slug === request.record!.slug);
    if (!hit) {
      const err: any = new Error(`Unknown format slug “${request.record.slug}”.`);
      err.status = 404;
      throw err;
    }
    if (request.record.kind === "format") {
      hit.format.n = request.record.n;
      hit.format.avg_retention_pct = request.record.avg_retention_pct ?? null;
      hit.format.notes = request.record.notes ?? null;
      hit.format.status = statusForN(hit.format.n);
    } else {
      hit.content_axis.n = request.record.n;
      hit.content_axis.avg_retention_pct = request.record.avg_retention_pct ?? null;
      hit.content_axis.notes = request.record.notes ?? null;
      hit.content_axis.status = statusForN(hit.content_axis.n);
      if (request.record.axes) hit.content_axis.axes = request.record.axes;
    }
    const honesty = checkHonesty(formats);
    return {
      ok: true,
      action: "record",
      formats: [hit],
      honesty,
      summary: `Recorded ${request.record.kind} measurement on ${hit.slug}: ${honestyLabel(
        request.record.kind === "format" ? hit.format : { n: hit.content_axis.n, status: hit.content_axis.status, avg_retention_pct: hit.content_axis.avg_retention_pct }
      )}.`,
    };
  }

  if (action === "honesty") {
    const honesty = checkHonesty(formats);
    return {
      ok: true,
      action: "honesty",
      formats,
      honesty,
      summary: honesty.ok
        ? `Honesty OK across ${formats.length} formats.`
        : `Honesty violations: ${honesty.violations.join("; ")}`,
    };
  }

  if (action === "list") {
    return {
      ok: true,
      action: "list",
      formats,
      honesty: checkHonesty(formats),
      summary: `${formats.length} short-form formats · all start untested until you record measurements.`,
    };
  }

  const q = [request.query, request.topic, request.brief, ...(request.tags || [])]
    .filter(Boolean)
    .join(" ");
  const scored = formats
    .map((f) => {
      const { score, reasons } = scoreFormat(f, q || (action === "demo" ? "ranking list hook retention" : ""), request.tags || []);
      return {
        format: f,
        score,
        reasons,
        honesty_label: honestyLabel(f.format),
      } satisfies FormatMatch;
    })
    .sort((a, b) => b.score - a.score);

  const limit = request.limit || 8;
  const matches =
    action === "demo"
      ? scored.slice(0, 5)
      : scored.filter((m) => m.score > 0).slice(0, limit);

  const top = matches[0];
  const summary =
    action === "demo"
      ? `Demo: top pick “${top?.format.name}” (${top?.honesty_label}). Formats stay untested until real n is recorded.`
      : matches.length
        ? `Top ${matches.length}: ${matches
            .map((m) => `${m.format.slug} ${m.score}`)
            .join(", ")}`
        : "No format matched — try richer topic/tags, or list the full board.";

  return {
    ok: true,
    action: action === "score" ? "score" : action === "demo" ? "demo" : "match",
    formats,
    matches,
    honesty: checkHonesty(formats),
    summary,
  };
}
