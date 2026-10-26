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
 * The extraction eval's spacing between requests. The free tier allows Flash
 * about 5 requests a minute, so one every 12s stays under it; a paid key can
 * override it with EVAL_MIN_INTERVAL_MS.
 */
export const EVAL_MIN_INTERVAL_MS = 12_000;

/**
 * Pages per request the eval sends live. Every ground-truth paper is 1-2
 * pages and batches never cross papers, so 4 and 8 would send the very same
 * requests; the results table reports the 2-page numbers for all three.
 */
export const EVAL_LIVE_BATCH_PAGES = 2;
export const EVAL_REPORTED_BATCH_SIZES = [2, 4, 8];

/**
 * Requests per quota day the eval allows itself per model, stopping before
 * each. gemini-flash-latest's 20 is measured; the others are not published
 * for the free tier, so they get a conservative guess. EVAL_DAILY_CAPS
 * ("model=n,model=n") overrides them.
 */
export const EVAL_DAILY_CAPS: Record<string, number> = {
  "gemini-flash-latest": 20,
  "gemini-2.5-flash-lite": 15,
  "gemma-4-26b-a4b-it": 15,
};
/** The cap for any other model, such as a fallback in the Flash chain. */
export const EVAL_DEFAULT_DAILY_CAP = 15;

/** Free-tier daily quotas reset at midnight Pacific time. */
export const QUOTA_TIME_ZONE = "America/Los_Angeles";

/**
 * A measurement refused with 429 or 503 is retried after this, doubling, up
 * to EVAL_MEASUREMENT_RETRIES times. A minute outlasts a requests-per-minute
 * window, so a 429 that survives it is the daily quota.
 */
export const EVAL_BACKOFF_BASE_MS = 60_000;
export const EVAL_MEASUREMENT_RETRIES = 2;

/** Consecutive 429s after which a model counts as spent for the quota day. */
export const EVAL_SPENT_AFTER_429S = 4;

/**
 * Requests per day one model allows on a free key, as measured for
 * gemini-flash-latest. The eval's papers-per-day figure divides it by
 * requests per paper.
 */
export const FREE_TIER_REQUESTS_PER_DAY = 20;

/**
 * Retry attempts per batch on 429 / 5xx / timeout before the batch is recorded
 * failed. Each attempt can burn the full request timeout, so this trades a
 * lower chance of recovery for bounded worst-case wall time.
 */
export const MAX_RETRIES = 2;

/** Base delay for exponential backoff, in milliseconds. */
export const RETRY_BASE_DELAY_MS = 2000;

/**
 * Wall-clock budget for one walk down the model chain. Kept at the 60s the
 * server routes were measured against, so a stalled batch fails and gets
 * retried or recorded rather than holding the whole extraction open.
 */
export const MODEL_BUDGET_MS = 60_000;
// The extraction eval (#6) should revisit this budget and the attempt caps
// below: they were sized for a 60s Vercel function window, which no longer
// bounds a browser-to-Gemini call.

/**
 * Longest a single model attempt may run, per action. Verbatim transcription
 * of a dense page was measured at 25–47s; a whole practice paper with
 * rationales at 35s and more; a hint, being short, at around 13s.
 */
export const EXTRACTION_ATTEMPT_MS = 45_000;
export const PRACTICE_PAPER_ATTEMPT_MS = 50_000;
export const HINT_ATTEMPT_MS = 25_000;

/** Rasterisation width. Wide enough for subscripted maths, small enough to batch. */
export const TARGET_PAGE_WIDTH_PX = 1200;

/** JPEG quality for rasterised pages. */
export const JPEG_QUALITY = 0.75;

/**
 * Per-request payload ceiling. Chosen when batches went through a Vercel
 * function (~4.5 MB bodies); requests now go straight to Gemini, whose inline
 * limit is higher, so this is conservative rather than binding.
 */
export const MAX_BATCH_BYTES = 3_500_000;

/**
 * Largest single page qDNA will send, as base64 bytes. Gemini caps a whole
 * request with inline data at 20 MB; a page over this is skipped with a clear
 * message rather than sent to fail. Photos are never downscaled to fit.
 */
export const GEMINI_INLINE_LIMIT_BYTES = 20_000_000;

/**
 * Non-whitespace characters at or above which a PDF page counts as having a
 * text layer. Image-only scans yield none, or a stray header of a few dozen.
 */
export const TEXT_LAYER_MIN_CHARS = 200;

/** Proportion of non-white pixels below which a page is treated as blank. */
export const LOW_INK_THRESHOLD = 0.02;

/** Papers below this count make recurrence signal unreliable. */
export const MIN_PAPERS_FOR_CONFIDENCE = 3;

/** Similarity at or above which two questions are the same lineage. */
export const VARIANT_THRESHOLD = 0.55;

/**
 * Similarity at or above which two topic labels are folded into one.
 *
 * Higher than the question threshold on purpose. Topic labels are two to five
 * words, so every token carries far more weight than it does in a paragraph of
 * question text: "Software Testing" and "Software Metrics" already share half
 * their tokens without naming the same subject. This catches the restatements
 * that independent batches produce — a plural, an added qualifier — and leaves
 * genuinely different labels apart.
 */
export const TOPIC_MERGE_THRESHOLD = 0.65;

/** Similarity at or above which two questions are effectively the same question. */
export const NEAR_IDENTICAL_THRESHOLD = 0.85;

/**
 * Split of the lexical similarity score between Jaccard and containment.
 *
 * Jaccard alone punishes the common real case where an examiner reuses a
 * question and bolts a bookwork part onto the front of it: the shared stem is
 * identical but the longer version's extra tokens inflate the union. Asking
 * instead what fraction of the *shorter* question reappears in the longer one
 * catches that; keeping Jaccard in the mix stops a two-word question matching
 * everything. Weights sum to 1.
 */
export const JACCARD_WEIGHT = 0.4;
export const CONTAINMENT_WEIGHT = 0.6;

/**
 * Below this token count a question is too short for containment to mean
 * anything — "What is an electric dipole?" is contained in half the corpus —
 * so such pairs are scored on Jaccard alone.
 */
export const MIN_TOKENS_FOR_CONTAINMENT = 8;

/**
 * How much shared numeric literals may lift a pair's score. Applied to the
 * headroom above the lexical score, so it can never push a pair past 1 and
 * never penalises a question that carries no numbers at all.
 */
export const NUMERIC_BONUS = 0.15;

/**
 * How much of the corpus the practice paper is written from.
 *
 * The paper is meant to concentrate revision on what recurs, so the tail is
 * deliberately excluded — and a shorter request is a faster, cheaper one
 * against the binding daily quota. Examples per topic are what teach the model
 * the examiner's register, so a few full questions beat many truncated ones.
 */
export const PRACTICE_PAPER_TOPIC_LIMIT = 8;
export const PRACTICE_PAPER_EXAMPLES_PER_TOPIC = 3;
export const PRACTICE_PAPER_EXAMPLE_CHARS = 400;

/** Coverage target marked on the Pareto curve. */
export const PARETO_TARGET_PCT = 70;

export const EXTRACTION_MODEL = "gemini-flash-latest";

/**
 * The extraction setup the app uses: a name from EXTRACTION_SETUPS in
 * lib/gemini/extract.ts. The eval rewrites the two lines below once it ends.
 */
// Pending: the extraction eval (docs/extraction-eval.md) is still in progress.
export const EXTRACTION_SETUP = "Flash chain";
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
