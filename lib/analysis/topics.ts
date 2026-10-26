import { TOPIC_MERGE_THRESHOLD } from "@/lib/config";
import { similarity } from "@/lib/analysis/lineage";
import type { Question } from "@/lib/types";

/**
 * Fold topic labels that name the same thing.
 *
 * The taxonomy is inferred per upload and never hardcoded (REQ-003), which is
 * the right call — but extraction runs a batch at a time, and two batches
 * reading the same course independently produce "Software Testing" and
 * "Software Testing Strategies", or "Cache Memory" and "Cache Memories". Left
 * alone those are two rows on the genome map, two entries in the Pareto curve,
 * and two topics that never recognise each other in the backtest, all for one
 * subject.
 *
 * Merging is greedy against the most-asked label rather than agglomerative:
 * chaining would let A-B and B-C drag A and C together even when they name
 * different things. A label only ever merges into a more frequent one, so the
 * surviving name is the one the corpus uses most.
 */
export function canonicalizeTopics(
  questions: Question[],
  threshold: number = TOPIC_MERGE_THRESHOLD,
): Question[] {
  const counts = new Map<string, number>();
  for (const question of questions) {
    const label = question.topic.trim();
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  // Most-asked first, ties broken alphabetically so the result never depends
  // on the order the pages happened to come back in.
  const labels = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);

  const canonical = new Map<string, string>();
  for (const label of labels) {
    let target = label;
    let best = threshold;

    for (const other of labels) {
      if (other === label) break; // only fold into a strictly more common label
      if (canonical.get(other) !== other) continue; // never fold into a folded one
      const score = similarity(label, other);
      if (score >= best) {
        best = score;
        target = other;
      }
    }
    canonical.set(label, target);
  }

  return questions.map((question) => {
    const label = question.topic.trim();
    const target = canonical.get(label);
    return target && target !== question.topic
      ? { ...question, topic: target }
      : question;
  });
}

/** Topic grouping's output: each topic label mapped to the topic it names. */
export type TopicGrouping = Record<string, string>;

/**
 * A student's merge (several topics into `to`) or rename (one topic to `to`).
 * Applied in order, each to the topics the ones before it produced.
 */
export interface TopicOverride {
  from: string[];
  to: string;
}

export interface TopicInputs {
  grouping?: TopicGrouping;
  overrides?: TopicOverride[];
}

/**
 * Each question's topic, by precedence: a topic override beats the topic
 * grouping, which beats lexical folding. Lexical folding only sees the labels
 * the grouping has not mapped, so it can never undo the grouping's call.
 */
export function resolveTopics(
  questions: Question[],
  { grouping = {}, overrides = [] }: TopicInputs = {},
): Question[] {
  const grouped = new Map(Object.entries(grouping));
  const folded = canonicalizeTopics(
    questions.filter((q) => !grouped.has(q.topic.trim())),
  );

  let next = 0;
  return questions.map((question) => {
    let topic = grouped.get(question.topic.trim()) ?? folded[next++].topic;
    for (const override of overrides) {
      if (override.from.includes(topic)) topic = override.to;
    }
    return topic === question.topic ? question : { ...question, topic };
  });
}

/** Topic labels the grouping has not seen yet. Grouping is pending while any remain. */
export function ungroupedLabels(
  questions: Question[],
  grouping: TopicGrouping = {},
): string[] {
  const grouped = new Map(Object.entries(grouping));
  return [
    ...new Set(questions.map((q) => q.topic.trim()).filter((l) => l && !grouped.has(l))),
  ];
}
