import { getCached, hashImage, setCached } from "@/lib/cache/hashCache";
import {
  MAX_CONCURRENT,
  MAX_RETRIES,
  MIN_REQUEST_INTERVAL_MS,
  RETRY_BASE_DELAY_MS,
} from "@/lib/config";
import {
  extractRetryAfter,
  extractStatus,
  isKeyRejected,
} from "@/lib/gemini/generate";
import { pagesOf } from "@/lib/extract/uploads";
import { batchPages } from "@/lib/pdf/batch";
import { createLimiter } from "@/lib/queue/rateLimiter";
import type {
  ExtractionOutcome,
  ExtractionProgress,
  PageImage,
  Question,
} from "@/lib/types";

/** Where one uploaded file has got to. */
export interface FileProgress {
  name: string;
  status: "reading" | "extracting" | "done" | "cancelled";
  pagesDone: number;
  pagesTotal: number;
  pagesFailed: number;
  batchesFailed: number;
  questionsFound: number;
}

/** The content-hash cache, injectable so tests need no browser storage. */
export interface ExtractionCache {
  get(hash: string): Question[] | null;
  set(hash: string, questions: Question[]): void;
}

export interface RunExtractionOptions {
  /** One batch of pages to questions — normally Gemini on the student's own key. */
  extractBatch: (pages: PageImage[], signal?: AbortSignal) => Promise<Question[]>;
  /** One file to its pages. Defaults to rendering PDFs and reading photos as is. */
  loadPages?: (file: File) => Promise<PageImage[]>;
  onProgress?: (files: FileProgress[]) => void;
  /** The student's cancel. Finished pages are kept and stay cached. */
  signal?: AbortSignal;
  cache?: ExtractionCache;
  /** Gap between request starts; the free tier fails on requests per minute first. */
  minIntervalMs?: number;
}

export interface ExtractionRun {
  outcome: ExtractionOutcome;
  files: FileProgress[];
  /** True when the student stopped the run before every page was read. */
  cancelled: boolean;
}

const browserCache: ExtractionCache = { get: getCached, set: setCached };

/**
 * Full client-side extraction: load → batch → cache → dispatch, per file.
 *
 * A batch that fails after exhausting retries is recorded and skipped. Losing
 * three pages of a thirty-five page upload is a shortfall to report, not a
 * reason to throw away the other thirty-two. A cancel likewise keeps what
 * finished; only a key Google rejects ends the run with an error, since every
 * later batch would fail the same way.
 */
export async function runExtraction(
  uploads: File[],
  {
    extractBatch,
    loadPages = pagesOf,
    onProgress,
    signal,
    cache = browserCache,
    minIntervalMs = MIN_REQUEST_INTERVAL_MS,
  }: RunExtractionOptions,
): Promise<ExtractionRun> {
  const files: FileProgress[] = uploads.map((file) => ({
    name: file.name,
    status: "reading",
    pagesDone: 0,
    pagesTotal: 0,
    pagesFailed: 0,
    batchesFailed: 0,
    questionsFound: 0,
  }));
  const emit = () => onProgress?.(files.map((f) => ({ ...f })));
  const questions: Question[] = [];
  const limiter = createLimiter({ maxConcurrent: MAX_CONCURRENT, minIntervalMs });

  const finish = (cancelled: boolean): ExtractionRun => {
    if (cancelled) {
      for (const f of files) if (f.status !== "done") f.status = "cancelled";
      emit();
    }
    const progress = totalProgress(files, questions.length);
    return {
      outcome: {
        questions: dedupe(questions),
        progress,
        partial: progress.pagesDone < progress.pagesTotal,
      },
      files: files.map((f) => ({ ...f })),
      cancelled,
    };
  };

  // Read every file first so each paper's page total is truthful before
  // dispatch starts.
  const perFilePages: PageImage[][] = [];
  for (const [i, upload] of uploads.entries()) {
    if (signal?.aborted) return finish(true);
    const pages = await loadPages(upload);
    perFilePages.push(pages);
    files[i].pagesTotal = pages.length;
    emit();
  }

  // Batches never straddle files: two papers on one request confuses paper
  // metadata, and paper provenance is the whole point of the extraction.
  for (const [i, pages] of perFilePages.entries()) {
    const progress = files[i];
    progress.status = "extracting";
    emit();

    for (const batch of batchPages(pages)) {
      if (signal?.aborted) return finish(true);

      const hash = await hashImage(batch.map((p) => p.base64));
      let extracted = cache.get(hash);

      if (!extracted) {
        try {
          extracted = await limiter.schedule(() =>
            dispatchBatch(batch, extractBatch, signal),
          );
          cache.set(hash, extracted);
        } catch (error) {
          if (signal?.aborted) return finish(true);
          if (isKeyRejected(error)) throw error;
          progress.batchesFailed += 1;
          progress.pagesFailed += batch.length;
          emit();
          continue;
        }
      }

      questions.push(...extracted);
      progress.pagesDone += batch.length;
      progress.questionsFound += extracted.length;
      emit();
    }

    progress.status = "done";
    emit();
  }

  return finish(false);
}

/** The run's totals, as the saved corpus records them. */
function totalProgress(files: FileProgress[], questionsFound: number): ExtractionProgress {
  const sum = (key: "pagesDone" | "pagesTotal" | "pagesFailed" | "batchesFailed") =>
    files.reduce((total, f) => total + f[key], 0);
  return {
    pagesDone: sum("pagesDone"),
    pagesTotal: sum("pagesTotal"),
    pagesFailed: sum("pagesFailed"),
    batchesFailed: sum("batchesFailed"),
    questionsFound,
  };
}

/** One batch, retried with exponential backoff plus jitter on 429/5xx. */
async function dispatchBatch(
  batch: PageImage[],
  extractBatch: RunExtractionOptions["extractBatch"],
  signal?: AbortSignal,
): Promise<Question[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      const jitter = Math.random() * RETRY_BASE_DELAY_MS;
      const retryAfter = Number(extractRetryAfter(lastError)) * 1000;
      await pause(retryAfter > 0 ? retryAfter : backoff + jitter, signal);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    }

    try {
      return await extractBatch(batch, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      // A 4xx other than rate limiting will not improve on retry.
      const status = extractStatus(error);
      if (status !== null && status !== 429 && status < 500) throw error;
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Batch failed after retries");
}

/** A backoff wait that a cancel cuts short. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Cache hits and page overlap between batches can surface the same question. */
function dedupe(questions: Question[]): Question[] {
  const seen = new Set<string>();
  return questions.filter((q) => {
    const key = `${q.id}::${q.text.slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
