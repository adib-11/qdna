"use client";

import { useMemo } from "react";
import Link from "next/link";
import { BacktestPanel } from "@/components/BacktestPanel";
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
import { Pill } from "@/components/ui/Pill";
import { analyze } from "@/lib/analysis";
import { corpusCourses, corpusTitle, paperOrder } from "@/lib/analysis/papers";
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

  /** An import merged new papers in: save them over this corpus. Throws when storage is full. */
  function saveMerged(questions: Question[], topicOverrides: TopicOverride[]) {
    if (!corpus) return;
    // A merge into a sample is saved as a new corpus, so reopening the sample
    // can never overwrite it.
    const saved = browserCorpusStore()?.saveImport(corpus, questions, topicOverrides);
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

  if (corpus === undefined) return null;

  if (!corpus || !outcome || !result) {
    return (
      <main id="main" tabIndex={-1} className="page-shell py-[64px] focus:outline-none">
        <h1 className="text-heading-sm font-bold">Nothing to analyze yet</h1>
        <p className="mt-[16px] text-body text-graphite">
          Upload a few past papers first.
        </p>
        <Link
          href="/"
          className="mt-[24px] inline-block text-body-sm font-medium text-notion-blue"
        >
          ← Back to upload
        </Link>
      </main>
    );
  }

  const { progress, partial } = outcome;
  const papers = paperOrder(result.questions);
  const courses = corpusCourses(result.questions);
  const crossDept = result.lineages.filter((l) => l.crossDepartment).length;

  return (
    <>
      <header className="page-shell flex flex-wrap items-center justify-between gap-[16px] py-[12px] print:hidden">
        <Link href="/" className="text-body-sm font-medium text-notion-blue">
          ← New analysis
        </Link>
        <div className="flex flex-wrap items-start gap-[8px]">
          <StudyPackButton result={result} />
          <Button variant="ghost" onClick={() => window.print()}>
            Print
          </Button>
          <ExportCorpusButton
            questions={outcome.questions}
            topicOverrides={corpus.topicOverrides ?? []}
          />
          <ImportCorpusButton
            existing={outcome.questions}
            existingOverrides={corpus.topicOverrides}
            onMerged={saveMerged}
          />
        </div>
        <OwnKeyStatus />
      </header>

      {/* Elevation is permitted here and nowhere else (PAT-002). */}
      <nav
        aria-label="Sections"
        className="sticky top-0 z-20 bg-pure-white print:hidden"
        style={{ boxShadow: "var(--elevation-nav)" }}
      >
        <ul className="page-shell flex gap-[4px] overflow-x-auto py-[8px]">
          {SECTIONS.map(([id, label]) => (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                className="block whitespace-nowrap rounded-[var(--radius-lg)] px-[10px] py-[6px] text-body-sm font-medium text-ink-black hover:bg-[rgba(0,0,0,0.04)]"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main id="main" tabIndex={-1} className="page-shell section-stack py-[32px] sm:py-[64px] focus:outline-none">
        <section id="study-plan" className={SCROLL_CLEARANCE}>
          {/* Course names are long and often one unbreakable word, so the
              display size steps down before it can push the page sideways. */}
          <h1 className="text-heading-sm sm:text-heading-lg md:text-display-sm font-medium tracking-[-0.242px] md:tracking-[-1.89px] break-words text-ink-black">
            {corpusTitle(courses)}
          </h1>

          <p className="mt-[8px] text-caption text-graphite tabular-nums">
            {result.questionCount} questions · {papers.length} paper
            {papers.length === 1 ? "" : "s"} · {result.stats.length} topics ·{" "}
            {result.lineages.length} lineage
            {result.lineages.length === 1 ? "" : "s"}
          </p>

          {partial && (
            <p className="mt-[16px] text-body-sm text-vermillion">
              {progress.pagesDone} of {progress.pagesTotal} pages analyzed —{" "}
              {shortfallNote(progress)} Every figure below is computed from
              what was successfully extracted.
            </p>
          )}

          <div className="mt-[16px] empty:hidden">
            <LowConfidenceNotice
              lowConfidence={result.lowConfidence}
              paperCount={result.paperCount}
            />
          </div>

          <div className="mt-[24px]">
            <StudyPlan
              plan={result.studyPlan}
              questionCount={result.questionCount}
              paperCount={result.paperCount}
            />
          </div>

          <div className="mt-[24px] flex flex-wrap gap-[8px]">
            {papers.map((paper) => (
              <Pill key={paper.label} tone="neutral">
                {paper.label}
                {paper.type === "CT" ? " · CT" : " · Final"}
              </Pill>
            ))}
          </div>
        </section>

        <section id="questions" className={SCROLL_CLEARANCE}>
          <div className="mb-[24px] print:hidden">
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
          <div className="flex flex-wrap items-baseline justify-between gap-[16px]">
            <h2 className="text-heading-sm font-bold tracking-[-0.242px]">
              Lineages
            </h2>
            <p className="text-body-sm text-graphite">
              {result.lineages.length === 0
                ? "No recurring question found in this corpus."
                : `${result.lineages.length} recurring question${result.lineages.length === 1 ? "" : "s"} detected${crossDept > 0 ? `, ${crossDept} spanning more than one course code` : ""}.`}
            </p>
          </div>

          {result.lineages.length > 0 && (
            <div className="mt-[24px] grid min-w-0 gap-[24px] xl:grid-cols-2">
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
          <h2 className="text-heading-sm font-bold tracking-[-0.242px]">
            How we know
          </h2>
          <p className="mt-[8px] max-w-[640px] text-body-sm text-graphite">
            The evidence behind the study plan: where each topic was asked, how
            quickly the top topics cover the papers, and how well the ranking
            would have covered a paper it never saw.
          </p>
          <div className="mt-[24px] space-y-[24px]">
            <GenomeMap questions={result.questions} stats={result.stats} />
            <ParetoChart pareto={result.pareto} />
            <BacktestPanel result={result} />
          </div>
        </section>
      </main>
    </>
  );
}
