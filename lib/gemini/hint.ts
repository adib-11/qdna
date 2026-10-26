import {
  HINT_ATTEMPT_MS,
  MODEL_BUDGET_MS,
  MODEL_FALLBACKS,
  REASONING_MODEL,
} from "@/lib/config";
import { generateWithFallback, type ModelClient } from "@/lib/gemini/generate";
import { TUTOR_PROMPT } from "@/lib/gemini/prompts";

export interface HintInput {
  question: {
    text?: string;
    qNo?: string;
    marks?: number | null;
    isNumerical?: boolean;
    paperLabel?: string;
  };
  topicContext?: {
    topic?: string;
    count?: number;
    papers?: string[];
  };
}

/** A hint for one question: the approach and the principle, never the answer. */
export async function writeHint(
  client: ModelClient,
  input: HintInput,
  signal?: AbortSignal,
): Promise<string> {
  const hint = await generateWithFallback(client, {
    parts: [{ text: `${TUTOR_PROMPT}\n\n${describeHint(input)}` }],
    models: [REASONING_MODEL, ...MODEL_FALLBACKS],
    config: {
      // Warmer than extraction: this is explanatory prose, not transcription.
      temperature: 0.4,
    },
    budgetMs: MODEL_BUDGET_MS,
    maxAttemptMs: HINT_ATTEMPT_MS,
    signal,
  });

  if (!hint?.trim()) throw new Error("The model returned an empty hint");
  return hint.trim();
}

/**
 * The question plus the little the corpus knows about it. Recurrence is worth
 * telling the model: a hint for a question that has been asked six times can
 * point at what the examiner keeps testing rather than at this instance alone.
 */
function describeHint({ question, topicContext }: HintInput): string {
  const lines = [`Question: ${question.text?.trim()}`];

  if (question.marks != null) lines.push(`Marks: ${question.marks}`);
  lines.push(
    question.isNumerical
      ? "This is a numerical question — the student must compute a value."
      : "This is a theory question — the student must derive, prove, or explain.",
  );

  if (topicContext?.topic) {
    const recurrence =
      topicContext.count != null && topicContext.papers?.length
        ? ` It has been examined ${topicContext.count} time${topicContext.count === 1 ? "" : "s"} across ${topicContext.papers.length} paper${topicContext.papers.length === 1 ? "" : "s"} in this course.`
        : "";
    lines.push(`Topic: ${topicContext.topic}.${recurrence}`);
  }

  return lines.join("\n");
}
