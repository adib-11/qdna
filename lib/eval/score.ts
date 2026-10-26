/**
 * Scoring one extraction against the ground truth. Pure: no I/O, no model
 * call, so the eval runner and the tests compute the same numbers.
 */
import { normalizeText, tokenize } from "@/lib/analysis/normalize";
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
  /** Distinct extracted topics over extracted questions. */
  topicsPerQuestion: number;
  /**
   * Pairwise agreement (Rand index) between the extraction's topics and the
   * ground-truth topics, over pairs of matched questions in the same course:
   * the share of pairs that both put together or both keep apart.
   */
  groupingAgreement: number;
}

/**
 * "Q.2(b)", "Q2 (b)" and "2b" all become "2.b": the printed prefix goes, and
 * the number splits into its digit and letter runs.
 */
export function normalizeQuestionNumber(qNo: string): string {
  const bare = qNo.toLowerCase().replace(/^\s*(?:question|ques|q)\s*\.?\s*/, "");
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

const key = (paperLabel: string, qNo: string) =>
  `${normalizeText(paperLabel)}::${normalizeQuestionNumber(qNo)}`;

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);

export function scoreExtraction(
  extracted: ExtractedQuestion[],
  truth: GroundTruthCourse[],
): EvalScore {
  const unmatched = new Map<string, { truth: GroundTruthQuestion; course: string }>();
  for (const course of truth) {
    for (const paper of course.papers) {
      for (const question of paper.questions) {
        unmatched.set(key(paper.label, question.qNo), { truth: question, course: course.course });
      }
    }
  }
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
  const topics = new Set(extracted.map((q) => q.topic)).size;

  return {
    groundTruthQuestions,
    extractedQuestions: extracted.length,
    matched: matches.length,
    recall: ratio(matches.length, groundTruthQuestions),
    precision: ratio(matches.length, extracted.length),
    textAccuracy: ratio(textCorrect, matches.length),
    marksAccuracy: ratio(marksCorrect, matches.length),
    topicsPerQuestion: ratio(topics, extracted.length),
    groupingAgreement: pairwiseAgreement(matches),
  };
}

function pairwiseAgreement(matches: Match[]): number {
  let pairs = 0;
  let agreeing = 0;
  for (let i = 0; i < matches.length; i++) {
    for (let j = i + 1; j < matches.length; j++) {
      const a = matches[i];
      const b = matches[j];
      if (a.course !== b.course) continue;
      pairs += 1;
      const togetherInTruth = a.truth.topic === b.truth.topic;
      const togetherInExtraction = a.extracted.topic === b.extracted.topic;
      if (togetherInTruth === togetherInExtraction) agreeing += 1;
    }
  }
  return ratio(agreeing, pairs);
}
