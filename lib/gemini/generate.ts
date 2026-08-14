import type { GenerateContentConfig, GoogleGenAI } from "@google/genai";

export type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/** Time reserved for serialising and returning the response. */
const RESPONSE_MARGIN_MS = 3_000;
/** Below this, there is no point starting another attempt. */
const MIN_ATTEMPT_MS = 8_000;

export interface GenerateOptions {
  parts: Part[];
  /** Tried in order; the walk steps on only when a model reports itself unusable. */
  models: string[];
  config?: GenerateContentConfig;
  /** Total wall-clock budget, normally the route's own `maxDuration`. */
  budgetMs: number;
  /** Longest a single model attempt may run. */
  maxAttemptMs: number;
}

/**
 * Run a generation, stepping down the model list only when a model reports
 * itself unavailable or spent. Any other failure is the caller's problem to
 * retry — switching models would just repeat it.
 *
 * Flash models go through demand spikes, and an overloaded one can sit on a
 * request for ~30s before answering 503. Each attempt is therefore capped, and
 * the walk stops once there is not enough of the function window left to finish
 * another one — returning a clean error beats being killed mid-flight.
 */
export async function generateWithFallback(
  ai: GoogleGenAI,
  { parts, models, config, budgetMs, maxAttemptMs }: GenerateOptions,
): Promise<string | undefined> {
  const deadline = Date.now() + budgetMs - RESPONSE_MARGIN_MS;
  let lastError: unknown;

  for (const model of models) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          ...config,
          httpOptions: { timeout: Math.min(remaining, maxAttemptMs) },
        },
      });
      return response.text;
    } catch (error) {
      const status = extractStatus(error);
      // 429 walks the chain too: the daily ceiling is metered per model, so
      // the next model has its own budget even when this one is spent.
      if (status !== 503 && status !== 404 && status !== 429) throw error;
      lastError = error;
    }
  }

  throw lastError ?? new Error("No model answered within the function window");
}

export function extractStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as { status?: unknown; code?: unknown; message?: unknown };
  // SDK errors carry non-HTTP codes too (gRPC numbers, ETIMEDOUT strings), so
  // anything outside the HTTP range is not a status.
  if (isHttpStatus(e.status)) return e.status;
  if (isHttpStatus(e.code)) return e.code;
  if (typeof e.message === "string") {
    if (/\b429\b|RESOURCE_EXHAUSTED/.test(e.message)) return 429;
    if (/\b503\b|UNAVAILABLE/.test(e.message)) return 503;
    if (/\b404\b|NOT_FOUND/.test(e.message)) return 404;
  }
  return null;
}

function isHttpStatus(value: unknown): value is number {
  return typeof value === "number" && value >= 200 && value <= 599;
}

export function extractRetryAfter(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return null;
  const match = message.match(/retryDelay["':\s]+(\d+)/);
  return match ? match[1] : null;
}

/**
 * The error shape every route returns, so a rate limit reaches the client as a
 * rate limit rather than as a generic failure it will retry blindly.
 */
export function errorResponseInit(error: unknown): {
  status: number;
  headers?: Record<string, string>;
  message: string;
} {
  const status = extractStatus(error);
  if (status === 429) {
    const retryAfter = extractRetryAfter(error);
    return {
      status: 429,
      headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
      message: "Rate limited upstream",
    };
  }
  return {
    // 502 for anything unrecognised: it is retryable, which a stalled or
    // overloaded upstream generally is.
    status: status ?? 502,
    message: error instanceof Error ? error.message : "Generation failed",
  };
}
