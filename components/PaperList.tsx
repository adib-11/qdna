"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { browserCorpusStore, type SavedCorpus } from "@/lib/corpus/store";
import { corpusChanged } from "@/lib/corpus/useCorpora";
import type { PaperRef } from "@/lib/types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The corpus's papers, each with its question count and a Remove action that
 * asks first. A corpus keeps at least one paper; deleting the whole corpus is
 * done from the saved corpora list.
 */
export function PaperList({ corpus, papers }: { corpus: SavedCorpus; papers: PaperRef[] }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const counts = new Map<string, number>();
  for (const q of corpus.outcome.questions) {
    counts.set(q.paper.label, (counts.get(q.paper.label) ?? 0) + 1);
  }

  function remove(label: string) {
    try {
      browserCorpusStore()?.removePaper(corpus, label);
      corpusChanged();
      setMessage({ error: false, text: `Removed ${label}.` });
    } catch (err) {
      setMessage({
        error: true,
        text: err instanceof Error ? err.message : `${label} could not be removed.`,
      });
    }
    setConfirming(null);
  }

  return (
    <div>
      <h2 className="text-lg">Papers in this corpus</h2>
      <ul className="mt-3 border-t border-ink">
        {papers.map(({ label, type }) => {
          const count = plural(counts.get(label) ?? 0, "question");
          return (
            <li
              key={label}
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 border-b border-rule py-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto] ${confirming === label ? "bg-surface-2" : ""}`}
            >
              <span className="min-w-0 break-words">
                {label}
                <span className="text-ink-2">{type === "CT" ? " · CT" : " · Final"}</span>
              </span>
              <span className="col-start-1 text-sm text-ink-2 sm:col-start-auto">{count}</span>
              {papers.length > 1 && confirming !== label && (
                <span className="col-start-2 row-span-2 row-start-1 justify-self-end sm:col-start-auto sm:row-span-1 sm:row-start-auto print:hidden">
                  <Button
                    variant="text"
                    aria-label={`Remove ${label}`}
                    onClick={() => {
                      setMessage(null);
                      setConfirming(label);
                    }}
                  >
                    Remove
                  </Button>
                </span>
              )}
              {confirming === label && (
                <div
                  role="alertdialog"
                  aria-labelledby="remove-paper-heading"
                  className="col-span-full flex flex-wrap items-center gap-x-6 gap-y-3 pt-2 pb-3"
                >
                  <p id="remove-paper-heading" className="flex-[1_1_24rem]">
                    <b>Remove {label}?</b> Its {count}{" "}
                    {counts.get(label) === 1 ? "leaves" : "leave"} every count, the plan and the
                    lineages. You can add the paper again later.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => remove(label)}>Remove {label}</Button>
                    {/* The question blocks the removal, so it takes focus, on the safe answer. */}
                    <Button variant="ghost" autoFocus onClick={() => setConfirming(null)}>
                      Keep it
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p
        role="status"
        className={`mt-2 min-h-6 text-sm ${message?.error ? "text-error" : "text-ink-2"}`}
      >
        {message?.text}
      </p>
    </div>
  );
}
