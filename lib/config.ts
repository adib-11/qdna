/**
 * Single source of truth for every constant governing rate, size, and
 * similarity. No numeric literal controlling any of those may live elsewhere.
 */

/**
 * Pages sent per extraction request. Never send a whole document.
 *
 * Measured rather than assumed: output volume, not payload size, binds this
 * number. A dense exam page yields ~13 questions of verbatim transcription and
 * costs 25–47s on its own; two pages completed in 31s, and three never
 * returned inside three minutes.
 *
 * Latency pushes this number down, but the free tier's 20-requests-per-day
 * ceiling pushes it up much harder — one page per request cannot finish a
 * paper at all. Two is the compromise that fits both.
 */
export const BATCH_PAGES = 2;

/**
 * Two in flight: enough to keep wall-clock reasonable on a 35-page corpus,
 * gentle enough not to trip the free tier's requests-per-minute ceiling.
 */
export const MAX_CONCURRENT = 2;

/** Minimum spacing between extraction requests, in milliseconds. */
export const MIN_REQUEST_INTERVAL_MS = 2500;

/**
 * Retry attempts per batch on 429 / 5xx / timeout before the batch is recorded
 * failed. Each attempt can burn the full request timeout, so this trades a
 * lower chance of recovery for bounded worst-case wall time.
 */
export const MAX_RETRIES = 2;

/** Base delay for exponential backoff, in milliseconds. */
export const RETRY_BASE_DELAY_MS = 2000;

/**
 * Per-request ceiling. Sits just under the function's own maxDuration so a
 * stalled batch fails and gets retried or recorded, rather than holding the
 * whole extraction open indefinitely.
 */
export const REQUEST_TIMEOUT_MS = 58_000;

/** Rasterisation width. Wide enough for subscripted maths, small enough to batch. */
export const TARGET_PAGE_WIDTH_PX = 1200;

/** JPEG quality for rasterised pages. */
export const JPEG_QUALITY = 0.75;

/**
 * Per-request payload ceiling. Vercel caps function request bodies at ~4.5 MB;
 * this leaves margin for base64 overhead and the JSON envelope.
 */
export const MAX_BATCH_BYTES = 3_500_000;

/** Proportion of non-white pixels below which a page is treated as blank. */
export const LOW_INK_THRESHOLD = 0.02;

/** Papers below this count make recurrence signal unreliable. */
export const MIN_PAPERS_FOR_CONFIDENCE = 3;

/** Similarity at or above which two questions are the same lineage. */
export const VARIANT_THRESHOLD = 0.55;

/** Similarity at or above which two questions are effectively the same question. */
export const NEAR_IDENTICAL_THRESHOLD = 0.85;

export const EXTRACTION_MODEL = "gemini-flash-latest";
export const REASONING_MODEL = "gemini-flash-latest";

/**
 * Tried in order when the primary model is unavailable OR out of quota.
 *
 * The free tier meters requests-per-day *per model* — measured at 20/day for
 * gemini-flash-latest. One model alone cannot extract a single 35-page paper,
 * so the chain is a quota pool as much as an availability fallback. A paper
 * half-extracted because one model was busy or spent is a worse outcome than
 * a slightly different model reading the remaining pages.
 */
export const MODEL_FALLBACKS = [
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-3.6-flash",
];

/** localStorage key prefix for the content-hash extraction cache. */
export const CACHE_PREFIX = "qdna:v1:";
