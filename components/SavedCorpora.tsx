"use client";

import { useRouter } from "next/navigation";
import { ImportCorpusButton } from "@/components/CorpusFileButtons";
import { Button } from "@/components/ui/Button";
import { corpusCourses, corpusTitle, paperOrder } from "@/lib/analysis/papers";
import { browserCorpusStore } from "@/lib/corpus/store";
import { corpusChanged, useSavedCorpora } from "@/lib/corpus/useCorpora";
import { sampleOutcome } from "@/lib/samples";
import type { Question } from "@/lib/types";

/** Every corpus saved in this browser, to reopen or delete, plus importing a classmate's file. */
export function SavedCorpora() {
  const router = useRouter();
  const corpora = useSavedCorpora();

  function reopen(id: string) {
    if (browserCorpusStore()?.open(id)) router.push("/analyze");
    else corpusChanged();
  }

  function remove(id: string, title: string) {
    if (!window.confirm(`Delete the saved corpus "${title}" from this browser?`)) return;
    browserCorpusStore()?.remove(id);
    corpusChanged();
  }

  /** An import from here starts a new corpus. */
  function saveImported(questions: Question[]) {
    browserCorpusStore()?.save(sampleOutcome(questions));
    corpusChanged();
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-[16px]">
        <h2 className="text-heading-sm font-bold tracking-[-0.242px]">
          Saved corpora
        </h2>
        <ImportCorpusButton existing={[]} onMerged={saveImported} />
      </div>

      {corpora.length === 0 ? (
        <p className="mt-[16px] text-body-sm text-graphite">
          Corpora you analyze are saved in this browser and listed here.
        </p>
      ) : (
        <ul className="mt-[16px] divide-y divide-[var(--border-hairline)] rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-pure-white">
          {corpora.map((corpus) => {
            const { questions } = corpus.outcome;
            const paperCount = paperOrder(questions).length;
            const title = corpusTitle(corpusCourses(questions));
            // Two corpora can share a title, so the labels also say which one.
            const which = `${title}, ${paperCount} paper${paperCount === 1 ? "" : "s"}, saved ${new Date(corpus.savedAt).toLocaleString()}`;
            return (
              <li
                key={corpus.id}
                className="flex flex-wrap items-center justify-between gap-[16px] p-[16px]"
              >
                <div className="min-w-0">
                  <p className="text-body font-medium break-words">
                    {title}
                  </p>
                  <p className="text-caption text-graphite tabular-nums">
                    {paperCount} paper{paperCount === 1 ? "" : "s"} ·{" "}
                    {questions.length} questions · saved{" "}
                    {new Date(corpus.savedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-[8px]">
                  <Button
                    variant="ghost"
                    aria-label={`Reopen ${which}`}
                    onClick={() => reopen(corpus.id)}
                  >
                    Reopen
                  </Button>
                  <Button
                    variant="text"
                    aria-label={`Delete ${which}`}
                    onClick={() => remove(corpus.id, title)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
