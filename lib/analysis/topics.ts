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
