import { describe, expect, it } from "vitest";
import {
  normalizeQuestionNumber,
  scoreExtraction,
  TEXT_MATCH_THRESHOLD,
  tokenSimilarity,
  type ExtractedQuestion,
} from "@/lib/eval/score";
import type { GroundTruthCourse, GroundTruthQuestion } from "@/lib/eval/groundTruth";

const PAPER = "2024 Final ECE 3119";

function truthQuestion(
  qNo: string,
  topic: string,
  overrides: Partial<GroundTruthQuestion> = {},
): GroundTruthQuestion {
  return {
    qNo,
    section: "A",
    marks: 4,
    text: `Explain the topic of question ${qNo} with a neat diagram`,
    topic,
    ...overrides,
  };
}

function course(questions: GroundTruthQuestion[], label = PAPER): GroundTruthCourse {
  return {
    course: "Computer Architecture and Design",
    courseCodes: ["ECE 3119"],
    topicGroupingStatus: "draft",
    topics: [...new Set(questions.map((q) => q.topic))],
    papers: [
      {
        label,
        exam: "B.Sc. Engineering 3rd Year Odd Semester Examination, 2024",
        year: 2024,
        source: { file: "x.pdf", pages: [1], capture: "scan", textLayer: false },
        questions,
      },
    ],
  };
}

/** An extraction that reproduces a ground-truth question exactly. */
function echo(q: GroundTruthQuestion, label = PAPER): ExtractedQuestion {
  return { paper: { label }, qNo: q.qNo, marks: q.marks, text: q.text, topic: q.topic };
}

describe("normalizeQuestionNumber", () => {
  it("treats a printed Q prefix, dots, spaces and brackets as the same number", () => {
    expect(normalizeQuestionNumber("Q.2(b)")).toBe(normalizeQuestionNumber("2(b)"));
    expect(normalizeQuestionNumber("Q2 (b)")).toBe("2.b");
    expect(normalizeQuestionNumber("Question 2b")).toBe("2.b");
    expect(normalizeQuestionNumber("q.1 (a)(ii)")).toBe("1.a.ii");
  });

  it("drops a printed \"No.\" or \"Qn\" prefix", () => {
    expect(normalizeQuestionNumber("Q.No.2(b)")).toBe("2.b");
    expect(normalizeQuestionNumber("Q. No. 2(b)")).toBe("2.b");
    expect(normalizeQuestionNumber("Qn 2b")).toBe("2.b");
  });

  it("keeps different sub-parts apart", () => {
    expect(normalizeQuestionNumber("2(a)")).not.toBe(normalizeQuestionNumber("2(b)"));
    expect(normalizeQuestionNumber("2(a)(i)")).not.toBe(normalizeQuestionNumber("2(a)"));
    expect(normalizeQuestionNumber("12(a)")).not.toBe(normalizeQuestionNumber("1(2a)"));
  });
});

describe("tokenSimilarity", () => {
  it("is 1 for text that differs only in case, punctuation and spacing", () => {
    expect(tokenSimilarity("Define DMA.  Discuss it!", "define dma discuss it")).toBe(1);
  });

  it("is 0 for texts with no token in common", () => {
    expect(tokenSimilarity("cache memory", "booth algorithm")).toBe(0);
  });

  it("counts repeated tokens, so a dropped repeat lowers the score", () => {
    expect(tokenSimilarity("a a b", "a b")).toBeCloseTo(0.8);
  });
});

describe("scoreExtraction", () => {
  const truth = [
    truthQuestion("1(a)", "Cache"),
    truthQuestion("1(b)", "Cache"),
    truthQuestion("2(a)", "MIPS"),
    truthQuestion("2(b)", "MIPS"),
  ];

  it("scores a perfect extraction as perfect", () => {
    const score = scoreExtraction(truth.map((q) => echo(q)), [course(truth)]);

    expect(score).toMatchObject({
      groundTruthQuestions: 4,
      extractedQuestions: 4,
      matched: 4,
      recall: 1,
      precision: 1,
      textAccuracy: 1,
      marksAccuracy: 1,
      groupingAgreement: 1,
      groupingPairPrecision: 1,
      groupingPairRecall: 1,
      groupingPairF1: 1,
    });
  });

  it("refuses ground truth with two questions that normalise to the same number", () => {
    const clash = [truthQuestion("1(a)", "Cache"), truthQuestion("Q.1 (a)", "Cache")];

    expect(() => scoreExtraction([], [course(clash)])).toThrow(/duplicate/i);
  });

  it("refuses ground truth with two papers that normalise to the same label", () => {
    const one = course(truth, "2024 Final ECE 3119");
    const two = course(truth, "2024 final ECE-3119");

    expect(() => scoreExtraction([], [one, two])).toThrow(/duplicate/i);
  });

  it("matches by paper and normalised question number, not by position", () => {
    const extracted = truth
      .map((q) => ({ ...echo(q), qNo: `Q.${q.qNo}` }))
      .reverse();

    expect(scoreExtraction(extracted, [course(truth)]).matched).toBe(4);
  });

  it("does not match a question number on a different paper", () => {
    const extracted = truth.map((q) => echo(q, "2023 Final ECE 3119"));
    const score = scoreExtraction(extracted, [course(truth)]);

    expect(score.matched).toBe(0);
    expect(score.recall).toBe(0);
    expect(score.precision).toBe(0);
  });

  it("matches paper labels regardless of case and punctuation", () => {
    const extracted = truth.map((q) => echo(q, "2024 final ECE-3119"));

    expect(scoreExtraction(extracted, [course(truth)]).matched).toBe(4);
  });

  it("reports missed questions as lost recall and invented ones as lost precision", () => {
    const extracted = [
      ...truth.slice(0, 3).map((q) => echo(q)),
      { ...echo(truth[0]), qNo: "9(z)" },
    ];
    const score = scoreExtraction(extracted, [course(truth)]);

    expect(score.recall).toBe(3 / 4);
    expect(score.precision).toBe(3 / 4);
  });

  it("matches a question number only once, so a duplicate costs precision", () => {
    const extracted = [...truth.map((q) => echo(q)), echo(truth[0])];
    const score = scoreExtraction(extracted, [course(truth)]);

    expect(score.matched).toBe(4);
    expect(score.precision).toBe(4 / 5);
  });

  describe("text", () => {
    const long = truthQuestion("1(a)", "Cache", {
      text: "one two three four five six seven eight nine ten",
    });

    it(`counts text as correct at a token similarity of ${TEXT_MATCH_THRESHOLD}`, () => {
      // Dropping one of ten tokens: 2·9 / (10 + 9) ≈ 0.947.
      const oneDropped = { ...echo(long), text: "one two three four five six seven eight nine" };
      expect(scoreExtraction([oneDropped], [course([long])]).textAccuracy).toBe(1);
    });

    it("counts text below the threshold as wrong, while still matching the question", () => {
      // Two wrong of ten tokens: 2·8 / 20 = 0.8.
      const twoWrong = { ...echo(long), text: "one two three four five six seven eight X Y" };
      const score = scoreExtraction([twoWrong], [course([long])]);

      expect(score.matched).toBe(1);
      expect(score.textAccuracy).toBe(0);
    });

    it("puts the threshold at exactly 0.9", () => {
      expect(TEXT_MATCH_THRESHOLD).toBe(0.9);
    });
  });

  describe("marks", () => {
    it("requires an exact match", () => {
      const extracted = [
        { ...echo(truth[0]), marks: 4 },
        { ...echo(truth[1]), marks: 4.5 },
        { ...echo(truth[2]), marks: null },
        { ...echo(truth[3]), marks: 40 },
      ];

      expect(scoreExtraction(extracted, [course(truth)]).marksAccuracy).toBe(1 / 4);
    });

    it("accepts fractional marks that match, such as 3½", () => {
      const half = truthQuestion("7(a)", "Cache", { marks: 3.5 });
      const score = scoreExtraction([echo(half)], [course([half])]);

      expect(score.marksAccuracy).toBe(1);
    });

    it("accepts null against null, when the paper prints no marks", () => {
      const unmarked = truthQuestion("3", "Cache", { marks: null });

      expect(scoreExtraction([echo(unmarked)], [course([unmarked])]).marksAccuracy).toBe(1);
    });

    it("scores marks only over matched questions", () => {
      const extracted = [echo(truth[0]), { ...echo(truth[1]), qNo: "9(z)", marks: 99 }];

      expect(scoreExtraction(extracted, [course(truth)]).marksAccuracy).toBe(1);
    });
  });

  describe("topics per question", () => {
    it("is distinct extracted topics divided by extracted questions", () => {
      const extracted = truth.map((q, i) => ({ ...echo(q), topic: `T${i % 3}` }));

      expect(scoreExtraction(extracted, [course(truth)]).topicsPerQuestion).toBe(3 / 4);
    });

    it("is also broken down per course, beside the pooled value", () => {
      const other = {
        ...course([truthQuestion("1(a)", "Noise"), truthQuestion("1(b)", "Noise")], "2018 Final ECE 3207"),
        course: "Communication Engineering",
      };
      const extracted = [
        ...truth.map((q, i) => ({ ...echo(q), topic: `T${i}` })),
        ...other.papers[0].questions.map((q) => ({ ...echo(q, "2018 Final ECE 3207"), topic: "Noise" })),
        { ...echo(truth[0], "Some Unknown Paper"), topic: "Stray" },
      ];
      const score = scoreExtraction(extracted, [course(truth), other]);

      expect(score.topicsPerQuestionByCourse).toEqual({
        "Computer Architecture and Design": 4 / 4,
        "Communication Engineering": 1 / 2,
      });
      expect(score.topicsPerQuestion).toBe(6 / 7);
    });
  });

  describe("grouping agreement", () => {
    // Pairs: (1a,1b) same, (2a,2b) same, and four cross pairs that differ.
    it("is 1 when the extraction groups exactly as the ground truth, whatever the names", () => {
      const renamed = truth.map((q) => ({
        ...echo(q),
        topic: q.topic === "Cache" ? "Memory" : "Assembly",
      }));

      expect(scoreExtraction(renamed, [course(truth)]).groupingAgreement).toBe(1);
    });

    it("penalises merging everything into one topic", () => {
      const merged = truth.map((q) => ({ ...echo(q), topic: "Everything" }));

      // Only the two same-topic pairs agree.
      expect(scoreExtraction(merged, [course(truth)]).groupingAgreement).toBe(2 / 6);
    });

    it("penalises splitting every question into its own topic", () => {
      const split = truth.map((q) => ({ ...echo(q), topic: q.qNo }));

      // Only the four cross pairs agree.
      expect(scoreExtraction(split, [course(truth)]).groupingAgreement).toBe(4 / 6);
    });

    it("reports pair precision, recall and F1 over same-topic pairs", () => {
      // Truth pairs: (1a,1b), (2a,2b).
      const extracted = truth.map((q) => ({
        ...echo(q),
        topic: q.qNo === "2(b)" ? "B" : "A",
      }));
      // A = {1a, 1b, 2a} gives three extracted pairs, of which only (1a,1b) is true.
      const score = scoreExtraction(extracted, [course(truth)]);

      expect(score.groupingPairPrecision).toBe(1 / 3);
      expect(score.groupingPairRecall).toBe(1 / 2);
      expect(score.groupingPairF1).toBeCloseTo(0.4);
    });

    it("gives pair F1 0.5 for merging everything here: full recall, a third precision", () => {
      const merged = truth.map((q) => ({ ...echo(q), topic: "Everything" }));
      const score = scoreExtraction(merged, [course(truth)]);

      expect(score.groupingPairPrecision).toBe(2 / 6);
      expect(score.groupingPairRecall).toBe(1);
      expect(score.groupingPairF1).toBe(0.5);
    });

    it("gives pair F1 0 for splitting everything: no same-topic pair is recovered", () => {
      const split = truth.map((q) => ({ ...echo(q), topic: q.qNo }));
      const score = scoreExtraction(split, [course(truth)]);

      expect(score.groupingPairRecall).toBe(0);
      expect(score.groupingPairF1).toBe(0);
    });

    it("counts only pairs of matched questions", () => {
      const extracted = truth.slice(0, 3).map((q) => echo(q));

      // (1a,1b) agree, (1a,2a) and (1b,2a) agree: 3 of 3.
      expect(scoreExtraction(extracted, [course(truth)]).groupingAgreement).toBe(1);
    });

    it("never pairs questions from different courses", () => {
      const other = {
        ...course([truthQuestion("1(a)", "Noise")], "2018 Final ECE 3207"),
        course: "Communication Engineering",
      };
      const extracted = [
        ...truth.map((q) => echo(q)),
        { ...echo(other.papers[0].questions[0], "2018 Final ECE 3207"), topic: "Cache" },
      ];

      expect(scoreExtraction(extracted, [course(truth), other]).groupingAgreement).toBe(1);
    });
  });

  it("reports zero rather than NaN for an empty extraction", () => {
    const score = scoreExtraction([], [course(truth)]);

    expect(score).toMatchObject({
      recall: 0,
      precision: 0,
      textAccuracy: 0,
      marksAccuracy: 0,
      topicsPerQuestion: 0,
      groupingAgreement: 0,
      groupingPairPrecision: 0,
      groupingPairRecall: 0,
      groupingPairF1: 0,
    });
  });
});
