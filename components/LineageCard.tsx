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
    <p className="text-body-sm break-words text-graphite">
      {parts.map((part, index) =>
        varying.has(part) ? (
          <mark
            key={index}
            className="rounded-[var(--radius-md)] bg-marigold px-[4px] font-medium text-ink-black"
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
    <article className="min-w-0 rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-pure-white p-[var(--card-padding)]">
      <div className="flex flex-wrap items-center gap-[8px]">
        <Pill tone="sky-tint" wrap>
          {cluster.topic}
        </Pill>
        <Pill tone="neutral">
          {cluster.members.length} variants · {papers.length} paper
          {papers.length === 1 ? "" : "s"}
        </Pill>
        {cluster.cohesion >= NEAR_IDENTICAL_THRESHOLD && (
          <Pill tone="marigold">near-identical</Pill>
        )}
        <CrossDeptBadge courseCodes={cluster.courseCodes} />
      </div>

      <ol className="mt-[16px]">
        {cluster.members.map((question, index) => (
          <li
            key={`${question.id}-${index}`}
            className="border-t border-[var(--border-hairline)] py-[12px] first:border-t-0 first:pt-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-[8px]">
              <div className="flex flex-wrap items-center gap-[8px]">
                <Pill tone="neutral">{question.paper.label}</Pill>
                <span className="text-caption text-[rgba(0,0,0,0.6)]">
                  {question.qNo}
                  {question.marks !== null ? ` · ${question.marks} marks` : ""}
                </span>
              </div>
              <span className="text-caption font-medium tabular-nums text-notion-blue">
                {index === 0
                  ? "reference"
                  : `${Math.round(cluster.pairwiseSimilarity[index] * 100)}% match`}
              </span>
            </div>

            <div className="mt-[8px]">
              <QuestionText text={question.text} varying={varying} />
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
