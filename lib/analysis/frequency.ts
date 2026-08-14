import type { Question, TopicStat } from "@/lib/types";

/**
 * Topic frequency, the base statistic every other analysis reads from.
 *
 * Topics are grouped case- and whitespace-insensitively but reported using the
 * first spelling encountered, so a corpus where the model emitted both
 * "Gauss's Law" and "gauss's law" counts once and displays once.
 */
export function topicFrequency(questions: Question[]): TopicStat[] {
  const groups = new Map<
    string,
    { topic: string; order: number; questions: Question[] }
  >();

  for (const question of questions) {
    const key = question.topic.trim().toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { topic: question.topic.trim(), order: groups.size, questions: [] };
      groups.set(key, group);
    }
    group.questions.push(question);
  }

  return [...groups.values()]
    .map((group) => ({
      topic: group.topic,
      count: group.questions.length,
      questions: group.questions,
      papers: [...new Set(group.questions.map((q) => q.paper.label))],
      order: group.order,
    }))
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ order: _order, ...stat }): TopicStat => stat);
}
