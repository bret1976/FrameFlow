/**
 * PairPack — title + thumbnail packaging linter.
 *
 * Idea inspired by Jakeschincariol/youtube-agent-skill (MIT) /yt-package
 * title+thumbnail pairing lint. This is an original FrameFlow TypeScript
 * implementation (no vendored Python, no cloned skill prompts). Pure
 * functions, local-first, no API keys.
 *
 * Complementary to: HookBank (spoken hook formulas), DeliveryGate
 * (metadata presence / export matrix), PromoteGate (render QA),
 * ViralJudge (heuristic GO/WARN). PairPack scores the click surface
 * as ONE unit: title and thumbnail must not say the same words twice.
 */

export type PairPackAction = "check" | "rank" | "demo" | "defaults" | "brief";

export type PairIssue = {
  id: string;
  ok: boolean;
  label: string;
  detail: string;
};

export type PairScore = {
  title: string;
  thumb?: string;
  chars: number;
  score: number;
  verdict: "SHIP" | "TWEAK" | "REWRITE";
  issues: PairIssue[];
  goods: string[];
};

export type PairPackRequest = {
  action?: PairPackAction;
  demo?: boolean;
  /** Primary title to lint. */
  title?: string;
  /** Thumbnail on-image text (3 words max ideal). */
  thumb?: string;
  /** Multiple titles for rank (one per line or array). */
  titles?: string[] | string;
  /** Optional niche hint for brief suggestions. */
  niche?: string;
};

export type PairPackResult = {
  ok: true;
  source: "pair-pack-1.0";
  action: string;
  summary: string;
  verdict?: "SHIP" | "TWEAK" | "REWRITE";
  score?: number;
  pair?: PairScore;
  ranked?: PairScore[];
  brief?: {
    title: string;
    thumb_words: string[];
    expression: string;
    framing: string;
    contrast_note: string;
    do_not_repeat: string[];
  };
  defaults?: {
    desktop_chars: number;
    mobile_chars: number;
    hard_chars: number;
    thumb_word_max: number;
    caps_word_max: number;
  };
  notes?: string[];
};

export type PairPackParseResult =
  | { ok: true; request: PairPackRequest }
  | { ok: false; error: string };

const DESKTOP = 60;
const MOBILE = 40;
const HARD = 100;
const THUMB_WORD_MAX = 3;
const CAPS_WORD_MAX = 2;

const VAGUE = new Set([
  "amazing",
  "incredible",
  "insane",
  "crazy",
  "huge",
  "massive",
  "ultimate",
  "best",
  "powerful",
  "secret",
  "revolutionary",
  "mindblowing",
  "epic",
  "perfect",
  "complete",
  "everything",
  "unbelievable",
  "gamechanging",
  "game-changing",
]);

const STOP = new Set([
  "the",
  "a",
  "an",
  "of",
  "for",
  "to",
  "in",
  "on",
  "and",
  "or",
  "is",
  "are",
  "with",
  "your",
  "you",
  "my",
  "i",
  "this",
  "that",
  "it",
  "how",
  "what",
  "why",
  "when",
  "from",
]);

const asString = (v: unknown): string =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

const asTitles = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(asString).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    return v
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
};

const words = (t: string): string[] => {
  const m = t.toLowerCase().match(/[a-z0-9']+/g);
  return m || [];
};

const contentWords = (t: string): Set<string> => {
  const out = new Set<string>();
  for (const w of words(t)) {
    if (!STOP.has(w) && w.length > 1) out.add(w);
  }
  return out;
};

export const scorePair = (title: string, thumb?: string): PairScore => {
  const t = title.trim();
  const n = t.length;
  const issues: PairIssue[] = [];
  const goods: string[] = [];

  if (!t) {
    issues.push({
      id: "missing",
      ok: false,
      label: "Title",
      detail: "Pass title: string to lint the click surface",
    });
    return {
      title: t,
      thumb,
      chars: 0,
      score: 0,
      verdict: "REWRITE",
      issues,
      goods,
    };
  }

  if (n > HARD) {
    issues.push({
      id: "hard_length",
      ok: false,
      label: "Hard length",
      detail: `${n} characters — YouTube hard-cuts near ${HARD}`,
    });
  } else if (n > DESKTOP) {
    issues.push({
      id: "desktop_length",
      ok: false,
      label: "Desktop truncation",
      detail: `${n} characters — desktop search cuts near ${DESKTOP}`,
    });
  } else {
    goods.push(`${n} chars inside the ${DESKTOP}-char desktop cut`);
    issues.push({
      id: "desktop_length",
      ok: true,
      label: "Desktop truncation",
      detail: `${n} ≤ ${DESKTOP} — subject survives search cut`,
    });
  }

  if (n > MOBILE) {
    const head = t.slice(0, MOBILE).replace(/\s+\S*$/, "");
    issues.push({
      id: "mobile_length",
      ok: false,
      label: "Mobile feed cut",
      detail: `Mobile home shows about "${head}…" — check the subject survives`,
    });
  } else {
    issues.push({
      id: "mobile_length",
      ok: true,
      label: "Mobile feed cut",
      detail: `${n} ≤ ${MOBILE} — full title visible on mobile feed`,
    });
  }

  const caps = t.split(/\s+/).filter((w) => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (caps.length > CAPS_WORD_MAX) {
    issues.push({
      id: "shouting",
      ok: false,
      label: "All-caps spam",
      detail: `${caps.length} ALL-CAPS words — ceiling is ${CAPS_WORD_MAX} before it reads as spam`,
    });
  } else if (caps.length) {
    goods.push(`${caps.length} ALL-CAPS word(s) for emphasis`);
    issues.push({
      id: "shouting",
      ok: true,
      label: "All-caps spam",
      detail: `${caps.length} ≤ ${CAPS_WORD_MAX} caps words`,
    });
  } else {
    issues.push({
      id: "shouting",
      ok: true,
      label: "All-caps spam",
      detail: "No ALL-CAPS shouting",
    });
  }

  const vagueHits = [...new Set(words(t).filter((w) => VAGUE.has(w)))];
  if (vagueHits.length) {
    issues.push({
      id: "vague",
      ok: false,
      label: "Vague adjectives",
      detail: `${vagueHits.join(", ")} — swap for a number, name, or date`,
    });
  } else {
    issues.push({
      id: "vague",
      ok: true,
      label: "Vague adjectives",
      detail: "No empty hype adjectives",
    });
  }

  const nums = t.match(/\d[\d,.]*%?/g) || [];
  const hasNamey = /\b[A-Z][a-z]{2,}\b/.test(t) && !/^(The|This|That|How|Why|What)\b/.test(t);
  if (nums.length) {
    goods.push(`carries a concrete figure (${nums.slice(0, 3).join(", ")})`);
    issues.push({
      id: "concrete",
      ok: true,
      label: "Number / date / name",
      detail: `Concrete figure: ${nums.slice(0, 3).join(", ")}`,
    });
  } else if (hasNamey) {
    goods.push("carries a proper-name signal");
    issues.push({
      id: "concrete",
      ok: true,
      label: "Number / date / name",
      detail: "Proper-name signal present (still prefer a number when you have one)",
    });
  } else {
    issues.push({
      id: "concrete",
      ok: false,
      label: "Number / date / name",
      detail: "No number, date, or clear name — the most reliable single fix",
    });
  }

  if (t.endsWith("?")) {
    goods.push("open question in the title");
  }

  const front = words(t).slice(0, 3).filter((w) => !STOP.has(w));
  if (!front.length) {
    issues.push({
      id: "front_load",
      ok: false,
      label: "Front-load",
      detail: "First three words are filler — move the subject forward",
    });
  } else {
    issues.push({
      id: "front_load",
      ok: true,
      label: "Front-load",
      detail: `Subject early: ${front.join(" ")}`,
    });
  }

  if (thumb && thumb.trim()) {
    const tw = contentWords(t);
    const hw = contentWords(thumb);
    const shared = [...tw].filter((w) => hw.has(w)).sort();
    if (shared.length) {
      issues.push({
        id: "duplicate",
        ok: false,
        label: "Title ↔ thumb duplicate",
        detail: `Thumbnail repeats title on: ${shared.join(", ")} — thumb should say what the title does not`,
      });
    } else {
      goods.push("thumbnail and title carry different content words");
      issues.push({
        id: "duplicate",
        ok: true,
        label: "Title ↔ thumb duplicate",
        detail: "No overlapping content words — pairing works as one unit",
      });
    }
    const thumbWordCount = words(thumb).length;
    if (thumbWordCount > THUMB_WORD_MAX) {
      issues.push({
        id: "thumb_length",
        ok: false,
        label: "Thumb word ceiling",
        detail: `${thumbWordCount} words on the thumbnail — ${THUMB_WORD_MAX} is the ceiling at feed size`,
      });
    } else {
      issues.push({
        id: "thumb_length",
        ok: true,
        label: "Thumb word ceiling",
        detail: `${thumbWordCount} ≤ ${THUMB_WORD_MAX} words at feed size`,
      });
    }
  } else {
    issues.push({
      id: "thumb_missing",
      ok: false,
      label: "Thumbnail text",
      detail: "Pass thumb: string so PairPack can lint the pairing (not just the title)",
    });
  }

  const fails = issues.filter((i) => !i.ok).length;
  const score = Math.max(0, Math.min(100, 100 - 14 * fails + 4 * goods.length));
  const verdict: PairScore["verdict"] =
    fails === 0 ? "SHIP" : fails <= 2 ? "TWEAK" : "REWRITE";

  return { title: t, thumb: thumb?.trim() || undefined, chars: n, score, verdict, issues, goods };
};

const buildBrief = (title: string, niche?: string): PairPackResult["brief"] => {
  const cw = [...contentWords(title)];
  // Prefer nouns that are NOT already in the title for thumb suggestion —
  // complementary words that extend the promise.
  const complementPool = [
    "STOP",
    "WATCH",
    "DO THIS",
    "BEFORE",
    "PROOF",
    "FIX IT",
    "DAY 1",
    "REAL",
    "SKIP",
  ];
  const avoid = new Set(cw);
  const thumb_words = complementPool
    .filter((phrase) => !words(phrase).some((w) => avoid.has(w)))
    .slice(0, 1);
  const pick = thumb_words[0] || "DO THIS";
  return {
    title,
    thumb_words: pick.split(/\s+/).slice(0, THUMB_WORD_MAX),
    expression: "direct eye-line, mid-shock — readable at 120px feed",
    framing: "subject left/right thirds; leave center clear for 2–3 big words",
    contrast_note:
      niche && niche.trim()
        ? `High contrast for ${niche.trim()} niche — pale text on dark plate, never grey-on-grey`
        : "High contrast pale text on dark plate — never grey-on-grey at feed size",
    do_not_repeat: cw.slice(0, 8),
  };
};

export const parsePairPackRequest = (
  body: Record<string, unknown>
): PairPackParseResult => {
  const actionRaw = asString(
    body.action || (body.demo ? "demo" : "check")
  ).toLowerCase();
  const allowed: PairPackAction[] = ["check", "rank", "demo", "defaults", "brief"];
  if (!allowed.includes(actionRaw as PairPackAction)) {
    return {
      ok: false,
      error: `Unknown action "${actionRaw}". Use check|rank|demo|defaults|brief.`,
    };
  }
  return {
    ok: true,
    request: {
      action: actionRaw as PairPackAction,
      demo: Boolean(body.demo),
      title: asString(body.title) || undefined,
      thumb: asString(body.thumb) || undefined,
      titles: asTitles(body.titles).length ? asTitles(body.titles) : undefined,
      niche: asString(body.niche) || undefined,
    },
  };
};

export const runPairPack = (req: PairPackRequest): PairPackResult => {
  const action = req.action || "check";

  if (action === "defaults") {
    return {
      ok: true,
      source: "pair-pack-1.0",
      action,
      summary: "PairPack defaults — title + thumbnail as one click-surface unit.",
      defaults: {
        desktop_chars: DESKTOP,
        mobile_chars: MOBILE,
        hard_chars: HARD,
        thumb_word_max: THUMB_WORD_MAX,
        caps_word_max: CAPS_WORD_MAX,
      },
      notes: [
        "Title and thumbnail are ONE unit — never write them separately.",
        "Thumbnail must not repeat title content words.",
        "Never invent a number/result for the title — ask or omit.",
      ],
    };
  }

  if (action === "demo") {
    const good = scorePair("I cut Shorts retention drop by 37%", "DO THIS");
    const bad = scorePair(
      "The ULTIMATE INSANE Secret to Amazing YouTube Shorts Growth Everything You Need",
      "AMAZING SHORTS GROWTH SECRET"
    );
    return {
      ok: true,
      source: "pair-pack-1.0",
      action,
      summary: `Demo: good pair ${good.score}/100 (${good.verdict}) vs bad ${bad.score}/100 (${bad.verdict})`,
      ranked: [good, bad],
      notes: [
        "Good pair: concrete number + complementary 2-word thumb.",
        "Bad pair: vague shouting + thumb that repeats the title.",
      ],
    };
  }

  if (action === "rank") {
    const list =
      req.titles && req.titles.length
        ? req.titles
        : req.title
          ? [req.title]
          : [];
    if (!list.length) {
      return {
        ok: true,
        source: "pair-pack-1.0",
        action,
        summary: "No titles to rank — pass titles: string[] or newline-separated string",
        ranked: [],
        notes: ["Example: titles: [\"Cut drop by 37%\", \"Stop posting daily\"]"],
      };
    }
    const ranked = list
      .map((title) => scorePair(title, req.thumb))
      .sort((a, b) => b.score - a.score);
    return {
      ok: true,
      source: "pair-pack-1.0",
      action,
      summary: `Ranked ${ranked.length} title(s) · top ${ranked[0]?.score ?? 0}/100`,
      ranked,
      verdict: ranked[0]?.verdict,
      score: ranked[0]?.score,
      notes: req.thumb
        ? undefined
        : ["No thumb passed — rank is title-only; add thumb for full pairing lint."],
    };
  }

  if (action === "brief") {
    const title =
      req.title ||
      (req.demo ? "I cut Shorts retention drop by 37%" : "");
    if (!title) {
      return {
        ok: true,
        source: "pair-pack-1.0",
        action,
        summary: "No title for brief — pass title: string",
        notes: ["Brief suggests complementary thumb words that do NOT repeat the title."],
      };
    }
    const pair = scorePair(title, req.thumb);
    const brief = buildBrief(title, req.niche);
    // If user already supplied thumb, score it; else attach suggested thumb for a second pass hint
    const suggested = brief.thumb_words.join(" ");
    const withSuggested = req.thumb ? pair : scorePair(title, suggested);
    return {
      ok: true,
      source: "pair-pack-1.0",
      action,
      summary: `Thumb brief for "${title.slice(0, 64)}" · pair ${withSuggested.score}/100`,
      pair: withSuggested,
      brief,
      verdict: withSuggested.verdict,
      score: withSuggested.score,
      notes: [
        "Ship it, or change it? PairPack never publishes — you do.",
        `Suggested thumb words: ${suggested}`,
      ],
    };
  }

  // check (default)
  const title =
    req.title ||
    (req.demo ? "I cut Shorts retention drop by 37%" : "");
  const thumb = req.thumb || (req.demo ? "DO THIS" : undefined);
  const pair = scorePair(title, thumb);
  return {
    ok: true,
    source: "pair-pack-1.0",
    action: "check",
    summary: title
      ? `Pair check → ${pair.verdict} · ${pair.score}/100`
      : "No title provided",
    pair,
    verdict: pair.verdict,
    score: pair.score,
    notes: pair.goods.length ? pair.goods.slice(0, 4) : undefined,
  };
};
