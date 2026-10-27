import {
  EXTRACTION_ATTEMPT_MS,
  EXTRACTION_MODEL,
  EXTRACTION_SETUP,
  MODEL_BUDGET_MS,
  MODEL_FALLBACKS,
} from "@/lib/config";
import { MediaResolution, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import { generateWithFallback, type ModelClient } from "@/lib/gemini/generate";
import { EXTRACTION_PROMPT } from "@/lib/gemini/prompts";
import { EXTRACTION_SCHEMA } from "@/lib/gemini/schema";
import type { Question } from "@/lib/types";

/** One page image as the model receives it: a rendered PDF page or a photo, as is. */
export interface PagePayload {
  base64: string;
  mimeType: string;
}

/** The models extraction walks, in order. */
export const EXTRACTION_CHAIN = [EXTRACTION_MODEL, ...MODEL_FALLBACKS];

export interface ExtractionSetup {
  /** The model chain to walk, in order. The eval's setups are pinned to one model. */
  models: string[];
  /** Settings layered over the app's schema and temperature. */
  config?: GenerateContentConfig;
}

/**
 * The setups the extraction eval measures, each pinned to the one model it is
 * named after so its row measures that model. EXTRACTION_SETUP names the
 * app's, which keeps the fallback chain (see APP_MODELS).
 */
export const EXTRACTION_SETUPS: Record<string, ExtractionSetup> = {
  "Flash (gemini-flash-latest)": { models: [EXTRACTION_MODEL] },
  // Thinking cannot be turned off on 3.5 Flash-Lite; minimal is its lowest.
  "Flash-Lite, minimal thinking": {
    models: ["gemini-3.5-flash-lite"],
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
  },
  "Low media resolution": {
    models: [EXTRACTION_MODEL],
    config: { mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW },
  },
};

/** Raw model output, before ids are assigned. */
type ExtractedQuestion = Omit<Question, "id">;

export interface ExtractOptions {
  hint?: string;
  signal?: AbortSignal;
  /** The model chain to walk. EXTRACTION_SETUP's unless the eval is measuring another. */
  models?: string[];
  /** Settings layered over the app's JSON schema and temperature, such as thinking or media resolution. */
  config?: GenerateContentConfig;
}

const APP_SETUP = EXTRACTION_SETUPS[EXTRACTION_SETUP];
/** The app's setup model first, then the rest of the chain: students keep every fallback. */
const APP_MODELS = [
  APP_SETUP.models[0],
  ...EXTRACTION_CHAIN.filter((model) => model !== APP_SETUP.models[0]),
];

/** Every question on a batch of page images, through the model chain. */
export async function extractQuestions(
  client: ModelClient,
  pages: PagePayload[],
  {
    hint,
    signal,
    models = APP_MODELS,
    config = APP_SETUP.config,
  }: ExtractOptions = {},
): Promise<Question[]> {
  const raw = await generateWithFallback(client, {
    parts: [
      { text: hint ? `${EXTRACTION_PROMPT}\n\nContext: ${hint}` : EXTRACTION_PROMPT },
      ...pages.map((page) => ({
        inlineData: { mimeType: page.mimeType, data: page.base64 },
      })),
    ],
    models,
    config: {
      responseMimeType: "application/json",
      responseSchema: EXTRACTION_SCHEMA,
      temperature: 0,
      ...config,
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
