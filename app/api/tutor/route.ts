import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { MODEL_FALLBACKS, REASONING_MODEL } from "@/lib/config";
import { errorResponseInit, generateWithFallback } from "@/lib/gemini/generate";
import { TUTOR_PROMPT } from "@/lib/gemini/prompts";

export const runtime = "nodejs";
// Raised from the planned 30s. A hint is a short answer, but a thinking flash
// model still spent 13s on one in local measurement and blew a 20s attempt cap
// in production, and 30s of budget leaves no room to try a second model.
export const maxDuration = 60;

/** Longest a single model attempt may run. */
const MAX_ATTEMPT_MS = 25_000;

interface TutorRequest {
  question?: {
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

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  let body: TutorRequest;
  try {
    body = (await request.json()) as TutorRequest;
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const text = body.question?.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "No question supplied" }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const hint = await generateWithFallback(ai, {
      parts: [{ text: `${TUTOR_PROMPT}\n\n${describe(body)}` }],
      models: [REASONING_MODEL, ...MODEL_FALLBACKS],
      config: {
        // Warmer than extraction: this is explanatory prose, not transcription.
        temperature: 0.4,
      },
      budgetMs: maxDuration * 1000,
      maxAttemptMs: MAX_ATTEMPT_MS,
    });

    if (!hint?.trim()) {
      return NextResponse.json(
        { error: "The model returned an empty hint" },
        { status: 502 },
      );
    }

    return NextResponse.json({ hint: hint.trim() });
  } catch (error: unknown) {
    const { status, headers, message } = errorResponseInit(error);
    return NextResponse.json({ error: message }, { status, headers });
  }
}

/**
 * The question plus the little the corpus knows about it. Recurrence is worth
 * telling the model: a hint for a question that has been asked six times can
 * point at what the examiner keeps testing rather than at this instance alone.
 */
function describe({ question, topicContext }: TutorRequest): string {
  const lines = [`Question: ${question?.text?.trim()}`];

  if (question?.marks != null) lines.push(`Marks: ${question.marks}`);
  lines.push(
    question?.isNumerical
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
