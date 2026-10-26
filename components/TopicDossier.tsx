"use client";

import { useEffect, useState } from "react";
import { useRequestKey } from "@/components/OwnKeyProvider";
import { TutorPanel } from "@/components/TutorPanel";
import { Pill } from "@/components/ui/Pill";
import type { Question, TopicStat } from "@/lib/types";

/** Id of a topic's row, by rank, so the study plan can link to it. */
export const topicAnchor = (rank: number) => `topic-${rank}`;

/**
 * The questions behind every count (REQ-009), topics in study plan order. Each
 * topic expands to the individual questions that produced its count, each
 * tagged with its paper, number and marks, and each with a hint.
 *
 * The top-ranked topic starts open so the pattern is visible without a click.
 */
function TopicRow({
  stat,
  rank,
  totalQuestions,
  expectedMarks,
  defaultOpen,
  onAskTutor,
}: {
  stat: TopicStat;
  rank: number;
  totalQuestions: number;
  expectedMarks: number | null;
  defaultOpen: boolean;
  onAskTutor: (question: Question) => void;
}) {
  const id = topicAnchor(rank);
  // Rows mount only after the corpus is read from browser storage, so the
  // URL is always there to check.
  const [open, setOpen] = useState(
    () => defaultOpen || window.location.hash === `#${id}`,
  );
  const share = totalQuestions === 0 ? 0 : (stat.count / totalQuestions) * 100;

  // A link to this topic opens it. Clicks are heard directly, since clicking
  // a link to the hash already in the URL fires no hashchange.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element).closest?.(`a[href="#${id}"]`)) setOpen(true);
    };
    const onHashChange = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    document.addEventListener("click", onClick);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [id]);

  return (
    <div
      id={id}
      // Clears the sticky section nav, as the page's sections do.
      className="scroll-mt-[64px] border-t border-[var(--border-hairline)] first:border-t-0"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-[12px] px-[var(--card-padding)] py-[16px] text-left hover:bg-[rgba(0,0,0,0.02)]"
      >
        <span className="w-[24px] shrink-0 text-caption tabular-nums text-[rgba(0,0,0,0.6)]">
          {rank}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block break-words text-body font-medium text-[rgba(0,0,0,0.95)]">
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
          className="shrink-0 text-caption text-[rgba(0,0,0,0.6)] print:hidden"
        >
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {/* Always rendered, so the print view carries every question. */}
      <ol
        className={`${open ? "" : "hidden"} px-[var(--card-padding)] pb-[16px] print:block`}
      >
        {stat.questions.map((question, index) => (
          <li
            key={`${question.id}-${index}`}
            className="border-t border-[var(--border-hairline)] py-[12px]"
          >
            <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[4px] text-caption text-graphite">
              <Pill tone="sky-tint" wrap>
                {question.paper.label}
              </Pill>
              {question.paper.section && (
                <span>Section {question.paper.section}</span>
              )}
              <span className="tabular-nums">{question.qNo}</span>
              <span className="tabular-nums">
                {question.marks === null ? "marks not stated" : `${question.marks} marks`}
              </span>
              <span>{question.isNumerical ? "Numerical" : "Theory"}</span>
            </div>
            <p className="mt-[8px] break-words text-body-sm text-graphite">
              {question.text}
            </p>
            <button
              type="button"
              onClick={() => onAskTutor(question)}
              className="mt-[8px] rounded-[var(--radius-lg)] bg-sky-tint px-[12px] py-[4px] text-caption font-medium text-notion-blue hover:bg-[#d8ecfd] print:hidden"
            >
              Hint
            </button>
          </li>
        ))}
      </ol>
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
  const requestKey = useRequestKey();
  const [asked, setAsked] = useState<{
    question: Question;
    stat: TopicStat;
    apiKey: string;
  } | null>(null);

  /** A hint is a model action, so this is where the key is asked for. */
  async function askTutor(question: Question, stat: TopicStat) {
    const apiKey = await requestKey();
    if (apiKey) setAsked({ question, stat, apiKey });
  }

  if (stats.length === 0) return null;

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-pure-white">
      <div className="p-[var(--card-padding)] pb-[16px]">
        <h2 className="text-heading-sm font-bold tracking-[-0.242px]">
          Questions
        </h2>
        <p className="mt-[8px] text-body-sm text-graphite">
          Every topic, in study plan order, with the questions behind its count.
          Open a topic to practise; ask for a hint on any question.
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
            onAskTutor={(question) => void askTutor(question, stat)}
          />
        ))}
      </div>

      {asked && (
        <TutorPanel
          question={asked.question}
          stat={asked.stat}
          apiKey={asked.apiKey}
          onClose={() => setAsked(null)}
        />
      )}
    </div>
  );
}
