"use client";

import { useMemo } from "react";
import Link from "next/link";
import { BacktestPanel } from "@/components/BacktestPanel";
import {
  ExportCorpusButton,
  ImportCorpusButton,
} from "@/components/CorpusFileButtons";
import { GenomeMap } from "@/components/GenomeMap";
import { HeadlineStat } from "@/components/HeadlineStat";
import { LineageCard } from "@/components/LineageCard";
import { LowConfidenceNotice } from "@/components/LowConfidenceNotice";
import { ParetoChart } from "@/components/ParetoChart";
import { PredictedPaper } from "@/components/PredictedPaper";
import { TopicDossier } from "@/components/TopicDossier";
import { Pill } from "@/components/ui/Pill";
import { analyze } from "@/lib/analysis";
import { corpusCourses, corpusTitle, paperOrder } from "@/lib/analysis/papers";
import { browserCorpusStore } from "@/lib/corpus/store";
import { corpusChanged, useOpenCorpus } from "@/lib/corpus/useCorpora";
import type { Question } from "@/lib/types";

export default function AnalyzePage() {
  // Undefined until browser storage can be read, after hydration.
  const corpus = useOpenCorpus();
  const outcome = corpus?.outcome ?? null;

  /** An import merged new papers in: save them over this corpus. Throws when storage is full. */
  function saveMerged(questions: Question[]) {
    if (!corpus) return;
    // A merge into a sample is saved as a new corpus, so reopening the sample
    // can never overwrite it.
    browserCorpusStore()?.saveImport(corpus, questions);
    corpusChanged();
  }

  // The whole analysis is pure and synchronous, so it runs here rather than
  // being carried through the session — the corpus is the only state worth
  // persisting, and recomputing costs nothing (REQ-008).
  const result = useMemo(
    () => (outcome ? analyze(outcome.questions) : null),
    [outcome],
  );

  if (corpus === undefined) return null;

  if (!outcome || !result) {
    return (
      <main className="page-shell py-[64px]">
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
      {/* Elevation is permitted here and nowhere else (PAT-002). */}
      <header
        className="sticky top-0 z-20 bg-pure-white"
        style={{ boxShadow: "var(--elevation-nav)" }}
      >
        <div className="page-shell flex flex-wrap items-center justify-between gap-[16px] py-[12px]">
          <Link
            href="/"
            className="text-body-sm font-medium text-notion-blue"
          >
            ← New analysis
          </Link>
          <div className="flex flex-wrap items-start gap-[8px]">
            <ExportCorpusButton questions={outcome.questions} />
            <ImportCorpusButton
              existing={outcome.questions}
              onMerged={saveMerged}
            />
          </div>
          <p className="text-caption text-graphite tabular-nums">
            {result.questionCount} questions · {papers.length} paper
            {papers.length === 1 ? "" : "s"} · {result.stats.length} topics ·{" "}
            {result.lineages.length} lineage
            {result.lineages.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <main className="page-shell section-stack py-[64px]">
        <section>
          {/* Course names are long and often one unbreakable word, so the
              display size steps down before it can push the page sideways. */}
          <h1 className="text-heading-sm sm:text-heading-lg md:text-display-sm font-medium tracking-[-0.242px] md:tracking-[-1.89px] break-words text-ink-black">
            The genome of {corpusTitle(courses)}
          </h1>

          <div className="mt-[24px] flex flex-wrap gap-[8px]">
            {papers.map((paper) => (
              <Pill key={paper.label} tone="neutral">
                {paper.label}
                {paper.type === "CT" ? " · CT" : " · Final"}
              </Pill>
            ))}
          </div>

          {partial && (
            <p className="mt-[24px] text-body-sm text-vermillion">
              {progress.pagesDone} of {progress.pagesTotal} pages analyzed —{" "}
              {progress.pagesFailed} page
              {progress.pagesFailed === 1 ? "" : "s"} could not be read. Every
              figure below is computed from what was successfully extracted.
            </p>
          )}

          <div className="mt-[24px]">
            <LowConfidenceNotice
              lowConfidence={result.lowConfidence}
              paperCount={result.paperCount}
            />
          </div>

          <div className="mt-[24px]">
            <HeadlineStat
              stats={result.stats}
              pareto={result.pareto}
              questionCount={result.questionCount}
            />
          </div>
        </section>

        <section>
          <GenomeMap questions={result.questions} stats={result.stats} />
        </section>

        <section>
          <ParetoChart pareto={result.pareto} />
        </section>

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-[16px]">
            <h2 className="text-heading-sm font-bold tracking-[-0.242px]">
              Question lineage
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

        <section>
          <BacktestPanel result={result} />
        </section>

        <section>
          <PredictedPaper result={result} />
        </section>

        <section>
          <TopicDossier
            stats={result.stats}
            expectedMarks={result.expectedMarks}
            totalQuestions={result.questionCount}
          />
        </section>
      </main>
    </>
  );
}
