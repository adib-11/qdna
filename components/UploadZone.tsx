"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OwnKeyStatus, useRequestKey } from "@/components/OwnKeyProvider";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import {
  emptyRunMessage,
  runExtraction,
  type ExtractionRun,
  type FileProgress,
} from "@/lib/extract/runExtraction";
import { UPLOAD_ACCEPT, uploadKind } from "@/lib/extract/uploads";
import { saveSession } from "@/lib/extract/session";
import { sampleCorpusId } from "@/lib/corpus/store";
import { MIN_PAPERS_FOR_CONFIDENCE } from "@/lib/config";
import { browserModelClient } from "@/lib/gemini/browserClient";
import { extractQuestions } from "@/lib/gemini/extract";
import { handleModelError } from "@/lib/key/ownKey";
import { SAMPLES, sampleOutcome } from "@/lib/samples";

type Phase = "idle" | "working" | "cancelled" | "failed";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function UploadZone() {
  const router = useRouter();
  const requestKey = useRequestKey();
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<AbortController | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<FileProgress[]>([]);
  const [stopped, setStopped] = useState<ExtractionRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const all = Array.from(incoming);
    const readable = all.filter((f) => uploadKind(f) !== null);
    const skipped = all.length - readable.length;
    setError(
      skipped > 0
        ? `${plural(skipped, "file")} skipped: qDNA reads exam paper PDFs and JPG, PNG or HEIC photos of pages.`
        : null,
    );
    setStopped(null);
    setPhase("idle");
    setFiles((prev) => [...prev, ...readable]);
  }, []);

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setStopped(null);
  }

  async function analyze() {
    if (files.length === 0) return;
    // Extraction is a model action, so this is where the key is asked for.
    const apiKey = await requestKey();
    if (!apiKey) return;

    const client = browserModelClient(apiKey);
    const controller = new AbortController();
    cancelRef.current = controller;
    setPhase("working");
    setError(null);
    setStopped(null);
    setProgress([]);

    try {
      const run = await runExtraction(files, {
        extractBatch: (pages, signal) => extractQuestions(client, pages, { signal }),
        onProgress: setProgress,
        signal: controller.signal,
      });

      if (run.cancelled) {
        setPhase("cancelled");
        setStopped(run);
        return;
      }

      if (run.outcome.questions.length === 0) {
        setPhase("failed");
        // Spent quota on every batch reads as a quota problem, not a bad scan.
        setError(
          emptyRunMessage(run, (error) => handleModelError(error, "Extraction failed.")),
        );
        return;
      }

      openOutcome(run);
    } catch (err) {
      setPhase("failed");
      setError(handleModelError(err, "Extraction failed."));
    } finally {
      cancelRef.current = null;
    }
  }

  function openOutcome(run: ExtractionRun) {
    saveSession(run.outcome);
    router.push("/analyze");
  }

  /** No extraction, no network, no key: the corpus is already in the bundle. */
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
  const kept = stopped?.outcome;

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
          accept={UPLOAD_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <p className="text-subheading font-medium text-[rgba(0,0,0,0.95)]">
          Drop your exam paper PDFs or photos here
        </p>
        <p className="mt-[16px] text-body-sm text-graphite">
          PDFs, and JPG, PNG or HEIC photos of paper pages. Pages are prepared
          in your browser and sent straight to Gemini on your own key, in small
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
          {working ? (
            <Button variant="outlined" onClick={() => cancelRef.current?.abort()}>
              Cancel extraction
            </Button>
          ) : (
            <Button onClick={analyze} disabled={files.length === 0}>
              Analyze papers
            </Button>
          )}
        </div>

        {files.length > 0 && !working && (
          <ul className="mt-[24px] flex flex-wrap justify-center gap-[8px]">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-[4px]">
                <Pill tone="sky-tint">
                  {f.name} · {(f.size / 1_000_000).toFixed(1)} MB
                </Pill>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label={`Remove ${f.name}`}
                  className="rounded-[var(--radius-full)] px-[8px] text-body-sm text-graphite hover:bg-[rgba(0,0,0,0.06)]"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {files.length > 0 && files.length < MIN_PAPERS_FOR_CONFIDENCE && !working && (
          <p className="mt-[16px] text-caption text-graphite">
            {plural(files.length, "file")} — recurrence needs{" "}
            {MIN_PAPERS_FOR_CONFIDENCE} or more papers to mean much.
          </p>
        )}

        <div className="mt-[16px] flex justify-center">
          <OwnKeyStatus />
        </div>
      </div>

      {!working && (
        <div className="mt-[24px] flex flex-wrap items-center gap-[8px]">
          <span className="text-body-sm text-graphite">
            Or open a corpus we already extracted, no key needed:
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

      {(working || phase === "cancelled") && progress.length > 0 && (
        <PaperProgressList files={progress} />
      )}

      {phase === "cancelled" && stopped && kept && (
        <div className="mt-[16px] text-body-sm text-graphite" role="status">
          <p>
            Extraction cancelled. {kept.progress.pagesDone} of{" "}
            {plural(kept.progress.pagesTotal, "page")} finished and are saved in
            this browser, so analyzing again will not pay for them.
          </p>
          {kept.questions.length > 0 && (
            <Button variant="ghost" className="mt-[12px]" onClick={() => openOutcome(stopped)}>
              Open the {plural(kept.questions.length, "question")} extracted so far
            </Button>
          )}
        </div>
      )}

      {error && (
        <p className="mt-[16px] text-body-sm text-vermillion" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<FileProgress["status"], string> = {
  reading: "Preparing pages…",
  extracting: "Extracting",
  done: "Done",
  cancelled: "Cancelled",
};

/** One row per paper, so a slow or failing paper is visible on its own. */
function PaperProgressList({ files }: { files: FileProgress[] }) {
  return (
    <ul
      className="mt-[24px] space-y-[16px] rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-pure-white p-[24px]"
      aria-live="polite"
    >
      {files.map((file, index) => {
        const pct =
          file.pagesTotal > 0 ? Math.round((file.pagesDone / file.pagesTotal) * 100) : 0;
        return (
          <li key={`${file.name}-${index}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-[16px]">
              <span className="min-w-0 break-words text-body-sm font-medium">{file.name}</span>
              <span className="text-body-sm text-graphite tabular-nums">
                {STATUS_TEXT[file.status]}
                {file.pagesTotal > 0 &&
                  ` · ${file.pagesDone} of ${plural(file.pagesTotal, "page")}`}{" "}
                · {plural(file.questionsFound, "question")}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${file.name} extraction progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="mt-[8px] h-[6px] w-full overflow-hidden rounded-[var(--radius-full)] bg-[rgba(0,0,0,0.06)]"
            >
              <div
                className="h-full bg-notion-blue transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            {file.pagesTooLarge > 0 && (
              <p className="mt-[8px] text-caption text-coral">
                {plural(file.pagesTooLarge, "page")}{" "}
                {file.pagesTooLarge === 1 ? "is" : "are"} over Gemini&apos;s 20 MB
                limit for one request and{" "}
                {file.pagesTooLarge === 1 ? "was" : "were"} skipped. Try a
                smaller photo or a lower-resolution scan.
              </p>
            )}
            {file.pagesFailed > file.pagesTooLarge && (
              <p className="mt-[8px] text-caption text-coral">
                {plural(file.pagesFailed - file.pagesTooLarge, "page")} could not
                be read and {file.pagesFailed - file.pagesTooLarge === 1 ? "was" : "were"}{" "}
                skipped.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
