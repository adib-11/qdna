import { describe, expect, it } from "vitest";
import { normalizeQuestionNumber, scoreExtraction } from "@/lib/eval/score";
import { GROUND_TRUTH } from "@/tests/fixtures/ground-truth";

const papers = GROUND_TRUTH.flatMap((course) =>
  course.papers.map((paper) => ({ course, paper })),
);

describe("ground truth fixtures", () => {
  it("cover six papers", () => {
    expect(papers).toHaveLength(6);
    expect(new Set(papers.map((p) => p.paper.label)).size).toBe(6);
  });

  it("include at least one phone photo or poor scan, and one PDF with a text layer", () => {
    expect(papers.some((p) => p.paper.source.capture === "phone-photo")).toBe(true);
    expect(papers.some((p) => p.paper.source.textLayer)).toBe(true);
  });

  it.each(GROUND_TRUTH.map((c) => [c.course, c] as const))(
    "%s has a canonical grouping of 8–15 distinct topics",
    (_, course) => {
      expect(new Set(course.topics).size).toBe(course.topics.length);
      expect(course.topics.length).toBeGreaterThanOrEqual(8);
      expect(course.topics.length).toBeLessThanOrEqual(15);
    },
  );

  it.each(papers.map((p) => [p.paper.label, p] as const))(
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

  it.each(papers.map((p) => [p.paper.label, p] as const))(
    "%s never records both a parent and its own marked sub-part as questions",
    (_, { paper }) => {
      const numbers = paper.questions.map((q) => q.qNo);
      for (const n of numbers) {
        expect(numbers.filter((m) => m.startsWith(`${n}(`))).toEqual([]);
      }
    },
  );

  it.each(papers.map((p) => [p.paper.label, p] as const))(
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
    const echo = papers.flatMap(({ paper }) =>
      paper.questions.map((q) => ({ ...q, paper: { label: paper.label } })),
    );
    const score = scoreExtraction(echo, GROUND_TRUTH);

    expect(score).toMatchObject({
      recall: 1,
      precision: 1,
      textAccuracy: 1,
      marksAccuracy: 1,
      groupingAgreement: 1,
    });
  });
});
