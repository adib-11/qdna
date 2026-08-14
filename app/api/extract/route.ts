import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { EXTRACTION_MODEL, MODEL_FALLBACKS } from "@/lib/config";
import { EXTRACTION_PROMPT } from "@/lib/gemini/prompts";
import { EXTRACTION_SCHEMA } from "@/lib/gemini/schema";
import type { Question } from "@/lib/types";

export const runtime = "nodejs";
// Raised from the planned 45s: verbatim transcription of a dense page was
// measured at 25–47s, so 45 truncates real work rather than catching runaways.
export const maxDuration = 60;

interface ExtractRequest {
  images?: string[];
  hint?: string;
}

/** Raw model output, before ids are assigned. */
type ExtractedQuestion = Omit<Question, "id">;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  let body: ExtractRequest;
  try {
    body = (await request.json()) as ExtractRequest;
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const images = body.images ?? [];
  if (images.length === 0) {
    return NextResponse.json({ error: "No images supplied" }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey });

  const parts = [
    { text: body.hint ? `${EXTRACTION_PROMPT}\n\nContext: ${body.hint}` : EXTRACTION_PROMPT },
    ...images.map((base64) => ({
      inlineData: { mimeType: "image/jpeg", data: base64 },
    })),
  ];

  try {
    const raw = await generateWithFallback(ai, parts);
    if (!raw) {
      return NextResponse.json({ questions: [] });
    }

    const parsed = JSON.parse(raw) as { questions?: ExtractedQuestion[] };
    const questions: Question[] = (parsed.questions ?? []).map((q, i) => ({
      ...q,
      id: `${q.paper?.label ?? "unknown"}::${q.qNo ?? i}`,
    }));

    return NextResponse.json({ questions });
  } catch (error: unknown) {
    const status = extractStatus(error);

    // Pass rate-limit signals through unchanged so the client can back off
    // against the real ceiling rather than guessing at one.
    if (status === 429) {
      const retryAfter = extractRetryAfter(error);
      return NextResponse.json(
        { error: "Rate limited upstream" },
        {
          status: 429,
          headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
        },
      );
    }

    const message = error instanceof Error ? error.message : "Extraction failed";
    // 502 for anything unrecognised: it is retryable, which a stalled or
    // overloaded upstream generally is.
    return NextResponse.json({ error: message }, { status: status ?? 502 });
  }
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

/**
 * Run the extraction, stepping down the model list only when a model reports
 * itself unavailable. Any other failure is the caller's problem to retry —
 * switching models would just repeat it.
 *
 * Flash models go through demand spikes, and an overloaded one can sit on a
 * request for ~30s before answering 503. Each attempt is therefore capped, and
 * the walk stops once there is not enough of the function window left to
 * finish another one — returning a clean error beats being killed mid-flight.
 */
async function generateWithFallback(
  ai: GoogleGenAI,
  parts: Part[],
): Promise<string | undefined> {
  const models = [EXTRACTION_MODEL, ...MODEL_FALLBACKS];
  const deadline = Date.now() + maxDuration * 1000 - RESPONSE_MARGIN_MS;
  let lastError: unknown;

  for (const model of models) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: EXTRACTION_SCHEMA,
          temperature: 0,
          httpOptions: { timeout: Math.min(remaining, MAX_ATTEMPT_MS) },
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

/** Time reserved for serialising and returning the response. */
const RESPONSE_MARGIN_MS = 3_000;
/** Longest a single model attempt may run. */
const MAX_ATTEMPT_MS = 45_000;
/** Below this, there is no point starting another attempt. */
const MIN_ATTEMPT_MS = 8_000;

function extractStatus(error: unknown): number | null {
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

function extractRetryAfter(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return null;
  const match = message.match(/retryDelay["':\s]+(\d+)/);
  return match ? match[1] : null;
}
