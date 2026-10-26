"use client";

import { useMemo, useState } from "react";
import { useRequestKey } from "@/components/OwnKeyProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
 * A practice paper written from the corpus, set as the one sheet of white paper
 * inside an ink edge. It is a revision aid, and is never described as a forecast.
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
    <Card tone="sheet" className={paper ? "" : "print:hidden"}>
      <div
        className={`flex flex-wrap items-start justify-between gap-4 ${paper ? "border-b-4 border-ink pb-6" : ""}`}
      >
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl">
            {paper?.title ?? "Write me a practice paper"}
          </h2>
          <p className="mt-3 max-w-[62ch] text-ink-2">
            {paper
              ? (paper.instructions ??
                "Generated from this corpus. Every question is annotated with the evidence that put it there.")
              : `Built from the ${shape.paperCount} paper${shape.paperCount === 1 ? "" : "s"} you uploaded: ${shape.sections.length} section${shape.sections.length === 1 ? "" : "s"}, about ${shape.questionsPerPaper} questions${shape.marksPerPaper !== null ? `, ${shape.marksPerPaper} marks` : ""}. Weighted by what this examiner keeps asking — a revision aid, never a forecast of the next exam.`}
          </p>
          <Pill tone="on" className="mt-4">
            Revision aid · never a forecast
          </Pill>
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
                      className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-x-3 border-b border-rule py-4 sm:grid-cols-[3rem_minmax(0,1fr)_auto]"
                    >
                      <span className="font-outlier text-sm">{question.qNo}</span>
                      {/* The marks in the right margin, as the papers print them,
                          and read straight after the number, as before. */}
                      <span className="col-start-3 row-start-1 text-right font-outlier text-sm whitespace-nowrap">
                        <span className="block">
                          {question.marks !== null ? `${question.marks} marks` : ""}
                        </span>{" "}
                        <span className="block text-ink-2">
                          {question.isNumerical ? "numerical" : "theory"}
                        </span>
                      </span>

                      <div className="col-start-2 row-start-1 min-w-0">
                        <p className="max-w-[65ch] break-words">{question.text}</p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Pill wrap>{question.topic}</Pill>
                          {stat && (
                            <Pill wrap>
                              asked {stat.count}× across {stat.papers.length} paper
                              {stat.papers.length === 1 ? "" : "s"}
                              {share !== null
                                ? ` · ${share.toFixed(1)}% of corpus`
                                : ""}
                            </Pill>
                          )}
                        </div>

                        {question.rationale && (
                          <p className="mt-2 max-w-[65ch] text-sm text-ink-2">
                            {question.rationale}
                          </p>
                        )}
                      </div>
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
    </Card>
  );
}
