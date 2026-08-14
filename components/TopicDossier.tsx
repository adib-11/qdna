"use client";

import { useState } from "react";
import { Pill } from "@/components/ui/Pill";
import type { TopicStat } from "@/lib/types";

/**
 * The evidence table (REQ-009). Every number shown anywhere else in the results
 * view can be audited here: each topic expands to the individual questions that
 * produced its count, each tagged with the paper it came from.
 *
 * The top-ranked topic starts open so the pattern is visible without a click.
 */
function TopicRow({
  stat,
  rank,
  totalQuestions,
  expectedMarks,
  defaultOpen,
}: {
  stat: TopicStat;
  rank: number;
  totalQuestions: number;
  expectedMarks: number | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const share = totalQuestions === 0 ? 0 : (stat.count / totalQuestions) * 100;

  return (
    <div className="border-t border-[var(--border-hairline)] first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-[16px] px-[var(--card-padding)] py-[16px] text-left hover:bg-[rgba(0,0,0,0.02)]"
      >
        <span className="w-[24px] shrink-0 text-caption tabular-nums text-[rgba(0,0,0,0.4)]">
          {rank}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium text-[rgba(0,0,0,0.95)]">
            {stat.topic}
          </span>
          <span className="mt-[4px] block text-caption text-graphite">
            {stat.count} question{stat.count === 1 ? "" : "s"} ·{" "}
            {share.toFixed(1)}% of corpus · {stat.papers.length} paper
            {stat.papers.length === 1 ? "" : "s"}
            {expectedMarks !== null
              ? ` · ${expectedMarks.toFixed(1)} marks per paper`
              : " · marks not recorded"}
          </span>
        </span>

        <span
          aria-hidden
          className="shrink-0 text-caption text-[rgba(0,0,0,0.4)]"
        >
          {open ? "Hide" : "Show"} evidence
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto px-[var(--card-padding)] pb-[24px]">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="text-caption font-medium text-[rgba(0,0,0,0.6)]">
                <th scope="col" className="py-[8px] pr-[16px] font-medium">
                  Paper
                </th>
                <th scope="col" className="py-[8px] pr-[16px] font-medium">
                  Q
                </th>
                <th scope="col" className="py-[8px] pr-[16px] font-medium">
                  Marks
                </th>
                <th scope="col" className="py-[8px] pr-[16px] font-medium">
                  Type
                </th>
                <th scope="col" className="py-[8px] font-medium">
                  Question
                </th>
              </tr>
            </thead>
            <tbody>
              {stat.questions.map((question, index) => (
                <tr
                  key={`${question.id}-${index}`}
                  className="border-t border-[var(--border-hairline)] align-top"
                >
                  <td className="py-[12px] pr-[16px]">
                    <Pill tone="sky-tint">{question.paper.label}</Pill>
                    {question.paper.section && (
                      <span className="mt-[4px] block text-caption text-[rgba(0,0,0,0.4)]">
                        Section {question.paper.section}
                      </span>
                    )}
                  </td>
                  <td className="py-[12px] pr-[16px] text-body-sm tabular-nums text-graphite whitespace-nowrap">
                    {question.qNo}
                  </td>
                  <td className="py-[12px] pr-[16px] text-body-sm tabular-nums text-graphite">
                    {question.marks ?? "—"}
                  </td>
                  <td className="py-[12px] pr-[16px] text-caption text-graphite whitespace-nowrap">
                    {question.isNumerical ? "Numerical" : "Theory"}
                  </td>
                  <td className="py-[12px] text-body-sm break-words text-graphite">
                    {question.text}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function TopicDossier({
  stats,
  expectedMarks,
  totalQuestions,
}: {
  stats: TopicStat[];
  expectedMarks: Record<string, number | null>;
  totalQuestions: number;
}) {
  if (stats.length === 0) return null;

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-pure-white">
      <div className="p-[var(--card-padding)] pb-[16px]">
        <h2 className="text-heading-sm font-bold tracking-[-0.242px]">
          Topic dossier
        </h2>
        <p className="mt-[8px] text-body-sm text-graphite">
          Every topic with the source questions behind its count. Expand a topic
          to check the evidence yourself.
        </p>
      </div>

      <div>
        {stats.map((stat, index) => (
          <TopicRow
            key={stat.topic}
            stat={stat}
            rank={index + 1}
            totalQuestions={totalQuestions}
            expectedMarks={expectedMarks[stat.topic] ?? null}
            defaultOpen={index === 0}
          />
        ))}
      </div>
    </div>
  );
}
