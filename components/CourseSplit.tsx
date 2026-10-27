"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { corpusCourses } from "@/lib/analysis/papers";
import { ungroupedLabels } from "@/lib/analysis/topics";
import { corpusTitle, splitCorpus, splitCourses, type Course } from "@/lib/corpus/courses";
import { browserCorpusStore, type SavedCorpus } from "@/lib/corpus/store";
import { corpusChanged, groupSavedCorpus } from "@/lib/corpus/useCorpora";
import { ownKeyStore } from "@/lib/key/ownKey";
import type { Question } from "@/lib/types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A course's identity while the student edits the split. */
const courseKey = (course: Course) => course.codes.join(" ");

/**
 * The split screen: a corpus holding several courses, from an upload, an
 * imported corpus file or a corpus saved before one course per corpus, is
 * split into one corpus per course. The student can say two courses are the
 * same course, and picks a course for each paper that prints no code.
 */
export function CourseSplit({ corpus }: { corpus: SavedCorpus }) {
  const { questions } = corpus.outcome;
  const [sameCourse, setSameCourse] = useState(corpus.sameCourse ?? []);
  const [chosen, setChosen] = useState<string[]>([]);
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const split = splitCourses(questions, sameCourse);
  const byPaper = new Map<string, Question[]>();
  for (const q of questions) byPaper.set(q.paper.label, [...(byPaper.get(q.paper.label) ?? []), q]);
  const courseQuestions = (course: Course) => course.papers.flatMap((label) => byPaper.get(label)!);
  const names = split.courses.map((course) => corpusTitle(courseQuestions(course)).name);
  const label = (i: number) => `${names[i]} ${split.courses[i].codes.join(" · ")}`;

  const indexOf = (key: string | undefined) => split.courses.findIndex((c) => courseKey(c) === key);
  const ready = split.unassigned.every((paper) => indexOf(assigned[paper]) >= 0);

  function toggle(key: string) {
    setChosen((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function joinChosen() {
    const codes = split.courses.filter((c) => chosen.includes(courseKey(c))).flatMap((c) => c.codes);
    setSameCourse((prev) => [...prev, codes]);
    setChosen([]);
  }

  function analyze() {
    const picks = Object.fromEntries(
      split.unassigned.map((paper) => [paper, indexOf(assigned[paper])]),
    );
    let saved: SavedCorpus[] | undefined;
    try {
      saved = browserCorpusStore()?.split(corpus, splitCorpus(questions, split, picks), sameCourse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The courses could not be saved.");
      return;
    }
    corpusChanged();
    window.scrollTo(0, 0);

    // Group the new corpora's topics in the background while the key is at
    // hand; one that fails keeps "Group topics" as a pending action.
    const apiKey = ownKeyStore().get();
    if (!apiKey || !saved) return;
    const toGroup = saved.filter((c) => ungroupedLabels(c.outcome.questions, c.topicGrouping).length > 0);
    void (async () => {
      for (const c of toGroup) await groupSavedCorpus(c.id, apiKey).catch(() => {});
    })();
  }

  return (
    <main
      id="main"
      tabIndex={-1}
      className="page-shell border-t-4 border-ink py-10 focus:outline-none sm:py-16"
    >
      <h1 className="text-2xl sm:text-3xl md:text-section">
        Found {plural(split.courses.length, "course")}
      </h1>
      <p className="lead mt-4 text-ink-2">
        Each course becomes its own corpus. Check the split, then analyze.
      </p>

      <div className="mt-10 grid gap-6">
        {split.courses.map((course, i) => {
          const key = courseKey(course);
          return (
            <section key={key} className="border-t border-ink pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h2 className="text-xl">{names[i]}</h2>
                  <span className="font-outlier text-sm">{course.codes.join(" · ")}</span>
                </div>
                {split.courses.length > 1 && (
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={chosen.includes(key)}
                      onChange={() => toggle(key)}
                      className="size-4 accent-ink"
                    />
                    Same course<span className="sr-only"> as another: {label(i)}</span>
                  </label>
                )}
              </div>
              <ul className="mt-3 grid gap-x-6 sm:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]">
                {course.papers.map((paper) => (
                  <li
                    key={paper}
                    className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b border-rule py-2"
                  >
                    <span>{paper}</span>
                    <span className="text-sm text-ink-2 tabular-nums">
                      {plural(byPaper.get(paper)!.length, "question")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {split.courses.length > 1 && (
          <div className="grid max-w-[48ch] gap-3 rounded-control border border-rule p-4 text-sm">
            <p>
              A course taught in two departments prints a code for each. Tick
              both, then join them.
            </p>
            <Button
              variant="ghost"
              className="justify-self-start"
              disabled={chosen.length < 2}
              onClick={joinChosen}
            >
              These are the same course
            </Button>
          </div>
        )}

        {split.unassigned.length > 0 && (
          <section className="border-t border-ink pt-4">
            <h2 className="text-xl">Unassigned: which course?</h2>
            <p className="mt-2 text-sm text-ink-2">No course code is printed on these papers.</p>
            <ul className="mt-3">
              {split.unassigned.map((paper) => {
                const paperQuestions = byPaper.get(paper)!;
                const printed = corpusCourses(paperQuestions)[0];
                return (
                  <li
                    key={paper}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule py-2"
                  >
                    <span>{paper}</span>
                    <span className="text-sm text-ink-2">
                      {plural(paperQuestions.length, "question")}
                      {printed ? `, titled ${printed}` : ""}
                    </span>
                    <label className="w-full sm:w-auto">
                      <span className="sr-only">Course for {paper}</span>
                      <select
                        value={indexOf(assigned[paper]) >= 0 ? assigned[paper] : ""}
                        onChange={(e) =>
                          setAssigned((prev) => ({ ...prev, [paper]: e.target.value }))
                        }
                        className="min-h-11 w-full rounded-control border border-ink bg-surface px-3 sm:w-auto sm:max-w-[28rem]"
                      >
                        <option value="" disabled>
                          Which course?
                        </option>
                        {split.courses.map((course, i) => (
                          <option key={courseKey(course)} value={courseKey(course)}>
                            {label(i)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <div className="mt-10">
        <Button onClick={analyze} disabled={!ready}>
          Analyze {plural(split.courses.length, "course")}
        </Button>
      </div>

      {error && (
        <p className="mt-4 text-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
