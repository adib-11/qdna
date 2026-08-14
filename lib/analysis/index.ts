import { MIN_PAPERS_FOR_CONFIDENCE, VARIANT_THRESHOLD } from "@/lib/config";
import { expectedMarks } from "@/lib/analysis/expectedMarks";
import { clusterLineages } from "@/lib/analysis/lineage";
import { paretoCoverage } from "@/lib/analysis/pareto";
import { topicFrequency } from "@/lib/analysis/frequency";
import type { AnalysisResult, Question } from "@/lib/types";

export { normalizeText, tokenize } from "@/lib/analysis/normalize";
export { topicFrequency } from "@/lib/analysis/frequency";
export { paretoCoverage, topicsToReach } from "@/lib/analysis/pareto";
export { similarity, clusterLineages } from "@/lib/analysis/lineage";
export { expectedMarks } from "@/lib/analysis/expectedMarks";

/**
 * The whole analysis, composed. Pure and synchronous: no API call happens at
 * analysis time, so re-analysing a corpus costs nothing and always produces
 * the same numbers (REQ-008).
 */
export function analyze(
  questions: Question[],
  threshold: number = VARIANT_THRESHOLD,
): AnalysisResult {
  const stats = topicFrequency(questions);
  const paperCount = new Set(questions.map((q) => q.paper.label)).size;

  return {
    questions,
    stats,
    pareto: paretoCoverage(stats),
    lineages: clusterLineages(questions, threshold),
    expectedMarks: expectedMarks(stats, paperCount),
    paperCount,
    questionCount: questions.length,
    lowConfidence: paperCount < MIN_PAPERS_FOR_CONFIDENCE,
  };
}
