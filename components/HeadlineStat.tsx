import { Card } from "@/components/ui/Card";
import { PARETO_TARGET_PCT } from "@/lib/config";
import { topicsToReach } from "@/lib/analysis/pareto";
import type { ParetoPoint, TopicStat } from "@/lib/types";

/**
 * The one sentence a user should leave with. Every number in it is computed
 * from the corpus in front of them (GUD-006) — including the coverage
 * percentage, which is the *actual* cumulative figure at the cut-off rank
 * rather than the target percentage that selected the rank.
 */
export function HeadlineStat({
  stats,
  pareto,
  questionCount,
}: {
  stats: TopicStat[];
  pareto: ParetoPoint[];
  questionCount: number;
}) {
  if (stats.length === 0 || pareto.length === 0) return null;

  const rank = topicsToReach(stats, PARETO_TARGET_PCT);
  const coverage = pareto[rank - 1].cumulativePct;

  return (
    <Card tone="marigold" className="p-[36px]">
      <p className="text-caption font-medium tracking-[0.12px] text-[rgba(0,0,0,0.6)]">
        Evidence-weighted prioritization
      </p>

      <p className="mt-[16px] text-heading-sm md:text-heading-lg font-medium tracking-[-0.242px] leading-[1.15] max-w-[900px]">
        {rank} topic{rank === 1 ? "" : "s"} out of {stats.length} cover{" "}
        {coverage.toFixed(1)}% of every question asked
      </p>

      <p className="mt-[16px] text-body-sm text-[rgba(0,0,0,0.6)] max-w-[640px]">
        Measured across {questionCount} extracted question
        {questionCount === 1 ? "" : "s"}. This describes what these papers have
        already asked — it is not a forecast of the next one.
      </p>
    </Card>
  );
}
