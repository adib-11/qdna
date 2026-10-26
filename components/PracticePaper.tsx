"use client";

import { useMemo, useState } from "react";
import { useRequestKey } from "@/components/OwnKeyProvider";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { inferPaperShape, UNSECTIONED } from "@/lib/analysis/paperShape";
import { browserModelClient } from "@/lib/gemini/browserClient";
import { practicePaperTopics, writePracticePaper } from "@/lib/gemini/practicePaper";
import { handleModelError } from "@/lib/key/ownKey";
import type { AnalysisResult, PracticePaper as Paper, TopicStat } from "@/lib/types";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; paper: Paper }
  | { status: "error"; message: string };

/**
 * A practice paper written from the corpus, on the page's one dark island
 * (PAT-005). It is a revision aid, and is never described as a forecast.
 *
 * The structure is not the model's invention: sections, question counts, and
 * mark denominations are measured from the uploaded papers and sent as a
 * constraint. What the model contributes is wording — the examiner's register,
 * applied to the topics the evidence ranks highest.
 *
 * Every question carries its own evidence line, and those numbers are looked up
 * from the local analysis by topic, never taken from the model (GUD-006).
 */
export function PracticePaper({ result }: { result: AnalysisResult }) {
  const requestKey = useRequestKey();
  const [state, setState] = useState<State>({ status: "idle" });

  const shape = useMemo(
    () => inferPaperShape(result.questions),
    [result.questions],
  );
  const statByTopic = useMemo(() => {
    const map = new Map<string, TopicStat>();
    for (const stat of result.stats) map.set(stat.topic, stat);
    return map;
  }, [result.stats]);

  if (!shape) return null;

  async function generate() {
    if (!shape) return;
    // Writing the paper is a model action, so this is where the key is asked for.
    const apiKey = await requestKey();
    if (!apiKey) return;
    setState({ status: "loading" });
    try {
      const paper = await writePracticePaper(browserModelClient(apiKey), {
        shape,
        topics: practicePaperTopics(result.stats),
      });
      setState({ status: "ready", paper });
    } catch (error) {
      setState({
        status: "error",
        message: handleModelError(error, "The paper could not be generated."),
      });
    }
  }

  const paper = state.status === "ready" ? state.paper : null;
  // Sections in the order they appear on the real papers, skipping any the
  // model left empty.
  const sections = shape.sections
    .map((section) => ({
      name: section.name,
      questions: (paper?.questions ?? []).filter(
        (q) => q.section === section.name,
      ),
    }))
    .filter((section) => section.questions.length > 0);

  return (
    // Printed only once a paper has been written: an unused prompt is noise on paper.
    <div
      className={`rounded-[var(--radius-xl)] bg-midnight-ink p-[var(--card-padding)] text-pure-white ${paper ? "" : "print:hidden"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-[16px]">
        <div className="min-w-0">
          <Pill tone="marigold">Revision aid · never a forecast</Pill>
          <h2 className="mt-[12px] text-heading-sm font-bold tracking-[-0.242px]">
            {paper?.title ?? "Write me a practice paper"}
          </h2>
          <p className="mt-[8px] max-w-[62ch] text-body-sm text-[rgba(255,255,255,0.6)]">
            {paper
              ? (paper.instructions ??
                "Generated from this corpus. Every question is annotated with the evidence that put it there.")
              : `Built from the ${shape.paperCount} paper${shape.paperCount === 1 ? "" : "s"} you uploaded: ${shape.sections.length} section${shape.sections.length === 1 ? "" : "s"}, about ${shape.questionsPerPaper} questions${shape.marksPerPaper !== null ? `, ${shape.marksPerPaper} marks` : ""}. Weighted by what this examiner keeps asking — a revision aid, never a forecast of the next exam.`}
          </p>
        </div>

        <Button
          variant="primary"
          className="print:hidden"
          onClick={generate}
          disabled={state.status === "loading"}
        >
          {state.status === "loading"
            ? "Writing…"
            : paper
              ? "Write another"
              : "Generate paper"}
        </Button>
      </div>

      {state.status === "loading" && (
        <div className="mt-[24px] space-y-[12px]" aria-live="polite">
          {[100, 88, 94, 72].map((width, index) => (
            <div
              key={index}
              className="h-[12px] animate-pulse rounded-[var(--radius-md)] bg-[rgba(255,255,255,0.12)]"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <p className="mt-[24px] text-body-sm text-marigold" aria-live="polite">
          {state.message}
        </p>
      )}

      {sections.length > 0 && (
        <div className="mt-[32px] space-y-[32px]">
          {sections.map((section) => (
            <section key={section.name}>
              {section.name !== UNSECTIONED && (
                <h3 className="text-caption font-medium tracking-[0.12px] text-[rgba(255,255,255,0.6)] uppercase">
                  Section {section.name}
                </h3>
              )}

              <ol className="mt-[16px] space-y-[24px]">
                {section.questions.map((question, index) => {
                  const stat = statByTopic.get(question.topic);
                  const share =
                    stat && result.questionCount > 0
                      ? (stat.count / result.questionCount) * 100
                      : null;

                  return (
                    <li
                      key={`${question.qNo}-${index}`}
                      className="border-t border-[rgba(255,255,255,0.12)] pt-[16px] first:border-t-0 first:pt-0"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
                        <span className="text-body-sm font-medium tabular-nums">
                          {question.qNo}
                        </span>
                        <span className="text-caption tabular-nums text-[rgba(255,255,255,0.6)]">
                          {question.marks !== null
                            ? `${question.marks} marks`
                            : ""}
                          {question.isNumerical ? " · numerical" : " · theory"}
                        </span>
                      </div>

                      <p className="mt-[8px] break-words text-body">
                        {question.text}
                      </p>

                      <div className="mt-[12px] flex flex-wrap items-center gap-[8px]">
                        <Pill tone="sky-wash" wrap>
                          {question.topic}
                        </Pill>
                        {stat && (
                          <Pill tone="marigold">
                            asked {stat.count}× across {stat.papers.length} paper
                            {stat.papers.length === 1 ? "" : "s"}
                            {share !== null
                              ? ` · ${share.toFixed(1)}% of corpus`
                              : ""}
                          </Pill>
                        )}
                      </div>

                      {question.rationale && (
                        <p className="mt-[8px] text-caption text-[rgba(255,255,255,0.6)]">
                          {question.rationale}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      {paper && (
        <p className="mt-[32px] text-caption text-[rgba(255,255,255,0.4)]">
          Written by Gemini from the structure and topic frequencies measured
          above. Recurrence is evidence of what matters to this examiner, not a
          forecast of the next paper.
        </p>
      )}
    </div>
  );
}
