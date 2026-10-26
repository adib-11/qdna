import { MIN_PAPERS_FOR_CONFIDENCE, VARIANT_THRESHOLD } from "@/lib/config";
import { expectedMarks } from "@/lib/analysis/expectedMarks";
import { clusterLineages } from "@/lib/analysis/lineage";
import { paretoCoverage } from "@/lib/analysis/pareto";
import { studyPlan } from "@/lib/analysis/studyPlan";
import { resolveTopics, type TopicInputs } from "@/lib/analysis/topics";
import { topicFrequency } from "@/lib/analysis/frequency";
import type { AnalysisResult, Question } from "@/lib/types";

export { normalizeText, tokenize } from "@/lib/analysis/normalize";
export { topicFrequency } from "@/lib/analysis/frequency";
export { paretoCoverage, topicsToReach } from "@/lib/analysis/pareto";
export { similarity, clusterLineages } from "@/lib/analysis/lineage";
export { expectedMarks } from "@/lib/analysis/expectedMarks";
export { canonicalizeTopics, resolveTopics } from "@/lib/analysis/topics";

/**
 * The whole analysis, composed. Pure and synchronous: no API call happens at
 * analysis time, so re-analysing a corpus costs nothing and always produces
 * the same numbers (REQ-008). The topic grouping and the student's topic
 * overrides come in as data, so the model call that produced the grouping
 * happened once, earlier.
 */
export function analyze(
  raw: Question[],
  topics: TopicInputs = {},
  threshold: number = VARIANT_THRESHOLD,
): AnalysisResult {
  // Topics are resolved before anything counts them, so every figure
  // downstream — the map, the curve, the dossier, the practice paper, the
  // backtest — reads one topic where the corpus means one topic.
  const questions = resolveTopics(raw, topics);
  const stats = topicFrequency(questions);
  const paperCount = new Set(questions.map((q) => q.paper.label)).size;
  const marks = expectedMarks(stats, paperCount);

  return {
    questions,
    stats,
    pareto: paretoCoverage(stats),
    lineages: clusterLineages(questions, threshold),
    expectedMarks: marks,
    paperCount,
    questionCount: questions.length,
    lowConfidence: paperCount < MIN_PAPERS_FOR_CONFIDENCE,
    studyPlan: studyPlan(stats, marks),
  };
}
