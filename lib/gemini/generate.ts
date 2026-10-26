import type { GenerateContentConfig, GenerateContentParameters } from "@google/genai";

export type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * The one thing the chain needs from a model client. `GoogleGenAI` satisfies
 * it, and so does a fake in tests, so the chain never touches the network
 * itself.
 */
export interface ModelClient {
  models: {
    generateContent(params: GenerateContentParameters): Promise<{ text?: string }>;
  };
}

/** Time reserved for handling the response after the last attempt. */
const RESPONSE_MARGIN_MS = 3_000;
/** Below this, there is no point starting another attempt. */
const MIN_ATTEMPT_MS = 8_000;

export interface GenerateOptions {
  parts: Part[];
  /** Tried in order; the walk steps on only when a model reports itself unusable. */
  models: string[];
  config?: GenerateContentConfig;
  /** Total wall-clock budget for the whole walk. */
  budgetMs: number;
  /** Longest a single model attempt may run. */
  maxAttemptMs: number;
  /** The caller's cancel. Ends the walk at once; no further model is tried. */
  signal?: AbortSignal;
}

/**
 * Run a generation, stepping down the model list only when a model reports
 * itself unavailable or spent, or does not answer inside its attempt cap. Any
 * other failure is the caller's problem to retry — switching models would just
 * repeat it.
 *
 * Flash models go through demand spikes, and an overloaded one can sit on a
 * request for ~30s before answering 503. Each attempt is therefore capped, and
 * the walk stops once there is not enough of the budget left to finish
 * another one.
 */
export async function generateWithFallback(
  ai: ModelClient,
  { parts, models, config, budgetMs, maxAttemptMs, signal }: GenerateOptions,
): Promise<string | undefined> {
  const deadline = Date.now() + budgetMs - RESPONSE_MARGIN_MS;
  let lastError: unknown;

  for (const model of models) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;

    const attemptMs = Math.min(remaining, maxAttemptMs);
    const attempt = attemptSignal(attemptMs, signal);

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: { ...config, abortSignal: attempt.signal },
      });
      return response.text;
    } catch (error) {
      if (signal?.aborted) throw error;
      // A deadline walks the chain: a model instance that will not answer
      // inside the attempt cap is exactly the case another model can rescue,
      // and the walk is bounded by the budget regardless.
      if (attempt.timedOut()) {
        lastError = Object.assign(
          new Error(`${model} did not answer within ${Math.round(attemptMs / 1000)}s`),
          { status: 504 },
        );
        continue;
      }
      // 429 walks the chain too: the daily ceiling is metered per model, so
      // the next model has its own budget even when this one is spent.
      if (!WALKABLE.has(extractStatus(error) ?? 0)) throw error;
      lastError = error;
    } finally {
      attempt.dispose();
    }
  }

  throw lastError ?? new Error("No model answered within the time budget");
}

/**
 * One attempt's abort: fires on the caller's cancel or on the attempt cap,
 * whichever comes first, and remembers which. Built on setTimeout rather than
 * `AbortSignal.timeout` so the cap follows fake timers in tests.
 */
function attemptSignal(ms: number, caller?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  const onCancel = () => controller.abort();
  if (caller?.aborted) controller.abort();
  caller?.addEventListener("abort", onCancel);

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      caller?.removeEventListener("abort", onCancel);
    },
  };
}

/** Upstream statuses another model may still answer. */
const WALKABLE = new Set([429, 503, 504, 404]);

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
    if (/\b504\b|DEADLINE_EXCEEDED/.test(e.message)) return 504;
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

/** True when Google refused the key itself, which no retry or other model can fix. */
export function isKeyRejected(error: unknown): boolean {
  const status = extractStatus(error);
  const message =
    typeof error === "object" && error !== null
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  return (
    status === 401 ||
    status === 403 ||
    /API_KEY_INVALID|API key not valid|API key expired/i.test(message)
  );
}

/** What a student is told when a model action fails. */
export function describeModelError(error: unknown, fallback: string): string {
  if (isKeyRejected(error)) {
    return "Google rejected your Gemini key. Forget it and paste a valid key, then try again.";
  }
  if (extractStatus(error) === 429) {
    return "Your Gemini key is out of quota on every model qDNA tried. The free tier resets daily; try again later.";
  }
  return error instanceof Error && error.message ? error.message : fallback;
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
