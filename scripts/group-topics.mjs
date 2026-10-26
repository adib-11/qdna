#!/usr/bin/env node
/**
 * The topic grouping proof, run live on every corpus it is proved on:
 *
 *   GEMINI_API_KEY=… node --import ./scripts/ts-paths.mjs scripts/group-topics.mjs [only]
 *
 * With `only`, it requests groupings only for corpora whose name contains it.
 * One model request per corpus, through the same `groupTopics` the app calls.
 * Each grouping is saved under tests/fixtures/topic-grouping/groupings/ and a
 * saved one is never requested again, so a run that dies on quota resumes.
 * Then it prints holdout coverage and agreement with the ground-truth
 * grouping, before and after, as a Markdown table.
 */
import { GoogleGenAI } from "@google/genai";
import { MIN_REQUEST_INTERVAL_MS, RETRY_BASE_DELAY_MS } from "@/lib/config";
import { extractStatus } from "@/lib/gemini/generate";
import { groupTopics } from "@/lib/gemini/groupTopics";
import { measureGrouping } from "@/lib/eval/score";
import {
  GATE_LABEL,
  GROUND_TRUTH_COURSES,
  groupingCorpora,
  savedGrouping,
  saveResponse,
} from "@/tests/fixtures/topic-grouping/corpora";

const MAX_TRIES = 4;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const corpora = groupingCorpora();
let client = null;
let requests = 0;
let response = "";

const only = process.argv[2] ?? "";

for (const corpus of corpora) {
  if (savedGrouping(corpus) || !corpus.name.includes(only)) continue;
  client ??= recording(new GoogleGenAI({ apiKey: requireKey() }));
  await withBackoff(() => groupTopics(client, corpus.questions));
  saveResponse(corpus, response);
  console.error(`grouped ${corpus.name} (${requests} model requests so far)`);
  await sleep(MIN_REQUEST_INTERVAL_MS);
}

if (corpora.some((corpus) => !savedGrouping(corpus))) process.exit(0);

const pct = (n) => (n === null ? "n/a" : `${n.toFixed(1)}%`);
const num = (n) => (n === null ? "n/a" : n.toFixed(3));

console.log(
  "| Corpus | Questions | Topics before → after | Holdout coverage before → after | Pair F1 before → after | Rand index before → after | Gate |",
);
console.log("|---|---|---|---|---|---|---|");
for (const corpus of corpora) {
  const before = measureGrouping(corpus.questions, {}, GROUND_TRUTH_COURSES);
  const after = measureGrouping(
    corpus.questions,
    { grouping: savedGrouping(corpus) },
    GROUND_TRUTH_COURSES,
  );
  console.log(
    `| ${corpus.name} | ${corpus.questions.length} | ${before.topics} → ${after.topics} | ${pct(before.holdoutCoverage)} → ${pct(after.holdoutCoverage)} | ${num(before.pairF1)} → ${num(after.pairF1)} | ${num(before.randIndex)} → ${num(after.randIndex)} | ${GATE_LABEL[corpus.gate]} |`,
  );
}

/** The client, counting every request and keeping the last raw response. */
function recording(ai) {
  return {
    models: {
      async generateContent(params) {
        requests += 1;
        const started = Date.now();
        const took = () => `${Math.round((Date.now() - started) / 1000)}s`;
        try {
          const result = await ai.models.generateContent(params);
          response = result.text ?? "";
          console.error(`  ${params.model}: answered in ${took()}`);
          return result;
        } catch (error) {
          console.error(`  ${params.model}: ${extractStatus(error) ?? "failed"} after ${took()}`);
          throw error;
        }
      },
    },
  };
}

/** Retry only when every model in the chain is out of quota, waiting longer each time. */
async function withBackoff(run) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (extractStatus(error) !== 429 || attempt === MAX_TRIES) throw error;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt * 5);
    }
  }
}

function requireKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("Set GEMINI_API_KEY to run the grouping requests that are not saved yet.");
    process.exit(2);
  }
  return key;
}
