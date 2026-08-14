import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import {
  MODEL_FALLBACKS,
  PREDICT_EXAMPLE_CHARS,
  PREDICT_EXAMPLES_PER_TOPIC,
  PREDICT_TOPIC_LIMIT,
  REASONING_MODEL,
} from "@/lib/config";
import { errorResponseInit, generateWithFallback } from "@/lib/gemini/generate";
import { PREDICT_PROMPT } from "@/lib/gemini/prompts";
import { predictionSchema } from "@/lib/gemini/schema";
import type { PaperShape, PredictedPaper, PredictedQuestion } from "@/lib/types";

export const runtime = "nodejs";
// Raised from the planned 45s for the same reason the extraction route was:
// measured, a whole paper of original questions plus rationales takes a flash
// model 35s and more, so 45 kills real work instead of catching a runaway.
export const maxDuration = 60;

/** Longest a single model attempt may run. */
const MAX_ATTEMPT_MS = 50_000;

/** One ranked topic with the evidence and wording behind it. */
export interface PredictTopicInput {
  topic: string;
  count: number;
  papers: string[];
  examples: string[];
}

interface PredictRequest {
  shape?: PaperShape;
  topics?: PredictTopicInput[];
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  let body: PredictRequest;
  try {
    body = (await request.json()) as PredictRequest;
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const shape = body.shape;
  const topics = (body.topics ?? []).slice(0, PREDICT_TOPIC_LIMIT);

  if (!shape || shape.sections.length === 0 || topics.length === 0) {
    return NextResponse.json(
      { error: "A paper shape and at least one topic are required" },
      { status: 400 },
    );
  }

  const topicNames = topics.map((t) => t.topic);
  const sectionNames = shape.sections.map((s) => s.name);

  const ai = new GoogleGenAI({ apiKey });

  try {
    const raw = await generateWithFallback(ai, {
      parts: [{ text: `${PREDICT_PROMPT}\n\n${describe(shape, topics)}` }],
      models: [REASONING_MODEL, ...MODEL_FALLBACKS],
      config: {
        responseMimeType: "application/json",
        responseSchema: predictionSchema(topicNames, sectionNames),
        // Question writing needs some freedom; the schema holds the shape.
        temperature: 0.6,
      },
      budgetMs: maxDuration * 1000,
      maxAttemptMs: MAX_ATTEMPT_MS,
    });

    if (!raw) {
      return NextResponse.json(
        { error: "The model returned an empty paper" },
        { status: 502 },
      );
    }

    const parsed = JSON.parse(raw) as Partial<PredictedPaper>;
    const questions = (parsed.questions ?? []).filter(
      (q): q is PredictedQuestion =>
        Boolean(q?.text?.trim()) &&
        topicNames.includes(q.topic) &&
        sectionNames.includes(q.section),
    );

    if (questions.length === 0) {
      return NextResponse.json(
        { error: "The model produced no usable questions" },
        { status: 502 },
      );
    }

    const paper: PredictedPaper = {
      title: parsed.title?.trim() || `${shape.course} — practice paper`,
      instructions: parsed.instructions?.trim() ?? "",
      questions,
    };

    return NextResponse.json({ paper });
  } catch (error: unknown) {
    const { status, headers, message } = errorResponseInit(error);
    return NextResponse.json({ error: message }, { status, headers });
  }
}

/** The measured corpus, rendered for the model. */
function describe(shape: PaperShape, topics: PredictTopicInput[]): string {
  const lines: string[] = [
    `Course: ${shape.course}${shape.courseCodes.length ? ` (${shape.courseCodes.join(", ")})` : ""}`,
    `Paper type: ${shape.type}`,
    `Measured from ${shape.paperCount} past paper${shape.paperCount === 1 ? "" : "s"}, typically ${shape.questionsPerPaper} questions${shape.marksPerPaper !== null ? ` totalling ${shape.marksPerPaper} marks` : ""}.`,
    "",
    "Structure to follow:",
  ];

  for (const section of shape.sections) {
    lines.push(
      `- Section ${section.name}: ${section.questionsPerPaper} question${section.questionsPerPaper === 1 ? "" : "s"}` +
        (section.markValues.length
          ? `, mark values used here: ${section.markValues.join(", ")}`
          : ", marks not printed on the source papers — return null for marks"),
    );
  }

  lines.push("", "Topics, most examined first:");

  for (const topic of topics) {
    lines.push(
      `\n## ${topic.topic} — asked ${topic.count} time${topic.count === 1 ? "" : "s"} across ${topic.papers.length} paper${topic.papers.length === 1 ? "" : "s"}`,
    );
    for (const example of topic.examples.slice(0, PREDICT_EXAMPLES_PER_TOPIC)) {
      lines.push(`  - "${example.slice(0, PREDICT_EXAMPLE_CHARS)}"`);
    }
  }

  return lines.join("\n");
}
