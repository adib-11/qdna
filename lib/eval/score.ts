/**
 * Scoring one extraction against the ground truth. Pure: no I/O, no model
 * call, so the eval runner and the tests compute the same numbers.
 */
import { analyze } from "@/lib/analysis";
import { backtest, defaultHeldOutPaper } from "@/lib/analysis/backtest";
import { normalizeText, tokenize } from "@/lib/analysis/normalize";
import type { TopicInputs } from "@/lib/analysis/topics";
import type { GroundTruthCourse, GroundTruthQuestion } from "@/lib/eval/groundTruth";
import type { PaperRef, Question } from "@/lib/types";

/** A question's text counts as correct at this token similarity or above. */
export const TEXT_MATCH_THRESHOLD = 0.9;

/** The parts of an extracted question that scoring reads. Any `Question` fits. */
export type ExtractedQuestion = Pick<Question, "qNo" | "marks" | "text" | "topic"> & {
  paper: Pick<PaperRef, "label">;
};

export interface EvalScore {
  groundTruthQuestions: number;
  extractedQuestions: number;
  /** Ground-truth questions found, by paper and normalised question number. */
  matched: number;
  /** Matched over ground-truth questions. */
  recall: number;
  /** Matched over extracted questions. */
  precision: number;
  /** Share of matched questions whose text reaches TEXT_MATCH_THRESHOLD. */
  textAccuracy: number;
  /** Share of matched questions whose marks match exactly. */
  marksAccuracy: number;
  /** Distinct extracted topics over extracted questions, pooled across courses. */
  topicsPerQuestion: number;
  /**
   * Topics per question for each ground-truth course, over the extracted
   * questions on that course's papers. Questions on unknown papers are left out.
   */
  topicsPerQuestionByCourse: Record<string, number>;
  /**
   * Pairwise agreement (Rand index) between the extraction's topics and the
   * ground-truth topics, over pairs of matched questions in the same course:
   * the share of pairs that both put together or both keep apart. Most pairs
   * are apart in any fine grouping, so this barely penalises fragmentation;
   * judge groupings by `groupingPairF1`.
   */
  groupingAgreement: number;
  /** Of the pairs the extraction puts in one topic, the share the ground truth does too. */
  groupingPairPrecision: number;
  /** Of the pairs the ground truth puts in one topic, the share the extraction does too. */
  groupingPairRecall: number;
  /**
   * Harmonic mean of pair precision and recall. Low both for merging
   * everything (precision falls) and for splitting everything (recall falls).
   */
  groupingPairF1: number;
}

/**
 * "Q.2(b)", "Q. No. 2(b)", "Qn 2b" and "2b" all become "2.b": the printed
 * prefix goes, and the number splits into its digit and letter runs.
 */
export function normalizeQuestionNumber(qNo: string): string {
  const bare = qNo
    .toLowerCase()
    .replace(/^\s*(?:question|ques|qn|q)\s*\.?\s*(?:no\.?\s*)?/, "");
  return (bare.match(/\d+|[a-z]+/g) ?? []).join(".");
}

/**
 * Dice overlap of the two texts' token multisets, 0–1. Case, punctuation and
 * spacing never count; a dropped or changed word does.
 */
export function tokenSimilarity(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.length === 0 && right.length === 0) return 1;

  const counts = new Map<string, number>();
  for (const token of left) counts.set(token, (counts.get(token) ?? 0) + 1);

  let shared = 0;
  for (const token of right) {
    const remaining = counts.get(token) ?? 0;
    if (remaining > 0) {
      shared += 1;
      counts.set(token, remaining - 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
}

interface Match {
  truth: GroundTruthQuestion;
  extracted: ExtractedQuestion;
  course: string;
}

const paperKey = (label: string) => normalizeText(label);

const key = (paperLabel: string, qNo: string) =>
  `${paperKey(paperLabel)}::${normalizeQuestionNumber(qNo)}`;

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);

const distinctTopicsPerQuestion = (questions: ExtractedQuestion[]) =>
  ratio(new Set(questions.map((q) => q.topic)).size, questions.length);

/**
 * Index the ground truth by normalised key. Two papers or two questions that
 * normalise to the same key could never both be matched, so that is an error
 * in the ground truth, not something to score around.
 */
function indexTruth(truth: GroundTruthCourse[]) {
  const questions = new Map<string, { truth: GroundTruthQuestion; course: string }>();
  const paperCourse = new Map<string, string>();

  for (const course of truth) {
    for (const paper of course.papers) {
      const pk = paperKey(paper.label);
      if (paperCourse.has(pk)) {
        throw new Error(`Duplicate ground-truth paper label after normalisation: "${paper.label}"`);
      }
      paperCourse.set(pk, course.course);

      for (const question of paper.questions) {
        const k = key(paper.label, question.qNo);
        if (questions.has(k)) {
          throw new Error(
            `Duplicate ground-truth question after normalisation: "${paper.label}" ${question.qNo}`,
          );
        }
        questions.set(k, { truth: question, course: course.course });
      }
    }
  }
  return { questions, paperCourse };
}

export function scoreExtraction(
  extracted: ExtractedQuestion[],
  truth: GroundTruthCourse[],
): EvalScore {
  const { questions: unmatched, paperCourse } = indexTruth(truth);
  const groundTruthQuestions = unmatched.size;

  // Each ground-truth question is claimed once; a repeat counts as invented.
  const matches: Match[] = [];
  for (const question of extracted) {
    const k = key(question.paper.label, question.qNo);
    const hit = unmatched.get(k);
    if (!hit) continue;
    unmatched.delete(k);
    matches.push({ ...hit, extracted: question });
  }

  const textCorrect = matches.filter(
    (m) => tokenSimilarity(m.extracted.text, m.truth.text) >= TEXT_MATCH_THRESHOLD,
  ).length;
  const marksCorrect = matches.filter((m) => m.extracted.marks === m.truth.marks).length;

  return {
    groundTruthQuestions,
    extractedQuestions: extracted.length,
    matched: matches.length,
    recall: ratio(matches.length, groundTruthQuestions),
    precision: ratio(matches.length, extracted.length),
    textAccuracy: ratio(textCorrect, matches.length),
    marksAccuracy: ratio(marksCorrect, matches.length),
    topicsPerQuestion: distinctTopicsPerQuestion(extracted),
    topicsPerQuestionByCourse: topicsPerQuestionByCourse(extracted, truth, paperCourse),
    ...groupingScores(matches),
  };
}

function topicsPerQuestionByCourse(
  extracted: ExtractedQuestion[],
  truth: GroundTruthCourse[],
  paperCourse: Map<string, string>,
): Record<string, number> {
  const byCourse: Record<string, number> = {};
  for (const course of truth) {
    const own = extracted.filter(
      (q) => paperCourse.get(paperKey(q.paper.label)) === course.course,
    );
    byCourse[course.course] = distinctTopicsPerQuestion(own);
  }
  return byCourse;
}

function groupingScores(matches: Match[]) {
  let pairs = 0;
  let agreeing = 0;
  let togetherInTruth = 0;
  let togetherInExtraction = 0;
  let togetherInBoth = 0;

  for (let i = 0; i < matches.length; i++) {
    for (let j = i + 1; j < matches.length; j++) {
      const a = matches[i];
      const b = matches[j];
      if (a.course !== b.course) continue;
      pairs += 1;
      const truthSame = a.truth.topic === b.truth.topic;
      const extractionSame = a.extracted.topic === b.extracted.topic;
      if (truthSame === extractionSame) agreeing += 1;
      if (truthSame) togetherInTruth += 1;
      if (extractionSame) togetherInExtraction += 1;
      if (truthSame && extractionSame) togetherInBoth += 1;
    }
  }

  const precision = ratio(togetherInBoth, togetherInExtraction);
  const recall = ratio(togetherInBoth, togetherInTruth);
  return {
    groupingAgreement: ratio(agreeing, pairs),
    groupingPairPrecision: precision,
    groupingPairRecall: recall,
    groupingPairF1: ratio(2 * precision * recall, precision + recall),
  };
}

/** What topic grouping changes about one corpus. Null where the corpus cannot say. */
export interface GroupingMeasure {
  topics: number;
  /** Holdout coverage of the newest dated paper, 0–100; null below two papers. */
  holdoutCoverage: number | null;
  /** Pair F1 against the ground-truth grouping; null without two matched questions. */
  pairF1: number | null;
  /** Rand index against the ground-truth grouping, shown beside pair F1. */
  randIndex: number | null;
}

/** Measure a corpus's topics before or after grouping, the same way for both. */
export function measureGrouping(
  raw: Question[],
  topics: TopicInputs,
  truth: GroundTruthCourse[],
): GroupingMeasure {
  const { questions, stats } = analyze(raw, topics);
  const heldOut = defaultHeldOutPaper(questions);
  const score = scoreExtraction(questions, truth);
  const scored = score.matched >= 2;
  return {
    topics: stats.length,
    holdoutCoverage: heldOut ? backtest(questions, heldOut).overlapPct : null,
    pairF1: scored ? score.groupingPairF1 : null,
    randIndex: scored ? score.groupingAgreement : null,
  };
}
