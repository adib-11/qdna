import { describe, expect, it } from "vitest";
import { EMF_QUESTIONS } from "@/tests/fixtures/emf";
import { similarity } from "@/lib/analysis/lineage";
import { topicFrequency } from "@/lib/analysis/frequency";
import extracted from "@/data/semester.json";
import type { Question } from "@/lib/types";

/**
 * TASK-046 — how far the pipeline's own reading of the EMF papers sits from
 * `EMF_Analysis.pdf`, the field-tested benchmark (ASSUMPTION-004).
 *
 * Topic labels cannot be compared directly: the benchmark's taxonomy is its
 * own, and qDNA's is inferred per upload by design (REQ-003), one batch at a
 * time. So each extracted question is matched to its nearest benchmark
 * question by the same lexical similarity that drives lineage, and the
 * benchmark's topic comes along with the match. That measures what actually
 * matters — whether the pipeline read the same paper — instead of whether two
 * models chose the same words for a heading.
 *
 * The run prints its numbers; the assertions only guard the floor. The figures
 * are transcribed into PROJECT_DOC.md §6.
 */
const corpus = extracted as Question[];

/** A match this close is the same question, allowing for OCR noise. */
const MATCH_THRESHOLD = 0.5;

describe("data/semester.json against EMF_Analysis.pdf", () => {
  it("measures and reports the deviation", () => {
    const matched: { question: Question; topic: string; score: number }[] = [];
    let unmatched = 0;

    for (const question of corpus) {
      let best = { topic: "", score: 0 };
      for (const reference of EMF_QUESTIONS) {
        const score = similarity(question.text, reference.text);
        if (score > best.score) best = { topic: reference.topic, score };
      }
      if (best.score >= MATCH_THRESHOLD) {
        matched.push({ question, topic: best.topic, score: best.score });
      } else {
        unmatched += 1;
      }
    }

    // Benchmark questions the pipeline never found, in benchmark topic terms.
    const foundReference = new Set(matched.map((m) => m.topic));

    const referenceStats = topicFrequency(EMF_QUESTIONS);
    const mappedStats = topicFrequency(
      matched.map(({ question, topic }) => ({ ...question, topic })),
    );
    const ownStats = topicFrequency(corpus);

    const referenceTop6 = referenceStats.slice(0, 6).map((s) => s.topic);
    const mappedTop6 = mappedStats.slice(0, 6).map((s) => s.topic);
    const shared = mappedTop6.filter((t) => referenceTop6.includes(t));
    const inOrder = referenceTop6.filter((t, i) => mappedTop6[i] === t);

    const report = [
      "",
      "TASK-046 — data/semester.json vs EMF_Analysis.pdf",
      "─".repeat(60),
      `questions      extracted ${corpus.length}   benchmark ${EMF_QUESTIONS.length}`,
      `papers         extracted ${new Set(corpus.map((q) => q.paper.label)).size}   benchmark ${new Set(EMF_QUESTIONS.map((q) => q.paper.label)).size}`,
      `topic labels   extracted ${ownStats.length}   benchmark ${referenceStats.length}`,
      `matched        ${matched.length} of ${corpus.length} extracted questions map onto a benchmark question at ≥${MATCH_THRESHOLD}`,
      `unmatched      ${unmatched}`,
      `benchmark topics reached: ${foundReference.size} of ${referenceStats.length}`,
      "",
      `top-6 shared:   ${shared.length} of 6`,
      `top-6 in place: ${inOrder.length} of 6`,
      "",
      "benchmark top 6:",
      ...referenceStats.slice(0, 6).map((s, i) => `  ${i + 1}. ${s.topic} (${s.count})`),
      "",
      "extracted corpus mapped into benchmark topics, top 6:",
      ...mappedStats.slice(0, 6).map((s, i) => `  ${i + 1}. ${s.topic} (${s.count})`),
      "",
      "extracted corpus in its own inferred topics, top 6:",
      ...ownStats.slice(0, 6).map((s, i) => `  ${i + 1}. ${s.topic} (${s.count})`),
      "",
    ].join("\n");

    console.log(report);

    expect(corpus.length).toBeGreaterThan(0);
    expect(matched.length).toBeGreaterThan(0);
  });
});
