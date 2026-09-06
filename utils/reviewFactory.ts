/**
 * ReviewFactory — review-first quality gate + lexical duplicate detection
 * for vertical video script drafts / batch topics.
 * Idea inspired by foxnaim/content-factory (MIT; reimplement only —
 * original FrameFlow TypeScript, no clone of their monorepo).
 * Pure functions, local-first, no network.
 */

export type ReviewStatus =
  | "draft"
  | "queued"
  | "qa_pending"
  | "ready_for_review"
  | "approved"
  | "rejected";

export type ScriptScene = {
  index: number;
  duration_sec: number;
  voiceover: string;
  subtitle: string;
  visual_type?: string;
  visual_prompt?: string;
  stock_query?: string | null;
  transition?: string;
};

export type SourceNote = {
  claim: string;
  source_url?: string | null;
  source_title?: string | null;
  verification_status: "verified" | "needs_review" | "not_applicable";
  note?: string | null;
};

export type VideoScriptDraft = {
  id?: string;
  topic?: string;
  title: string;
  description?: string;
  hook: string;
  language?: string;
  target_duration_sec: number;
  fact_check_required?: boolean;
  scenes: ScriptScene[];
  cta: string;
  source_notes?: SourceNote[];
};

export type DuplicateSignal = {
  candidateId: string;
  topicSimilarity: number;
  titleSimilarity: number;
  scriptSimilarity: number;
  shouldBlock: boolean;
};

export type QualityGateResult = {
  passed: boolean;
  needsHumanFactCheck: boolean;
  blockers: string[];
  warnings: string[];
};

export type BatchTopic = {
  id: string;
  topic: string;
  language?: string;
  target_duration_sec?: number;
  hook?: string;
  notes?: string;
};

export type ReviewFactoryRequest = {
  /** Run quality + duplicate check on one script. */
  script?: VideoScriptDraft;
  /** Prior scripts/topics to compare against (lexical Jaccard). */
  candidates?: Array<{
    id: string;
    topic?: string;
    script?: VideoScriptDraft;
    title?: string;
    text?: string;
  }>;
  /** CSV or JSON array of batch topics to parse + validate. */
  batch_text?: string;
  batch_format?: "csv" | "json" | "auto";
  /** Desired status transition from current. */
  status?: ReviewStatus;
  action?: "approve" | "reject" | "queue" | "ready" | "fact_check";
  reviewer?: string;
  reason?: string;
  demo?: boolean;
};

export type ReviewFactoryResult = {
  ok: true;
  quality?: QualityGateResult;
  duplicates?: DuplicateSignal[];
  status?: ReviewStatus;
  allowed_next?: ReviewStatus[];
  batch?: {
    count: number;
    topics: BatchTopic[];
    errors: string[];
  };
  summary: string;
};

const TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  draft: ["queued", "rejected"],
  queued: ["qa_pending", "ready_for_review", "rejected"],
  qa_pending: ["ready_for_review", "rejected"],
  ready_for_review: ["approved", "rejected", "queued"],
  approved: [],
  rejected: ["draft"],
};

const PROHIBITED = [
  /guaranteed\s+(income|views|monetization)/i,
  /100%\s+(monetization|success)/i,
  /earn\s+\$?\d+\s+in\s+\d+\s+days?/i,
  /fake\s+(account|address|document)/i,
  /buy\s+(views|subscribers|watch\s*hours)/i,
];

const DEMO_SCRIPT: VideoScriptDraft = {
  id: "demo-1",
  topic: "compound interest for creators",
  title: "The 1% Fee That Quietly Eats Your Channel",
  description: "A short vertical explaining how platform fees and ad splits compound against creator income.",
  hook: "You keep posting. Platforms keep taking. Watch the math.",
  language: "en",
  target_duration_sec: 45,
  fact_check_required: true,
  scenes: [
    {
      index: 0,
      duration_sec: 8,
      voiceover: "Every view looks free until the cut hits.",
      subtitle: "Every view looks free",
      visual_type: "motion_graphic",
      visual_prompt: "simple bar chart draining",
      stock_query: null,
      transition: "cut",
    },
    {
      index: 1,
      duration_sec: 12,
      voiceover: "A one percent fee on a thousand dollars is ten bucks. On a hundred thousand, it is a thousand.",
      subtitle: "1% becomes real money",
      visual_type: "text_card",
      visual_prompt: "big 1% → $1,000",
      stock_query: null,
      transition: "cut",
    },
    {
      index: 2,
      duration_sec: 15,
      voiceover: "Stack that every month for a year and your channel paid rent you never saw.",
      subtitle: "It stacks every month",
      visual_type: "generated_image",
      visual_prompt: "calendar pages flipping with coins falling",
      stock_query: null,
      transition: "fade",
    },
    {
      index: 3,
      duration_sec: 10,
      voiceover: "Audit your cuts. Keep the work that compounds for you.",
      subtitle: "Audit your cuts",
      visual_type: "text_card",
      visual_prompt: "checklist with green check",
      stock_query: null,
      transition: "cut",
    },
  ],
  cta: "Save this and open your payout dashboard tonight.",
  source_notes: [
    {
      claim: "Platform revenue shares commonly take a percentage of creator earnings",
      verification_status: "needs_review",
      source_title: "Creator payout docs",
      source_url: null,
    },
  ],
};

const DEMO_CANDIDATES = [
  {
    id: "prior-a",
    topic: "compound interest for creators",
    script: {
      ...DEMO_SCRIPT,
      id: "prior-a",
      title: "The Fee That Quietly Eats Your Channel",
      hook: "You keep posting. Platforms keep taking.",
    } as VideoScriptDraft,
  },
  {
    id: "prior-b",
    topic: "color grading tips for reels",
    title: "Warm Skins in 30 Seconds",
    text: "Lift shadows, warm midtones, leave highlights clean for vertical reels.",
  },
];

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function tokens(value: string): Set<string> {
  return new Set(
    String(value || "")
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter((part) => part.length > 2)
  );
}

export function jaccard(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

function flattenScript(script: VideoScriptDraft): string {
  return [script.hook, ...script.scenes.map((s) => s.voiceover), script.cta]
    .filter(Boolean)
    .join(" ");
}

export function compareLexicalDuplicates(
  topic: string,
  script: VideoScriptDraft,
  candidates: ReviewFactoryRequest["candidates"] = []
): DuplicateSignal[] {
  return (candidates || []).map((candidate) => {
    const candTopic = candidate.topic || "";
    const candTitle =
      candidate.script?.title || candidate.title || "";
    const candText =
      (candidate.script ? flattenScript(candidate.script) : "") ||
      candidate.text ||
      "";
    const topicSimilarity = round3(jaccard(topic || script.topic || "", candTopic));
    const titleSimilarity = round3(jaccard(script.title, candTitle));
    const scriptSimilarity = round3(jaccard(flattenScript(script), candText));
    return {
      candidateId: candidate.id,
      topicSimilarity,
      titleSimilarity,
      scriptSimilarity,
      shouldBlock:
        topicSimilarity >= 0.9 ||
        titleSimilarity >= 0.82 ||
        scriptSimilarity >= 0.88,
    };
  });
}

export function runQualityGate(
  script: VideoScriptDraft,
  duplicateSignals: DuplicateSignal[] = []
): QualityGateResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const fullText = [
    script.title,
    script.description || "",
    script.hook,
    ...script.scenes.map((s) => `${s.voiceover}\n${s.subtitle}`),
    script.cta,
  ].join("\n");

  if (!script.title || script.title.trim().length < 3) {
    blockers.push("Title must be at least 3 characters");
  }
  if (!script.hook || script.hook.trim().length < 3) {
    blockers.push("Hook must be at least 3 characters");
  }
  if (!script.cta || !script.cta.trim()) {
    blockers.push("CTA is required");
  }
  if (!Array.isArray(script.scenes) || script.scenes.length < 1) {
    blockers.push("At least one scene is required");
  }

  const indexes = (script.scenes || []).map((s) => s.index);
  if (new Set(indexes).size !== indexes.length) {
    blockers.push("Scene indexes must be unique");
  }
  const expected = (script.scenes || []).map((_, i) => i);
  if (!indexes.every((v, i) => v === expected[i])) {
    blockers.push("Scene indexes must be contiguous and start at 0");
  }

  const totalDuration = (script.scenes || []).reduce(
    (sum, s) => sum + (Number(s.duration_sec) || 0),
    0
  );
  const target = Number(script.target_duration_sec) || 0;
  if (target < 10 || target > 180) {
    blockers.push("target_duration_sec must be between 10 and 180");
  } else {
    const tolerance = Math.max(2, target * 0.1);
    if (Math.abs(totalDuration - target) > tolerance) {
      blockers.push(
        `Scene duration total ${round3(totalDuration)}s differs from target ${target}s by more than ${round3(tolerance)}s`
      );
    }
  }

  if (PROHIBITED.some((pattern) => pattern.test(fullText))) {
    blockers.push("Script contains a prohibited promise or evasion pattern");
  }

  const duplicate = duplicateSignals.find((s) => s.shouldBlock);
  if (duplicate) {
    blockers.push(`Script is too similar to content item ${duplicate.candidateId}`);
  }

  for (const scene of script.scenes || []) {
    if (scene.visual_type === "licensed_stock" && !scene.stock_query) {
      blockers.push("Licensed stock scenes require a stock_query");
    }
    if ((scene.subtitle || "").length > 120) {
      warnings.push(`Scene ${scene.index} subtitle may be too long for a vertical frame`);
    }
    if ((scene.duration_sec || 0) < 0.5 || (scene.duration_sec || 0) > 30) {
      blockers.push(`Scene ${scene.index} duration must be between 0.5 and 30 seconds`);
    }
  }

  const notes = script.source_notes || [];
  if (notes.some((n) => n.source_url)) {
    warnings.push(
      "Model-supplied source URLs should be verified before publish (review-first)"
    );
  }
  if (notes.some((n) => n.verification_status === "verified")) {
    warnings.push(
      "A draft provider marking its own sources verified still needs human sign-off"
    );
  }
  if (notes.length === 0 && script.fact_check_required) {
    warnings.push("Fact checking is required but no source notes were supplied");
  }

  const unresolved = notes.some((n) => n.verification_status === "needs_review");
  const needsHumanFactCheck = Boolean(script.fact_check_required) || unresolved;

  return {
    passed: blockers.length === 0,
    needsHumanFactCheck,
    blockers,
    warnings,
  };
}

export function assertTransition(
  from: ReviewStatus,
  to: ReviewStatus
): { ok: true } | { ok: false; error: string } {
  const allowed = TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      error: `Cannot transition from ${from} to ${to}. Allowed: ${allowed.join(", ") || "(terminal)"}`,
    };
  }
  return { ok: true };
}

export function nextStatuses(status: ReviewStatus): ReviewStatus[] {
  return [...(TRANSITIONS[status] || [])];
}

function parseCsvTopics(text: string): { topics: BatchTopic[]; errors: string[] } {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const errors: string[] = [];
  const topics: BatchTopic[] = [];
  if (!lines.length) {
    return { topics, errors: ["Batch CSV is empty"] };
  }
  const header = lines[0].toLowerCase();
  const hasHeader = /topic/.test(header);
  const start = hasHeader ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const topic = hasHeader
      ? cols[header.split(",").findIndex((h) => h.trim() === "topic")] || cols[0]
      : cols[0];
    if (!topic) {
      errors.push(`Row ${i + 1}: missing topic`);
      continue;
    }
    const idCol = hasHeader
      ? cols[header.split(",").findIndex((h) => h.trim() === "id")]
      : cols[1];
    topics.push({
      id: idCol || `topic-${topics.length + 1}`,
      topic,
      language: hasHeader
        ? cols[header.split(",").findIndex((h) => h.trim() === "language")] || "en"
        : cols[2] || "en",
      target_duration_sec: Number(
        hasHeader
          ? cols[header.split(",").findIndex((h) => /duration/.test(h.trim()))]
          : cols[3]
      ) || 45,
      hook: hasHeader
        ? cols[header.split(",").findIndex((h) => h.trim() === "hook")]
        : cols[4],
    });
  }
  return { topics, errors };
}

function parseJsonTopics(text: string): { topics: BatchTopic[]; errors: string[] } {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { topics: [], errors: ["Batch JSON is invalid"] };
  }
  const arr = Array.isArray(raw) ? raw : (raw as any)?.topics;
  if (!Array.isArray(arr)) {
    return { topics: [], errors: ["Batch JSON must be an array or { topics: [] }"] };
  }
  const topics: BatchTopic[] = [];
  arr.forEach((item, i) => {
    if (!item || typeof item !== "object") {
      errors.push(`Item ${i}: not an object`);
      return;
    }
    const topic = String((item as any).topic || "").trim();
    if (!topic) {
      errors.push(`Item ${i}: missing topic`);
      return;
    }
    topics.push({
      id: String((item as any).id || `topic-${i + 1}`),
      topic,
      language: (item as any).language || "en",
      target_duration_sec: Number((item as any).target_duration_sec) || 45,
      hook: (item as any).hook,
      notes: (item as any).notes,
    });
  });
  return { topics, errors };
}

export function parseBatchTopics(
  text: string,
  format: "csv" | "json" | "auto" = "auto"
): { topics: BatchTopic[]; errors: string[] } {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { topics: [], errors: ["Batch text is empty"] };
  const resolved =
    format === "auto"
      ? trimmed.startsWith("[") || trimmed.startsWith("{")
        ? "json"
        : "csv"
      : format;
  return resolved === "json" ? parseJsonTopics(trimmed) : parseCsvTopics(trimmed);
}

function applyAction(
  status: ReviewStatus,
  action: ReviewFactoryRequest["action"],
  quality?: QualityGateResult
): { status: ReviewStatus } | { error: string } {
  if (!action) return { status };
  if (action === "queue") {
    const t = assertTransition(status, "queued");
    if (t.ok === false) return { error: t.error };
    return { status: "queued" };
  }
  if (action === "fact_check") {
    const t = assertTransition(status === "draft" ? "queued" : status, "qa_pending");
    // allow draft→qa via queued hop conceptually for UI
    if (status === "draft" || status === "queued") return { status: "qa_pending" };
    if (t.ok === false) return { error: t.error };
    return { status: "qa_pending" };
  }
  if (action === "ready") {
    if (quality && !quality.passed) {
      return { error: `Cannot mark ready_for_review: ${quality.blockers.join("; ")}` };
    }
    if (status === "draft" || status === "queued" || status === "qa_pending") {
      return { status: "ready_for_review" };
    }
    const t = assertTransition(status, "ready_for_review");
    if (t.ok === false) return { error: t.error };
    return { status: "ready_for_review" };
  }
  if (action === "approve") {
    if (status !== "ready_for_review") {
      return { error: "Only ready_for_review items can be approved (review-first)" };
    }
    return { status: "approved" };
  }
  if (action === "reject") {
    if (!["draft", "queued", "qa_pending", "ready_for_review"].includes(status)) {
      return { error: `Cannot reject from ${status}` };
    }
    return { status: "rejected" };
  }
  return { status };
}

export function parseReviewFactoryRequest(
  body: Record<string, unknown>
): { ok: true; request: ReviewFactoryRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body must be a JSON object" };
  }
  if (body.demo === true) {
    return { ok: true, request: { demo: true } };
  }
  const request: ReviewFactoryRequest = {
    script: body.script as VideoScriptDraft | undefined,
    candidates: body.candidates as ReviewFactoryRequest["candidates"],
    batch_text: typeof body.batch_text === "string" ? body.batch_text : undefined,
    batch_format:
      body.batch_format === "csv" || body.batch_format === "json" || body.batch_format === "auto"
        ? body.batch_format
        : "auto",
    status:
      typeof body.status === "string" && body.status in TRANSITIONS
        ? (body.status as ReviewStatus)
        : "draft",
    action: body.action as ReviewFactoryRequest["action"],
    reviewer: typeof body.reviewer === "string" ? body.reviewer : undefined,
    reason: typeof body.reason === "string" ? body.reason : undefined,
  };
  if (!request.script && !request.batch_text && !request.action) {
    return {
      ok: false,
      error: "Provide script, batch_text, action, or demo:true",
    };
  }
  return { ok: true, request };
}

export function runReviewFactory(request: ReviewFactoryRequest): ReviewFactoryResult {
  if (request.demo) {
    const duplicates = compareLexicalDuplicates(
      DEMO_SCRIPT.topic || "",
      DEMO_SCRIPT,
      DEMO_CANDIDATES
    );
    const quality = runQualityGate(DEMO_SCRIPT, duplicates);
    const batch = parseBatchTopics(
      `id,topic,language,target_duration_sec,hook\n1,compound interest for creators,en,45,Watch the math\n2,color grading for reels,en,30,Warm skins fast\n`,
      "csv"
    );
    return {
      ok: true,
      quality,
      duplicates,
      status: quality.passed
        ? quality.needsHumanFactCheck
          ? "qa_pending"
          : "ready_for_review"
        : "draft",
      allowed_next: nextStatuses(
        quality.passed
          ? quality.needsHumanFactCheck
            ? "qa_pending"
            : "ready_for_review"
          : "draft"
      ),
      batch: {
        count: batch.topics.length,
        topics: batch.topics,
        errors: batch.errors,
      },
      summary: quality.passed
        ? `Demo: quality passed with ${duplicates.filter((d) => d.shouldBlock).length} duplicate block(s); batch imported ${batch.topics.length} topics.`
        : `Demo: quality blocked — ${quality.blockers.join("; ")}`,
    };
  }

  let quality: QualityGateResult | undefined;
  let duplicates: DuplicateSignal[] | undefined;
  let batch: ReviewFactoryResult["batch"];

  if (request.batch_text) {
    const parsed = parseBatchTopics(request.batch_text, request.batch_format || "auto");
    batch = {
      count: parsed.topics.length,
      topics: parsed.topics,
      errors: parsed.errors,
    };
  }

  if (request.script) {
    duplicates = compareLexicalDuplicates(
      request.script.topic || "",
      request.script,
      request.candidates || []
    );
    quality = runQualityGate(request.script, duplicates);
  }

  let status: ReviewStatus = request.status || "draft";
  if (request.action) {
    const moved = applyAction(status, request.action, quality);
    if ("error" in moved) {
      throw Object.assign(new Error(moved.error), { status: 400 });
    }
    status = moved.status;
  } else if (quality) {
    if (!quality.passed) status = "draft";
    else if (quality.needsHumanFactCheck) status = "qa_pending";
    else status = "ready_for_review";
  }

  const parts: string[] = [];
  if (quality) {
    parts.push(
      quality.passed
        ? `Quality passed${quality.needsHumanFactCheck ? " (fact-check pending)" : ""}`
        : `Quality blocked (${quality.blockers.length})`
    );
  }
  if (duplicates) {
    const blocked = duplicates.filter((d) => d.shouldBlock).length;
    parts.push(
      blocked
        ? `${blocked} duplicate block(s)`
        : `${duplicates.length} candidate(s) compared, none blocked`
    );
  }
  if (batch) {
    parts.push(`batch ${batch.count} topic(s)${batch.errors.length ? `, ${batch.errors.length} error(s)` : ""}`);
  }
  parts.push(`status=${status}`);

  return {
    ok: true,
    quality,
    duplicates,
    status,
    allowed_next: nextStatuses(status),
    batch,
    summary: parts.join(" · "),
  };
}
