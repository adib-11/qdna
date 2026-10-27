import {
  GROUPING_ATTEMPT_MS,
  GROUPING_BUDGET_MS,
  MODEL_FALLBACKS,
  REASONING_MODEL,
  TOPIC_MERGE_THRESHOLD,
} from "@/lib/config";
import { similarity } from "@/lib/analysis/lineage";
import { normalizeText } from "@/lib/analysis/normalize";
import { pinTopics, ungroupedLabels, type TopicGrouping } from "@/lib/analysis/topics";
import { corpusTitle } from "@/lib/corpus/courses";
import { generateWithFallback, type ModelClient } from "@/lib/gemini/generate";
import { NEW_LABELS_GROUPING_PROMPT, TOPIC_GROUPING_PROMPT } from "@/lib/gemini/prompts";
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
  const raw = await requestGrouping(
    client,
    `${TOPIC_GROUPING_PROMPT}\n\n${describeLabels(questions)}`,
    signal,
  );
  return parseGrouping(raw, ungroupedLabels(questions));
}

/**
 * Incremental topic grouping, for papers added to a corpus: the model sees the
 * corpus's existing topics and only the labels the corpus has never had, and
 * places each new label in an existing topic or a new one. The result pins
 * every existing label to its current topic and adds the new labels, so no
 * existing topic is renamed or regrouped. Topic overrides still apply on top,
 * since they refer to these topic names.
 */
export async function groupNewLabels(
  client: ModelClient,
  existing: Question[],
  current: TopicGrouping | undefined,
  added: Question[],
  signal?: AbortSignal,
): Promise<TopicGrouping> {
  const pinned = pinTopics(existing, current);
  const grouping = { ...current, ...pinned };
  const labels = ungroupedLabels(added, grouping);
  if (labels.length === 0) return grouping;

  const topics = [...new Set(Object.values(pinned))];
  const raw = await requestGrouping(
    client,
    [
      NEW_LABELS_GROUPING_PROMPT,
      `Course: ${corpusTitle(existing).name}`,
      `Existing topics:\n${topics.map((t) => `- ${t}`).join("\n")}`,
      `New labels:\n${labels.map((l) => `- ${l}`).join("\n")}`,
    ].join("\n\n"),
    signal,
  );
  // An existing topic the model respelled is still that topic.
  const spelled = new Map(topics.map((topic) => [normalizeText(topic), topic]));
  const placed = Object.entries(parseGrouping(raw, labels)).map(
    ([label, topic]) => [label, spelled.get(normalizeText(topic)) ?? topic] as const,
  );
  return { ...grouping, ...Object.fromEntries(placed) };
}

function requestGrouping(client: ModelClient, text: string, signal?: AbortSignal) {
  return generateWithFallback(client, {
    parts: [{ text }],
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
}

/**
 * Every label as one course block: a corpus is one course, so topics fold
 * across its offerings.
 */
function describeLabels(questions: Question[]): string {
  const labels = ungroupedLabels(questions).map((label) => `- ${label}`);
  return `Course: ${corpusTitle(questions).name}\n${labels.join("\n")}`;
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
