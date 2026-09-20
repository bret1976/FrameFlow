/**
 * Ending Coherence — cold-viewer story-gate for short clips.
 * Idea inspired by JeremySNR/cutawan editorial-coherence study (MIT;
 * reimplement only — original FrameFlow TypeScript, no cloned code).
 * Checks whether a candidate window ends mid-thought / unresolved, and
 * suggests a sentence-boundary extend. Pure functions, no API keys.
 */

export type CoherenceIssue =
  | "unresolved_ending"
  | "mid_sentence_cut"
  | "dangling_connective"
  | "open_quote"
  | "trailing_filler"
  | "none";

export type CoherenceVerdict = "PASS" | "WARN" | "FAIL";

export type TimedWord = {
  word: string;
  start_sec: number;
  end_sec: number;
};

export type EndingCoherenceRequest = {
  action?: "check" | "demo";
  demo?: boolean;
  transcript?: string;
  words?: TimedWord[];
  start_sec?: number;
  end_sec?: number;
  source_duration_sec?: number;
  max_extend_sec?: number;
};

export type EndingCoherenceResult = {
  ok: true;
  source: "ending-coherence-1.0";
  verdict: CoherenceVerdict;
  issue: CoherenceIssue;
  explanation: string;
  evidence_quote: string;
  clip: { start_sec: number; end_sec: number; duration_sec: number };
  suggested: {
    start_sec: number;
    end_sec: number;
    extended_sec: number;
    reason: string;
  };
  speech_tail: string;
};

export type EndingCoherenceParseResult =
  | { ok: true; request: EndingCoherenceRequest }
  | { ok: false; error: string };

const TERMINAL = /[.!?…]["'")\]]*\s*$/;
const OPEN_QUOTE = /["“][^"”]*$/;
const DANGLING =
  /\b(because|so|and then|but then|which means|which is why|for example|like when|until|unless|although|though|while|whereas|if)\s*$/i;
const TRAILING_FILLER =
  /\b(um+|uh+|you know|i mean|sort of|kind of|basically|literally|right|okay so|yeah so)\s*$/i;
const MID_CUT =
  /\b(the|a|an|to|of|in|on|for|with|and|or|but|that|this|these|those|we|they|he|she|it|my|your|our)\s*$/i;

const DEMO_FAIL = {
  transcript:
    "Why does she do this? We already tried that one and then",
  start_sec: 346.25,
  end_sec: 368.9,
  source_duration_sec: 420,
};

const DEMO_PASS = {
  transcript:
    "Wait — what if the whole playbook was wrong? Watch this. Three mistakes every creator makes on day one. Subscribe if this saved you an hour.",
  start_sec: 12,
  end_sec: 38,
  source_duration_sec: 180,
};

function normalizeSpeech(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function speechTail(text: string, maxWords = 12): string {
  const words = normalizeSpeech(text).split(/\s+/).filter(Boolean);
  return words.slice(-maxWords).join(" ");
}

function evidenceQuote(text: string, maxWords = 18): string {
  const words = normalizeSpeech(text).split(/\s+/).filter(Boolean);
  const slice = words.slice(-maxWords).join(" ");
  return slice.length > 120 ? slice.slice(-120) : slice;
}

function detectIssue(speech: string): {
  issue: CoherenceIssue;
  explanation: string;
  verdict: CoherenceVerdict;
} {
  const t = normalizeSpeech(speech);
  if (!t) {
    return {
      issue: "unresolved_ending",
      explanation: "Empty speech window — no story to land.",
      verdict: "FAIL",
    };
  }
  if (OPEN_QUOTE.test(t)) {
    return {
      issue: "open_quote",
      explanation: "Clip ends inside an open quote — viewer never hears the close.",
      verdict: "FAIL",
    };
  }
  if (DANGLING.test(t)) {
    return {
      issue: "dangling_connective",
      explanation:
        "Ends on a connective that promises a payoff the window never delivers.",
      verdict: "FAIL",
    };
  }
  if (TRAILING_FILLER.test(t)) {
    return {
      issue: "trailing_filler",
      explanation: "Trailing filler / hedge — cut feels unfinished.",
      verdict: "WARN",
    };
  }
  if (!TERMINAL.test(t)) {
    if (MID_CUT.test(t)) {
      return {
        issue: "mid_sentence_cut",
        explanation: "Cuts mid-phrase after a determiner/preposition/pronoun.",
        verdict: "FAIL",
      };
    }
    return {
      issue: "unresolved_ending",
      explanation: "No terminal punctuation — thought likely incomplete.",
      verdict: "WARN",
    };
  }
  return {
    issue: "none",
    explanation: "Speech lands on a complete beat with terminal punctuation.",
    verdict: "PASS",
  };
}

/** Estimate next sentence end from plain transcript density when no word times. */
function estimateExtend(
  transcript: string,
  endSec: number,
  sourceDuration: number | undefined,
  maxExtend: number
): { end_sec: number; extended_sec: number; reason: string } {
  const full = normalizeSpeech(transcript);
  const after = full.slice(full.length); // no lookahead without words
  void after;
  // Without timed words, nudge +2s if FAIL/WARN and source allows — caller
  // passes only the clip transcript; use a conservative pad.
  const pad = Math.min(2.5, maxExtend);
  const capped =
    sourceDuration != null
      ? Math.min(endSec + pad, sourceDuration)
      : endSec + pad;
  const extended = Math.max(0, +(capped - endSec).toFixed(3));
  return {
    end_sec: +capped.toFixed(3),
    extended_sec: extended,
    reason:
      extended > 0
        ? `Conservative +${extended}s pad toward next beat (no word timestamps).`
        : "Already at source end — cannot extend.",
  };
}

function extendFromWords(
  words: TimedWord[],
  endSec: number,
  maxExtend: number,
  sourceDuration?: number
): { end_sec: number; extended_sec: number; reason: string } {
  const limit = Math.min(
    endSec + maxExtend,
    sourceDuration ?? Number.POSITIVE_INFINITY
  );
  // Words whose midpoint is after current end, within extend budget.
  const later = words
    .filter((w) => {
      const mid = (w.start_sec + w.end_sec) / 2;
      return mid > endSec - 0.02 && mid <= limit + 0.02;
    })
    .sort((a, b) => a.start_sec - b.start_sec);

  let target = endSec;
  let foundTerminal = false;
  for (const w of later) {
    target = Math.max(target, w.end_sec);
    if (TERMINAL.test(w.word.trim()) || /[.!?…]/.test(w.word)) {
      foundTerminal = true;
      break;
    }
    // Also stop if accumulated speech from end forms a terminal sentence.
    const slice = words
      .filter((x) => x.end_sec <= target + 0.01 && x.start_sec >= endSec - 0.5)
      .map((x) => x.word)
      .join(" ");
    if (TERMINAL.test(normalizeSpeech(slice))) {
      foundTerminal = true;
      break;
    }
  }

  const capped = Math.min(target, limit);
  const extended = Math.max(0, +(capped - endSec).toFixed(3));
  return {
    end_sec: +capped.toFixed(3),
    extended_sec: extended,
    reason: foundTerminal
      ? `Extended ${extended}s to next terminal word boundary.`
      : extended > 0
        ? `Extended ${extended}s within budget; no clear terminal found.`
        : "No later words inside extend budget.",
  };
}

function speechInWindow(
  transcript: string | undefined,
  words: TimedWord[] | undefined,
  start: number,
  end: number
): string {
  if (words && words.length > 0) {
    return words
      .filter((w) => {
        const mid = (w.start_sec + w.end_sec) / 2;
        return mid >= start && mid <= end;
      })
      .map((w) => w.word)
      .join(" ");
  }
  return transcript ?? "";
}

export function parseEndingCoherenceRequest(
  body: Record<string, unknown>
): EndingCoherenceParseResult {
  if (body.demo === true || body.action === "demo") {
    return { ok: true, request: { demo: true, action: "demo" } };
  }

  const transcript =
    typeof body.transcript === "string" ? body.transcript : undefined;
  const wordsRaw = Array.isArray(body.words) ? body.words : undefined;
  const words: TimedWord[] | undefined = wordsRaw
    ?.map((row: any) => ({
      word: String(row?.word ?? row?.text ?? ""),
      start_sec: Number(row?.start_sec ?? row?.start ?? 0),
      end_sec: Number(row?.end_sec ?? row?.end ?? 0),
    }))
    .filter(
      (w) =>
        w.word &&
        Number.isFinite(w.start_sec) &&
        Number.isFinite(w.end_sec) &&
        w.end_sec >= w.start_sec
    );

  if (!transcript?.trim() && (!words || words.length === 0)) {
    return {
      ok: false,
      error: "Provide transcript and/or words[], or { demo: true }.",
    };
  }

  const start_sec = Number(body.start_sec ?? 0);
  const end_sec = Number(
    body.end_sec ??
      (words && words.length
        ? Math.max(...words.map((w) => w.end_sec))
        : 30)
  );
  if (!Number.isFinite(start_sec) || !Number.isFinite(end_sec) || end_sec <= start_sec) {
    return { ok: false, error: "start_sec / end_sec must be finite with end > start." };
  }

  const source_duration_sec =
    body.source_duration_sec != null
      ? Number(body.source_duration_sec)
      : undefined;
  if (
    source_duration_sec != null &&
    (!Number.isFinite(source_duration_sec) || source_duration_sec <= 0)
  ) {
    return { ok: false, error: "source_duration_sec must be a positive number." };
  }

  const max_extend_sec =
    body.max_extend_sec != null ? Number(body.max_extend_sec) : 8;
  if (!Number.isFinite(max_extend_sec) || max_extend_sec < 0 || max_extend_sec > 60) {
    return { ok: false, error: "max_extend_sec must be 0–60." };
  }

  return {
    ok: true,
    request: {
      action: "check",
      transcript,
      words,
      start_sec,
      end_sec,
      source_duration_sec,
      max_extend_sec,
    },
  };
}

export function runEndingCoherence(
  request: EndingCoherenceRequest
): EndingCoherenceResult {
  if (request.demo) {
    // Prefer the failing cinematic control from the Cutawan study shape.
    return runEndingCoherence({
      action: "check",
      transcript: DEMO_FAIL.transcript,
      start_sec: DEMO_FAIL.start_sec,
      end_sec: DEMO_FAIL.end_sec,
      source_duration_sec: DEMO_FAIL.source_duration_sec,
      max_extend_sec: 8,
    });
  }

  const start = request.start_sec ?? 0;
  const end = request.end_sec ?? 30;
  const maxExtend = request.max_extend_sec ?? 8;
  const speech = speechInWindow(request.transcript, request.words, start, end);
  const { issue, explanation, verdict } = detectIssue(speech);

  let suggested = {
    start_sec: start,
    end_sec: end,
    extended_sec: 0,
    reason: "No extend needed.",
  };

  if (verdict !== "PASS") {
    suggested =
      request.words && request.words.length > 0
        ? {
            start_sec: start,
            ...extendFromWords(
              request.words,
              end,
              maxExtend,
              request.source_duration_sec
            ),
          }
        : {
            start_sec: start,
            ...estimateExtend(
              request.transcript ?? speech,
              end,
              request.source_duration_sec,
              maxExtend
            ),
          };
  }

  return {
    ok: true,
    source: "ending-coherence-1.0",
    verdict,
    issue,
    explanation,
    evidence_quote: evidenceQuote(speech),
    clip: {
      start_sec: start,
      end_sec: end,
      duration_sec: +(end - start).toFixed(3),
    },
    suggested,
    speech_tail: speechTail(speech),
  };
}

/** Exported for tests / panel pass demo. */
export function demoPassResult(): EndingCoherenceResult {
  return runEndingCoherence({
    action: "check",
    transcript: DEMO_PASS.transcript,
    start_sec: DEMO_PASS.start_sec,
    end_sec: DEMO_PASS.end_sec,
    source_duration_sec: DEMO_PASS.source_duration_sec,
  });
}
