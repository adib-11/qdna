import {
  GROUPING_ATTEMPT_MS,
  GROUPING_BUDGET_MS,
  MODEL_FALLBACKS,
  REASONING_MODEL,
  TOPIC_MERGE_THRESHOLD,
} from "@/lib/config";
import { similarity } from "@/lib/analysis/lineage";
import { normalizeText } from "@/lib/analysis/normalize";
import { ungroupedLabels, type TopicGrouping } from "@/lib/analysis/topics";
import { generateWithFallback, type ModelClient } from "@/lib/gemini/generate";
import { TOPIC_GROUPING_PROMPT } from "@/lib/gemini/prompts";
import { TOPIC_GROUPING_SCHEMA } from "@/lib/gemini/schema";
import type { Question } from "@/lib/types";

/**
 * Topic grouping: one model request for the whole corpus, which receives every
 * distinct topic label and returns the topic each one names.
 */
export async function groupTopics(
  client: ModelClient,
  questions: Question[],
  signal?: AbortSignal,
): Promise<TopicGrouping> {
  const raw = await generateWithFallback(client, {
    parts: [{ text: `${TOPIC_GROUPING_PROMPT}\n\n${describeLabels(questions)}` }],
    models: [REASONING_MODEL, ...MODEL_FALLBACKS],
    config: {
      responseMimeType: "application/json",
      responseSchema: TOPIC_GROUPING_SCHEMA,
      temperature: 0,
    },
    budgetMs: GROUPING_BUDGET_MS,
    maxAttemptMs: GROUPING_ATTEMPT_MS,
    signal,
  });
  return parseGrouping(raw, ungroupedLabels(questions));
}

/** Labels listed under their course, so the model never folds across courses. */
function describeLabels(questions: Question[]): string {
  const byCourse = new Map<string, Set<string>>();
  for (const q of questions) {
    const label = q.topic.trim();
    if (!label) continue;
    const course = q.course.trim() || "Unnamed course";
    byCourse.set(course, (byCourse.get(course) ?? new Set()).add(label));
  }
  return [...byCourse]
    .map(([course, labels]) => `Course: ${course}\n${[...labels].map((l) => `- ${l}`).join("\n")}`)
    .join("\n\n");
}

/**
 * The model's topics as a map over the labels that were sent. A label the
 * model returned with different case or spacing still counts; one it invented
 * is ignored. One it left out joins the topic of the closest label already
 * placed, as lexical folding would have folded the two, or else keeps its own
 * name, since the pass has seen it.
 */
export function parseGrouping(raw: string | undefined, labels: string[]): TopicGrouping {
  if (!raw) throw new Error("The model returned no topic grouping");
  const parsed = JSON.parse(raw) as { topics?: { topic?: string; labels?: string[] }[] };
  const sent = new Map(labels.map((label) => [normalizeText(label), label]));

  // A Map, so a label such as "constructor" is never mistaken for a key.
  const grouping = new Map<string, string>();
  for (const { topic, labels: folded = [] } of parsed.topics ?? []) {
    const name = topic?.trim();
    if (!name) continue;
    for (const returned of folded) {
      const label = labels.includes(returned) ? returned : sent.get(normalizeText(returned));
      if (label && !grouping.has(label)) grouping.set(label, name);
    }
  }
  const placed = [...grouping.keys()];
  for (const label of labels) {
    if (grouping.has(label)) continue;
    let closest = label;
    let best = TOPIC_MERGE_THRESHOLD;
    for (const other of placed) {
      const score = similarity(label, other);
      if (score >= best) [closest, best] = [other, score];
    }
    grouping.set(label, grouping.get(closest) ?? label);
    // Later left-out labels fold into this one too, as lexical folding would.
    placed.push(label);
  }
  return Object.fromEntries(grouping);
}
