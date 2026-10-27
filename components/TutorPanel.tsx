"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Marks, PaperLabel } from "@/components/Marks";
import type { PaperInfo } from "@/lib/corpus/courses";
import { browserModelClient } from "@/lib/gemini/browserClient";
import { writeHint } from "@/lib/gemini/hint";
import { handleModelError } from "@/lib/key/ownKey";
import type { Question, TopicStat } from "@/lib/types";

interface TutorState {
  status: "loading" | "ready" | "error";
  hint: string;
  error: string;
}

/**
 * A hint, not a solution (REQ-012).
 *
 * The panel is an overlay rather than an inline expansion because it is opened
 * from a row inside a horizontally scrolling evidence table — expanding in
 * place would push the table wider still. It is modal: the page behind is
 * inert until it closes, and focus goes back to the Hint button that opened
 * it. The analysis behind it is never blocked on the network.
 */
export function TutorPanel({
  question,
  stat,
  names,
  apiKey,
  onClose,
}: {
  question: Question;
  stat?: TopicStat;
  names: Map<string, PaperInfo>;
  /** The student's own key; the hint is asked for from this browser. */
  apiKey: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<TutorState>({
    status: "loading",
    hint: "",
    error: "",
  });

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      setState({ status: "loading", hint: "", error: "" });
      try {
        const hint = await writeHint(
          browserModelClient(apiKey),
          {
            question: {
              text: question.text,
              qNo: question.qNo,
              marks: question.marks,
              isNumerical: question.isNumerical,
              paperLabel: question.paper.label,
            },
            topicContext: stat
              ? { topic: stat.topic, count: stat.count, papers: stat.papers }
              : { topic: question.topic },
          },
          controller.signal,
        );
        setState({ status: "ready", hint, error: "" });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          hint: "",
          error: handleModelError(error, "The hint request failed."),
        });
      }
    }

    void run();
    return () => controller.abort();
    // Re-runs when the user opens a different question from the same panel.
  }, [question, stat, apiKey]);

  return (
    <Dialog
      placement="end"
      label={`Hint for question ${question.qNo}`}
      onClose={onClose}
      className="flex h-full w-full max-w-[480px] flex-col overflow-y-auto border-l border-ink bg-surface shadow-card"
    >
      <div className="flex items-start justify-between gap-4 p-6">
        <div className="min-w-0">
          <h2 className="text-2xl">Where to start</h2>
          <p className="mt-1 text-sm text-ink-2">
            The approach and the principle — never the final answer.
          </p>
        </div>
        <Button variant="text" onClick={onClose} aria-label="Close hint">
          Close
        </Button>
      </div>

      <div className="border-t border-ink p-6">
        <p className="font-semibold break-words">{stat?.topic ?? question.topic}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
          <PaperLabel question={question} names={names} />{" "}
          <span className="font-outlier">Q{question.qNo}</span>{" "}
          {question.marks !== null && <Marks value={question.marks} />}
        </p>
        <p className="mt-4 break-words text-ink-2">
          {question.text}
        </p>
      </div>

      {/* One region for every state, so the hint is announced as it arrives. */}
      <div
        className="border-t border-rule p-6"
        aria-live="polite"
      >
        {state.status === "loading" && (
          <div className="space-y-3">
            <p className="text-ink-2">Thinking it through…</p>
            {/* Three settling bars rather than a spinner: the wait is a few
                seconds and the shape previews what is about to arrive. */}
            {[100, 92, 64].map((width, index) => (
              <div
                key={index}
                className="h-3 animate-pulse rounded-control bg-surface-3"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        )}

        {state.status === "error" && (
          <div>
            <p className="text-error">{state.error}</p>
            <p className="mt-2 text-sm text-ink-2">
              Everything else on the page is computed locally and is
              unaffected.
            </p>
          </div>
        )}

        {state.status === "ready" && (
          <div>
            <p className="whitespace-pre-wrap text-ink">
              {state.hint}
            </p>
            <p className="mt-4 text-sm text-ink-2">
              Generated by Gemini. Finish the last step yourself — that is
              where the learning is.
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
