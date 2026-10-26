import { PARETO_TARGET_PCT, VARIANT_THRESHOLD } from "@/lib/config";
import { clusterLineages } from "@/lib/analysis/lineage";
import { paperOrder } from "@/lib/analysis/papers";
import { topicFrequency } from "@/lib/analysis/frequency";
import { topicsToReach } from "@/lib/analysis/pareto";
import { canonicalizeTopics } from "@/lib/analysis/topics";
import type { BacktestResult, Question } from "@/lib/types";

const key = (topic: string) => topic.trim().toLowerCase();

/**
 * The most recent paper in the corpus — the one worth holding out.
 *
 * Hiding the newest paper and rebuilding the ranking from everything before it
 * is the only honest form of this test: it is the position the student is
 * actually in the night before an exam.
 */
export function defaultHeldOutPaper(questions: Question[]): string | null {
  const papers = paperOrder(questions);
  if (papers.length < 2) return null;

  // Papers whose year OCR could not read sort last, and one of those is
  // usually a fragment — a couple of questions off a page whose header sat in
  // another batch. Holding one of those out tests nothing, so the newest
  // *dated* paper wins whenever the corpus has one.
  const dated = papers.filter((paper) => paper.year !== null);
  const chosen = dated.length > 0 ? dated[dated.length - 1] : papers[papers.length - 1];
  return chosen.label;
}

/**
 * Hold one paper out, rank topics from the rest, and check the ranking against
 * what that paper actually asked.
 *
 * The number of topics the ranking is allowed to name is not a free parameter:
 * it is `topicsToReach(training, PARETO_TARGET_PCT)`, the same figure the
 * headline stat tells the user to study. So the measurement answers the
 * product's own claim — if you had studied the topics qDNA named, how much of
 * this paper could you have answered? — rather than a claim invented to score
 * well.
 *
 * Coverage is question-weighted rather than topic-weighted. A held-out paper
 * whose one unranked topic carries a single question is not the same
 * failure as one whose unranked topic carries six, and the student cares
 * about marks on the page, not about labels.
 */
export function backtest(
  raw: Question[],
  heldOutPaperLabel: string,
  threshold: number = VARIANT_THRESHOLD,
): BacktestResult {
  // Folded over the whole corpus, held-out paper included. Folding the two
  // sides separately would let the same subject survive under two names and
  // score as a miss for no reason but wording.
  const questions = canonicalizeTopics(raw);
  const heldOut = questions.filter((q) => q.paper.label === heldOutPaperLabel);
  const training = questions.filter((q) => q.paper.label !== heldOutPaperLabel);

  const trainingStats = topicFrequency(training);
  const actualTopics = topicFrequency(heldOut);

  const topicsNamed = topicsToReach(trainingStats, PARETO_TARGET_PCT);
  const rankedTopics = trainingStats.slice(0, topicsNamed);
  const rankedKeys = new Set(rankedTopics.map((s) => key(s.topic)));

  const hits = actualTopics.filter((s) => rankedKeys.has(key(s.topic)));
  const misses = actualTopics.filter((s) => !rankedKeys.has(key(s.topic)));

  const covered = hits.reduce((sum, stat) => sum + stat.count, 0);
  const overlapPct = heldOut.length === 0 ? 0 : (covered / heldOut.length) * 100;

  // Lineage is the sharper claim: not "this topic came up again" but "this
  // question came up again". Only clusters that straddle the boundary count —
  // a cluster living entirely inside the held-out paper proves nothing about
  // what the earlier papers could have told you.
  const heldOutIds = new Set(heldOut.map((q) => q.id));
  const matchedLineages = clusterLineages(questions, threshold).filter(
    (cluster) => {
      const inHeldOut = cluster.members.filter((m) => heldOutIds.has(m.id));
      return inHeldOut.length > 0 && inHeldOut.length < cluster.members.length;
    },
  );

  return {
    heldOutPaper: heldOutPaperLabel,
    trainingPapers: [...new Set(training.map((q) => q.paper.label))],
    rankedTopics,
    actualTopics,
    hits,
    misses,
    overlapPct,
    questionsCovered: covered,
    questionsHeldOut: heldOut.length,
    matchedLineages,
  };
}
