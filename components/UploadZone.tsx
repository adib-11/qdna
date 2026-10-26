"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { runExtraction } from "@/lib/extract/runExtraction";
import { saveSession } from "@/lib/extract/session";
import { sampleCorpusId } from "@/lib/corpus/store";
import { MIN_PAPERS_FOR_CONFIDENCE } from "@/lib/config";
import { SAMPLES, sampleOutcome } from "@/lib/samples";
import type { ExtractionProgress } from "@/lib/types";

type Phase = "idle" | "working" | "failed";

export function UploadZone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const pdfs = Array.from(incoming).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfs.length === 0) {
      setError("Those files aren't PDFs. qDNA reads scanned exam paper PDFs.");
      return;
    }
    setError(null);
    setFiles((prev) => [...prev, ...pdfs]);
  }, []);

  async function analyze() {
    if (files.length === 0) return;
    setPhase("working");
    setError(null);
    setProgress(null);

    try {
      const outcome = await runExtraction(files, { onProgress: setProgress });

      if (outcome.questions.length === 0) {
        setPhase("failed");
        setError(
          "No questions came back from those pages. If the scans are very faint or rotated, try a cleaner copy.",
        );
        return;
      }

      saveSession(outcome);
      router.push("/analyze");
    } catch (err) {
      setPhase("failed");
      setError(err instanceof Error ? err.message : "Extraction failed.");
    }
  }

  /** No extraction, no network: the corpus is already in the bundle. */
  async function openSample(id: string) {
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    setError(null);
    setLoadingSample(id);

    try {
      saveSession(sampleOutcome(await sample.load()), sampleCorpusId(sample.id));
      router.push("/analyze");
    } catch (err) {
      setLoadingSample(null);
      setError(
        err instanceof Error
          ? err.message
          : `The ${sample.name} sample could not be loaded.`,
      );
    }
  }

  const working = phase === "working";
  const pagesTotal = progress?.pagesTotal ?? 0;
  const pagesDone = progress?.pagesDone ?? 0;
  const pct = pagesTotal > 0 ? Math.round((pagesDone / pagesTotal) * 100) : 0;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!working) addFiles(e.dataTransfer.files);
        }}
        className={`rounded-[var(--radius-xl)] border border-dashed bg-pure-white p-[36px] text-center transition-colors ${
          dragging ? "border-notion-blue bg-sky-tint" : "border-[rgba(0,0,0,0.2)]"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <p className="text-subheading font-medium text-[rgba(0,0,0,0.95)]">
          Drop your exam paper PDFs here
        </p>
        <p className="mt-[16px] text-body-sm text-graphite">
          Pages are rendered in your browser and sent to the extractor in small
          batches. Your files are never stored on a server.
        </p>

        <div className="mt-[24px] flex items-center justify-center gap-[8px]">
          <Button
            variant="ghost"
            onClick={() => inputRef.current?.click()}
            disabled={working}
          >
            Choose files
          </Button>
          <Button onClick={analyze} disabled={working || files.length === 0}>
            {working ? "Analyzing…" : "Analyze papers"}
          </Button>
        </div>

        {files.length > 0 && (
          <ul className="mt-[24px] flex flex-wrap justify-center gap-[8px]">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <Pill tone="sky-tint">
                  {f.name} · {(f.size / 1_000_000).toFixed(1)} MB
                </Pill>
              </li>
            ))}
          </ul>
        )}

        {files.length > 0 && files.length < MIN_PAPERS_FOR_CONFIDENCE && !working && (
          <p className="mt-[16px] text-caption text-graphite">
            {files.length} paper{files.length === 1 ? "" : "s"} — recurrence
            needs {MIN_PAPERS_FOR_CONFIDENCE} or more to mean much.
          </p>
        )}
      </div>

      {!working && (
        <div className="mt-[24px] flex flex-wrap items-center gap-[8px]">
          <span className="text-body-sm text-graphite">
            Or open a corpus we already extracted:
          </span>
          {SAMPLES.map((sample) => (
            <Button
              key={sample.id}
              variant="ghost"
              title={sample.blurb}
              onClick={() => openSample(sample.id)}
              disabled={loadingSample !== null}
            >
              {loadingSample === sample.id ? "Opening…" : sample.name}
            </Button>
          ))}
        </div>
      )}

      {working && (
        <div className="mt-[24px] rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-pure-white p-[24px]">
          <div className="flex items-baseline justify-between gap-[16px]">
            <span className="text-body-sm font-medium">
              {pagesTotal === 0
                ? "Rendering pages…"
                : `${pagesDone} of ${pagesTotal} pages analyzed`}
            </span>
            <span className="text-body-sm text-graphite">
              {progress?.questionsFound ?? 0} questions found
            </span>
          </div>

          <div className="mt-[12px] h-[6px] w-full overflow-hidden rounded-[var(--radius-full)] bg-[rgba(0,0,0,0.06)]">
            <div
              className="h-full bg-notion-blue transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>

          {progress && progress.batchesFailed > 0 && (
            <p className="mt-[12px] text-caption text-coral">
              {progress.pagesFailed} page
              {progress.pagesFailed === 1 ? "" : "s"} could not be read and were
              skipped. The rest are still being analyzed.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-[16px] text-body-sm text-vermillion">{error}</p>
      )}
    </div>
  );
}
