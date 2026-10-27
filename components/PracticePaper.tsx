"use client";

import { useMemo, useState } from "react";
import { useRequestKey } from "@/components/OwnKeyProvider";
import { Marks, TypeTag } from "@/components/Marks";
import { Button } from "@/components/ui/Button";
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
 * A practice paper written from the corpus, set like the real papers: the
 * number in the left margin, the marks in red pen in the right. It is a
 * revision aid, and is never described as a forecast.
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
    <div className={paper ? "" : "print:hidden"}>
      <div
        className={`flex flex-wrap items-start justify-between gap-6 border-t border-ink pt-6 ${paper ? "border-b-4 pb-6" : ""}`}
      >
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl">
            {paper?.title ?? "Write me a practice paper"}
          </h2>
          <p className="mt-2 max-w-[65ch] text-ink-2">
            {paper
              ? (paper.instructions ??
                "Generated from this corpus. Every question is annotated with the evidence that put it there.")
              : `Built from the ${shape.paperCount} paper${shape.paperCount === 1 ? "" : "s"} you uploaded: ${shape.sections.length} section${shape.sections.length === 1 ? "" : "s"}, about ${shape.questionsPerPaper} questions${shape.marksPerPaper !== null ? `, ${shape.marksPerPaper} marks` : ""}. Weighted by what this examiner keeps asking.`}
          </p>
          <p className="mt-5 max-w-[40ch] border-t border-ink pt-3 text-sm font-semibold">
            A revision aid, never a forecast
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
        <div className="mt-6 space-y-3" aria-live="polite">
          {[100, 88, 94, 72].map((width, index) => (
            <div
              key={index}
              className="h-3 animate-pulse rounded-control bg-surface-3"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <p className="mt-6 text-error" aria-live="polite">
          {state.message}
        </p>
      )}

      {sections.length > 0 && (
        <div className="mt-10 space-y-10">
          {sections.map((section) => (
            <section key={section.name}>
              {section.name !== UNSECTIONED && (
                <h3 className="text-lg">Section {section.name}</h3>
              )}

              <ol className="mt-4 border-t border-ink">
                {section.questions.map((question, index) => {
                  const stat = statByTopic.get(question.topic);
                  const share =
                    stat && result.questionCount > 0
                      ? (stat.count / result.questionCount) * 100
                      : null;

                  return (
                    <li
                      key={`${question.qNo}-${index}`}
                      className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-rule py-4 sm:grid-cols-[4rem_minmax(0,1fr)_9rem] sm:gap-x-6"
                    >
                      <span className="font-outlier text-sm">{question.qNo}</span>
                      <div className="min-w-0">
                        <p className="max-w-[70ch] break-words">{question.text}</p>
                        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
                          <span className="font-semibold text-ink">{question.topic}</span>{" "}
                          <TypeTag numerical={question.isNumerical} />{" "}
                          {stat && (
                            <span>
                              asked {stat.count}× across {stat.papers.length} paper
                              {stat.papers.length === 1 ? "" : "s"}
                              {share !== null ? ` · ${share.toFixed(1)}% of corpus` : ""}
                            </span>
                          )}
                        </p>
                        {question.rationale && (
                          <p className="mt-2 max-w-[65ch] text-sm text-ink-2">
                            {question.rationale}
                          </p>
                        )}
                      </div>
                      <Marks value={question.marks} className="text-right sm:text-lg" />
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      {paper && (
        <p className="mt-10 max-w-[65ch] text-sm text-ink-2">
          Written by Gemini from the structure and topic frequencies measured
          above. Recurrence is evidence of what matters to this examiner, not a
          forecast of the next paper.
        </p>
      )}
    </div>
  );
}
