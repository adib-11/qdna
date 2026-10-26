/**
 * The extraction eval: every model setup through the app's own pipeline
 * (batching, retries, model chain, prompt and schema), scored against the
 * ground truth, then the two finalists re-run. It runs on a free key over
 * several quota days: every measurement and every request is recorded in an
 * EvalProgress, and a run stops before each model's daily cap. No I/O of its
 * own; the eval script renders the pages, supplies the client and keeps the
 * progress file.
 */
import {
  EVAL_BACKOFF_BASE_MS,
  EVAL_DAILY_CAPS,
  EVAL_DEFAULT_DAILY_CAP,
  EVAL_LIVE_BATCH_PAGES,
  EVAL_MEASUREMENT_RETRIES,
  EVAL_MIN_INTERVAL_MS,
  EVAL_REPORTED_BATCH_SIZES,
  EVAL_SPENT_AFTER_429S,
  FREE_TIER_REQUESTS_PER_DAY,
  QUOTA_TIME_ZONE,
  TEXT_LAYER_MIN_CHARS,
} from "@/lib/config";
import { runExtraction, type ExtractionCache } from "@/lib/extract/runExtraction";
import { EXTRACTION_SETUPS, extractQuestions, type ExtractionSetup } from "@/lib/gemini/extract";
import { extractStatus, type ModelClient } from "@/lib/gemini/generate";
import type { GroundTruthCourse } from "@/lib/eval/groundTruth";
import { scoreExtraction, type ExtractedQuestion } from "@/lib/eval/score";
import { parseTextLayer } from "@/lib/eval/textLayer";
import type { PageImage } from "@/lib/types";

export interface EvalConfiguration extends ExtractionSetup {
  name: string;
}

/**
 * Every setup the eval runs live. "Text layer first" is measured offline only
 * (see textLayerRecall), and Gemma 4 is not run: see resultsDoc.
 */
export const CONFIGURATIONS: EvalConfiguration[] = Object.entries(EXTRACTION_SETUPS).map(
  ([name, setup]) => ({ name, ...setup }),
);

export interface EvalPaper {
  /** The ground-truth label. Extracted questions are scored under it. */
  label: string;
  pages: PageImage[];
}

/** One configuration's run over one paper, as the progress file keeps it. */
export interface Measurement {
  /** Requests Google accepted, per model, retries included. Rate-limit refusals are not counted. */
  requests: Record<string, number>;
  /** Batches answered, per model: the chain may answer from a fallback. */
  answeredBy: Record<string, number>;
  /** Latency of each batch that answered, the app's retries and backoff included. */
  latenciesMs: number[];
  batches: number;
  /** Batches that failed or timed out after every retry. */
  batchesFailed: number;
  /** Why each failed batch failed. Absent in progress saved before reasons were kept. */
  failures?: BatchFailure[];
  questions: ExtractedQuestion[];
}

/** Why a batch failed: the HTTP status (null when there was none) and a short message. */
export interface BatchFailure {
  status: number | null;
  message: string;
}

/**
 * Statuses that say nothing about the setup, only that its model was missing,
 * broken, overloaded or out of quota just then. A measurement hit by one stays
 * pending for a later run; only output the model gave and nothing could use,
 * or a timeout, is measured as a failure.
 */
const UNAVAILABLE = new Set([404, 429, 500, 503]);

/** A failure, worded for the progress file: short, and never quoting an API key. */
function describeFailure(error: unknown): BatchFailure {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: extractStatus(error),
    message: message.replace(/AIza[\w-]{35}/g, "[key]").replace(/\s+/g, " ").trim().slice(0, 200),
  };
}

/** Requests sent to one model on one quota day, refusals included, and whether it is spent. */
export interface ModelUsage {
  requests: number;
  spent: boolean;
}

/**
 * Everything the eval has done, so a run stopped by the daily quota resumes
 * where it stopped. Kept outside the repo; it holds no key.
 */
export interface EvalProgress {
  /** Keyed by measurementKey. */
  measurements: Record<string, Measurement>;
  /** Quota day, then model. */
  usage: Record<string, Record<string, ModelUsage>>;
  /** Measurements left pending because their model was unavailable, and why, by measurementKey. */
  retry?: Record<string, BatchFailure[]>;
}

export const emptyProgress = (): EvalProgress => ({ measurements: {}, usage: {}, retry: {} });

const measurementKey = (run: number, configuration: string, paper: string) =>
  `${run}|${configuration}|${paper}`;

/** What the eval measures: the ground truth, over these configurations, under these daily caps. */
export interface EvalSpec {
  truth: GroundTruthCourse[];
  configurations?: EvalConfiguration[];
  /** Requests per quota day per model. EVAL_DAILY_CAPS by default. */
  caps?: Record<string, number>;
}

export interface EvalRow {
  configuration: string;
  batchSize: number;
  /** 1 for the first pass, 2 for a finalist's re-run. */
  run: number;
  batches: number;
  /** Model requests Google accepted, retries included. Rate-limit refusals are not counted. */
  requests: number;
  papers: number;
  /** Latency of the batches that answered, retries and backoff included. NaN when none did. */
  p50Ms: number;
  p95Ms: number;
  /** Batches that failed or timed out after every retry, over all batches. */
  failureRate: number;
  requestsPerPaper: number;
  /** Papers one model's free daily quota covers. A chain pools several models' quotas. */
  papersPerDay: number;
  recall: number;
  precision: number;
  marksAccuracy: number;
  topicsPerQuestion: number;
  /** Batches answered, per model. */
  answeredBy: Record<string, number>;
}

export interface AdvanceOptions extends EvalSpec {
  papers: EvalPaper[];
  /** Gap between request starts, sized to the free tier's requests per minute. */
  minIntervalMs?: number;
  /** Called after every request and every measurement, to persist the progress. */
  save?: (progress: EvalProgress) => void;
  log?: (line: string) => void;
}

/** Every request is measured, so nothing is served from cache. */
const NO_CACHE: ExtractionCache = { get: () => null, set: () => {} };

export type EvalPhase = "first pass" | "finalists" | "complete";

/** A measurement still to make. */
export interface PendingMeasurement {
  run: number;
  configuration: EvalConfiguration;
  paper: string;
}

const paperLabels = (truth: GroundTruthCourse[]) =>
  truth.flatMap((course) => course.papers.map((p) => p.label));

/**
 * Where the eval stands: the first pass measures every configuration, then the
 * two best of it are re-run. The finalists follow from the first pass alone.
 */
export function pendingWork(
  progress: EvalProgress,
  spec: EvalSpec,
): { phase: EvalPhase; pending: PendingMeasurement[]; finalists: EvalConfiguration[] } {
  const configurations = spec.configurations ?? CONFIGURATIONS;
  const missing = (run: number, among: EvalConfiguration[]) =>
    among.flatMap((configuration) =>
      paperLabels(spec.truth)
        .filter((paper) => !progress.measurements[measurementKey(run, configuration.name, paper)])
        .map((paper) => ({ run, configuration, paper })),
    );

  const firstPass = missing(1, configurations);
  if (firstPass.length > 0) return { phase: "first pass", pending: firstPass, finalists: [] };
  const finalists = rankRows(evalRows(progress, spec, 1))
    .slice(0, 2)
    .map((row) => configurations.find((c) => c.name === row.configuration)!);
  const reruns = missing(2, finalists);
  return { phase: reruns.length > 0 ? "finalists" : "complete", pending: reruns, finalists };
}

export interface ModelStatus {
  model: string;
  cap: number;
  usedToday: number;
  spentToday: boolean;
  /** Requests sent on every quota day so far, refusals included. */
  sent: number;
  /** The fewest requests the pending measurements still need, one per batch. */
  left: number;
}

export interface EvalStatus {
  phase: EvalPhase;
  models: ModelStatus[];
  /**
   * Quota days to the end, today included, if every batch takes one request.
   * During the first pass, the finalists count as one more day.
   */
  daysLeft: number;
  /** What the next run will do. */
  next: string;
  /** Every failed batch: measured as a failure, or pending for a later run. */
  failures: Array<{ measurement: string; pending: boolean } & BatchFailure>;
}

/** Where the eval stands, and how long the rest takes under the caps. Needs no key and no network. */
export function evalStatus(progress: EvalProgress, spec: EvalSpec, now: Date): EvalStatus {
  const caps = spec.caps ?? EVAL_DAILY_CAPS;
  const { phase, pending } = pendingWork(progress, spec);
  const today = progress.usage[quotaDay(now)] ?? {};
  const batchesOf = new Map(
    spec.truth.flatMap((course) =>
      course.papers.map((p) => [p.label, Math.ceil(p.source.pages.length / EVAL_LIVE_BATCH_PAGES)]),
    ),
  );
  const primaries = (spec.configurations ?? CONFIGURATIONS).map((c) => c.models[0]);
  const used = Object.values(progress.usage).flatMap(Object.keys);

  const models = [...new Set([...primaries, ...used])].map((model) => {
    const cap = caps[model] ?? EVAL_DEFAULT_DAILY_CAP;
    const usage = today[model] ?? { requests: 0, spent: false };
    return {
      model,
      cap,
      usedToday: usage.requests,
      spentToday: usage.spent,
      sent: Object.values(progress.usage).reduce((n, day) => n + (day[model]?.requests ?? 0), 0),
      left: pending
        .filter((m) => m.configuration.models[0] === model)
        .reduce((n, m) => n + (batchesOf.get(m.paper) ?? 0), 0),
    };
  });
  const daysFor = ({ cap, usedToday, spentToday, left }: ModelStatus) => {
    const room = spentToday ? 0 : Math.max(0, cap - usedToday);
    if (left === 0) return 0;
    return left <= room ? 1 : 1 + Math.ceil((left - room) / cap);
  };

  const papersLeft = new Map<string, number>();
  for (const m of pending) papersLeft.set(m.configuration.name, (papersLeft.get(m.configuration.name) ?? 0) + 1);
  const list = [...papersLeft].map(([name, n]) => `${name} (${n} paper${n === 1 ? "" : "s"})`).join(", ");
  return {
    phase,
    models,
    daysLeft: Math.max(0, ...models.map(daysFor)) + (phase === "first pass" ? 1 : 0),
    failures: [
      ...Object.entries(progress.measurements).flatMap(([measurement, m]) =>
        (m.failures ?? []).map((f) => ({ measurement, pending: false, ...f })),
      ),
      ...Object.entries(progress.retry ?? {}).flatMap(([measurement, failures]) =>
        failures.map((f) => ({ measurement, pending: true, ...f })),
      ),
    ],
    next: {
      "first pass": `measure the first pass: ${list}`,
      finalists: `re-run the finalists: ${list}`,
      complete: "nothing: the eval is complete",
    }[phase],
  };
}

/**
 * Take the eval as far as today's quota allows: measure what the progress
 * lacks, mutating it as it goes, and go on to the finalists when the first
 * pass completes.
 */
export async function advanceEval(
  client: ModelClient,
  progress: EvalProgress,
  options: AdvanceOptions,
): Promise<void> {
  const {
    papers,
    caps = EVAL_DAILY_CAPS,
    minIntervalMs = EVAL_MIN_INTERVAL_MS,
    save = () => {},
    log = () => {},
  } = options;
  const usageOf = (model: string): ModelUsage => {
    const today = (progress.usage[quotaDay(new Date())] ??= {});
    return (today[model] ??= { requests: 0, spent: false });
  };
  const available = (model: string) => {
    const usage = usageOf(model);
    return !usage.spent && usage.requests < (caps[model] ?? EVAL_DEFAULT_DAILY_CAP);
  };
  const spend = (model: string) => {
    if (usageOf(model).spent) return;
    usageOf(model).spent = true;
    // A run that outlasts midnight starts the new quota day's count afresh.
    refusals[model] = 0;
    save(progress);
    log(`${model}: still refused after backing off, so its quota is spent for today`);
  };
  const refusals: Record<string, number> = {};
  let lastRequestAt = -Infinity;

  // Every request sent counts against the day, refusals included: the caps
  // are a ceiling to stay under, not a budget to spend. A model past its cap,
  // or spent, is refused here, without a request, as Google would refuse it.
  const guarded: ModelClient = {
    models: {
      generateContent: async ({ model, ...params }) => {
        if (!available(model)) throw Object.assign(new Error(`${model}: out of quota today`), { status: 429 });
        usageOf(model).requests += 1;
        lastRequestAt = Date.now();
        save(progress);
        try {
          const response = await client.models.generateContent({ model, ...params });
          refusals[model] = 0;
          return response;
        } catch (error) {
          if (extractStatus(error) === 429) {
            refusals[model] = (refusals[model] ?? 0) + 1;
            if (refusals[model] >= EVAL_SPENT_AFTER_429S) spend(model);
          }
          throw error;
        }
      },
    },
  };

  /**
   * One measurement, measured again after a backoff while the model refuses
   * (429) or is overloaded (503). The failures instead when its model stayed
   * unavailable, and null when it is out of quota today before starting.
   */
  const measureWithBackoff = async (
    configuration: EvalConfiguration,
    paper: EvalPaper,
  ): Promise<Measurement | BatchFailure[] | null> => {
    const primary = configuration.models[0];
    /** Requests accepted so far, over every attempt: all of them are the measurement's cost. */
    let accepted: Record<string, number> = {};
    /** The last attempt's failures, kept if the model runs out of quota before the next. */
    let failures: BatchFailure[] | null = null;
    for (let attempt = 0; ; attempt++) {
      if (!available(primary)) return failures;
      if (attempt > 0) await sleep(EVAL_BACKOFF_BASE_MS * 2 ** (attempt - 1));
      // runExtraction paces within a measurement; this paces across them.
      await sleep(lastRequestAt + minIntervalMs - Date.now());
      const measurement = await measure(guarded, configuration, paper, minIntervalMs);
      for (const [model, n] of Object.entries(accepted)) {
        measurement.requests[model] = (measurement.requests[model] ?? 0) + n;
      }
      accepted = measurement.requests;
      failures = measurement.failures ?? [];
      const status = failures.find((f) => f.status !== null && UNAVAILABLE.has(f.status))?.status;
      if (status === undefined) return measurement;
      const backOff = status === 429 || status === 503;
      if (backOff && attempt < EVAL_MEASUREMENT_RETRIES) continue;
      if (status === 429) spend(primary);
      return failures;
    }
  };

  /** Left pending in this run: the next run, on a later day, tries them again. */
  const deferred = new Set<string>();
  const retry = (progress.retry ??= {});

  for (;;) {
    let measured = false;
    for (const { run, configuration, paper } of pendingWork(progress, options).pending) {
      const key = measurementKey(run, configuration.name, paper);
      if (deferred.has(key) || !available(configuration.models[0])) continue;
      const pages = papers.find((p) => p.label === paper);
      if (!pages) throw new Error(`no pages for ${paper}`);
      const result = await measureWithBackoff(configuration, pages);
      if (!result) continue;
      const step = `${run === 1 ? "first pass" : "re-run"} · ${configuration.name} · ${paper}`;
      if (Array.isArray(result)) {
        deferred.add(key);
        retry[key] = result;
        save(progress);
        log(`${step}: left for a later run, ${result.map((f) => `${f.status ?? "no status"} ${f.message}`).join("; ")}`);
        continue;
      }
      progress.measurements[key] = result;
      delete retry[key];
      save(progress);
      measured = true;
      const outcome = result.batchesFailed
        ? `${result.batchesFailed} of ${result.batches} batches failed`
        : `${result.questions.length} questions`;
      log(`${step}: ${outcome}`);
    }
    if (!measured) return;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/** One configuration over one paper, through the app's own pipeline. */
async function measure(
  client: ModelClient,
  configuration: EvalConfiguration,
  paper: EvalPaper,
  minIntervalMs: number,
): Promise<Measurement> {
  const measurement: Measurement = {
    requests: {},
    answeredBy: {},
    latenciesMs: [],
    batches: 0,
    batchesFailed: 0,
    failures: [],
    questions: [],
  };
  const bump = (counts: Record<string, number>, model: string) => {
    counts[model] = (counts[model] ?? 0) + 1;
  };
  const counting: ModelClient = {
    models: {
      generateContent: async (params) => {
        try {
          const response = await client.models.generateContent(params);
          bump(measurement.requests, params.model);
          bump(measurement.answeredBy, params.model);
          return response;
        } catch (error) {
          if (extractStatus(error) !== 429) bump(measurement.requests, params.model);
          throw error;
        }
      },
    },
  };

  /** When each batch's first attempt started; a retry reuses the batch array. */
  const startedAt = new Map<PageImage[], number>();
  /** Each batch's last failure, until it answers. */
  const lastFailure = new Map<PageImage[], BatchFailure>();
  const extractBatch = async (pages: PageImage[], signal?: AbortSignal) => {
    if (!startedAt.has(pages)) startedAt.set(pages, Date.now());
    try {
      const questions = await extractQuestions(counting, pages, {
        signal,
        models: configuration.models,
        config: configuration.config,
      });
      measurement.latenciesMs.push(Date.now() - startedAt.get(pages)!);
      lastFailure.delete(pages);
      return questions;
    } catch (error) {
      lastFailure.set(pages, describeFailure(error));
      throw error;
    }
  };

  // runExtraction reads uploads; the paper stands in as an empty one.
  const result = await runExtraction([new File([], paper.label)], {
    extractBatch,
    loadPages: async () => paper.pages,
    cache: NO_CACHE,
    minIntervalMs,
    maxPages: EVAL_LIVE_BATCH_PAGES,
  });
  const { batchesFailed } = result.outcome.progress;
  measurement.batchesFailed = batchesFailed;
  measurement.batches = measurement.latenciesMs.length + batchesFailed;
  measurement.questions = result.outcome.questions.map((q) => ({
    qNo: q.qNo,
    marks: q.marks,
    text: q.text,
    topic: q.topic,
    paper: { label: paper.label },
  }));
  measurement.failures = [...lastFailure.values()];
  return measurement;
}

/** The scored row of each configuration whose run has measured every paper. */
export function evalRows(progress: EvalProgress, spec: EvalSpec, run: number): EvalRow[] {
  const labels = paperLabels(spec.truth);
  return (spec.configurations ?? CONFIGURATIONS).flatMap((configuration) => {
    const measured = labels.map(
      (label) => progress.measurements[measurementKey(run, configuration.name, label)],
    );
    if (measured.some((m) => !m)) return [];
    const sum = (pick: (m: Measurement) => number) => measured.reduce((n, m) => n + pick(m), 0);
    const total = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);
    const answeredBy: Record<string, number> = {};
    for (const m of measured) {
      for (const [model, n] of Object.entries(m.answeredBy)) answeredBy[model] = (answeredBy[model] ?? 0) + n;
    }
    const latencies = measured.flatMap((m) => m.latenciesMs);
    const batches = sum((m) => m.batches);
    const requests = sum((m) => total(m.requests));
    const score = scoreExtraction(measured.flatMap((m) => m.questions), spec.truth);
    return [
      {
        configuration: configuration.name,
        batchSize: EVAL_LIVE_BATCH_PAGES,
        run,
        batches,
        requests,
        papers: labels.length,
        p50Ms: percentile(latencies, 0.5),
        p95Ms: percentile(latencies, 0.95),
        failureRate: batches === 0 ? 0 : sum((m) => m.batchesFailed) / batches,
        requestsPerPaper: requests / labels.length,
        papersPerDay: requests === 0 ? Infinity : (FREE_TIER_REQUESTS_PER_DAY * labels.length) / requests,
        recall: score.recall,
        precision: score.precision,
        marksAccuracy: score.marksAccuracy,
        topicsPerQuestion: score.topicsPerQuestion,
        answeredBy,
      },
    ];
  });
}

/** The free-tier quota day a moment falls on: its date in Pacific time, as YYYY-MM-DD. */
export function quotaDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: QUOTA_TIME_ZONE }).format(at);
}

const hasTextLayer = (page: { text: string }) =>
  page.text.replace(/\s/g, "").length >= TEXT_LAYER_MIN_CHARS;

/**
 * "Text layer first", measured offline: the recall the text-layer parser
 * reaches alone on each paper that has a text layer. It is far below the
 * recall gate, so the setup is not run live.
 */
export function textLayerRecall(
  papers: Array<{ label: string; pages: Array<{ text: string }> }>,
  truth: GroundTruthCourse[],
): Array<{ label: string; recall: number }> {
  return papers
    .filter((paper) => paper.pages.some(hasTextLayer))
    .map(({ label, pages }) => {
      const questions = pages
        .filter(hasTextLayer)
        .flatMap((page) => parseTextLayer(page.text))
        .map((q) => ({ ...q, topic: "", paper: { label } }));
      const own = truth
        .map((course) => ({ ...course, papers: course.papers.filter((p) => p.label === label) }))
        .filter((course) => course.papers.length > 0);
      return { label, recall: scoreExtraction(questions, own).recall };
    });
}

/** Where the eval writes its results table, relative to the repo. */
export const RESULTS_DOC = "docs/extraction-eval.md";

/**
 * The results document, once the finalists are re-run, and the winner it
 * names. The winner is chosen on the re-run, so its numbers are the confirmed
 * ones. `textLayer` is the offline recall that kept "text layer first" out.
 */
export function resultsDoc(
  progress: EvalProgress,
  spec: EvalSpec,
  textLayer: Array<{ label: string; recall: number }>,
): { markdown: string; winner: string; why: string } {
  const firstPass = evalRows(progress, spec, 1);
  const reruns = evalRows(progress, spec, 2);
  const [best] = rankRows(reruns);
  const failed = gateFailures(best);
  const why = failed.length
    ? `no setup passed every gate; it has the best recall, failing ${failed.join("; ")}`
    : `it passes every gate with the fewest requests per paper (${best.requestsPerPaper.toFixed(2)})`;
  // Only 2 pages a request ran: on this ground truth 4 and 8 send the same requests.
  const everySize = (rows: EvalRow[]) =>
    rows.flatMap((row) => EVAL_REPORTED_BATCH_SIZES.map((batchSize) => ({ ...row, batchSize })));
  // Each finalist's first run sits beside its re-run, so stability is visible.
  const finalistRows = reruns.flatMap((rerun) => [
    firstPass.find((r) => r.configuration === rerun.configuration)!,
    rerun,
  ]);
  const days = Object.keys(progress.usage).sort();
  const papers = paperLabels(spec.truth).length;

  const markdown = `# Extraction eval

Measured by \`scripts/eval-extraction.mjs\` on a free key, over quota days ${days[0]} to ${days.at(-1)},
on the ${papers} ground-truth papers in \`tests/fixtures/ground-truth/\`.

Gates: ${GATES_TEXT}. Among the setups that pass, the fewest requests per paper wins; if none
passes, the best recall. Latency is per batch that answered, the app's retries and backoff
included; the eval's own backoff after a 429 or 503 is not. Requests count every request Google
accepted, the eval's retries included. Papers per day divide one model's free daily quota
(${FREE_TIER_REQUESTS_PER_DAY}, as measured for gemini-flash-latest) by requests per paper.

**Pages per request.** Every ground-truth paper is 1-2 pages, and batches never cross papers, so
4 and 8 pages per request send exactly the requests 2 does. Only 2 was run; its numbers are
reported for all three.

**Text layer first** was not run live. The text-layer parser alone reaches recall
${textLayer.map((t) => `${t.label}: ${t.recall.toFixed(2)}`).join(", ")} on the papers with a
text layer, against the ${GATES.minRecall} gate. \`scripts/eval-extraction.mjs text-layer\`
reproduces it offline.

**Gemma 4** (\`gemma-4-26b-a4b-it\`) was dropped from the live eval: on the free key it answered
extraction requests with repeated 500 INTERNAL errors, and a minimal JSON-schema test call
returned 500 as well.

**Flash-Lite, minimal thinking** is \`gemini-3.5-flash-lite\` with \`thinkingLevel: MINIMAL\`.
Thinking cannot be turned off on that model; minimal is the lowest level it allows.

**Pinned models.** Each setup runs on the one model it is named after, with no fallback, so
"Answered by" names that model. A batch refused with 429 or 503 is left pending for a later
day instead of falling back. The app keeps its fallback chain for students.

## Winner

**${best.configuration}**: ${why}. \`EXTRACTION_SETUP\` in \`lib/config.ts\` is set to it.

## First pass

${formatResultsTable(everySize(firstPass))}
## Finalists re-run

${formatResultsTable(finalistRows)}`;
  return { markdown, winner: best.configuration, why };
}

const SETUP_LINES = /^\/\/.*\n(export const EXTRACTION_SETUP = )".*";$/m;

/** lib/config.ts's source with EXTRACTION_SETUP set to the winner, and a comment citing the table. */
export function setExtractionSetup(configSource: string, winner: string, why: string): string {
  if (!SETUP_LINES.test(configSource)) throw new Error("EXTRACTION_SETUP not found in the config");
  return configSource.replace(
    SETUP_LINES,
    (_, assignment) => `// Chosen by the extraction eval, ${RESULTS_DOC}: ${why}.\n${assignment}${JSON.stringify(winner)};`,
  );
}

/** Nearest-rank percentile. */
function percentile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(q * sorted.length) - 1];
}

export const GATES = {
  minRecall: 0.95,
  minMarksAccuracy: 0.95,
  maxFailureRate: 0.02,
  maxP95Ms: 50_000,
};

/** The gates, worded for the results document. */
export const GATES_TEXT =
  `recall ≥ ${GATES.minRecall}, marks accuracy ≥ ${GATES.minMarksAccuracy}, ` +
  `failure + timeout ≤ ${GATES.maxFailureRate * 100}%, p95 < ${GATES.maxP95Ms / 1000}s`;

/** The gates a row fails, worded for the results table. Empty when it passes. */
export function gateFailures(row: EvalRow): string[] {
  const failures: string[] = [];
  if (!(row.recall >= GATES.minRecall)) failures.push(`recall < ${GATES.minRecall}`);
  if (!(row.marksAccuracy >= GATES.minMarksAccuracy)) {
    failures.push(`marks accuracy < ${GATES.minMarksAccuracy}`);
  }
  if (!(row.failureRate <= GATES.maxFailureRate)) {
    failures.push(`failure + timeout > ${GATES.maxFailureRate * 100}%`);
  }
  // With no model batch there is no latency to gate.
  if (row.batches > 0 && !(row.p95Ms < GATES.maxP95Ms)) {
    failures.push(`p95 ≥ ${GATES.maxP95Ms / 1000}s`);
  }
  return failures;
}

/**
 * Best first: rows that pass every gate, fewest requests per paper first;
 * then the rest, best recall first. The head of the list is the winner, and
 * the first two are the finalists.
 */
export function rankRows(rows: EvalRow[]): EvalRow[] {
  const passes = (row: EvalRow) => gateFailures(row).length === 0;
  return [...rows].sort((a, b) => {
    if (passes(a) !== passes(b)) return passes(a) ? -1 : 1;
    if (passes(a) && a.requestsPerPaper !== b.requestsPerPaper) {
      return a.requestsPerPaper - b.requestsPerPaper;
    }
    return b.recall - a.recall;
  });
}

const seconds = (ms: number) => (Number.isNaN(ms) ? "–" : (ms / 1000).toFixed(1));
const ratio = (value: number) => value.toFixed(2);

export function formatResultsTable(rows: EvalRow[]): string {
  const header = [
    "Configuration",
    "Pages/request",
    "Run",
    "p50 (s)",
    "p95 (s)",
    "Fail + timeout",
    "Requests/paper",
    "Papers/day (free)",
    "Recall",
    "Precision",
    "Marks accuracy",
    "Topics/question",
    "Answered by",
    "Gates",
  ];
  const lines = rows.map((row) => [
    row.configuration,
    String(row.batchSize),
    String(row.run),
    seconds(row.p50Ms),
    seconds(row.p95Ms),
    `${(row.failureRate * 100).toFixed(1)}%`,
    ratio(row.requestsPerPaper),
    Number.isFinite(row.papersPerDay) ? row.papersPerDay.toFixed(1) : "unlimited",
    ratio(row.recall),
    ratio(row.precision),
    ratio(row.marksAccuracy),
    ratio(row.topicsPerQuestion),
    Object.entries(row.answeredBy).map(([model, n]) => `${model} ×${n}`).join(", ") || "–",
    gateFailures(row).join("; ") || "pass",
  ]);
  return [header, header.map(() => "---"), ...lines].map((cells) => `| ${cells.join(" | ")} |`).join("\n") + "\n";
}
