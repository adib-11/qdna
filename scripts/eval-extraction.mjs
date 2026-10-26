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
 * the app's own code, through lib/eval/run.ts.
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
const { BATCH_SIZES, CONFIGURATIONS, formatResultsTable, gateFailures, rankRows, runConfiguration } =
  await import("../lib/eval/run.ts");

/**
 * Gap between request starts. The free tier allows Flash about 5 requests a
 * minute, so one every 12s stays under it; a paid key could go far faster.
 */
const MIN_INTERVAL_MS = 12_000;

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
    const [image] = rasterise(pdf, { first: n, last: n, dir });
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
    minIntervalMs: MIN_INTERVAL_MS,
  });
  console.log(
    `${configuration.name} @ ${batchSize} (run ${run}): recall ${row.recall.toFixed(2)}, ` +
      `p95 ${(row.p95Ms / 1000).toFixed(1)}s, ${row.requestsPerPaper.toFixed(2)} requests/paper`,
  );
  return row;
}

const firstPass = [];
for (const configuration of CONFIGURATIONS) {
  for (const batchSize of BATCH_SIZES) firstPass.push(await measure(configuration, batchSize, 1));
}

const finalists = rankRows(firstPass).slice(0, 2);
const reruns = [];
for (const finalist of finalists) {
  const configuration = CONFIGURATIONS.find((c) => c.name === finalist.configuration);
  reruns.push(await measure(configuration, finalist.batchSize, 2));
}

// The winner is chosen on the re-run, so its numbers are the confirmed ones.
const [winner] = rankRows(reruns);
const failed = gateFailures(winner);
const verdict = failed.length
  ? `No configuration passed every gate. Best recall: **${winner.configuration}** at ${winner.batchSize} pages per request, failing ${failed.join("; ")}.`
  : `**${winner.configuration}** at ${winner.batchSize} pages per request: it passes every gate with the fewest requests per paper.`;

fs.writeFileSync(
  outPath,
  `# Extraction eval

Measured on ${new Date().toISOString().slice(0, 10)} by \`scripts/eval-extraction.mjs\` over the
${papers.length} ground-truth papers in \`tests/fixtures/ground-truth/\`.

Gates: recall ≥ 0.95, marks accuracy ≥ 0.95, failure + timeout ≤ 2%, p95 < 50s. Among the
configurations that pass, the fewest requests per paper wins; if none passes, the best recall.
Latency is per batch that answered. Requests count every request Google accepted, retries included.
Text-layer pages carry no topic, so they add one blank topic to topics per question.

## Winner

${verdict}

## First pass

${formatResultsTable(firstPass)}
## Finalists re-run

${formatResultsTable(reruns)}`,
);
console.log(`wrote ${path.relative(ROOT, outPath)}`);
