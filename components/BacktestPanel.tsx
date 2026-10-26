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
      <div>
        <h3 className="text-xl sm:text-2xl">Backtest</h3>
        <p className="mt-3 max-w-[65ch] text-ink-2">
          A backtest needs at least two papers: one to hide, and the rest to
          build the ranking from. Add another paper from this course to see how
          well the ranking would have called it.
        </p>
      </div>
    );
  }

  const named = report.rankedTopics.length;

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h3 className="text-xl sm:text-2xl">Backtest</h3>

        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold print:hidden">
          Hold out
          <select
            value={heldOut ?? ""}
            onChange={(e) => setHeldOut(e.target.value)}
            className="min-h-11 max-w-full rounded-control border border-muted bg-surface px-3 text-md font-normal"
          >
            {papers.map((paper) => (
              <option key={paper.label} value={paper.label}>
                {paper.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Card className="mt-6">
        <p className="text-sm font-semibold text-ink-2">
          {report.trainingPapers.length} paper
          {report.trainingPapers.length === 1 ? "" : "s"} in, {report.heldOutPaper}{" "}
          hidden
        </p>

        <p className="mt-4 max-w-[28ch] text-2xl leading-[1.1] font-bold tracking-(--tracking-display) text-balance md:text-3xl">
          The {named} topic{named === 1 ? "" : "s"} ranked from the other papers
          covered {report.overlapPct.toFixed(1)}% of {report.heldOutPaper}
        </p>

        <p className="mt-6 max-w-[65ch] text-ink-2">
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

      <div className="mt-16 grid gap-x-8 gap-y-16 lg:grid-cols-2">
        <div className="min-w-0">
          <h4 className="text-lg font-bold">Ranked from the other papers</h4>
          <p className="mt-2 text-sm text-ink-2">
            The topics qDNA would have told you to study, in order.
          </p>
          <ol className="mt-4 border-t border-ink">
            {report.rankedTopics.map((stat, index) => (
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
        </div>

        <div className="min-w-0">
          <h4 className="text-lg font-bold">What {report.heldOutPaper} actually asked</h4>
          <p className="mt-2 text-sm text-ink-2">
            Every topic on the hidden paper, by question count.
          </p>
          <ol className="mt-4 border-t border-ink">
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
        </div>
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
    <li className="flex items-baseline gap-3 border-b border-rule py-2">
      <span className="w-8 shrink-0 font-outlier text-sm text-ink-2">{rank}</span>
      <span className="min-w-0 flex-1 break-words">{stat.topic}</span>
      {hit ? (
        <Pill tone="in">matched</Pill>
      ) : showMiss ? (
        <Pill tone="out">missed</Pill>
      ) : null}
      <span className="w-10 shrink-0 text-right font-outlier text-sm text-ink-2">
        ×{stat.count}
      </span>
    </li>
  );
}
