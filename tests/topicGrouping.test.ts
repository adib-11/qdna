import { describe, expect, it } from "vitest";
import type { GenerateContentParameters } from "@google/genai";
import { analyze } from "@/lib/analysis";
import { ungroupedLabels } from "@/lib/analysis/topics";
import { measureGrouping } from "@/lib/eval/score";
import type { ModelClient } from "@/lib/gemini/generate";
import { groupTopics } from "@/lib/gemini/groupTopics";
import type { Question } from "@/lib/types";
import {
  GROUND_TRUTH_COURSES,
  groupingCorpora,
  savedGrouping,
} from "@/tests/fixtures/topic-grouping/corpora";

/** A client that answers every request with `body` as JSON, recording what it was sent. */
function replying(body: unknown) {
  const requests: GenerateContentParameters[] = [];
  const client: ModelClient = {
    models: {
      generateContent: async (params) => {
        requests.push(params);
        return { text: JSON.stringify(body) };
      },
    },
  };
  return { client, requests };
}

const question = (id: string, topic: string, course = "Software Engineering"): Question => ({
  id,
  course,
  courseCodes: [],
  paper: { type: "Final", label: "2024 Final", section: null, year: 2024 },
  qNo: id,
  marks: 4,
  text: `Question ${id}`,
  topic,
  isNumerical: false,
});

const promptOf = (request: GenerateContentParameters) =>
  (request.contents as { parts: { text: string }[] }[])[0].parts[0].text;

describe("groupTopics", () => {
  const corpus = [
    question("1", "SDLC"),
    question("2", "SDLC Models"),
    question("3", "Data Flow Diagrams"),
    question("4", "Data Flow Diagram"),
    question("5", "Fourier Series", "Mathematics"),
  ];

  it("sends every distinct topic label once, as one course, in one request", async () => {
    const { client, requests } = replying({ topics: [] });

    await groupTopics(client, [...corpus, question("6", "SDLC")]);

    expect(requests).toHaveLength(1);
    const prompt = promptOf(requests[0]);
    expect(prompt.match(/- SDLC$/gm)).toHaveLength(1);
    // Labels from every offering fold together, so the corpus is one course block.
    expect(prompt.match(/^Course:/gm)).toHaveLength(1);
    expect(prompt).toMatch(/- Data Flow Diagram\n- Fourier Series/);
    expect(prompt).not.toMatch(/different courses/);
  });

  it("maps each label to the topic the model put it in", async () => {
    const { client } = replying({
      topics: [
        { topic: "SDLC & Process Models", labels: ["SDLC", "sdlc  models"] },
        { topic: "Structured Analysis", labels: ["Data Flow Diagrams", "Invented Label"] },
        { topic: "Fourier Analysis", labels: ["Fourier Series"] },
      ],
    });

    const grouping = await groupTopics(client, corpus);

    expect(grouping).toEqual({
      SDLC: "SDLC & Process Models",
      "SDLC Models": "SDLC & Process Models",
      "Data Flow Diagrams": "Structured Analysis",
      // Left out by the model, so it follows the label it lexically matches.
      "Data Flow Diagram": "Structured Analysis",
      "Fourier Series": "Fourier Analysis",
    });
    expect(ungroupedLabels(corpus, grouping)).toEqual([]);
  });

  it("keeps a label the model left out, and matches nothing placed, under its own name", async () => {
    const { client } = replying({ topics: [{ topic: "Process", labels: ["SDLC"] }] });

    const grouping = await groupTopics(client, [question("1", "SDLC"), question("2", "constructor")]);

    expect(grouping).toEqual({ SDLC: "Process", constructor: "constructor" });
  });

  it("feeds analysis, which then counts one topic per subject", async () => {
    const { client } = replying({
      topics: [{ topic: "SDLC & Process Models", labels: ["SDLC", "SDLC Models"] }],
    });

    const grouping = await groupTopics(client, corpus);
    const before = analyze(corpus).stats.length;

    expect(analyze(corpus, { grouping }).stats.length).toBeLessThan(before);
  });
});

describe("pending topic grouping", () => {
  it("is pending for every label until a grouping covers it, as after an import", () => {
    const corpus = [question("1", "SDLC"), question("2", "Testing")];

    expect(ungroupedLabels(corpus)).toEqual(["SDLC", "Testing"]);
    expect(ungroupedLabels(corpus, { SDLC: "Process" })).toEqual(["Testing"]);
    expect(ungroupedLabels([...corpus, question("3", "Agile")], { SDLC: "P", Testing: "T" })).toEqual(["Agile"]);
  });
});

/**
 * The offline half of the proof: the live model's saved groupings, measured
 * against the bundled corpora and the ground truth, as `scripts/group-topics.mjs`
 * reports them. The gate is the owner's: holdout coverage and pair F1 rise on
 * the two bundled corpora, and pair F1 rises on the six single-paper
 * ground-truth sets.
 */
describe("the saved topic groupings", () => {
  const measured = groupingCorpora().map((corpus) => {
    const grouping = savedGrouping(corpus);
    if (!grouping) throw new Error(`No saved grouping for ${corpus.name}`);
    return {
      name: corpus.name,
      gate: corpus.gate,
      before: measureGrouping(corpus.questions, {}, GROUND_TRUTH_COURSES),
      after: measureGrouping(corpus.questions, { grouping }, GROUND_TRUTH_COURSES),
    };
  });
  const gated = (gate: string) => measured.filter((m) => m.gate === gate);
  const GROUND_TRUTH_SETS = [
    "computer-architecture",
    "microprocessors",
    "basic-mechanical",
    "electrical-machines",
    "software-engineering",
    "communication",
  ].map((slug) => `ground truth: ${slug}`);

  it("gate exactly the corpora the owner named", () => {
    expect(gated("coverage and pair F1").map((m) => m.name)).toEqual([
      "data/swe.json",
      "data/cad.json",
    ]);
    expect(gated("pair F1").map((m) => m.name).sort()).toEqual([...GROUND_TRUTH_SETS].sort());
    expect(measured).toHaveLength(8);
  });

  it("raise holdout coverage and pair F1 on data/swe.json and data/cad.json", () => {
    for (const { name, before, after } of gated("coverage and pair F1")) {
      expect(after.holdoutCoverage, name).toBeGreaterThan(before.holdoutCoverage!);
      expect(after.pairF1, name).toBeGreaterThan(before.pairF1!);
    }
  });

  it("raise pair F1 on the six single-paper ground-truth sets, where coverage is not measurable", () => {
    for (const { name, before, after } of gated("pair F1")) {
      // One paper leaves nothing to hold out.
      expect(before.holdoutCoverage, name).toBeNull();
      expect(after.holdoutCoverage, name).toBeNull();
      expect(after.pairF1, name).toBeGreaterThan(before.pairF1!);
    }
  });

  it("fold the bundled Software Engineering corpus's 57 topics to a syllabus-sized set", () => {
    const swe = measured.find((m) => m.name === "data/swe.json")!;

    expect(swe.before.topics).toBe(57);
    expect(swe.after.topics).toBeLessThanOrEqual(15);
  });
});
