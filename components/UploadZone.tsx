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
import { needsSplit, splitCourses } from "@/lib/corpus/courses";
import { sampleCorpusId } from "@/lib/corpus/store";
import { groupSavedCorpus } from "@/lib/corpus/useCorpora";
import { MIN_PAPERS_FOR_CONFIDENCE } from "@/lib/config";
import { browserModelClient } from "@/lib/gemini/browserClient";
import { extractQuestions } from "@/lib/gemini/extract";
import { handleModelError, ownKeyStore } from "@/lib/key/ownKey";
import { SAMPLES, sampleOutcome } from "@/lib/samples";

type Phase = "idle" | "working" | "grouping" | "cancelled" | "failed";

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

      await openOutcome(run);
    } catch (err) {
      setPhase("failed");
      setError(handleModelError(err, "Extraction failed."));
    } finally {
      cancelRef.current = null;
    }
  }

  /** Save what was extracted, group its topics while the key is at hand, and open it. */
  async function openOutcome(run: ExtractionRun) {
    const saved = saveSession(run.outcome);
    const apiKey = ownKeyStore().get();
    if (saved && apiKey && !needsSplit(splitCourses(run.outcome.questions))) {
      const controller = new AbortController();
      cancelRef.current = controller;
      setPhase("grouping");
      // A failed or skipped grouping is not a failed extraction: the analysis
      // offers "Group topics" as a pending action until one succeeds. Papers
      // from several courses are grouped once the split screen has split them.
      await groupSavedCorpus(saved.id, apiKey, controller.signal).catch(() => {});
      cancelRef.current = null;
    }
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
  const grouping = phase === "grouping";
  const kept = stopped?.outcome;
  const sample = SAMPLES.find((s) => s.id === loadingSample);

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
          if (!working && !grouping) addFiles(e.dataTransfer.files);
        }}
        className={`rounded-card border border-dashed p-6 transition-[background-color,border-color] duration-(--dur-short) ease-out sm:p-10 ${
          dragging ? "border-accent bg-accent-soft" : "border-muted bg-surface-2"
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

        <h2 className="text-xl sm:text-2xl">
          Drop your exam paper PDFs or photos here
        </h2>
        <p className="mt-4 max-w-[60ch] text-ink-2">
          PDFs, and JPG, PNG or HEIC photos of paper pages. Pages are prepared
          in your browser and sent straight to Gemini on your own key, in small
          batches. Your files are never stored on a server.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => inputRef.current?.click()}
            disabled={working || grouping}
          >
            Choose files
          </Button>
          {working ? (
            <Button variant="outlined" onClick={() => cancelRef.current?.abort()}>
              Cancel extraction
            </Button>
          ) : grouping ? (
            <>
              <Button disabled>Grouping topics…</Button>
              <Button variant="outlined" onClick={() => cancelRef.current?.abort()}>
                Skip topic grouping
              </Button>
            </>
          ) : (
            <Button onClick={analyze} disabled={files.length === 0}>
              Analyze papers
            </Button>
          )}
        </div>

        {files.length > 0 && !working && (
          <ul className="mt-6 border-t border-ink">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex min-w-0 items-center justify-between gap-2 border-b border-rule py-1"
              >
                <Pill wrap className="min-w-0 break-all">
                  {f.name} · {(f.size / 1_000_000).toFixed(1)} MB
                </Pill>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label={`Remove ${f.name}`}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-lg text-ink-2 transition-[background-color] duration-(--dur-micro) ease-out hover:bg-surface-3 active:bg-rule"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {files.length > 0 && files.length < MIN_PAPERS_FOR_CONFIDENCE && !working && (
          <p className="mt-4 text-sm text-ink-2">
            {plural(files.length, "file")} — recurrence needs{" "}
            {MIN_PAPERS_FOR_CONFIDENCE} or more papers to mean much.
          </p>
        )}

        <div className="mt-4">
          <OwnKeyStatus />
        </div>
      </div>

      {!working && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="w-full text-sm text-ink-2">
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
        <div className="mt-4 text-ink-2">
          <p>
            Extraction cancelled. {kept.progress.pagesDone} of{" "}
            {plural(kept.progress.pagesTotal, "page")} finished and are saved in
            this browser, so analyzing again will not pay for them.
          </p>
          {kept.questions.length > 0 && (
            <Button variant="ghost" className="mt-3" onClick={() => void openOutcome(stopped)}>
              Open the {plural(kept.questions.length, "question")} extracted so far
            </Button>
          )}
        </div>
      )}

      {/* Always in the page, so a screen reader hears each change to it. */}
      <p role="status" className="sr-only">
        {sample
          ? `Opening the ${sample.name} sample…`
          : uploadStatus(phase, files.length, progress, kept)}
      </p>

      {error && (
        <p className="mt-4 text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** What the status region says, in one sentence, for the upload's current phase. */
function uploadStatus(
  phase: Phase,
  fileCount: number,
  progress: FileProgress[],
  kept: ExtractionRun["outcome"] | undefined,
): string {
  const total = (key: "pagesDone" | "pagesTotal" | "questionsFound") =>
    progress.reduce((sum, file) => sum + file[key], 0);
  switch (phase) {
    case "working":
      return total("pagesTotal") === 0
        ? "Preparing pages…"
        : `Extracting: ${total("pagesDone")} of ${plural(total("pagesTotal"), "page")} done, ${plural(total("questionsFound"), "question")} found.`;
    case "grouping":
      return "Pages extracted. Grouping topics…";
    case "cancelled":
      return kept
        ? `Extraction cancelled. ${kept.progress.pagesDone} of ${plural(kept.progress.pagesTotal, "page")} finished.`
        : "Extraction cancelled.";
    case "failed":
      return "";
    case "idle":
      return fileCount > 0 ? `${plural(fileCount, "file")} ready to analyze.` : "";
  }
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
    <ul className="mt-6 border-t border-ink">
      {files.map((file, index) => {
        const pct =
          file.pagesTotal > 0 ? Math.round((file.pagesDone / file.pagesTotal) * 100) : 0;
        return (
          <li key={`${file.name}-${index}`} className="border-b border-rule py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="min-w-0 break-words font-semibold">{file.name}</span>
              <span className="flex flex-wrap gap-x-3 text-sm text-ink-2 tabular-nums">
                <span>{STATUS_TEXT[file.status]}</span>{" "}
                {file.pagesTotal > 0 && (
                  <span>
                    {file.pagesDone} of {plural(file.pagesTotal, "page")}
                  </span>
                )}{" "}
                <span>{plural(file.questionsFound, "question")}</span>
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${file.name} extraction progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-valuetext={
                file.pagesTotal > 0
                  ? `${file.pagesDone} of ${plural(file.pagesTotal, "page")}`
                  : STATUS_TEXT[file.status]
              }
              className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-surface-3"
            >
              <div
                className="h-full w-full origin-left bg-ink transition-transform duration-(--dur-short) ease-out"
                style={{ transform: `scaleX(${pct / 100})` }}
              />
            </div>
            {file.pagesTooLarge > 0 && (
              <p className="mt-2 text-sm text-error">
                {plural(file.pagesTooLarge, "page")}{" "}
                {file.pagesTooLarge === 1 ? "is" : "are"} over Gemini&apos;s 20 MB
                limit for one request and{" "}
                {file.pagesTooLarge === 1 ? "was" : "were"} skipped. Try a
                smaller photo or a lower-resolution scan.
              </p>
            )}
            {file.pagesFailed > file.pagesTooLarge && (
              <p className="mt-2 text-sm text-error">
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
