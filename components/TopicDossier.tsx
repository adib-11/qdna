"use client";

import { useEffect, useState } from "react";
import { useRequestKey } from "@/components/OwnKeyProvider";
import { TutorPanel } from "@/components/TutorPanel";
import { Button } from "@/components/ui/Button";
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
      className="scroll-mt-[64px] border-b border-rule"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-4 text-left transition-[background-color] duration-(--dur-micro) ease-out hover:bg-surface-2 active:bg-surface-3 sm:grid-cols-[3rem_minmax(0,1fr)_auto]"
      >
        <span className="font-outlier text-sm text-ink-2">{rank}</span>

        <span className="min-w-0">
          <span className="block break-words text-lg font-semibold">
            {stat.topic}
          </span>
          <span className="mt-1 flex flex-wrap gap-x-4 text-sm text-ink-2 tabular-nums">
            <span>
              {stat.count} question{stat.count === 1 ? "" : "s"}
            </span>{" "}
            <span>{share.toFixed(1)}% of corpus</span>{" "}
            <span>
              {stat.papers.length} paper{stat.papers.length === 1 ? "" : "s"}
            </span>{" "}
            <span>
              {expectedMarks !== null
                ? `${expectedMarks.toFixed(1)} marks per paper`
                : "marks not recorded"}
            </span>
          </span>
        </span>

        <span
          aria-hidden
          className="text-sm font-semibold underline decoration-rule underline-offset-4 print:hidden"
        >
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {/* Always rendered, so the print view carries every question. */}
      <ol
        className={`${open ? "" : "hidden"} pb-4 print:block sm:pl-[3.75rem]`}
      >
        {stat.questions.map((question, index) => (
          <li
            key={`${question.id}-${index}`}
            className="border-t border-rule py-4"
          >
            {/* An exam paper's line: the number and its text, the marks pushed
                to the right margin by `order`, so they are still read after the number. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
              <Pill wrap>{question.paper.label}</Pill>
              {question.paper.section && (
                <span>Section {question.paper.section}</span>
              )}
              <span className="font-outlier text-ink">{question.qNo}</span>
              <span className="order-last ml-auto font-outlier whitespace-nowrap text-ink">
                {question.marks === null ? "marks not stated" : `${question.marks} marks`}
              </span>
              <span>{question.isNumerical ? "Numerical" : "Theory"}</span>
            </div>
            <p className="mt-2 max-w-[65ch] break-words">{question.text}</p>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onAskTutor(question)}
              className="mt-2 print:hidden"
            >
              Hint
            </Button>
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
    <div>
      <div className="border-t border-ink pt-6 pb-10">
        <h2 className="text-2xl sm:text-3xl">Questions</h2>
        <p className="mt-3 max-w-[65ch] text-ink-2">
          Every topic, in study plan order, with the questions behind its count.
          Open a topic to practise; ask for a hint on any question.
        </p>
      </div>

      <div className="border-t border-ink">
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
