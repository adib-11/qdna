import { getCached, hashImage, setCached } from "@/lib/cache/hashCache";
import {
  MAX_CONCURRENT,
  MAX_RETRIES,
  MIN_REQUEST_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  RETRY_BASE_DELAY_MS,
} from "@/lib/config";
import { batchPages } from "@/lib/pdf/batch";
import { renderPdfToPages } from "@/lib/pdf/render";
import { createLimiter } from "@/lib/queue/rateLimiter";
import type {
  ExtractionOutcome,
  ExtractionProgress,
  PageImage,
  Question,
} from "@/lib/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RunExtractionOptions {
  onProgress?: (progress: ExtractionProgress) => void;
  /** Optional free-text context passed to the extractor, e.g. a course name. */
  hint?: string;
  signal?: AbortSignal;
}

/**
 * Full client-side extraction: render → filter → batch → cache → dispatch.
 *
 * A batch that fails after exhausting retries is recorded and skipped. Losing
 * three pages of a thirty-five page upload is a shortfall to report, not a
 * reason to throw away the other thirty-two.
 */
export async function runExtraction(
  files: File[],
  options: RunExtractionOptions = {},
): Promise<ExtractionOutcome> {
  const { onProgress, hint, signal } = options;

  const progress: ExtractionProgress = {
    pagesDone: 0,
    pagesTotal: 0,
    questionsFound: 0,
    batchesFailed: 0,
    pagesFailed: 0,
  };
  const emit = () => onProgress?.({ ...progress });

  // Render every file first so pagesTotal is truthful before dispatch starts.
  const perFilePages: PageImage[][] = [];
  for (const file of files) {
    const pages = await renderPdfToPages(file);
    perFilePages.push(pages);
    progress.pagesTotal += pages.length;
    emit();
  }

  const limiter = createLimiter({
    maxConcurrent: MAX_CONCURRENT,
    minIntervalMs: MIN_REQUEST_INTERVAL_MS,
  });

  const questions: Question[] = [];

  // Batches never straddle files: two papers on one request confuses paper
  // metadata, and paper provenance is the whole point of the extraction.
  for (const pages of perFilePages) {
    for (const batch of batchPages(pages)) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const hash = await hashImage(batch.map((p) => p.base64));
      const cached = getCached(hash);

      if (cached) {
        questions.push(...cached);
        progress.pagesDone += batch.length;
        progress.questionsFound = questions.length;
        emit();
        continue;
      }

      try {
        const extracted = await limiter.schedule(() =>
          dispatchBatch(batch, { hint, signal }),
        );
        setCached(hash, extracted);
        questions.push(...extracted);
        progress.pagesDone += batch.length;
      } catch (error) {
        if (signal?.aborted) throw error;
        progress.batchesFailed += 1;
        progress.pagesFailed += batch.length;
      }

      progress.questionsFound = questions.length;
      emit();
    }
  }

  return {
    questions: dedupe(questions),
    progress: { ...progress },
    partial: progress.batchesFailed > 0,
  };
}

/** One batch, retried with exponential backoff plus jitter on 429/5xx. */
async function dispatchBatch(
  batch: PageImage[],
  { hint, signal }: { hint?: string; signal?: AbortSignal },
): Promise<Question[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      const jitter = Math.random() * RETRY_BASE_DELAY_MS;
      await sleep(retryAfterMs(lastError) ?? backoff + jitter);
    }

    // A batch that never returns must not hold the whole run open. The abort
    // is combined with the caller's so a user cancel still wins.
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const attemptSignal = signal
      ? AbortSignal.any([signal, timeout])
      : timeout;

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: batch.map((p) => p.base64), hint }),
        signal: attemptSignal,
      });

      if (response.ok) {
        const data = (await response.json()) as { questions?: Question[] };
        return data.questions ?? [];
      }

      // 4xx other than rate limiting will not improve on retry.
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`Extraction rejected the batch (${response.status})`);
      }

      lastError = Object.assign(new Error(`Upstream ${response.status}`), {
        status: response.status,
        retryAfter: response.headers.get("Retry-After"),
      });
    } catch (error) {
      // Only a caller-initiated abort ends the run; a timeout is retryable.
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Batch failed after retries");
}

function retryAfterMs(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const value = (error as { retryAfter?: unknown }).retryAfter;
  const seconds = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
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
