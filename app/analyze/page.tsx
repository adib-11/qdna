"use client";

import { Suspense, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { ParetoChart } from "@/components/ParetoChart";
import { PracticePaper } from "@/components/PracticePaper";
import { StudyPlan } from "@/components/StudyPlan";
import { TopicDossier } from "@/components/TopicDossier";
import { TopicEditor } from "@/components/TopicEditor";
import { Button } from "@/components/ui/Button";
import { analyze } from "@/lib/analysis";
import { paperOrder } from "@/lib/analysis/papers";
import { corpusTitle, describePapers, needsSplit, splitCourses } from "@/lib/corpus/courses";
import { browserCorpusStore } from "@/lib/corpus/store";
import { shortfallNote } from "@/lib/extract/runExtraction";
import { corpusChanged, useOpenCorpus } from "@/lib/corpus/useCorpora";
import type { TopicOverride } from "@/lib/analysis/topics";
import type { Question } from "@/lib/types";

/** The results' tabs, in the order a student needs them. */
const TABS = [
  ["plan", "Plan"],
  ["questions", "Questions"],
  ["lineages", "Lineages"],
  ["practice", "Practice"],
  ["how-we-know", "How we know"],
] as const;
type Tab = (typeof TABS)[number][0];

export default function AnalyzePage() {
  // ?tab= is read on the client, so the page waits for it rather than
  // rendering a tab it would then swap.
  return (
    <Suspense>
      <Results />
    </Suspense>
  );
}

function Results() {
  const asked = useSearchParams().get("tab");
  const tab: Tab = TABS.find(([id]) => id === asked)?.[0] ?? "plan";
  const headerRef = useRef<HTMLElement>(null);

  /** A tab opened from further down the page starts at its top, under the tabs. */
  function toTabs() {
    const header = headerRef.current;
    if (!header) return;
    const top = header.offsetTop + header.offsetHeight;
    if (window.scrollY > top) window.scrollTo({ top });
  }

  // Undefined until browser storage can be read, after hydration.
  const corpus = useOpenCorpus();
  const outcome = corpus?.outcome ?? null;

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

  const names = useMemo(() => describePapers(result?.questions ?? []), [result]);

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
  const panel = (id: Tab) => `${tab === id ? "" : "hidden"} page-shell pt-10 sm:pt-12 print:block`;

  return (
    <>
      <header ref={headerRef} className="page-shell border-t-4 border-ink">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 print:hidden">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-sm font-semibold underline decoration-ink-2 underline-offset-4 hover:decoration-accent"
          >
            ← New analysis
          </Link>
          <div className="flex flex-wrap items-start gap-2">
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
              variant="text"
              existing={outcome.questions}
              existingOverrides={corpus.topicOverrides}
              existingSameCourse={corpus.sameCourse}
              onMerged={saveMerged}
            />
          </div>
          <OwnKeyStatus />
        </div>

        {/* Course names are long and often one unbreakable word, so the
            display size steps down before it can push the page sideways. */}
        <h1 className="mt-6 max-w-[24ch] text-2xl sm:mt-8 sm:text-3xl md:text-section">
          {title.name}
        </h1>
        {title.codes.length > 1 && (
          <p className="mt-3 font-outlier text-ink-2">{title.codes.join(" · ")}</p>
        )}

        {/* The corpus at a glance. */}
        <p className="mt-6 flex flex-wrap gap-x-8 gap-y-1 pt-3 pb-5 text-sm text-ink-2">
          {[
            [result.questionCount, "questions"],
            [papers.length, papers.length === 1 ? "paper" : "papers"],
            [result.stats.length, "topics"],
            [result.lineages.length, result.lineages.length === 1 ? "lineage" : "lineages"],
          ].map(([figure, label]) => (
            <span key={label}>
              <b className="mr-2 text-xl text-ink tabular-nums">{figure}</b>
              {label}{" "}
            </span>
          ))}
        </p>

        {partial && (
          <p className="mb-4 max-w-[65ch] text-error">
            {progress.pagesDone} of {progress.pagesTotal} pages analyzed —{" "}
            {shortfallNote(progress)} Every figure below is computed from
            what was successfully extracted.
          </p>
        )}

        <div className="mb-6 empty:hidden">
          <LowConfidenceNotice
            lowConfidence={result.lowConfidence}
            paperCount={result.paperCount}
          />
        </div>
      </header>

      {/* One route, one tab open at a time, kept in ?tab= so a reload, a link
          and back and forward all land on it. Print shows every tab. */}
      <nav
        aria-label="Results"
        className="sticky top-0 z-20 border-y border-ink bg-surface print:hidden"
      >
        <ul className="page-shell flex gap-1 overflow-x-auto">
          {TABS.map(([id, label]) => (
            <li key={id} className="shrink-0 [&:first-child>a]:pl-0">
              <Link
                href={`?tab=${id}`}
                scroll={false}
                onClick={toTabs}
                aria-current={tab === id ? "page" : undefined}
                className="flex min-h-12 items-center px-4 text-sm font-semibold whitespace-nowrap text-muted shadow-[inset_0_-3px_0_transparent] transition-[color,box-shadow] duration-(--dur-micro) ease-out hover:text-ink aria-[current=page]:text-ink aria-[current=page]:shadow-[inset_0_-3px_0_var(--color-ink)]"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <main id="main" tabIndex={-1} className="pb-(--section-gap) focus:outline-none print:space-y-8">
        <section id="plan" className={panel("plan")}>
          <StudyPlan plan={result.studyPlan} questionCount={result.questionCount} />
        </section>

        <section id="questions" className={panel("questions")}>
          <TopicDossier
            stats={result.stats}
            expectedMarks={result.expectedMarks}
            names={names}
          />
          <div className="mt-16 print:hidden">
            <TopicEditor corpus={corpus} topics={result.stats.map((stat) => stat.topic)} />
          </div>
        </section>

        <section id="lineages" className={panel("lineages")}>
          <h2 className="text-2xl sm:text-3xl">Lineages</h2>
          <p className="mt-2 max-w-[65ch] text-ink-2">
            {result.lineages.length === 0 ? (
              "No question was asked again in these papers."
            ) : (
              <>
                {result.lineages.length} question{result.lineages.length === 1 ? "" : "s"} asked
                again across papers{crossDept > 0 ? `, ${crossDept} in both departments` : ""}.{" "}
                <mark>Highlighted</mark>: what changed from the variant before.
              </>
            )}
          </p>
          {result.lineages.length > 0 && (
            <ol className="mt-8">
              {result.lineages.map((cluster, index) => (
                <li key={`${cluster.id}-${index}`}>
                  <LineageCard cluster={cluster} names={names} />
                </li>
              ))}
            </ol>
          )}
        </section>

        <section id="practice" className={panel("practice")}>
          <PracticePaper result={result} />
        </section>

        <section id="how-we-know" className={panel("how-we-know")}>
          <h2 className="text-2xl sm:text-3xl">How we know</h2>
          <p className="mt-2 max-w-[65ch] text-ink-2">
            Where each topic was asked, how quickly the top topics cover the
            papers, and how the ranking did on a paper it never saw.
          </p>
          <div className="mt-10 space-y-16">
            <GenomeMap questions={result.questions} stats={result.stats} names={names} />
            <ParetoChart pareto={result.pareto} />
            <BacktestPanel result={result} names={names} />
          </div>
        </section>
      </main>
    </>
  );
}
