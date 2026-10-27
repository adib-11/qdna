"use client";

import { useRouter } from "next/navigation";
import { ImportCorpusButton } from "@/components/CorpusFileButtons";
import { Button } from "@/components/ui/Button";
import { topicFrequency } from "@/lib/analysis/frequency";
import { paperOrder } from "@/lib/analysis/papers";
import { resolveTopics } from "@/lib/analysis/topics";
import { corpusTitle, needsSplit, splitCourses } from "@/lib/corpus/courses";
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
  function saveImported(
    questions: Question[],
    topicOverrides: TopicOverride[],
    sameCourse: string[][],
  ) {
    const saved = browserCorpusStore()?.save(sampleOutcome(questions), undefined, {
      topicOverrides,
      sameCourse,
    });
    corpusChanged();
    return saved?.id;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl sm:text-3xl">Saved corpora</h2>
        <ImportCorpusButton existing={[]} onMerged={saveImported} />
      </div>

      {corpora.length === 0 ? (
        <p className="mt-6 text-lg text-ink-2">
          Corpora you analyze are saved in this browser and listed here.
        </p>
      ) : (
        <ul className="mt-8 border-t border-ink">
          {corpora.map((corpus) => {
            const { questions } = corpus.outcome;
            const paperCount = paperOrder(questions).length;
            const { name: title, codes } = corpusTitle(questions);
            // The plan is a prefix of the ranking, so its first topic is the
            // most asked one. A corpus still holding several courses has none.
            const first = needsSplit(splitCourses(questions, corpus.sameCourse))
              ? undefined
              : topicFrequency(
                  resolveTopics(questions, {
                    grouping: corpus.topicGrouping,
                    overrides: corpus.topicOverrides,
                  }),
                )[0]?.topic;
            // Two corpora can share a title, so the labels also say which one.
            const which = `${title}, ${paperCount} paper${paperCount === 1 ? "" : "s"}, saved ${new Date(corpus.savedAt).toLocaleString()}`;
            return (
              <li
                key={corpus.id}
                className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-5"
              >
                <div className="grid min-w-0 flex-[1_1_32rem] gap-x-6 gap-y-1 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <p className="text-lg font-semibold break-words">{title}</p>
                  <p className="font-outlier text-sm text-ink-2 lg:justify-self-end">
                    {codes.join(" · ")}
                  </p>
                  {/* The highlighter: the topic this corpus says to study first. */}
                  {first ? (
                    <p className="text-ink-2">
                      Study first: <mark>{first}</mark>
                    </p>
                  ) : (
                    <span />
                  )}
                  <p className="flex flex-wrap gap-x-4 text-sm text-ink-2 tabular-nums lg:justify-self-end">
                    <span>
                      {paperCount} paper{paperCount === 1 ? "" : "s"}
                    </span>{" "}
                    <span>{questions.length} questions</span>{" "}
                    <span>
                      saved{" "}
                      {new Date(corpus.savedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
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
