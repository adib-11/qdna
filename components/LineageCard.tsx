import { Fragment } from "react";
import { Marks, PaperLabel } from "@/components/Marks";
import { lineageVariants } from "@/lib/analysis/lineage";
import type { PaperInfo } from "@/lib/corpus/courses";
import type { LineageCluster } from "@/lib/types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * One lineage: the same question as it appeared across papers, oldest first,
 * one variant to a row. The highlighter marks the numbers the examiner changed
 * from the variant before, and the % match compares the same two, so a student
 * can read both and judge whether 74% looks right.
 */
export function LineageCard({
  cluster,
  names,
}: {
  cluster: LineageCluster;
  names: Map<string, PaperInfo>;
}) {
  const variants = lineageVariants(cluster);
  const paperCount = new Set(cluster.members.map((q) => q.paper.label)).size;

  return (
    <article className="border-t border-ink pt-5 pb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="max-w-none text-lg tracking-[-0.02em]">{cluster.topic}</h3>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
          <span>
            {plural(cluster.members.length, "variant")} in {plural(paperCount, "paper")}
          </span>{" "}
          {/* The least expected finding: the same question set into two
              departments' papers, so a student can revise from a course they
              were never enrolled in. */}
          {cluster.crossDepartment && (
            <span className="font-semibold text-ink" title={cluster.courseCodes.join(" · ")}>
              asked in both departments
            </span>
          )}
        </p>
      </div>

      <ol className="mt-4">
        {variants.map(({ question, match, parts }, index) => (
          <li
            key={`${question.id}-${index}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-t border-rule-2 py-4 [grid-template-areas:'y_m'_'t_t'] sm:grid-cols-[6rem_minmax(0,1fr)_9rem] sm:gap-x-6 sm:[grid-template-areas:'y_t_m']"
          >
            <span className="font-outlier font-semibold [grid-area:y]">
              {question.paper.year ?? "undated"}
            </span>
            <div className="min-w-0 [grid-area:t]">
              <p className="max-w-[70ch] text-[1.0625rem] break-words">
                {parts.map((part, i) =>
                  part.changed ? (
                    <mark key={i}>{part.text}</mark>
                  ) : (
                    <Fragment key={i}>{part.text}</Fragment>
                  ),
                )}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
                <PaperLabel question={question} names={names} />{" "}
                <span className="font-outlier">Q{question.qNo}</span>{" "}
                {match !== null && (
                  <span className="text-xs text-accent">{Math.round(match * 100)}% match</span>
                )}
              </p>
            </div>
            <Marks value={question.marks} className="text-right [grid-area:m] sm:text-lg" />
          </li>
        ))}
      </ol>
    </article>
  );
}
