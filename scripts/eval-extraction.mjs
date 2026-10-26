#!/usr/bin/env node
/**
 * The extraction eval, run on a free key over several days.
 *
 *   node scripts/eval-extraction.mjs plan
 *   node scripts/eval-extraction.mjs text-layer <papers-dir>
 *   GEMINI_API_KEY=… node scripts/eval-extraction.mjs run <papers-dir> <pages-dir>
 *
 * `plan` needs no key and makes no network call: it prints the requests the
 * whole eval needs per model and the days that takes under the daily caps,
 * then where the saved progress stands.
 *
 * `text-layer` measures "text layer first" offline, from each PDF's text layer
 * (pdftotext), at no quota. It is why that setup is not run live.
 *
 * `run` takes the eval as far as today's quota allows and stops before each
 * model's cap. Every request and measurement is saved to the progress file, so
 * the next run, on any day, carries on where this one stopped: the first pass,
 * then the two finalists' re-runs, and then it writes docs/extraction-eval.md
 * and sets EXTRACTION_SETUP in lib/config.ts to the winner. Until then it
 * prints what is done, what is left and what the next run will do.
 *
 * <papers-dir> holds the source PDFs the ground truth names (never committed);
 * pages are rendered into <pages-dir> the way extract-corpus.mjs renders them,
 * and everything after that is the app's own code, through lib/eval/run.ts.
 * Needs Node 23.5+ for `registerHooks`, and pdftoppm and pdftotext (poppler).
 *
 * Environment:
 *   EVAL_PROGRESS_FILE    progress file, outside the repo (default /tmp/qd/eval6-progress.json)
 *   EVAL_DAILY_CAPS       "model=n,model=n": per-model requests per quota day, over lib/config.ts's
 *   EVAL_MIN_INTERVAL_MS  gap between requests (default: free-tier pacing)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GROUND_TRUTH_DIR = path.join(ROOT, "tests", "fixtures", "ground-truth");
const CONFIG_FILE = path.join(ROOT, "lib", "config.ts");

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
const { EVAL_DAILY_CAPS, EVAL_LIVE_BATCH_PAGES, EVAL_MIN_INTERVAL_MS } = await import("../lib/config.ts");
const { RESULTS_DOC, advanceEval, emptyProgress, evalStatus, resultsDoc, setExtractionSetup, textLayerRecall } =
  await import("../lib/eval/run.ts");

const progressFile = path.resolve(process.env.EVAL_PROGRESS_FILE ?? "/tmp/qd/eval6-progress.json");
if (!path.relative(ROOT, progressFile).startsWith("..")) {
  fail(`the progress file must live outside the repo: ${progressFile}`);
}

const caps = { ...EVAL_DAILY_CAPS };
for (const entry of (process.env.EVAL_DAILY_CAPS ?? "").split(",").filter(Boolean)) {
  const [model, n] = entry.split("=");
  if (!model || !Number.isInteger(Number(n))) fail(`EVAL_DAILY_CAPS: cannot read "${entry}"`);
  caps[model.trim()] = Number(n);
}

const truth = fs
  .readdirSync(GROUND_TRUTH_DIR)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(fs.readFileSync(path.join(GROUND_TRUTH_DIR, name), "utf8")));
const groundTruthPapers = truth.flatMap((course) => course.papers);
const spec = { truth, caps };

const [mode, papersDir, pagesDir] = process.argv.slice(2);
if (mode === "plan") plan();
else if (mode === "text-layer" && papersDir) printTextLayer(papersDir);
else if (mode === "run" && papersDir && pagesDir) await run(papersDir, pagesDir);
else {
  fail(
    "usage: eval-extraction.mjs plan | text-layer <papers-dir> | run <papers-dir> <pages-dir>" +
      " (run needs GEMINI_API_KEY)",
  );
}

function plan() {
  const whole = evalStatus(emptyProgress(), spec, new Date());
  const perRun = groundTruthPapers.reduce((n, p) => n + Math.ceil(p.source.pages.length / EVAL_LIVE_BATCH_PAGES), 0);
  const firstPass = whole.models.reduce((n, m) => n + m.left, 0);
  console.log("The whole eval, at one request per batch (retries and chain fallbacks add more):");
  for (const m of whole.models) console.log(`  ${m.model}: ${m.left} requests, at ${m.cap} a day`);
  console.log(
    `  first pass ${firstPass} requests, then up to ${2 * perRun} for the two finalists' re-runs,` +
      " on whichever models they use.",
  );
  console.log(
    `  About ${whole.daysLeft} quota days on full daily budgets. Quota other work spends on the` +
      " same key, and every 429 or 503, adds to that.",
  );
  if (fs.existsSync(progressFile)) printStatus(loadProgress());
  else console.log(`No progress yet (${progressFile}).`);
}

function printTextLayer(dir) {
  for (const { label, recall } of measureTextLayer(dir)) {
    console.log(`${label}: recall ${recall.toFixed(2)} from the text layer alone`);
  }
}

/** "Text layer first", offline: the parser's recall on each paper's own text layer. */
function measureTextLayer(dir) {
  const papers = groundTruthPapers.map((paper) => ({
    label: paper.label,
    pages: paper.source.pages.map((n) => ({
      text: execFileSync(
        "pdftotext",
        ["-layout", "-f", String(n), "-l", String(n), path.join(dir, paper.source.file), "-"],
        { encoding: "utf8" },
      ),
    })),
  }));
  return textLayerRecall(papers, truth);
}

async function run(papersDir, pagesDir) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) fail("run needs GEMINI_API_KEY");
  const { GoogleGenAI } = await import("@google/genai");
  const { rasterise } = await import("./extract-corpus.mjs");

  const papers = groundTruthPapers.map((paper) => ({
    label: paper.label,
    pages: paper.source.pages.map((n) => {
      const dir = path.join(pagesDir, `${paper.label.replace(/\W+/g, "-")}-p${n}`);
      fs.rmSync(dir, { recursive: true, force: true });
      const [image] = rasterise(path.join(papersDir, paper.source.file), { page: n, dir });
      if (!image) fail(`${paper.label}: page ${n} of ${paper.source.file} rendered blank`);
      return { ...image, pageIndex: n - 1 };
    }),
  }));

  const progress = fs.existsSync(progressFile) ? loadProgress() : emptyProgress();
  await advanceEval(new GoogleGenAI({ apiKey }), progress, {
    ...spec,
    papers,
    minIntervalMs: Number(process.env.EVAL_MIN_INTERVAL_MS ?? EVAL_MIN_INTERVAL_MS),
    save: saveProgress,
    log: (line) => console.log(line),
  });
  saveProgress(progress);

  const status = evalStatus(progress, spec, new Date());
  if (status.phase !== "complete") {
    printStatus(progress);
    return;
  }
  const { markdown, winner, why } = resultsDoc(progress, spec, measureTextLayer(papersDir));
  fs.mkdirSync(path.join(ROOT, path.dirname(RESULTS_DOC)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, RESULTS_DOC), markdown);
  fs.writeFileSync(CONFIG_FILE, setExtractionSetup(fs.readFileSync(CONFIG_FILE, "utf8"), winner, why));
  console.log(`The eval is complete. Wrote ${RESULTS_DOC}; EXTRACTION_SETUP is now "${winner}": ${why}.`);
}

function printStatus(progress) {
  const status = evalStatus(progress, spec, new Date());
  console.log(`Eval: ${status.phase}. Progress in ${progressFile}.`);
  for (const m of status.models) {
    const today = m.spentToday ? "spent today" : `${m.usedToday}/${m.cap} used today`;
    console.log(`  ${m.model}: ${m.sent} requests sent, at least ${m.left} left; ${today}`);
  }
  if (status.phase !== "complete") {
    console.log(`About ${status.daysLeft} quota day(s) left, today included. Next run: ${status.next}.`);
  }
}

function loadProgress() {
  return JSON.parse(fs.readFileSync(progressFile, "utf8"));
}

/** Written whole and renamed into place, so a run killed mid-write keeps the last good copy. */
function saveProgress(progress) {
  fs.mkdirSync(path.dirname(progressFile), { recursive: true });
  const partial = `${progressFile}.partial`;
  fs.writeFileSync(partial, JSON.stringify(progress, null, 1));
  fs.renameSync(partial, progressFile);
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
