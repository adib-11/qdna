import type { ParetoPoint, TopicStat } from "@/lib/types";

/**
 * Cumulative coverage curve over topics ranked by frequency.
 *
 * This is the number the tool exists to produce: how few topics account for
 * how much of everything ever asked. It is a description of the corpus, not a
 * forecast — see CON-008.
 */
export function paretoCoverage(stats: TopicStat[]): ParetoPoint[] {
  const total = stats.reduce((sum, stat) => sum + stat.count, 0);
  if (total === 0) return [];

  let running = 0;
  return stats.map((stat) => {
    running += stat.count;
    return {
      topic: stat.topic,
      count: stat.count,
      cumulativePct: (running / total) * 100,
    };
  });
}

/**
 * How many top-ranked topics must be studied to cover `targetPct` of every
 * question asked. Returns the full topic count when the target is
 * unreachable, and 0 for an empty corpus.
 */
export function topicsToReach(stats: TopicStat[], targetPct: number): number {
  const curve = paretoCoverage(stats);
  const index = curve.findIndex((point) => point.cumulativePct >= targetPct);
  return index === -1 ? curve.length : index + 1;
}
