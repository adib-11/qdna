import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis";
import type { Question } from "@/lib/types";
import { EMF_QUESTIONS } from "@/tests/fixtures/emf";

let next = 0;
const question = (
  topic: string,
  paper: string,
  marks: number | null = null,
): Question => ({
  id: `q${next++}`,
  course: "Test Course",
  courseCodes: ["TST 1010"],
  paper: { type: "Final", label: paper, section: null, year: null },
  qNo: "1",
  marks,
  text: `A question on ${topic}`,
  topic,
  isNumerical: false,
});

/**
 * Ten questions over two papers: A 4, B 3, C 2, D 1. The 70% target is first
 * reached at B (70%), so the plan is A then B.
 */
const CORPUS: Question[] = [
  question("A", "P1", 10),
  question("A", "P1", 5),
  question("A", "P2", 10),
  question("A", "P2", null),
  question("B", "P1", 4),
  question("B", "P2", 4),
  question("B", "P2", 4),
  question("C", "P1"),
  question("C", "P2"),
  question("D", "P2", 2),
];

describe("study plan", () => {
  it("is the shortest run of ranked topics that reaches the 70% coverage target", () => {
    const plan = analyze(CORPUS).studyPlan;

    expect(plan.topics.map((t) => t.topic)).toEqual(["A", "B"]);
    expect(plan.coveragePct).toBeCloseTo(70, 10);
  });

  it("gives each topic the marks it typically carries per paper, and the plan's total", () => {
    const plan = analyze(CORPUS).studyPlan;

    // A: 10 + 5 + 10 over 2 papers; the unmarked question adds nothing.
    expect(plan.topics[0]).toMatchObject({ count: 4, paperCount: 2, marksPerPaper: 12.5 });
    expect(plan.topics[1]).toMatchObject({ count: 3, paperCount: 2, marksPerPaper: 6 });
    expect(plan.marksPerPaper).toBe(18.5);
  });

  it("reports marks as not recorded rather than zero", () => {
    const plan = analyze([question("A", "P1"), question("B", "P2")]).studyPlan;

    expect(plan.topics.map((t) => t.marksPerPaper)).toEqual([null, null]);
    expect(plan.marksPerPaper).toBeNull();
  });

  it("gives no total when any planned topic's marks were not recorded", () => {
    const plan = analyze([question("A", "P1", 10), question("B", "P2")]).studyPlan;

    expect(plan.topics.map((t) => t.marksPerPaper)).toEqual([5, null]);
    expect(plan.marksPerPaper).toBeNull();
  });

  it("is empty for an empty corpus", () => {
    expect(analyze([]).studyPlan).toMatchObject({
      topics: [],
      coveragePct: 0,
      marksPerPaper: null,
    });
  });

  it("names the seven EMF topics that reach the target, most-asked first", () => {
    const plan = analyze(EMF_QUESTIONS).studyPlan;

    expect(plan.topics).toHaveLength(7);
    expect(plan.topics[0].topic).toBe(
      "Gauss's Law, Divergence & Electric Flux Density (D)",
    );
    expect(plan.coveragePct).toBeGreaterThanOrEqual(70);
  });
});
