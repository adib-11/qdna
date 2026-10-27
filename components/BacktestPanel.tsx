"use client";

import { useMemo, useState } from "react";
import { backtest, defaultHeldOutPaper } from "@/lib/analysis/backtest";
import { paperOrder } from "@/lib/analysis/papers";
import { paperName, type PaperInfo } from "@/lib/corpus/courses";
import type { AnalysisResult } from "@/lib/types";

/**
 * The honest test: hide a paper, rank topics from the rest, then check the
 * ranking against what that paper actually asked.
 *
 * Whatever the number turns out to be, it is shown as measured (RISK-007). A
 * modest figure with a visible method is worth more than a confident claim
 * with none.
 */
export function BacktestPanel({
  result,
  names,
}: {
  result: AnalysisResult;
  names: Map<string, PaperInfo>;
}) {
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
        <h3 className="text-lg tracking-[-0.02em]">Backtest</h3>
        <p className="mt-2 max-w-[65ch] text-ink-2">
          A backtest needs at least two papers: one to hide, and the rest to
          build the ranking from. Add another paper from this course to see how
          well the ranking would have called it.
        </p>
      </div>
    );
  }

  const name = (label: string) => paperName(names, label);

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
        <h3 className="text-lg tracking-[-0.02em]">Backtest</h3>

        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold print:hidden">
          Hold out
          <select
            value={heldOut ?? ""}
            onChange={(e) => setHeldOut(e.target.value)}
            className="min-h-11 max-w-full rounded-control border border-muted bg-surface px-3 text-md font-normal"
          >
            {papers.map((paper) => (
              <option key={paper.label} value={paper.label}>
                {name(paper.label)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 max-w-[65ch]">
        Hiding <b>{name(report.heldOutPaper)}</b>, the ranking from the other{" "}
        {report.trainingPapers.length} paper{report.trainingPapers.length === 1 ? "" : "s"} named
        the topic of{" "}
        <b>
          {report.questionsCovered} of its {report.questionsHeldOut} questions
        </b>{" "}
        ({report.overlapPct.toFixed(1)}%).
      </p>
      {/* Counted independently of the topic ranking: a question can be a
          recycled one whose topic the ranking still missed. */}
      {recurrences > 0 && (
        <p className="mt-2 max-w-[65ch] text-sm text-ink-2">
          Separately, {recurrences} of its {report.questionsHeldOut} question
          {report.questionsHeldOut === 1 ? "" : "s"} {recurrences === 1 ? "was" : "were"} a
          direct variant of a question asked in an earlier paper.
        </p>
      )}

      {/* Teal is a match: a topic of the hidden paper the ranking named. */}
      <ul aria-label={`Topics ${name(report.heldOutPaper)} asked`} className="mt-3 flex flex-wrap gap-2">
        {report.hits.map((stat) => (
          <li key={stat.topic} className="rounded-[4px] bg-accent-soft px-2 text-sm text-accent-soft-ink">
            {stat.topic}
            <span className="sr-only">, named</span>
          </li>
        ))}
        {report.misses.map((stat) => (
          <li key={stat.topic} className="rounded-[4px] px-2 text-sm text-muted ring-1 ring-inset ring-rule">
            {stat.topic}
            <span className="sr-only">, missed</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
