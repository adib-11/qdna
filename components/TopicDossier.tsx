"use client";

import { useEffect, useState } from "react";
import { useRequestKey } from "@/components/OwnKeyProvider";
import { TutorPanel } from "@/components/TutorPanel";
import { approx, Marks, PaperLabel, TypeTag } from "@/components/Marks";
import { Button } from "@/components/ui/Button";
import type { PaperInfo } from "@/lib/corpus/courses";
import type { Question, TopicStat } from "@/lib/types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Id of a topic's row, by rank, so the study plan can link to it. */
export const topicAnchor = (rank: number) => `topic-${rank}`;

/**
 * The questions behind every count (REQ-009), topics in study plan order. Each
 * topic expands to the individual questions that produced its count, each
 * set like an exam paper: the number in the left margin, the marks in red pen
 * in the right, and under the text where it was asked, its type and a hint.
 *
 * The top-ranked topic starts open so the pattern is visible without a click.
 */
function TopicRow({
  stat,
  rank,
  expectedMarks,
  defaultOpen,
  names,
  onAskTutor,
}: {
  stat: TopicStat;
  rank: number;
  expectedMarks: number | null;
  defaultOpen: boolean;
  names: Map<string, PaperInfo>;
  onAskTutor: (question: Question) => void;
}) {
  const id = topicAnchor(rank);
  // Rows mount only after the corpus is read from browser storage, so the
  // URL is always there to check.
  const [open, setOpen] = useState(
    () => defaultOpen || window.location.hash === `#${id}`,
  );

  // A link to this topic opens it. Clicks are heard directly, since clicking
  // a link to the hash already in the URL fires no hashchange.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element).closest?.(`a[href$="#${id}"]`)) setOpen(true);
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
      // Clears the sticky results nav.
      className="scroll-mt-[64px] border-b border-rule"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 py-4 text-left transition-[background-color] duration-(--dur-micro) ease-out [grid-template-areas:'r_t_m'_'._f_f'] hover:bg-surface-2 active:bg-surface-3 sm:grid-cols-[4rem_minmax(0,4fr)_minmax(0,4fr)_9rem] sm:gap-x-6 sm:[grid-template-areas:'r_t_f_m']"
      >
        <span className="font-outlier text-sm text-muted [grid-area:r]">{rank}</span>
        <span className="text-lg font-semibold break-words [grid-area:t]">{stat.topic}</span>
        <span className="text-ink-2 [grid-area:f]">
          <b className="mr-1 text-lg tracking-[-0.02em] text-ink">
            Asked {plural(stat.count, "time")}
          </b>{" "}
          in {plural(stat.papers.length, "paper")}
        </span>
        <span className="grid justify-items-end text-right [grid-area:m]">
          <Marks
            value={expectedMarks === null ? null : approx(expectedMarks)}
            className="text-lg"
          />
          {expectedMarks !== null && (
            <span aria-hidden className="text-xs text-muted">a paper</span>
          )}
        </span>
      </button>

      {/* Always rendered, so the print view carries every question. */}
      <ol className={`${open ? "" : "hidden"} pb-4 print:block`}>
        {stat.questions.map((question, index) => (
          <li
            key={`${question.id}-${index}`}
            className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 border-t border-rule-2 py-4 sm:grid-cols-[4rem_minmax(0,1fr)_9rem] sm:gap-x-6"
          >
            <span className="font-outlier text-sm">{question.qNo}</span>
            <div className="min-w-0">
              <p className="max-w-[70ch] text-[1.0625rem] break-words">{question.text}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
                <PaperLabel question={question} names={names} />{" "}
                <TypeTag numerical={question.isNumerical} />{" "}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onAskTutor(question)}
                  className="min-h-8! bg-transparent! px-3! text-xs! print:hidden"
                >
                  Hint
                </Button>
              </p>
            </div>
            <Marks value={question.marks} className="text-right sm:text-lg" />
          </li>
        ))}
      </ol>
    </div>
  );
}

export function TopicDossier({
  stats,
  expectedMarks,
  names,
}: {
  stats: TopicStat[];
  expectedMarks: Record<string, number | null>;
  names: Map<string, PaperInfo>;
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
      <h2 className="text-2xl sm:text-3xl">Questions</h2>
      <p className="mt-2 max-w-[65ch] text-ink-2">
        Every topic in plan order, with the questions behind its count.
      </p>

      <div className="mt-8 border-t border-ink">
        {stats.map((stat, index) => (
          <TopicRow
            key={stat.topic}
            stat={stat}
            rank={index + 1}
            names={names}
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
          names={names}
          apiKey={asked.apiKey}
          onClose={() => setAsked(null)}
        />
      )}
    </div>
  );
}
