import type { AnalysisResult } from "@/lib/types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "A", "A and B", "A, B and C". */
const listOf = (items: string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

function ordinal(n: number): string {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

/**
 * What adding papers changed, in one line: the papers added, the questions
 * they brought, how many topics are new, and the topic whose rank moved most.
 * Papers skipped as already present are named after it.
 */
export function describeAdded(
  before: AnalysisResult,
  after: AnalysisResult,
  added: string[],
  skipped: string[],
): string {
  const parts: string[] = [];
  if (added.length > 0) {
    const rankBefore = new Map(before.stats.map((stat, i) => [stat.topic, i + 1]));
    const newTopics = after.stats.filter((stat) => !rankBefore.has(stat.topic)).length;
    const changes = [
      plural(after.questionCount - before.questionCount, "question"),
      newTopics === 0 ? "no new topics" : plural(newTopics, "new topic"),
    ];

    let move: { topic: string; from: number; to: number } | null = null;
    for (const [i, { topic }] of after.stats.entries()) {
      const from = rankBefore.get(topic);
      if (from === undefined || from === i + 1) continue;
      if (!move || Math.abs(from - (i + 1)) > Math.abs(move.from - move.to)) {
        move = { topic, from, to: i + 1 };
      }
    }
    if (move) {
      const { topic, from, to } = move;
      changes.push(`${topic} moved from ${ordinal(from)} to ${ordinal(to)}`);
    }
    parts.push(`Added ${listOf(added)}: ${changes.join(", ")}.`);
  }
  if (skipped.length > 0) {
    parts.push(
      `${listOf(skipped)} ${skipped.length === 1 ? "is" : "are"} already in this corpus, skipped.`,
    );
  }
  return parts.join(" ");
}
