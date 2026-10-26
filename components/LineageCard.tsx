import { Fragment } from "react";
import { Pill } from "@/components/ui/Pill";
import { CrossDeptBadge } from "@/components/CrossDeptBadge";
import { NEAR_IDENTICAL_THRESHOLD } from "@/lib/config";
import type { LineageCluster } from "@/lib/types";

const NUMBER_SPLIT = /(\d+(?:\.\d+)?)/g;

/**
 * The numbers an examiner changed.
 *
 * A literal every member shares is part of the question; a literal only some
 * members carry is the parameter that was swapped to make the variant look new.
 * Only the latter is worth emphasising — highlighting the shared ones would
 * bury the signal in noise.
 *
 * Literals are read straight off the rendered text rather than through
 * `numericLiterals`, whose normalisation splits `3.5` into two tokens. That is
 * correct for scoring and wrong for highlighting, which has to line up with the
 * characters actually on screen.
 */
function varyingLiterals(cluster: LineageCluster): Set<string> {
  const perMember = cluster.members.map(
    (question) => new Set(question.text.match(NUMBER_SPLIT) ?? []),
  );
  const all = new Set(perMember.flatMap((set) => [...set]));

  const varying = new Set<string>();
  for (const literal of all) {
    if (!perMember.every((set) => set.has(literal))) varying.add(literal);
  }
  return varying;
}

function QuestionText({
  text,
  varying,
}: {
  text: string;
  varying: Set<string>;
}) {
  const parts = text.split(NUMBER_SPLIT);

  return (
    <p className="max-w-[65ch] break-words">
      {parts.map((part, index) =>
        varying.has(part) ? (
          <mark
            key={index}
            className="rounded-sm bg-surface-3 px-1 font-semibold text-ink underline decoration-ink decoration-2 underline-offset-4"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </p>
  );
}

/**
 * One lineage: the same question as it appeared across papers.
 *
 * Similarity is reported against the first member rather than as a single
 * cluster score, because that is the comparison a user can check by eye — they
 * can read the two questions and judge whether 74% looks right.
 */
export function LineageCard({ cluster }: { cluster: LineageCluster }) {
  const varying = varyingLiterals(cluster);
  const papers = [...new Set(cluster.members.map((q) => q.paper.label))];

  return (
    <article className="min-w-0 border-t border-ink pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill wrap>
          {cluster.topic}
        </Pill>
        <Pill tone="neutral">
          {cluster.members.length} variants · {papers.length} paper
          {papers.length === 1 ? "" : "s"}
        </Pill>
        {cluster.cohesion >= NEAR_IDENTICAL_THRESHOLD && (
          <Pill tone="out">near-identical</Pill>
        )}
        <CrossDeptBadge courseCodes={cluster.courseCodes} />
      </div>

      <ol className="mt-4">
        {cluster.members.map((question, index) => (
          <li
            key={`${question.id}-${index}`}
            className="border-t border-rule py-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Pill tone="neutral">{question.paper.label}</Pill>
                <span className="font-outlier text-sm">{question.qNo}</span>
                {question.marks !== null && (
                  <span className="font-outlier text-sm text-ink-2">
                    {question.marks} marks
                  </span>
                )}
              </div>
              <span className="font-outlier text-sm">
                {index === 0
                  ? "reference"
                  : `${Math.round(cluster.pairwiseSimilarity[index] * 100)}% match`}
              </span>
            </div>

            <div className="mt-2">
              <QuestionText text={question.text} varying={varying} />
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
