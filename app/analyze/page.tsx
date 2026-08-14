"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { loadSession } from "@/lib/extract/session";
import type { ExtractionOutcome } from "@/lib/types";

/**
 * Phase 2 landing point: confirms the pipeline produced a real corpus.
 * The analysis engine (Phase 3) and the results interface (Phase 4) replace
 * the body of this page.
 */
export default function AnalyzePage() {
  const [outcome, setOutcome] = useState<ExtractionOutcome | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOutcome(loadSession());
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!outcome) {
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

  const { questions, progress, partial } = outcome;
  const papers = [...new Set(questions.map((q) => q.paper.label))];
  const topics = [...new Set(questions.map((q) => q.topic))];

  return (
    <main className="page-shell py-[64px]">
      <Link href="/" className="text-body-sm font-medium text-notion-blue">
        ← New analysis
      </Link>

      <h1 className="mt-[24px] text-display-sm font-medium tracking-[-1.89px]">
        {questions.length} questions extracted
      </h1>
      <p className="mt-[16px] text-body text-graphite">
        Across {papers.length} paper{papers.length === 1 ? "" : "s"} and{" "}
        {topics.length} distinct topic{topics.length === 1 ? "" : "s"}.
      </p>

      {partial && (
        <p className="mt-[16px] text-body-sm text-vermillion">
          {progress.pagesDone} of {progress.pagesTotal} pages analyzed —{" "}
          {progress.pagesFailed} could not be read.
        </p>
      )}

      <div className="mt-[64px] flex flex-wrap gap-[8px]">
        {papers.map((label) => (
          <Pill key={label} tone="sky-tint">
            {label}
          </Pill>
        ))}
      </div>

      <div className="mt-[24px] grid gap-[24px] md:grid-cols-2">
        {questions.slice(0, 12).map((q) => (
          <Card key={q.id + q.text.slice(0, 24)}>
            <div className="flex items-center gap-[8px]">
              <Pill tone="neutral">{q.paper.label}</Pill>
              <Pill tone="marigold">{q.topic}</Pill>
            </div>
            <CardTitle className="mt-[12px] text-body font-medium">
              {q.qNo}
              {q.marks !== null ? ` · ${q.marks} marks` : ""}
            </CardTitle>
            <p className="mt-[8px] text-body-sm text-graphite">{q.text}</p>
          </Card>
        ))}
      </div>
    </main>
  );
}
