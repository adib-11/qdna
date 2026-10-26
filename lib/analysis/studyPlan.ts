import { PARETO_TARGET_PCT } from "@/lib/config";
import { paretoCoverage, topicsToReach } from "@/lib/analysis/pareto";
import type { StudyPlan, TopicStat } from "@/lib/types";

/**
 * What to study first: the shortest run of top-ranked topics that covers the
 * coverage target, each with the marks it typically carries in one paper.
 *
 * It is a description of what these papers have asked, never a forecast.
 */
export function studyPlan(
  stats: TopicStat[],
  expectedMarks: Record<string, number | null>,
): StudyPlan {
  const curve = paretoCoverage(stats);
  const topics = stats
    .slice(0, topicsToReach(stats, PARETO_TARGET_PCT))
    .map((stat, index) => ({
      topic: stat.topic,
      count: stat.count,
      paperCount: stat.papers.length,
      marksPerPaper: expectedMarks[stat.topic] ?? null,
      cumulativePct: curve[index].cumulativePct,
    }));

  // A total that silently skipped an unmarked topic would understate the plan.
  const marksPerPaper = topics.every((t) => t.marksPerPaper !== null)
    ? topics.reduce((sum, t) => sum + (t.marksPerPaper ?? 0), 0)
    : null;

  return {
    topics,
    marksPerPaper: topics.length === 0 ? null : marksPerPaper,
    coveragePct: topics.at(-1)?.cumulativePct ?? 0,
  };
}
