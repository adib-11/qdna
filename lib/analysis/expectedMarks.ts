import type { TopicStat } from "@/lib/types";

/**
 * Mean marks a topic is worth per paper.
 *
 * Questions whose marks the paper never stated — or that OCR could not read —
 * are excluded from the sum rather than counted as zero. Counting them as zero
 * would silently understate every topic that appears on a paper with an
 * unlabelled mark scheme, and the user has no way to see that happening.
 * A topic with no readable marks at all reports `null`, which the UI renders
 * as "not recorded" rather than as a number.
 */
export function expectedMarks(
  stats: TopicStat[],
  paperCount: number,
): Record<string, number | null> {
  const result: Record<string, number | null> = {};

  for (const stat of stats) {
    const marked = stat.questions.filter((q) => q.marks !== null);
    result[stat.topic] =
      marked.length === 0 || paperCount === 0
        ? null
        : marked.reduce((sum, q) => sum + (q.marks ?? 0), 0) / paperCount;
  }

  return result;
}
