import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { EXTRACTION_MODEL, MODEL_FALLBACKS } from "@/lib/config";
import { errorResponseInit, generateWithFallback } from "@/lib/gemini/generate";
import { EXTRACTION_PROMPT } from "@/lib/gemini/prompts";
import { EXTRACTION_SCHEMA } from "@/lib/gemini/schema";
import type { Question } from "@/lib/types";

export const runtime = "nodejs";
// Raised from the planned 45s: verbatim transcription of a dense page was
// measured at 25–47s, so 45 truncates real work rather than catching runaways.
export const maxDuration = 60;

/** Longest a single model attempt may run. */
const MAX_ATTEMPT_MS = 45_000;

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
    const raw = await generateWithFallback(ai, {
      parts,
      models: [EXTRACTION_MODEL, ...MODEL_FALLBACKS],
      config: {
        responseMimeType: "application/json",
        responseSchema: EXTRACTION_SCHEMA,
        temperature: 0,
      },
      budgetMs: maxDuration * 1000,
      maxAttemptMs: MAX_ATTEMPT_MS,
    });
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
    const { status, headers, message } = errorResponseInit(error);
    return NextResponse.json({ error: message }, { status, headers });
  }
}
