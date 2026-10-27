"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAddPapers } from "@/components/AddPapers";
import { BacktestPanel } from "@/components/BacktestPanel";
import { CourseSplit } from "@/components/CourseSplit";
import {
  ExportCorpusButton,
  ImportCorpusButton,
  StudyPackButton,
} from "@/components/CorpusFileButtons";
import { GenomeMap } from "@/components/GenomeMap";
import { LineageCard } from "@/components/LineageCard";
import { LowConfidenceNotice } from "@/components/LowConfidenceNotice";
import { OwnKeyStatus } from "@/components/OwnKeyProvider";
import { PaperList } from "@/components/PaperList";
import { ParetoChart } from "@/components/ParetoChart";
import { PracticePaper } from "@/components/PracticePaper";
import { StudyPlan } from "@/components/StudyPlan";
import { TopicDossier } from "@/components/TopicDossier";
import { TopicEditor } from "@/components/TopicEditor";
import { Button } from "@/components/ui/Button";
import { analyze } from "@/lib/analysis";
import { paperOrder } from "@/lib/analysis/papers";
import { corpusTitle, needsSplit, splitCourses } from "@/lib/corpus/courses";
import { browserCorpusStore } from "@/lib/corpus/store";
import { shortfallNote } from "@/lib/extract/runExtraction";
import { corpusChanged, useOpenCorpus } from "@/lib/corpus/useCorpora";
import type { TopicOverride } from "@/lib/analysis/topics";
import type { Question } from "@/lib/types";

/** The results, in the order a student needs them. */
const SECTIONS = [
  ["study-plan", "Study plan"],
  ["questions", "Questions"],
  ["lineages", "Lineages"],
  ["practice-paper", "Practice paper"],
  ["how-we-know", "How we know"],
] as const;

/** Clears the sticky nav when a section link scrolls to it. */
const SCROLL_CLEARANCE = "scroll-mt-[64px]";

export default function AnalyzePage() {
  // Undefined until browser storage can be read, after hydration.
  const corpus = useOpenCorpus();
  const outcome = corpus?.outcome ?? null;
  const adding = useAddPapers(corpus);

  /** An import merged new papers in: save them over this corpus. Throws when storage is full. */
  function saveMerged(
    questions: Question[],
    topicOverrides: TopicOverride[],
    sameCourse: string[][],
  ) {
    if (!corpus) return;
    // A merge into a sample is saved as a new corpus, so reopening the sample
    // can never overwrite it.
    const saved = browserCorpusStore()?.saveImport(
      corpus,
      questions,
      topicOverrides,
      sameCourse,
    );
    corpusChanged();
    return saved?.id;
  }

  // The whole analysis is pure and synchronous, so it runs here rather than
  // being carried through the session — the corpus is the only state worth
  // persisting, and recomputing costs nothing (REQ-008).
  const result = useMemo(
    () =>
      corpus
        ? analyze(corpus.outcome.questions, {
            grouping: corpus.topicGrouping,
            overrides: corpus.topicOverrides,
          })
        : null,
    [corpus],
  );

  // A corpus holding several courses is split before anything is analyzed.
  const mustSplit = useMemo(
    () => (corpus ? needsSplit(splitCourses(corpus.outcome.questions, corpus.sameCourse)) : false),
    [corpus],
  );

  if (corpus === undefined) return null;
  if (corpus && mustSplit) return <CourseSplit key={corpus.id} corpus={corpus} />;

  if (!corpus || !outcome || !result) {
    return (
      <main
        id="main"
        tabIndex={-1}
        className="page-shell py-16 focus:outline-none"
      >
        <h1 className="text-3xl sm:text-section">Nothing to analyze yet</h1>
        <p className="mt-4 text-lg text-ink-2">Upload a few past papers first.</p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center font-semibold underline decoration-ink-2 underline-offset-4 hover:decoration-accent"
        >
          ← Back to upload
        </Link>
      </main>
    );
  }

  const { progress, partial } = outcome;
  const papers = paperOrder(result.questions);
  const title = corpusTitle(result.questions);
  const crossDept = result.lineages.filter((l) => l.crossDepartment).length;

  return (
    <>
      <header className="page-shell print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-t-4 border-ink py-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-sm font-semibold underline decoration-ink-2 underline-offset-4 hover:decoration-accent"
          >
            ← New analysis
          </Link>
          <div className="flex flex-wrap items-start gap-2">
            {adding.button}
            <StudyPackButton result={result} />
            <Button variant="ghost" onClick={() => window.print()}>
              Print
            </Button>
            <ExportCorpusButton
              questions={outcome.questions}
              topicOverrides={corpus.topicOverrides ?? []}
              sameCourse={corpus.sameCourse}
            />
            <ImportCorpusButton
              existing={outcome.questions}
              existingOverrides={corpus.topicOverrides}
              existingSameCourse={corpus.sameCourse}
              onMerged={saveMerged}
            />
          </div>
          <OwnKeyStatus />
        </div>
      </header>

      {/* Flat: the ink rules part the nav from the page, not a shadow. */}
      <nav
        aria-label="Sections"
        className="sticky top-0 z-20 border-y border-ink bg-surface print:hidden"
      >
        <ul className="page-shell flex gap-1 overflow-x-auto">
          {SECTIONS.map(([id, label]) => (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                className="flex min-h-11 items-center whitespace-nowrap px-3 text-sm font-semibold underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-(--dur-micro) ease-out first:pl-0 hover:decoration-accent"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {adding.strip}

      <main
        id="main"
        tabIndex={-1}
        className="page-shell space-y-(--section-gap-s) pt-10 print:space-y-8 pb-(--section-gap) focus:outline-none sm:pt-16"
      >
        <section id="study-plan" className={SCROLL_CLEARANCE}>
          {/* Course names are long and often one unbreakable word, so the
              display size steps down before it can push the page sideways. */}
          <h1 className="max-w-[24ch] text-2xl sm:text-3xl md:text-section">
            {title.name}
          </h1>
          {title.codes.length > 1 && (
            <p className="mt-2 font-outlier text-sm">{title.codes.join(" · ")}</p>
          )}

          {/* The corpus at a glance, one figure to a column. */}
          <p className="mt-6 grid max-w-[640px] grid-cols-2 border-t border-ink sm:grid-cols-4">
            {[
              [result.questionCount, "questions"],
              [papers.length, papers.length === 1 ? "paper" : "papers"],
              [result.stats.length, "topics"],
              [result.lineages.length, result.lineages.length === 1 ? "lineage" : "lineages"],
            ].map(([figure, label], index) => (
              <span
                key={label}
                className={`py-2 ${index < 2 ? "border-b border-rule sm:border-b-0" : ""}`}
              >
                <span className="block text-2xl font-bold tabular-nums">{figure}</span>{" "}
                <span className="text-sm text-ink-2">{label}</span>{" "}
              </span>
            ))}
          </p>

          {partial && (
            <p className="mt-4 max-w-[65ch] text-error">
              {progress.pagesDone} of {progress.pagesTotal} pages analyzed —{" "}
              {shortfallNote(progress)} Every figure below is computed from
              what was successfully extracted.
            </p>
          )}

          <div className="mt-4 empty:hidden">
            <LowConfidenceNotice
              lowConfidence={result.lowConfidence}
              paperCount={result.paperCount}
            />
          </div>

          <div className="mt-10">
            <StudyPlan
              plan={result.studyPlan}
              questionCount={result.questionCount}
              paperCount={result.paperCount}
            />
          </div>

          <div className="mt-10 max-w-[720px]">
            <PaperList corpus={corpus} papers={papers} />
          </div>
        </section>

        <section id="questions" className={SCROLL_CLEARANCE}>
          <div className="mb-16 print:hidden">
            <TopicEditor
              corpus={corpus}
              topics={result.stats.map((stat) => stat.topic)}
            />
          </div>
          <TopicDossier
            stats={result.stats}
            expectedMarks={result.expectedMarks}
            totalQuestions={result.questionCount}
          />
        </section>

        <section id="lineages" className={SCROLL_CLEARANCE}>
          <div className="border-t border-ink pt-6">
            <h2 className="text-2xl sm:text-3xl">Lineages</h2>
            <p className="mt-3 text-ink-2">
              {result.lineages.length === 0
                ? "No recurring question found in this corpus."
                : `${result.lineages.length} recurring question${result.lineages.length === 1 ? "" : "s"} detected${crossDept > 0 ? `, ${crossDept} asked in both departments` : ""}.`}
            </p>
          </div>

          {result.lineages.length > 0 && (
            <div className="mt-10 grid min-w-0 gap-x-8 gap-y-16 xl:grid-cols-2">
              {result.lineages.map((cluster, index) => (
                <LineageCard key={`${cluster.id}-${index}`} cluster={cluster} />
              ))}
            </div>
          )}
        </section>

        <section id="practice-paper" className={SCROLL_CLEARANCE}>
          <PracticePaper result={result} />
        </section>

        <section id="how-we-know" className={SCROLL_CLEARANCE}>
          <div className="border-t border-ink pt-6">
            <h2 className="text-2xl sm:text-3xl">How we know</h2>
            <p className="mt-3 max-w-[65ch] text-ink-2">
            The evidence behind the study plan: where each topic was asked, how
            quickly the top topics cover the papers, and how well the ranking
            would have covered a paper it never saw.
            </p>
          </div>
          <div className="mt-16 space-y-24">
            <GenomeMap questions={result.questions} stats={result.stats} />
            <ParetoChart pareto={result.pareto} />
            <BacktestPanel result={result} />
          </div>
        </section>
      </main>
    </>
  );
}
