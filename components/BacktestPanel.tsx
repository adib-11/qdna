"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { backtest, defaultHeldOutPaper } from "@/lib/analysis/backtest";
import { paperOrder } from "@/lib/analysis/papers";
import type { AnalysisResult, TopicStat } from "@/lib/types";

/**
 * The honest test: hide a paper, rank topics from the rest, then check the
 * ranking against what that paper actually asked.
 *
 * Whatever the number turns out to be, it is shown as measured (RISK-007). A
 * modest figure with a visible method is worth more than a confident claim
 * with none.
 */
export function BacktestPanel({ result }: { result: AnalysisResult }) {
  const papers = useMemo(() => paperOrder(result.questions), [result.questions]);
  const initial = useMemo(
    () => defaultHeldOutPaper(result.questions),
    [result.questions],
  );
  const [heldOut, setHeldOut] = useState<string | null>(initial);

  const report = useMemo(
    () => (heldOut ? backtest(result.questions, heldOut) : null),
    [result.questions, heldOut],
  );

  if (papers.length < 2 || !report) {
    return (
      <Card tone="white">
        <h2 className="text-heading-sm font-bold tracking-[-0.242px]">
          Backtest
        </h2>
        <p className="mt-[16px] text-body-sm text-graphite max-w-[640px]">
          A backtest needs at least two papers: one to hide, and the rest to
          build the ranking from. Add another paper from this course to see how
          well the ranking would have called it.
        </p>
      </Card>
    );
  }

  const named = report.predictedTopics.length;

  // Questions on the hidden paper that an earlier paper had already asked, in
  // some other clothes — counted as questions, not as clusters.
  const recurrences = new Set(
    report.matchedLineages.flatMap((cluster) =>
      cluster.members
        .filter((m) => m.paper.label === report.heldOutPaper)
        .map((m) => m.id),
    ),
  ).size;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-[16px]">
        <h2 className="text-heading-sm font-bold tracking-[-0.242px]">
          Backtest
        </h2>

        <label className="flex items-center gap-[8px] text-body-sm text-graphite">
          Hold out
          <select
            value={heldOut ?? ""}
            onChange={(e) => setHeldOut(e.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--border-hairline)] bg-pure-white px-[12px] py-[4px] text-body-sm text-ink-black"
          >
            {papers.map((paper) => (
              <option key={paper.label} value={paper.label}>
                {paper.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Card tone="sky-wash" className="mt-[24px] p-[36px]">
        <p className="text-caption font-medium tracking-[0.12px] text-[rgba(0,0,0,0.6)]">
          {report.trainingPapers.length} paper
          {report.trainingPapers.length === 1 ? "" : "s"} in, {report.heldOutPaper}{" "}
          hidden
        </p>

        <p className="mt-[16px] text-heading-sm md:text-heading-lg font-medium tracking-[-0.242px] leading-[1.15] max-w-[900px]">
          The {named} topic{named === 1 ? "" : "s"} ranked from the other papers
          covered {report.overlapPct.toFixed(1)}% of {report.heldOutPaper}
        </p>

        <p className="mt-[16px] text-body-sm text-[rgba(0,0,0,0.6)] max-w-[720px]">
          {report.questionsCovered} of {report.questionsHeldOut} questions on
          that paper came from a topic the ranking had already named — without
          ever seeing it. {recurrences > 0 && (
            <>
              {/* Counted independently of the topic ranking: a question can be
                  a recycled one whose topic the ranking still missed. */}
              Separately, {recurrences} of its {report.questionsHeldOut}{" "}
              question{report.questionsHeldOut === 1 ? "" : "s"}{" "}
              {recurrences === 1 ? "was" : "were"} a direct variant of a
              question asked in an earlier paper.
            </>
          )}
        </p>
      </Card>

      <div className="mt-[24px] grid gap-[24px] lg:grid-cols-2">
        <Card tone="white">
          <h3 className="text-body font-medium">
            Ranked from the other papers
          </h3>
          <p className="mt-[8px] text-caption text-graphite">
            The topics qDNA would have told you to study, in order.
          </p>
          <ol className="mt-[16px] space-y-[8px]">
            {report.predictedTopics.map((stat, index) => (
              <TopicRow
                key={stat.topic}
                rank={index + 1}
                stat={stat}
                hit={report.hits.some(
                  (h) => h.topic.toLowerCase() === stat.topic.toLowerCase(),
                )}
              />
            ))}
          </ol>
        </Card>

        <Card tone="white">
          <h3 className="text-body font-medium">
            What {report.heldOutPaper} actually asked
          </h3>
          <p className="mt-[8px] text-caption text-graphite">
            Every topic on the hidden paper, by question count.
          </p>
          <ol className="mt-[16px] space-y-[8px]">
            {report.actualTopics.map((stat, index) => (
              <TopicRow
                key={stat.topic}
                rank={index + 1}
                stat={stat}
                hit={report.hits.some(
                  (h) => h.topic.toLowerCase() === stat.topic.toLowerCase(),
                )}
                showMiss
              />
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}

function TopicRow({
  rank,
  stat,
  hit,
  showMiss = false,
}: {
  rank: number;
  stat: TopicStat;
  hit: boolean;
  showMiss?: boolean;
}) {
  return (
    <li className="flex items-baseline gap-[12px]">
      <span className="w-[20px] shrink-0 text-caption tabular-nums text-[rgba(0,0,0,0.4)]">
        {rank}
      </span>
      <span className="min-w-0 flex-1 text-body-sm text-ink-black break-words">
        {stat.topic}
      </span>
      {hit ? (
        <Pill tone="sky-tint">matched</Pill>
      ) : showMiss ? (
        <Pill tone="peach">missed</Pill>
      ) : null}
      <span className="shrink-0 text-caption tabular-nums text-graphite">
        ×{stat.count}
      </span>
    </li>
  );
}
