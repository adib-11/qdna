/**
 * The extraction eval: every configuration, at every batch size, through the
 * app's own pipeline (batching, pacing, retries, model chain, prompt and
 * schema), scored against the ground truth. No I/O of its own; the eval
 * script renders the pages and supplies the model client.
 */
import { MediaResolution, type GenerateContentConfig } from "@google/genai";
import { EXTRACTION_MODEL, MODEL_FALLBACKS, TEXT_LAYER_MIN_CHARS } from "@/lib/config";
import { runExtraction, type ExtractionCache } from "@/lib/extract/runExtraction";
import { extractQuestions } from "@/lib/gemini/extract";
import { extractStatus, type ModelClient } from "@/lib/gemini/generate";
import type { GroundTruthCourse } from "@/lib/eval/groundTruth";
import { scoreExtraction, type ExtractedQuestion } from "@/lib/eval/score";
import { parseTextLayer } from "@/lib/eval/textLayer";
import type { PageImage } from "@/lib/types";

export interface EvalConfiguration {
  name: string;
  /** The model chain to walk, in order. */
  models: string[];
  /** Settings layered over the app's schema and temperature. */
  config?: GenerateContentConfig;
  /** Read pages that have a text layer without the model. */
  textLayerFirst?: boolean;
}

const APP_CHAIN = [EXTRACTION_MODEL, ...MODEL_FALLBACKS];

export const CONFIGURATIONS: EvalConfiguration[] = [
  { name: "Flash chain", models: APP_CHAIN },
  {
    // The 2.5 Flash-Lite is the one Flash-Lite whose thinking can be turned
    // off outright; later ones only go down to a minimal level.
    name: "Flash-Lite, thinking off",
    models: ["gemini-2.5-flash-lite"],
    config: { thinkingConfig: { thinkingBudget: 0 } },
  },
  { name: "Gemma 4", models: ["gemma-4-26b-a4b-it"] },
  { name: "Text layer first", models: APP_CHAIN, textLayerFirst: true },
  {
    name: "Low media resolution",
    models: APP_CHAIN,
    config: { mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW },
  },
];

export const BATCH_SIZES = [2, 4, 8];

/** A page of a ground-truth paper: its image, and its text layer ("" when it has none). */
export type EvalPage = PageImage & { text: string };

export interface EvalPaper {
  /** The ground-truth label. Extracted questions are scored under it. */
  label: string;
  pages: EvalPage[];
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
  /** Latency of the batches that answered. NaN when none did. */
  p50Ms: number;
  p95Ms: number;
  /** Batches that failed or timed out after every retry, over all batches. */
  failureRate: number;
  requestsPerPaper: number;
  recall: number;
  precision: number;
  marksAccuracy: number;
  topicsPerQuestion: number;
  /** Batches answered, per model: the chain may answer from a fallback. */
  answeredBy: Record<string, number>;
}

export interface RunOptions {
  configuration: EvalConfiguration;
  batchSize: number;
  papers: EvalPaper[];
  truth: GroundTruthCourse[];
  run?: number;
  /** Gap between request starts, sized to the free tier's requests per minute. */
  minIntervalMs?: number;
}

/** Every request is measured, so nothing is served from cache. */
const NO_CACHE: ExtractionCache = { get: () => null, set: () => {} };

const hasTextLayer = (page: EvalPage) =>
  page.text.replace(/\s/g, "").length >= TEXT_LAYER_MIN_CHARS;

export async function runConfiguration(
  client: ModelClient,
  { configuration, batchSize, papers, truth, run = 1, minIntervalMs }: RunOptions,
): Promise<EvalRow> {
  let requests = 0;
  const answeredBy: Record<string, number> = {};
  const counting: ModelClient = {
    models: {
      generateContent: async (params) => {
        try {
          const response = await client.models.generateContent(params);
          requests += 1;
          answeredBy[params.model] = (answeredBy[params.model] ?? 0) + 1;
          return response;
        } catch (error) {
          if (extractStatus(error) !== 429) requests += 1;
          throw error;
        }
      },
    },
  };

  const labelOf = new Map<PageImage, string>();
  const latencies: number[] = [];
  /** Each batch's last error status, or null once it answered. */
  const lastStatus = new Map<PageImage[], number | null>();

  const extractBatch = async (pages: PageImage[], signal?: AbortSignal) => {
    const label = labelOf.get(pages[0]) ?? "";
    const started = Date.now();
    try {
      const questions = await extractQuestions(counting, pages, {
        signal,
        models: configuration.models,
        config: configuration.config,
      });
      latencies.push(Date.now() - started);
      lastStatus.set(pages, null);
      return questions.map((q) => ({ ...q, id: `${label}::${q.qNo}`, paper: { ...q.paper, label } }));
    } catch (error) {
      lastStatus.set(pages, extractStatus(error));
      throw error;
    }
  };

  const textQuestions: ExtractedQuestion[] = [];
  const modelPages = papers.map(({ label, pages }) => {
    const read = configuration.textLayerFirst ? pages.filter(hasTextLayer) : [];
    for (const page of read) {
      for (const q of parseTextLayer(page.text)) {
        textQuestions.push({ ...q, topic: "", paper: { label } });
      }
    }
    const rest = pages.filter((page) => !read.includes(page));
    for (const page of rest) labelOf.set(page, label);
    return rest;
  });

  const uploads = papers.map((_, i) => new File([], String(i)));
  const result = await runExtraction(uploads, {
    extractBatch,
    loadPages: async (file) => modelPages[Number(file.name)],
    cache: NO_CACHE,
    minIntervalMs,
    maxPages: batchSize,
  });

  if ([...lastStatus.values()].includes(429)) {
    throw new Error(
      `${configuration.name} at ${batchSize} pages: quota spent on every model, run incomplete`,
    );
  }

  const score = scoreExtraction([...textQuestions, ...result.outcome.questions], truth);
  const failed = result.outcome.progress.batchesFailed;
  const batches = latencies.length + failed;
  return {
    configuration: configuration.name,
    batchSize,
    run,
    batches,
    requests,
    papers: papers.length,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    failureRate: batches === 0 ? 0 : failed / batches,
    requestsPerPaper: requests / papers.length,
    recall: score.recall,
    precision: score.precision,
    marksAccuracy: score.marksAccuracy,
    topicsPerQuestion: score.topicsPerQuestion,
    answeredBy,
  };
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
  if (!(row.p95Ms < GATES.maxP95Ms)) failures.push(`p95 ≥ ${GATES.maxP95Ms / 1000}s`);
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
    ratio(row.recall),
    ratio(row.precision),
    ratio(row.marksAccuracy),
    ratio(row.topicsPerQuestion),
    Object.entries(row.answeredBy).map(([model, n]) => `${model} ×${n}`).join(", ") || "–",
    gateFailures(row).join("; ") || "pass",
  ]);
  return [header, header.map(() => "---"), ...lines].map((cells) => `| ${cells.join(" | ")} |`).join("\n") + "\n";
}
