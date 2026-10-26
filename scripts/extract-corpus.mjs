#!/usr/bin/env node
/**
 * Extract a bundled sample corpus from a PDF, offline of the browser.
 *
 *   node scripts/extract-corpus.mjs <pdf> <out.json> ["course hint"]
 *
 * The shipped path renders pages with pdf.js in a canvas and sends them to
 * Gemini from the browser. Neither exists here, so rasterisation is pdftoppm —
 * but the prompt, the schema, the batch size, the byte ceiling and the
 * model-fallback walk are all imported from the same modules the browser uses, so a corpus produced here is the corpus a user would
 * get from uploading the same file.
 *
 * Every batch is cached on disk by content hash. A run that dies on quota
 * resumes where it stopped instead of paying for the pages it already read.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BATCH_PAGES,
  EXTRACTION_MODEL,
  JPEG_QUALITY,
  LOW_INK_THRESHOLD,
  MAX_BATCH_BYTES,
  MIN_REQUEST_INTERVAL_MS,
  MODEL_FALLBACKS,
  TARGET_PAGE_WIDTH_PX,
} from "../lib/config.ts";
import { generateWithFallback } from "../lib/gemini/generate.ts";
import { EXTRACTION_PROMPT } from "../lib/gemini/prompts.ts";
import { EXTRACTION_SCHEMA } from "../lib/gemini/schema.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(ROOT, ".cache", "extract");

/** Matches the browser's budget: 60s total, 45s per model attempt. */
const BUDGET_MS = 60_000;
const MAX_ATTEMPT_MS = 45_000;

const [pdfPath, outPath, hint] = process.argv.slice(2);

// The eval runner imports `rasterise` from here; only a direct run extracts.
if (import.meta.main) {
  if (!pdfPath || !outPath) {
    console.error('usage: extract-corpus.mjs <pdf> <out.json> ["course hint"]');
    process.exit(2);
  }
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function main() {
  const apiKey = readApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const pages = rasterise(pdfPath);
  console.log(`${path.basename(pdfPath)}: ${pages.length} pages with ink`);

  const batches = batchPages(pages);
  const questions = [];
  let failed = 0;

  for (const [i, batch] of batches.entries()) {
    const label = `batch ${i + 1}/${batches.length} (pages ${batch
      .map((p) => p.pageIndex + 1)
      .join(", ")})`;

    const hash = hashBatch(batch);
    const cached = readCache(hash);
    if (cached) {
      questions.push(...cached);
      console.log(`${label}: ${cached.length} questions (cached)`);
      continue;
    }

    try {
      const extracted = await extractBatch(ai, batch, hint);
      writeCache(hash, extracted);
      questions.push(...extracted);
      console.log(`${label}: ${extracted.length} questions`);
    } catch (error) {
      failed += 1;
      console.error(`${label}: FAILED — ${error?.message ?? error}`);
    }

    await sleep(MIN_REQUEST_INTERVAL_MS);
  }

  const deduped = dedupe(questions.map(withId));
  fs.writeFileSync(outPath, `${JSON.stringify(deduped, null, 2)}\n`);

  const papers = new Set(deduped.map((q) => q.paper.label));
  const topics = new Set(deduped.map((q) => q.topic));
  console.log(
    `wrote ${outPath}: ${deduped.length} questions, ${papers.size} papers, ` +
      `${topics.size} topics${failed ? `, ${failed} batch(es) failed` : ""}`,
  );
  if (deduped.length === 0) process.exit(1);
}

/**
 * PDF pages to JPEG, with blank pages dropped.
 *
 * Ink is measured on a separate 20-DPI greyscale raster rather than on the
 * JPEG: the browser path reads pixels out of the canvas it already has, and
 * the honest equivalent here is to read pixels too. A small PGM is trivial to
 * parse and costs a few milliseconds a page.
 *
 * `first`/`last` limit it to a one-based page range, and `dir` keeps the
 * renders there instead of in a temporary directory that is removed after.
 */
export function rasterise(file, { first, last, dir } = {}) {
  const outDir = dir ?? fs.mkdtempSync(path.join(os.tmpdir(), "qdna-"));
  fs.mkdirSync(outDir, { recursive: true });
  const range = first ? ["-f", String(first), "-l", String(last ?? first)] : [];

  execFileSync("pdftoppm", [
    ...range,
    "-jpeg",
    "-jpegopt", `quality=${Math.round(JPEG_QUALITY * 100)}`,
    "-scale-to-x", String(TARGET_PAGE_WIDTH_PX),
    "-scale-to-y", "-1",
    file,
    path.join(outDir, "page"),
  ]);
  execFileSync("pdftoppm", [...range, "-gray", "-r", "20", file, path.join(outDir, "ink")]);

  const jpegs = fs.readdirSync(outDir).filter((f) => f.endsWith(".jpg")).sort();
  const grays = fs.readdirSync(outDir).filter((f) => f.endsWith(".pgm")).sort();

  const pages = [];
  for (const [index, name] of jpegs.entries()) {
    if (grays[index] && inkRatio(path.join(outDir, grays[index])) < LOW_INK_THRESHOLD) {
      console.log(`  page ${index + 1}: blank, skipped`);
      continue;
    }
    const base64 = fs.readFileSync(path.join(outDir, name)).toString("base64");
    pages.push({ pageIndex: index, base64, bytes: base64.length, mimeType: "image/jpeg" });
  }

  if (!dir) fs.rmSync(outDir, { recursive: true, force: true });
  return pages;
}

/** Proportion of non-white pixels in a binary PGM (P5), 0–1. */
function inkRatio(pgmPath) {
  const buffer = fs.readFileSync(pgmPath);
  // P5 header: magic, width, height, maxval — whitespace-separated, then raw
  // bytes. Comment lines are legal but pdftoppm does not emit them.
  let offset = 0;
  let fields = 0;
  while (fields < 4 && offset < buffer.length) {
    while (offset < buffer.length && /\s/.test(String.fromCharCode(buffer[offset]))) offset++;
    while (offset < buffer.length && !/\s/.test(String.fromCharCode(buffer[offset]))) offset++;
    fields++;
  }
  offset++; // the single whitespace byte terminating the header

  let ink = 0;
  for (let i = offset; i < buffer.length; i++) if (buffer[i] < 250) ink++;
  return ink / Math.max(1, buffer.length - offset);
}

/** Runs of BATCH_PAGES, split further when the payload would exceed the cap. */
function batchPages(pages) {
  const batches = [];
  let current = [];
  let bytes = 0;

  for (const page of pages) {
    const wouldExceed = current.length > 0 && bytes + page.bytes > MAX_BATCH_BYTES;
    if (current.length === BATCH_PAGES || wouldExceed) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(page);
    bytes += page.bytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function extractBatch(ai, batch, hint) {
  const raw = await generateWithFallback(ai, {
    parts: [
      { text: hint ? `${EXTRACTION_PROMPT}\n\nContext: ${hint}` : EXTRACTION_PROMPT },
      ...batch.map((page) => ({
        inlineData: { mimeType: "image/jpeg", data: page.base64 },
      })),
    ],
    models: [EXTRACTION_MODEL, ...MODEL_FALLBACKS],
    config: {
      responseMimeType: "application/json",
      responseSchema: EXTRACTION_SCHEMA,
      temperature: 0,
    },
    budgetMs: BUDGET_MS,
    maxAttemptMs: MAX_ATTEMPT_MS,
  });
  if (!raw) return [];
  return JSON.parse(raw).questions ?? [];
}

function hashBatch(batch) {
  return createHash("sha256")
    .update(batch.map((p) => p.base64).join("|"))
    .digest("hex");
}

function readCache(hash) {
  const file = path.join(CACHE_DIR, `${hash}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(hash, questions) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(CACHE_DIR, `${hash}.json`),
    JSON.stringify(questions),
  );
}

/** The id the app assigns, so bundled corpora are shaped like live ones. */
function withId(question, index) {
  return { ...question, id: `${question.paper?.label ?? "unknown"}::${question.qNo ?? index}` };
}

function dedupe(questions) {
  const seen = new Set();
  return questions.filter((q) => {
    const key = `${q.id}::${q.text.slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envFile = path.join(ROOT, ".env.local");
  const line = fs
    .readFileSync(envFile, "utf8")
    .split("\n")
    .find((l) => l.startsWith("GEMINI_API_KEY="));
  if (!line) throw new Error("GEMINI_API_KEY not found in environment or .env.local");
  return line.slice("GEMINI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
