import {
  MODEL_BUDGET_MS,
  MODEL_FALLBACKS,
  PRACTICE_PAPER_ATTEMPT_MS,
  PRACTICE_PAPER_EXAMPLE_CHARS,
  PRACTICE_PAPER_EXAMPLES_PER_TOPIC,
  PRACTICE_PAPER_TOPIC_LIMIT,
  REASONING_MODEL,
} from "@/lib/config";
import { generateWithFallback, type ModelClient } from "@/lib/gemini/generate";
import { PRACTICE_PAPER_PROMPT } from "@/lib/gemini/prompts";
import { practicePaperSchema } from "@/lib/gemini/schema";
import type {
  PaperShape,
  PracticePaper,
  PracticeQuestion,
  TopicStat,
} from "@/lib/types";

/** One ranked topic with the evidence and wording behind it. */
export interface PracticePaperTopic {
  topic: string;
  count: number;
  papers: string[];
  examples: string[];
}

export interface PracticePaperInput {
  shape: PaperShape;
  topics: PracticePaperTopic[];
}

/** The ranked topics the paper is written from: the head of the corpus, with examples. */
export function practicePaperTopics(stats: TopicStat[]): PracticePaperTopic[] {
  return stats.slice(0, PRACTICE_PAPER_TOPIC_LIMIT).map((stat) => ({
    topic: stat.topic,
    count: stat.count,
    papers: stat.papers,
    examples: stat.questions
      .slice(0, PRACTICE_PAPER_EXAMPLES_PER_TOPIC)
      .map((q) => q.text),
  }));
}

/**
 * A practice paper in the corpus's measured shape. The structure is sent as a
 * constraint and the schema enumerates the corpus's topics and sections, so
 * only the wording is the model's.
 */
export async function writePracticePaper(
  client: ModelClient,
  { shape, topics }: PracticePaperInput,
  signal?: AbortSignal,
): Promise<PracticePaper> {
  const used = topics.slice(0, PRACTICE_PAPER_TOPIC_LIMIT);
  const topicNames = used.map((t) => t.topic);
  const sectionNames = shape.sections.map((s) => s.name);

  const raw = await generateWithFallback(client, {
    parts: [{ text: `${PRACTICE_PAPER_PROMPT}\n\n${describe(shape, used)}` }],
    models: [REASONING_MODEL, ...MODEL_FALLBACKS],
    config: {
      responseMimeType: "application/json",
      responseSchema: practicePaperSchema(topicNames, sectionNames),
      // Question writing needs some freedom; the schema holds the shape.
      temperature: 0.6,
    },
    budgetMs: MODEL_BUDGET_MS,
    maxAttemptMs: PRACTICE_PAPER_ATTEMPT_MS,
    signal,
  });

  return parsePracticePaper(raw, shape, topicNames);
}

/**
 * Keep only questions that resolve against the corpus, so every evidence line
 * under them is looked up rather than invented.
 */
export function parsePracticePaper(
  raw: string | undefined,
  shape: PaperShape,
  topicNames: string[],
): PracticePaper {
  if (!raw) throw new Error("The model returned an empty paper");

  const sectionNames = shape.sections.map((s) => s.name);
  const parsed = JSON.parse(raw) as Partial<PracticePaper>;
  const questions = (parsed.questions ?? []).filter(
    (q): q is PracticeQuestion =>
      Boolean(q?.text?.trim()) &&
      topicNames.includes(q.topic) &&
      sectionNames.includes(q.section),
  );

  if (questions.length === 0) {
    throw new Error("The model produced no usable questions");
  }

  return {
    title: parsed.title?.trim() || `${shape.course} — practice paper`,
    instructions: parsed.instructions?.trim() ?? "",
    questions,
  };
}

/** The measured corpus, rendered for the model. */
function describe(shape: PaperShape, topics: PracticePaperTopic[]): string {
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
    for (const example of topic.examples.slice(0, PRACTICE_PAPER_EXAMPLES_PER_TOPIC)) {
      lines.push(`  - "${example.slice(0, PRACTICE_PAPER_EXAMPLE_CHARS)}"`);
    }
  }

  return lines.join("\n");
}
