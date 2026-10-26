import { getCached, hashImage, setCached } from "@/lib/cache/hashCache";
import {
  GEMINI_INLINE_LIMIT_BYTES,
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
  /** Pages skipped, including any too large to send. */
  pagesFailed: number;
  /** Pages over Gemini's inline size limit, skipped without a request. */
  pagesTooLarge: number;
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
  loadPages?: (file: File, signal?: AbortSignal) => Promise<PageImage[]>;
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
  /** The last batch failure, so a run that read nothing can say why. */
  lastError?: unknown;
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
    pagesTooLarge: 0,
    batchesFailed: 0,
    questionsFound: 0,
  }));
  const emit = () => onProgress?.(files.map((f) => ({ ...f })));
  const questions: Question[] = [];
  let lastError: unknown;
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
      lastError,
    };
  };

  // Read every file first so each paper's page total is truthful before
  // dispatch starts.
  const perFilePages: PageImage[][] = [];
  for (const [i, upload] of uploads.entries()) {
    if (signal?.aborted) return finish(true);
    let pages: PageImage[];
    try {
      pages = await loadPages(upload, signal);
    } catch (error) {
      if (signal?.aborted) return finish(true);
      throw error;
    }
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

      // Batches cap their bytes, so only a lone page can be this big. Sending
      // it would fail anyway; say why instead. Photos are never downscaled.
      if (batch.length === 1 && batch[0].bytes > GEMINI_INLINE_LIMIT_BYTES) {
        progress.pagesTooLarge += 1;
        progress.pagesFailed += 1;
        emit();
        continue;
      }

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
          lastError = error;
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

/**
 * Why a run that produced no questions produced none: the model's own error
 * when batches failed (spent quota, say), otherwise the scans themselves.
 */
export function emptyRunMessage(run: ExtractionRun, describe: (error: unknown) => string): string {
  if (run.lastError !== undefined) return describe(run.lastError);
  if (run.files.some((f) => f.pagesTooLarge > 0)) {
    return "Every page was too large to send to Gemini. Try smaller photos or a lower-resolution scan.";
  }
  return "No questions came back from those pages. If the scans are very faint or rotated, try a cleaner copy.";
}

/**
 * The note on a partial corpus: pages that could not be read, pages a cancel
 * left unread, or both.
 */
export function shortfallNote(progress: ExtractionProgress): string {
  const notes: string[] = [];
  const pages = (n: number) => `${n} page${n === 1 ? "" : "s"}`;
  const tooLarge = progress.pagesTooLarge ?? 0;
  const unreadable = progress.pagesFailed - tooLarge;
  if (unreadable > 0) notes.push(`${pages(unreadable)} could not be read`);
  if (tooLarge > 0) {
    notes.push(`${pages(tooLarge)} ${tooLarge === 1 ? "was" : "were"} too large to send to Gemini`);
  }
  if (progress.pagesDone + progress.pagesFailed < progress.pagesTotal) {
    notes.push("the extraction was cancelled before the rest");
  }
  return notes.length > 0 ? `${notes.join(", and ")}.` : "";
}

/** The run's totals, as the saved corpus records them. */
function totalProgress(files: FileProgress[], questionsFound: number): ExtractionProgress {
  const sum = (
    key: "pagesDone" | "pagesTotal" | "pagesFailed" | "pagesTooLarge" | "batchesFailed",
  ) =>
    files.reduce((total, f) => total + f[key], 0);
  return {
    pagesDone: sum("pagesDone"),
    pagesTotal: sum("pagesTotal"),
    pagesFailed: sum("pagesFailed"),
    pagesTooLarge: sum("pagesTooLarge"),
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
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
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
