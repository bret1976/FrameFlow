/**
 * HookBank — rotating short-form hook formula bank.
 *
 * Idea inspired by hoyosclaudio11-svg/ShortsForgeAI (MIT) rotating hook
 * formulas. This is an original FrameFlow TypeScript implementation with
 * English formulas (no vendored JSON, no cloned Spanish copy). Pure
 * functions, local-first, no API keys.
 *
 * Complementary to: ViralJudge (heuristic GO/WARN), DeliveryGate
 * (open/mid/close checkpoints), StickyCue (caption burn-in).
 */

export type HookTrigger =
  | "curiosity"
  | "contrarian"
  | "authority"
  | "emotional"
  | "list"
  | "question"
  | "story"
  | "negation";

export type HookBankAction =
  | "list"
  | "pick"
  | "fill"
  | "rotate"
  | "check"
  | "demo"
  | "defaults"
  | "triggers";

export type HookFormula = {
  id: string;
  trigger: HookTrigger;
  formula: string;
  example: string;
  /** When true, filler must supply a real number/fact slot — never invent. */
  needs_data?: boolean;
};

export type HookPick = {
  id: string;
  trigger: HookTrigger;
  formula: string;
  filled: string;
  example: string;
  needs_data: boolean;
  rotation_index: number;
};

export type HookBankRequest = {
  action?: HookBankAction;
  demo?: boolean;
  /** Topic / niche for [topic] and related slots. */
  topic?: string;
  niche?: string;
  /** Free-form slot map: thing, problem, result, number, etc. */
  slots?: Record<string, string>;
  /** Prefer one trigger (omit for any). */
  trigger?: HookTrigger | string;
  /** Previously used formula ids to skip (rotation memory). */
  used_ids?: string[];
  /** How many picks to return (1–5). */
  count?: number;
  /** Candidate hook line to score against bank patterns. */
  hook?: string;
};

export type HookCheck = {
  id: string;
  ok: boolean;
  label: string;
  detail: string;
};

export type HookBankResult = {
  ok: true;
  source: "hook-bank-1.0";
  action: string;
  summary: string;
  formulas?: HookFormula[];
  picks?: HookPick[];
  triggers?: { id: HookTrigger; count: number; label: string }[];
  checks?: HookCheck[];
  verdict?: "STRONG" | "OK" | "WEAK";
  defaults?: {
    count: number;
    triggers: HookTrigger[];
    slot_keys: string[];
  };
  notes?: string[];
};

export type HookBankParseResult =
  | { ok: true; request: HookBankRequest }
  | { ok: false; error: string };

const TRIGGERS: HookTrigger[] = [
  "curiosity",
  "contrarian",
  "authority",
  "emotional",
  "list",
  "question",
  "story",
  "negation",
];

const TRIGGER_LABEL: Record<HookTrigger, string> = {
  curiosity: "Curiosity gap",
  contrarian: "Contrarian take",
  authority: "Authority / proof",
  emotional: "Emotional mirror",
  list: "List / kit",
  question: "Direct question",
  story: "Micro-story",
  negation: "Negation / myth-bust",
};

/** Original English bank — 40 formulas, 5 per trigger. */
export const HOOK_FORMULAS: HookFormula[] = [
  { id: "c01", trigger: "curiosity", formula: "Nobody talks about [thing] in [niche]", example: "Nobody talks about why Shorts die after 3am" },
  { id: "c02", trigger: "curiosity", formula: "I figured out why [problem] keeps happening", example: "I figured out why your clips never convert" },
  { id: "c03", trigger: "curiosity", formula: "The [niche] industry doesn't want you to know this", example: "The creator-tool industry doesn't want you to know this" },
  { id: "c04", trigger: "curiosity", formula: "What happens if you [action] for [time]", example: "What happens if you post 3x/day for 90 days" },
  { id: "c05", trigger: "curiosity", formula: "The hidden cost of [thing]", example: "The hidden cost of posting every day" },

  { id: "x01", trigger: "contrarian", formula: "Stop [common_advice]", example: "Stop posting every day — do this instead" },
  { id: "x02", trigger: "contrarian", formula: "[Popular_strategy] is dead. This replaced it", example: "Hashtag hunting is dead. This replaced it" },
  { id: "x03", trigger: "contrarian", formula: "Unpopular opinion: [bold_claim]", example: "Unpopular opinion: Canva templates are killing your brand" },
  { id: "x04", trigger: "contrarian", formula: "I quit [popular_thing] and [positive_result]", example: "I quit daily Reels and my reach doubled" },
  { id: "x05", trigger: "contrarian", formula: "If you still [habit], stop", example: "If you still cold-DM like it's 2019, stop" },

  { id: "a01", trigger: "authority", formula: "I hit [result] in [time]. Here's the breakdown", example: "I hit 100k followers in 6 months. Here's the breakdown", needs_data: true },
  { id: "a02", trigger: "authority", formula: "After reviewing [number] [things], this is what works", example: "After reviewing 500 viral posts, this is what works", needs_data: true },
  { id: "a03", trigger: "authority", formula: "[number] years of [experience] taught me one lesson", example: "8 years of freelance taught me one brutal lesson", needs_data: true },
  { id: "a04", trigger: "authority", formula: "My [metric] went from [before] to [after] when I changed one thing", example: "My CTR went from 2% to 11% when I changed thumbnails", needs_data: true },
  { id: "a05", trigger: "authority", formula: "I tried [number] [things]. Only one worked", example: "I tried 13 subject lines. Only one worked", needs_data: true },

  { id: "e01", trigger: "emotional", formula: "If you're stuck on [pain], this is for you", example: "If you're stuck under 1k followers, this is for you" },
  { id: "e02", trigger: "emotional", formula: "This is for the [role] who [struggle]", example: "This is for the creator who posts daily and gets silence" },
  { id: "e03", trigger: "emotional", formula: "I almost quit [thing] until [turning_point]", example: "I almost quit YouTube until I found this hook" },
  { id: "e04", trigger: "emotional", formula: "You're not [negative_belief] — you're missing [fix]", example: "You're not bad at this — you're missing better hooks" },
  { id: "e05", trigger: "emotional", formula: "For the person who needs to hear this…", example: "For the person about to quit: watch this first" },

  { id: "l01", trigger: "list", formula: "[number] [things] that actually move the needle", example: "5 hooks that actually move the needle", needs_data: true },
  { id: "l02", trigger: "list", formula: "[number] mistakes I made so you don't have to", example: "6 mistakes I made shipping short-form", needs_data: true },
  { id: "l03", trigger: "list", formula: "The starter kit for [topic] (save this)", example: "The starter kit for faceless Shorts (save this)" },
  { id: "l04", trigger: "list", formula: "[number] underrated [things] that actually work", example: "5 underrated cuts that actually retain", needs_data: true },
  { id: "l05", trigger: "list", formula: "[number] things I wish I knew at [stage]", example: "7 things I wish I knew at 0 followers", needs_data: true },

  { id: "q01", trigger: "question", formula: "Why does [annoyance] keep happening?", example: "Why does your retention cliff at second 3?" },
  { id: "q02", trigger: "question", formula: "What if everything you know about [topic] is wrong?", example: "What if everything you know about posting daily is wrong?" },
  { id: "q03", trigger: "question", formula: "Are you making this [niche] mistake?", example: "Are you making this Shorts mistake?" },
  { id: "q04", trigger: "question", formula: "Can you guess [striking_fact]?", example: "Can you guess how fast viewers decide to scroll?" },
  { id: "q05", trigger: "question", formula: "Why does nobody talk about [thing]?", example: "Why does nobody talk about end-card chaining?" },

  { id: "s01", trigger: "story", formula: "Last week [unexpected_thing] happened", example: "Last week a stranger DMed me this retention chart" },
  { id: "s02", trigger: "story", formula: "[number] years ago I was [low]. Today [high]", example: "3 years ago I slept in my car. Today I bought my parents a house", needs_data: true },
  { id: "s03", trigger: "story", formula: "I almost made the worst [career] mistake", example: "I almost made the worst career mistake" },
  { id: "s04", trigger: "story", formula: "POV: you're [scenario]", example: "POV: you're the new editor and nobody explains the cut" },
  { id: "s05", trigger: "story", formula: "The day I realized [revelation]…", example: "The day I realized I was the bottleneck…" },

  { id: "n01", trigger: "negation", formula: "It wasn't [common_belief].", example: "It wasn't the algorithm." },
  { id: "n02", trigger: "negation", formula: "[Popular_belief] is a lie.", example: "'Just be consistent' is a lie." },
  { id: "n03", trigger: "negation", formula: "It's not [apparent_cause] — it's [real_cause]", example: "It's not willpower — it's bad hooks" },
  { id: "n04", trigger: "negation", formula: "Forget what they told you about [topic]", example: "Forget what they told you about posting times" },
  { id: "n05", trigger: "negation", formula: "[Popular_thing] doesn't work. Here's why", example: "Hashtag stuffing doesn't work. Here's why" },
];

const SLOT_ALIASES: Record<string, string[]> = {
  topic: ["topic", "niche", "subject"],
  niche: ["niche", "topic", "vertical"],
  thing: ["thing", "topic", "subject"],
  problem: ["problem", "pain", "annoyance"],
  pain: ["pain", "problem", "struggle"],
  action: ["action", "habit"],
  time: ["time", "duration"],
  common_advice: ["common_advice", "advice", "habit"],
  popular_strategy: ["popular_strategy", "strategy", "popular_thing"],
  bold_claim: ["bold_claim", "claim"],
  popular_thing: ["popular_thing", "thing", "habit"],
  positive_result: ["positive_result", "result", "after"],
  habit: ["habit", "action"],
  result: ["result", "after", "high"],
  number: ["number", "n", "count"],
  things: ["things", "thing"],
  experience: ["experience", "role"],
  metric: ["metric"],
  before: ["before"],
  after: ["after", "result"],
  role: ["role", "person"],
  struggle: ["struggle", "pain", "problem"],
  turning_point: ["turning_point", "fix"],
  negative_belief: ["negative_belief"],
  fix: ["fix", "solution"],
  stage: ["stage"],
  annoyance: ["annoyance", "problem"],
  striking_fact: ["striking_fact", "fact", "number"],
  unexpected_thing: ["unexpected_thing", "thing"],
  low: ["low", "before"],
  high: ["high", "after", "result"],
  career: ["career", "role"],
  scenario: ["scenario", "role"],
  revelation: ["revelation", "thing"],
  common_belief: ["common_belief", "popular_belief"],
  popular_belief: ["popular_belief", "common_belief"],
  apparent_cause: ["apparent_cause", "cause"],
  real_cause: ["real_cause", "fix"],
};

const isTrigger = (v: unknown): v is HookTrigger =>
  typeof v === "string" && (TRIGGERS as string[]).includes(v);

const asString = (v: unknown): string =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

const asStringMap = (v: unknown): Record<string, string> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const s = asString(val);
    if (s) out[k.toLowerCase()] = s;
  }
  return out;
};

const asStringList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(asString).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    return v.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

export const parseHookBankRequest = (
  body: Record<string, unknown>
): HookBankParseResult => {
  const actionRaw = asString(body.action || (body.demo ? "demo" : "pick")).toLowerCase();
  const allowed: HookBankAction[] = [
    "list",
    "pick",
    "fill",
    "rotate",
    "check",
    "demo",
    "defaults",
    "triggers",
  ];
  if (!allowed.includes(actionRaw as HookBankAction)) {
    return {
      ok: false,
      error: `Unknown action "${actionRaw}". Use list|pick|fill|rotate|check|demo|defaults|triggers.`,
    };
  }
  const triggerRaw = asString(body.trigger);
  if (triggerRaw && !isTrigger(triggerRaw)) {
    return {
      ok: false,
      error: `Unknown trigger "${triggerRaw}". Use ${TRIGGERS.join("|")}.`,
    };
  }
  let count = Number(body.count);
  if (!Number.isFinite(count) || count <= 0) count = 3;
  count = Math.min(5, Math.max(1, Math.floor(count)));

  return {
    ok: true,
    request: {
      action: actionRaw as HookBankAction,
      demo: Boolean(body.demo),
      topic: asString(body.topic),
      niche: asString(body.niche),
      slots: asStringMap(body.slots),
      trigger: triggerRaw || undefined,
      used_ids: asStringList(body.used_ids),
      count,
      hook: asString(body.hook),
    },
  };
};

const resolveSlot = (
  key: string,
  slots: Record<string, string>,
  topic: string,
  niche: string
): string => {
  const k = key.toLowerCase();
  if (slots[k]) return slots[k];
  const aliases = SLOT_ALIASES[k] || [k];
  for (const a of aliases) {
    if (slots[a]) return slots[a];
  }
  if (k === "topic" || k === "niche" || k === "thing" || k === "subject") {
    return niche || topic || slots.topic || slots.niche || `[${key}]`;
  }
  if (topic && (k === "problem" || k === "pain" || k === "annoyance")) {
    return slots.problem || `getting ${topic} to land`;
  }
  return `[${key}]`;
};

export const fillFormula = (
  formula: string,
  slots: Record<string, string>,
  topic: string,
  niche: string
): string =>
  formula.replace(/\[([a-zA-Z0-9_]+)\]/g, (_, key: string) =>
    resolveSlot(key, slots, topic, niche)
  );

const hashSeed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const pickFormulas = (
  req: HookBankRequest
): { picks: HookPick[]; pool_size: number } => {
  const topic = req.topic || "";
  const niche = req.niche || req.topic || "";
  const slots = { ...(req.slots || {}) };
  if (topic && !slots.topic) slots.topic = topic;
  if (niche && !slots.niche) slots.niche = niche;

  const used = new Set((req.used_ids || []).map((x) => x.toLowerCase()));
  let pool = HOOK_FORMULAS.filter((f) => !used.has(f.id.toLowerCase()));
  if (req.trigger && isTrigger(req.trigger)) {
    pool = pool.filter((f) => f.trigger === req.trigger);
  }
  if (pool.length === 0) {
    pool = HOOK_FORMULAS.filter((f) =>
      req.trigger && isTrigger(req.trigger) ? f.trigger === req.trigger : true
    );
  }

  const seed = hashSeed(
    `${topic}|${niche}|${req.trigger || ""}|${(req.used_ids || []).join(",")}|${req.count}`
  );
  const ranked = [...pool].sort((a, b) => {
    const ha = hashSeed(a.id + String(seed)) % 9973;
    const hb = hashSeed(b.id + String(seed)) % 9973;
    return ha - hb;
  });

  const count = req.count || 3;
  const picks: HookPick[] = ranked.slice(0, count).map((f, i) => ({
    id: f.id,
    trigger: f.trigger,
    formula: f.formula,
    filled: fillFormula(f.formula, slots, topic, niche),
    example: f.example,
    needs_data: Boolean(f.needs_data),
    rotation_index: i,
  }));
  return { picks, pool_size: pool.length };
};

const checkHook = (hook: string): { checks: HookCheck[]; verdict: "STRONG" | "OK" | "WEAK" } => {
  const text = hook.trim();
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const checks: HookCheck[] = [];

  const lenOk = words.length >= 4 && words.length <= 18;
  checks.push({
    id: "length",
    ok: lenOk,
    label: "Length",
    detail: lenOk
      ? `${words.length} words (sweet spot 4–18)`
      : `${words.length} words — aim for 4–18 spoken words on frame zero`,
  });

  const hasQuestion = /[?]/.test(text) || /^(why|what|how|are|can|do|did|is)\b/i.test(text);
  const hasNegation = /\b(not|stop|quit|never|don't|forget|lie|dead)\b/i.test(text);
  const hasNumber = /\b\d+\b/.test(text) || /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(text);
  const hasSpecific = /\[.+\]/.test(text) === false && (hasNumber || /\b(you|your)\b/i.test(text));

  checks.push({
    id: "pattern",
    ok: hasQuestion || hasNegation || hasNumber,
    label: "Pattern signal",
    detail: hasQuestion
      ? "Question / curiosity opener detected"
      : hasNegation
        ? "Negation / stop-doing pattern detected"
        : hasNumber
          ? "Authority / list number detected"
          : "No clear question, negation, or number — bank can suggest one",
  });

  checks.push({
    id: "specificity",
    ok: hasSpecific && words.length >= 4,
    label: "Specificity",
    detail: hasSpecific
      ? "Mentions you/your or a concrete number"
      : "Add a concrete noun, number, or 'you/your' address",
  });

  const frameZero =
    !/\b(in this video|today we|welcome back|hey guys|subscribe)\b/i.test(lower);
  checks.push({
    id: "frame_zero",
    ok: frameZero,
    label: "Frame-zero ready",
    detail: frameZero
      ? "No soft channel greeting — can sit on frame 1"
      : "Drop channel filler; lead with the claim on frame 1",
  });

  const fail = checks.filter((c) => !c.ok).length;
  const verdict = fail === 0 ? "STRONG" : fail === 1 ? "OK" : "WEAK";
  return { checks, verdict };
};

const demoPicks = (): HookPick[] => {
  const req: HookBankRequest = {
    action: "pick",
    topic: "faceless YouTube Shorts",
    niche: "short-form",
    slots: {
      thing: "end-card chaining",
      problem: "dropping viewers at second 3",
      number: "3",
      result: "doubled average view duration",
    },
    count: 3,
    used_ids: [],
  };
  return pickFormulas(req).picks;
};

export const runHookBank = (req: HookBankRequest): HookBankResult => {
  const action = req.action || "pick";

  if (action === "defaults") {
    return {
      ok: true,
      source: "hook-bank-1.0",
      action,
      summary: "HookBank defaults — 40 English formulas across 8 triggers.",
      defaults: {
        count: 3,
        triggers: [...TRIGGERS],
        slot_keys: [
          "topic",
          "niche",
          "thing",
          "problem",
          "number",
          "result",
          "pain",
          "habit",
        ],
      },
      notes: [
        "Formulas with needs_data=true require a real number/fact — never invent.",
        "Pass used_ids to rotate away from recently shipped hooks.",
      ],
    };
  }

  if (action === "triggers") {
    const triggers = TRIGGERS.map((id) => ({
      id,
      count: HOOK_FORMULAS.filter((f) => f.trigger === id).length,
      label: TRIGGER_LABEL[id],
    }));
    return {
      ok: true,
      source: "hook-bank-1.0",
      action,
      summary: `${triggers.length} triggers · ${HOOK_FORMULAS.length} formulas`,
      triggers,
    };
  }

  if (action === "list") {
    let formulas = HOOK_FORMULAS;
    if (req.trigger && isTrigger(req.trigger)) {
      formulas = formulas.filter((f) => f.trigger === req.trigger);
    }
    return {
      ok: true,
      source: "hook-bank-1.0",
      action,
      summary: `${formulas.length} formulas` + (req.trigger ? ` · trigger ${req.trigger}` : ""),
      formulas,
    };
  }

  if (action === "demo") {
    const picks = demoPicks();
    return {
      ok: true,
      source: "hook-bank-1.0",
      action,
      summary: `Demo: ${picks.length} rotated hooks for faceless YouTube Shorts`,
      picks,
      notes: ["Demo uses fixed topic + slots; production calls pass your own used_ids."],
    };
  }

  if (action === "check") {
    const hook = req.hook || (req.demo ? "Stop posting every day — do this instead" : "");
    if (!hook) {
      return {
        ok: true,
        source: "hook-bank-1.0",
        action,
        summary: "No hook text provided",
        checks: [
          {
            id: "missing",
            ok: false,
            label: "Hook text",
            detail: "Pass hook: string to score against bank heuristics",
          },
        ],
        verdict: "WEAK",
      };
    }
    const { checks, verdict } = checkHook(hook);
    return {
      ok: true,
      source: "hook-bank-1.0",
      action,
      summary: `Hook check → ${verdict}`,
      checks,
      verdict,
      notes: [`Scored: ${hook.slice(0, 160)}`],
    };
  }

  // pick | fill | rotate — same core
  const { picks, pool_size } = pickFormulas(req);
  const unused = (req.used_ids || []).length;
  return {
    ok: true,
    source: "hook-bank-1.0",
    action: action === "fill" ? "fill" : action === "rotate" ? "rotate" : "pick",
    summary: `${picks.length} hook(s) from pool ${pool_size}` + (unused ? ` · skipped ${unused} used_ids` : ""),
    picks,
    notes: picks.some((p) => p.needs_data)
      ? ["At least one pick needs_data — fill number/result with real brief facts."]
      : undefined,
  };
};
