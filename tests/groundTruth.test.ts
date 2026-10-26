import { describe, expect, it } from "vitest";
import { normalizeText } from "@/lib/analysis/normalize";
import type { Capture } from "@/lib/eval/groundTruth";
import { normalizeQuestionNumber, scoreExtraction } from "@/lib/eval/score";
import { GROUND_TRUTH } from "@/tests/fixtures/ground-truth";

const CAPTURES: Capture[] = ["phone-photo", "scan"];

const papers = GROUND_TRUTH.flatMap((course) =>
  course.papers.map((paper) => ({ course, paper })),
);

/** `[label, entry]` rows for `it.each`, one per paper. */
const byLabel = papers.map((p) => [p.paper.label, p] as const);

/** The ground truth replayed as a perfect extraction, with its topics rewritten. */
const echo = (topic: (qNo: string, label: string, truthTopic: string) => string) =>
  papers.flatMap(({ paper }) =>
    paper.questions.map((q) => ({
      ...q,
      paper: { label: paper.label },
      topic: topic(q.qNo, paper.label, q.topic),
    })),
  );

describe("ground truth fixtures", () => {
  it("cover six papers whose labels stay distinct after normalisation", () => {
    expect(papers).toHaveLength(6);
    expect(new Set(papers.map((p) => normalizeText(p.paper.label))).size).toBe(6);
  });

  it("include at least one phone photo or poor scan, and one PDF with a text layer", () => {
    expect(papers.some((p) => p.paper.source.capture === "phone-photo")).toBe(true);
    expect(papers.some((p) => p.paper.source.textLayer)).toBe(true);
  });

  it.each(byLabel)("%s records how its source was captured", (_, { paper }) => {
    expect(CAPTURES).toContain(paper.source.capture);
    expect(typeof paper.source.textLayer).toBe("boolean");
  });

  it.each(GROUND_TRUTH.map((c) => [c.course, c] as const))(
    "%s has a canonical grouping of 8–15 distinct topics",
    (_, course) => {
      expect(new Set(course.topics).size).toBe(course.topics.length);
      expect(course.topics.length).toBeGreaterThanOrEqual(8);
      expect(course.topics.length).toBeLessThanOrEqual(15);
    },
  );

  it.each(byLabel)(
    "%s records every question's number, marks, text and a canonical topic",
    (_, { course, paper }) => {
      expect(paper.questions.length).toBeGreaterThan(0);
      for (const q of paper.questions) {
        expect(q.qNo).toMatch(/^\d+(\([a-z]+\))*$/);
        expect(q.marks === null || q.marks > 0).toBe(true);
        expect(q.text.trim().length).toBeGreaterThan(0);
        expect(course.topics).toContain(q.topic);
      }
      const numbers = paper.questions.map((q) => normalizeQuestionNumber(q.qNo));
      expect(new Set(numbers).size).toBe(numbers.length);
    },
  );

  it.each(byLabel)(
    "%s never records both a parent and its own marked sub-part as questions",
    (_, { paper }) => {
      const numbers = paper.questions.map((q) => q.qNo);
      for (const n of numbers) {
        expect(numbers.filter((m) => m.startsWith(`${n}(`))).toEqual([]);
      }
    },
  );

  it.each(byLabel)(
    "%s gives every numbered question the same total, as its rubric says",
    (_, { paper }) => {
      const totals = new Map<string, number>();
      for (const q of paper.questions) {
        const top = q.qNo.split("(")[0];
        totals.set(top, (totals.get(top) ?? 0) + (q.marks ?? 0));
      }
      expect(new Set(totals.values()).size).toBe(1);
    },
  );

  it("scores perfectly against itself", () => {
    const score = scoreExtraction(echo((_, __, topic) => topic), GROUND_TRUTH);

    expect(score).toMatchObject({
      recall: 1,
      precision: 1,
      textAccuracy: 1,
      marksAccuracy: 1,
      groupingAgreement: 1,
      groupingPairF1: 1,
    });
  });

  describe("judging a topic grouping on the real fixtures", () => {
    const singletons = scoreExtraction(echo((qNo, label) => `${label} ${qNo}`), GROUND_TRUTH);
    const merged = scoreExtraction(echo((_, label) => label), GROUND_TRUTH);

    it("pair F1 scores both one-topic-per-question and one-topic-per-paper low", () => {
      expect(singletons.groupingPairF1).toBe(0);
      expect(merged.groupingPairF1).toBeLessThan(0.3);
    });

    it("the Rand index alone would let one-topic-per-question pass", () => {
      expect(singletons.groupingAgreement).toBeGreaterThan(0.85);
    });
  });
});
