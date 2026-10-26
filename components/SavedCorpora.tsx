"use client";

import { useRouter } from "next/navigation";
import { ImportCorpusButton } from "@/components/CorpusFileButtons";
import { Button } from "@/components/ui/Button";
import { corpusCourses, corpusTitle, paperOrder } from "@/lib/analysis/papers";
import { browserCorpusStore } from "@/lib/corpus/store";
import { corpusChanged, useSavedCorpora } from "@/lib/corpus/useCorpora";
import { sampleOutcome } from "@/lib/samples";
import type { TopicOverride } from "@/lib/analysis/topics";
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
  function saveImported(questions: Question[], topicOverrides: TopicOverride[]) {
    const saved = browserCorpusStore()?.save(sampleOutcome(questions), undefined, {
      topicOverrides,
    });
    corpusChanged();
    return saved?.id;
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2>Saved corpora</h2>
        <ImportCorpusButton existing={[]} onMerged={saveImported} />
      </div>

      {corpora.length === 0 ? (
        <p className="mt-6 text-lg text-ink-2">
          Corpora you analyze are saved in this browser and listed here.
        </p>
      ) : (
        <ul className="mt-10 border-t border-ink">
          {corpora.map((corpus) => {
            const { questions } = corpus.outcome;
            const paperCount = paperOrder(questions).length;
            const title = corpusTitle(corpusCourses(questions));
            // Two corpora can share a title, so the labels also say which one.
            const which = `${title}, ${paperCount} paper${paperCount === 1 ? "" : "s"}, saved ${new Date(corpus.savedAt).toLocaleString()}`;
            return (
              <li
                key={corpus.id}
                className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-4"
              >
                <div className="min-w-0">
                  <p className="text-lg font-semibold break-words">{title}</p>
                  <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-ink-2 tabular-nums">
                    <span>
                      {paperCount} paper{paperCount === 1 ? "" : "s"}
                    </span>{" "}
                    <span>{questions.length} questions</span>{" "}
                    <span>saved {new Date(corpus.savedAt).toLocaleDateString()}</span>
                  </p>
                </div>
                <div className="flex gap-2">
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
