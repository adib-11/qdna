import {
  EXTRACTION_ATTEMPT_MS,
  EXTRACTION_MODEL,
  MODEL_BUDGET_MS,
  MODEL_FALLBACKS,
} from "@/lib/config";
import { generateWithFallback, type ModelClient } from "@/lib/gemini/generate";
import { EXTRACTION_PROMPT } from "@/lib/gemini/prompts";
import { EXTRACTION_SCHEMA } from "@/lib/gemini/schema";
import type { Question } from "@/lib/types";

/** One page image as the model receives it: a rendered PDF page or a photo, as is. */
export interface PagePayload {
  base64: string;
  mimeType: string;
}

/** Raw model output, before ids are assigned. */
type ExtractedQuestion = Omit<Question, "id">;

/** Every question on a batch of page images, through the model chain. */
export async function extractQuestions(
  client: ModelClient,
  pages: PagePayload[],
  { hint, signal }: { hint?: string; signal?: AbortSignal } = {},
): Promise<Question[]> {
  const raw = await generateWithFallback(client, {
    parts: [
      { text: hint ? `${EXTRACTION_PROMPT}\n\nContext: ${hint}` : EXTRACTION_PROMPT },
      ...pages.map((page) => ({
        inlineData: { mimeType: page.mimeType, data: page.base64 },
      })),
    ],
    models: [EXTRACTION_MODEL, ...MODEL_FALLBACKS],
    config: {
      responseMimeType: "application/json",
      responseSchema: EXTRACTION_SCHEMA,
      temperature: 0,
    },
    budgetMs: MODEL_BUDGET_MS,
    maxAttemptMs: EXTRACTION_ATTEMPT_MS,
    signal,
  });
  return parseExtraction(raw);
}

/** The model's JSON, with the stable ids the analysis keys on. */
export function parseExtraction(raw: string | undefined): Question[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { questions?: ExtractedQuestion[] };
  return (parsed.questions ?? []).map((q, i) => ({
    ...q,
    id: `${q.paper?.label ?? "unknown"}::${q.qNo ?? i}`,
  }));
}
