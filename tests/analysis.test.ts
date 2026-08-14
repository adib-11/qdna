import { describe, expect, it } from "vitest";
import {
  EMF_QUESTIONS,
  GAUSS_80_MICRO,
  POLARIZATION_PAIR,
} from "@/tests/fixtures/emf";
import { analyze } from "@/lib/analysis";
import { expectedMarks } from "@/lib/analysis/expectedMarks";
import { clusterLineages, similarity } from "@/lib/analysis/lineage";
import { normalizeText, tokenize } from "@/lib/analysis/normalize";
import { inferPaperShape, UNSECTIONED } from "@/lib/analysis/paperShape";
import { paretoCoverage, topicsToReach } from "@/lib/analysis/pareto";
import { topicFrequency } from "@/lib/analysis/frequency";
import type { Question } from "@/lib/types";

const question = (over: Partial<Question> & { id: string }): Question => ({
  course: "Test Course",
  courseCodes: ["TST 1010"],
  paper: { type: "CT", label: "CT1", section: null, year: null },
  qNo: "1",
  marks: null,
  text: "placeholder",
  topic: "Topic",
  isNumerical: false,
  ...over,
});

describe("normalizeText", () => {
  it("is idempotent", () => {
    for (const q of EMF_QUESTIONS) {
      const once = normalizeText(q.text);
      expect(normalizeText(once)).toBe(once);
    }
  });

  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalizeText("  What IS  Gauss's law, really? ")).toBe(
      "what is gauss s law really",
    );
  });

  it("preserves digits and Greek letters", () => {
    expect(normalizeText("80 μC/m³ at ρv = 0")).toContain("80");
    expect(normalizeText("80 μC/m³ at ρv = 0")).toContain("μc");
    expect(normalizeText("ε0 and λ/8")).toBe("ε0 and λ 8");
  });

  it("folds the micro sign onto mu, which OCR emits interchangeably", () => {
    expect(normalizeText("µC")).toBe(normalizeText("μC"));
  });

  it("tokenizes to non-empty tokens, and to nothing for empty input", () => {
    expect(tokenize("Prove that ∇ × H = J.")).toEqual(["prove", "that", "h", "j"]);
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("topicFrequency", () => {
  // TEST-001
  it("returns 17 topics totalling 94 questions with a top count of 13 for the EMF corpus", () => {
    const stats = topicFrequency(EMF_QUESTIONS);

    expect(stats).toHaveLength(17);
    expect(stats.reduce((sum, s) => sum + s.count, 0)).toBe(94);
    expect(stats[0].count).toBe(13);
    expect(stats[0].topic).toBe(
      "Gauss's Law, Divergence & Electric Flux Density (D)",
    );
  });

  it("sorts strictly by descending count", () => {
    const counts = topicFrequency(EMF_QUESTIONS).map((s) => s.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it("lists each topic's distinct source papers", () => {
    const gauss = topicFrequency(EMF_QUESTIONS)[0];
    expect(gauss.papers).toEqual([...new Set(gauss.papers)]);
    expect(gauss.papers).toContain("2024 EEE 2107");
  });

  it("groups topic labels that differ only in case or padding", () => {
    const stats = topicFrequency([
      question({ id: "a", topic: "Gauss's Law" }),
      question({ id: "b", topic: "  gauss's law " }),
    ]);

    expect(stats).toHaveLength(1);
    expect(stats[0].count).toBe(2);
    expect(stats[0].topic).toBe("Gauss's Law");
  });

  it("returns nothing for an empty corpus", () => {
    expect(topicFrequency([])).toEqual([]);
  });
});

describe("paretoCoverage", () => {
  // TEST-002
  it("reaches 59.6% at rank 5 and 68.1% at rank 6 for the EMF corpus", () => {
    const curve = paretoCoverage(topicFrequency(EMF_QUESTIONS));

    expect(curve[4].cumulativePct).toBeCloseTo(59.6, 1);
    expect(curve[5].cumulativePct).toBeCloseTo(68.1, 1);
  });

  it("ends at exactly 100%", () => {
    const curve = paretoCoverage(topicFrequency(EMF_QUESTIONS));
    expect(curve[curve.length - 1].cumulativePct).toBeCloseTo(100, 10);
  });

  it("counts the topics needed to reach a coverage target", () => {
    const stats = topicFrequency(EMF_QUESTIONS);

    expect(topicsToReach(stats, 59.5)).toBe(5);
    expect(topicsToReach(stats, 70)).toBe(7);
    expect(topicsToReach(stats, 100)).toBe(stats.length);
  });

  it("handles an empty corpus without dividing by zero", () => {
    expect(paretoCoverage([])).toEqual([]);
    expect(topicsToReach([], 70)).toBe(0);
  });
});

describe("similarity", () => {
  it("scores identical text at 1 and unrelated text near 0", () => {
    const text = EMF_QUESTIONS[0].text;
    expect(similarity(text, text)).toBeCloseTo(1, 10);
    expect(similarity("Define magnetic vector potential.", "Prove that 1 + Γ = τ.")).toBeLessThan(
      0.2,
    );
  });

  it("is symmetric", () => {
    const [a, b] = [EMF_QUESTIONS[0].text, EMF_QUESTIONS[3].text];
    expect(similarity(a, b)).toBeCloseTo(similarity(b, a), 10);
  });

  it("scores empty text at 0 rather than dividing by zero", () => {
    expect(similarity("", "anything at all")).toBe(0);
    expect(similarity("", "")).toBe(0);
  });
});

describe("clusterLineages", () => {
  // TEST-003
  it("groups the three recycled 80 μC/m³ Gauss's-law variants into one cluster", () => {
    expect(GAUSS_80_MICRO).toHaveLength(3);

    const clusters = clusterLineages(EMF_QUESTIONS);
    const found = clusters.filter((c) =>
      c.members.some((m) => GAUSS_80_MICRO.includes(m)),
    );

    expect(found).toHaveLength(1);
    expect(found[0].members).toEqual(expect.arrayContaining(GAUSS_80_MICRO));
    expect(found[0].members.map((m) => m.paper.label)).toEqual([
      "2nd CT",
      "CT2 ECE 3121",
      "2024 EEE 2107",
    ]);
  });

  // TEST-003
  it("groups the 3×/4×-polarization pair into one cluster", () => {
    expect(POLARIZATION_PAIR).toHaveLength(2);

    const clusters = clusterLineages(EMF_QUESTIONS);
    const found = clusters.filter((c) =>
      c.members.some((m) => POLARIZATION_PAIR.includes(m)),
    );

    expect(found).toHaveLength(1);
    expect(found[0].members).toEqual(expect.arrayContaining(POLARIZATION_PAIR));
  });

  it("flags a cluster spanning ECE 3121 and EEE 2107 as cross-department", () => {
    const clusters = clusterLineages(EMF_QUESTIONS);
    const gauss = clusters.find((c) =>
      c.members.some((m) => GAUSS_80_MICRO.includes(m)),
    );

    expect(gauss?.crossDepartment).toBe(true);
    expect(gauss?.courseCodes.sort()).toEqual(["ECE 3121", "EEE 2107"]);
  });

  it("does not report a question as its own lineage", () => {
    for (const cluster of clusterLineages(EMF_QUESTIONS)) {
      expect(cluster.members.length).toBeGreaterThan(1);
    }
  });

  it("assigns every question to at most one cluster", () => {
    const seen = clusterLineages(EMF_QUESTIONS).flatMap((c) =>
      c.members.map((m) => m.id),
    );
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("reports each member's similarity to the cluster's first member", () => {
    const cluster = clusterLineages(EMF_QUESTIONS)[0];

    expect(cluster.pairwiseSimilarity).toHaveLength(cluster.members.length);
    expect(cluster.pairwiseSimilarity[0]).toBe(1);
    expect(cluster.cohesion).toBeGreaterThan(0.5);
  });

  it("chains variants transitively under single linkage", () => {
    const chain = [
      question({ id: "a", text: "Find the total charge inside the spherical surface r = 10 mm" }),
      question({
        id: "b",
        text: "Find the total charge inside the spherical surface at r = 10 mm given ρv = 0",
      }),
      question({
        id: "c",
        text: "Given ρv = 0 find the total charge inside the surface at r = 10 mm for the sphere",
      }),
    ];

    const clusters = clusterLineages(chain);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(3);
  });

  it("returns nothing when no pair clears the threshold", () => {
    expect(
      clusterLineages([
        question({ id: "a", text: "Define magnetic vector potential." }),
        question({ id: "b", text: "State Poynting's theorem for an EM field." }),
      ]),
    ).toEqual([]);
  });
});

describe("expectedMarks", () => {
  it("returns null, not 0, for topics with no recorded marks", () => {
    const stats = topicFrequency(EMF_QUESTIONS);
    const marks = expectedMarks(stats, 11);

    for (const stat of stats) expect(marks[stat.topic]).toBeNull();
  });

  it("excludes unmarked questions from the mean rather than counting them as zero", () => {
    const stats = topicFrequency([
      question({ id: "a", topic: "Gauss", marks: 10 }),
      question({ id: "b", topic: "Gauss", marks: null }),
      question({
        id: "c",
        topic: "Gauss",
        marks: 5,
        paper: { type: "CT", label: "CT2", section: null, year: null },
      }),
    ]);

    // 15 marks over 2 papers — the unmarked question contributes nothing.
    expect(expectedMarks(stats, 2).Gauss).toBe(7.5);
  });

  it("returns null rather than dividing by zero papers", () => {
    const stats = topicFrequency([question({ id: "a", topic: "Gauss", marks: 10 })]);
    expect(expectedMarks(stats, 0).Gauss).toBeNull();
  });
});

describe("analyze", () => {
  // TEST-004
  it("sets lowConfidence for a corpus drawn from fewer than 3 papers", () => {
    const onePaper = EMF_QUESTIONS.filter((q) => q.paper.label === "2024 EEE 2107");

    expect(analyze(onePaper).lowConfidence).toBe(true);
    expect(analyze(onePaper).paperCount).toBe(1);
  });

  it("clears lowConfidence at 3 papers", () => {
    const threePapers = EMF_QUESTIONS.filter((q) =>
      ["2024 EEE 2107", "2024 ECE 3121", "CT2 ECE 3121"].includes(q.paper.label),
    );

    expect(analyze(threePapers).paperCount).toBe(3);
    expect(analyze(threePapers).lowConfidence).toBe(false);
  });

  it("composes the full EMF result", () => {
    const result = analyze(EMF_QUESTIONS);

    expect(result.questionCount).toBe(94);
    expect(result.paperCount).toBe(11);
    expect(result.stats).toHaveLength(17);
    expect(result.pareto).toHaveLength(17);
    expect(result.lineages.length).toBeGreaterThan(0);
    expect(result.lowConfidence).toBe(false);
  });

  it("is deterministic — no API call, same input, same output", () => {
    expect(JSON.stringify(analyze(EMF_QUESTIONS))).toBe(
      JSON.stringify(analyze(EMF_QUESTIONS)),
    );
  });

  it("survives an empty corpus", () => {
    const result = analyze([]);

    expect(result.questionCount).toBe(0);
    expect(result.stats).toEqual([]);
    expect(result.pareto).toEqual([]);
    expect(result.lineages).toEqual([]);
    expect(result.lowConfidence).toBe(true);
  });
});

describe("inferPaperShape", () => {
  const sectioned = (
    label: string,
    section: string,
    count: number,
    marks: number | null,
  ): Question[] =>
    Array.from({ length: count }, (_, i) =>
      question({
        id: `${label}-${section}-${i}`,
        paper: { type: "Final", label, section, year: 2024 },
        marks,
      }),
    );

  it("returns null for an empty corpus", () => {
    expect(inferPaperShape([])).toBeNull();
  });

  it("takes the median question count per section, not the sum", () => {
    const shape = inferPaperShape([
      ...sectioned("2023 Final", "A", 4, 10),
      ...sectioned("2023 Final", "B", 3, 5),
      ...sectioned("2024 Final", "A", 4, 10),
      ...sectioned("2024 Final", "B", 3, 5),
    ]);

    expect(shape?.sections.map((s) => s.name)).toEqual(["A", "B"]);
    expect(shape?.sections[0].questionsPerPaper).toBe(4);
    expect(shape?.sections[1].questionsPerPaper).toBe(3);
    expect(shape?.questionsPerPaper).toBe(7);
    expect(shape?.marksPerPaper).toBe(55);
  });

  it("does not dilute a section that only some papers carry", () => {
    const shape = inferPaperShape([
      ...sectioned("CT1", "A", 2, null),
      ...sectioned("2024 Final", "A", 2, null),
      ...sectioned("2024 Final", "B", 6, null),
    ]);

    // B appears in one paper of two; averaging over both would halve it.
    expect(shape?.sections.find((s) => s.name === "B")?.questionsPerPaper).toBe(
      6,
    );
    expect(shape?.marksPerPaper).toBeNull();
  });

  it("reports the mark denominations the examiner actually uses", () => {
    const shape = inferPaperShape([
      ...sectioned("2024 Final", "A", 3, 10),
      ...sectioned("2024 Final", "A", 1, 7),
    ]);

    expect(shape?.sections[0].markValues).toEqual([10, 7]);
  });

  it("sorts unsectioned questions last", () => {
    const shape = inferPaperShape([
      ...sectioned("2024 Final", "B", 1, null),
      ...EMF_QUESTIONS.slice(0, 1).map((q) => ({
        ...q,
        paper: { ...q.paper, label: "2024 Final", section: null },
      })),
    ]);

    expect(shape?.sections.at(-1)?.name).toBe(UNSECTIONED);
  });

  it("measures the real EMF corpus", () => {
    const shape = inferPaperShape(EMF_QUESTIONS);

    expect(shape?.paperCount).toBe(11);
    expect(shape?.course).toBe("Electromagnetic Fields and Waves");
    expect(shape?.type).toBe("CT");
    expect(shape?.questionsPerPaper).toBeGreaterThan(0);
    expect(shape?.sections.length).toBeGreaterThan(0);
  });
});
