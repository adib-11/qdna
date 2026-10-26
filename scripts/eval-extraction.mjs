#!/usr/bin/env node
/**
 * The extraction eval: every configuration at every batch size, scored
 * against the ground truth, then the two finalists re-run.
 *
 *   GEMINI_API_KEY=… node scripts/eval-extraction.mjs <papers-dir> <pages-dir> [out.md]
 *
 * <papers-dir> holds the source PDFs the ground truth names (they are never
 * committed); the ground-truth pages are rendered into <pages-dir>. Pages are
 * rasterised the way extract-corpus.mjs does it, and everything after that —
 * batching, pacing, retries, the model chain, the prompt and the schema — is
 * the app's own code, through lib/eval/run.ts. Needs Node 23.5+ for
 * `registerHooks`, and pdftoppm and pdftotext (poppler).
 *
 * Rows are written after every measurement, so a run stopped by spent quota
 * keeps what it measured. EVAL_MIN_INTERVAL_MS overrides the free-tier pacing.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GoogleGenAI } from "@google/genai";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GROUND_TRUTH_DIR = path.join(ROOT, "tests", "fixtures", "ground-truth");

// The app's modules import each other through tsconfig's "@/" alias and
// without extensions, as the bundler allows; plain Node needs both spelled out.
registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = specifier.startsWith("@/")
      ? pathToFileURL(path.join(ROOT, specifier.slice(2))).href
      : specifier;
    const fromTs = context.parentURL?.endsWith(".ts");
    if (fromTs && /^(file:|\.)/.test(target) && !path.extname(target)) target += ".ts";
    return nextResolve(target, context);
  },
});
const { rasterise } = await import("./extract-corpus.mjs");
const { EVAL_BATCH_SIZES, EVAL_MIN_INTERVAL_MS } = await import("../lib/config.ts");
const { CONFIGURATIONS, GATES_TEXT, formatResultsTable, gateFailures, rankRows, runConfiguration } =
  await import("../lib/eval/run.ts");

const minIntervalMs = Number(process.env.EVAL_MIN_INTERVAL_MS ?? EVAL_MIN_INTERVAL_MS);

const [papersDir, pagesDir, outPath = path.join(ROOT, "docs", "extraction-eval.md")] =
  process.argv.slice(2);
if (!papersDir || !pagesDir || !process.env.GEMINI_API_KEY) {
  console.error("usage: GEMINI_API_KEY=… eval-extraction.mjs <papers-dir> <pages-dir> [out.md]");
  process.exit(2);
}

const truth = fs
  .readdirSync(GROUND_TRUTH_DIR)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(fs.readFileSync(path.join(GROUND_TRUTH_DIR, name), "utf8")));

const papers = truth.flatMap((course) =>
  course.papers.map((paper) => ({ label: paper.label, pages: paper.source.pages.map(renderPage(paper)) })),
);

/** One ground-truth page: its image, and its PDF text layer. */
function renderPage(paper) {
  const pdf = path.join(papersDir, paper.source.file);
  return (n) => {
    const dir = path.join(pagesDir, `${paper.label.replace(/\W+/g, "-")}-p${n}`);
    fs.rmSync(dir, { recursive: true, force: true });
    const [image] = rasterise(pdf, { page: n, dir });
    if (!image) throw new Error(`${paper.label}: page ${n} of ${paper.source.file} rendered blank`);
    const text = execFileSync("pdftotext", ["-layout", "-f", String(n), "-l", String(n), pdf, "-"], {
      encoding: "utf8",
    });
    return { ...image, pageIndex: n - 1, text };
  };
}

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function measure(configuration, batchSize, run) {
  const row = await runConfiguration(client, {
    configuration,
    batchSize,
    papers,
    truth,
    run,
    minIntervalMs,
  });
  console.log(formatResultsTable([row]).split("\n")[2]);
  return row;
}

const firstPass = [];
const reruns = [];
let verdict = "Not chosen yet: the run stopped before the finalists were re-run.";

try {
  for (const configuration of CONFIGURATIONS) {
    for (const batchSize of EVAL_BATCH_SIZES) {
      firstPass.push(await measure(configuration, batchSize, 1));
      writeResults();
    }
  }

  const finalists = rankRows(firstPass).slice(0, 2);
  for (const finalist of finalists) {
    const configuration = CONFIGURATIONS.find((c) => c.name === finalist.configuration);
    reruns.push(await measure(configuration, finalist.batchSize, 2));
    writeResults();
  }

  // The winner is chosen on the re-run, so its numbers are the confirmed ones.
  const [winner] = rankRows(reruns);
  const failed = gateFailures(winner);
  verdict = failed.length
    ? `No configuration passed every gate. Best recall: **${winner.configuration}** at ${winner.batchSize} pages per request, failing ${failed.join("; ")}.`
    : `**${winner.configuration}** at ${winner.batchSize} pages per request: it passes every gate with the fewest requests per paper.`;
} finally {
  writeResults();
}

function writeResults() {
  // Each finalist's first run sits beside its re-run, so stability is visible.
  const finalistRows = reruns.flatMap((rerun) => [
    firstPass.find((r) => r.configuration === rerun.configuration && r.batchSize === rerun.batchSize),
    rerun,
  ]);
  fs.writeFileSync(
    outPath,
    `# Extraction eval

Measured on ${new Date().toISOString().slice(0, 10)} by \`scripts/eval-extraction.mjs\` over the
${papers.length} ground-truth papers in \`tests/fixtures/ground-truth/\`.

Gates: ${GATES_TEXT}. Among the configurations that pass, the fewest requests per paper wins;
if none passes, the best recall. Latency is per batch that answered, retries and backoff included.
Requests count every request Google accepted, retries included. Papers per day divide one model's
free daily quota by requests per paper. Text-layer pages carry no topic, so they add one blank
topic to topics per question.

## Winner

${verdict}

## First pass

${formatResultsTable(firstPass)}
## Finalists re-run

${formatResultsTable(finalistRows)}`,
  );
}
console.log(`wrote ${path.relative(ROOT, outPath)}`);
