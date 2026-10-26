"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
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
 * place would push the table wider still. It resolves on its own; the page
 * behind stays interactive and the analysis is never blocked on the network.
 */
export function TutorPanel({
  question,
  stat,
  apiKey,
  onClose,
}: {
  question: Question;
  stat?: TopicStat;
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-[rgba(0,0,0,0.4)]"
        onClick={onClose}
        aria-hidden
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Hint for question ${question.qNo}`}
        className="relative flex h-full w-full max-w-[480px] flex-col overflow-y-auto border-l border-[var(--border-hairline)] bg-pure-white"
      >
        <div className="flex items-start justify-between gap-[16px] p-[var(--card-padding)] pb-[16px]">
          <div className="min-w-0">
            <h2 className="text-heading-sm font-bold tracking-[-0.242px]">
              Where to start
            </h2>
            <p className="mt-[4px] text-caption text-graphite">
              The approach and the principle — never the final answer.
            </p>
          </div>
          <Button variant="text" onClick={onClose} aria-label="Close hint">
            Close
          </Button>
        </div>

        <div className="border-t border-[var(--border-hairline)] p-[var(--card-padding)]">
          <div className="flex flex-wrap gap-[8px]">
            <Pill tone="neutral">{question.paper.label}</Pill>
            <Pill tone="neutral">{question.qNo}</Pill>
            {question.marks !== null && (
              <Pill tone="neutral">{question.marks} marks</Pill>
            )}
            <Pill tone="sky-tint" wrap>
              {stat?.topic ?? question.topic}
            </Pill>
          </div>
          <p className="mt-[16px] text-body-sm break-words text-graphite">
            {question.text}
          </p>
        </div>

        <div className="border-t border-[var(--border-hairline)] p-[var(--card-padding)]">
          {state.status === "loading" && (
            <div className="space-y-[12px]" aria-live="polite">
              <p className="text-body-sm text-graphite">Thinking it through…</p>
              {/* Three settling bars rather than a spinner: the wait is a few
                  seconds and the shape previews what is about to arrive. */}
              {[100, 92, 64].map((width, index) => (
                <div
                  key={index}
                  className="h-[12px] animate-pulse rounded-[var(--radius-md)] bg-[rgba(0,0,0,0.06)]"
                  style={{ width: `${width}%` }}
                />
              ))}
            </div>
          )}

          {state.status === "error" && (
            <div aria-live="polite">
              <p className="text-body-sm text-vermillion">{state.error}</p>
              <p className="mt-[8px] text-caption text-graphite">
                Everything else on the page is computed locally and is
                unaffected.
              </p>
            </div>
          )}

          {state.status === "ready" && (
            <div aria-live="polite">
              <p className="whitespace-pre-wrap text-body text-graphite">
                {state.hint}
              </p>
              <p className="mt-[16px] text-caption text-[rgba(0,0,0,0.4)]">
                Generated by Gemini. Finish the last step yourself — that is
                where the learning is.
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
