import { topicAnchor } from "@/components/TopicDossier";
import { Card } from "@/components/ui/Card";
import type { StudyPlan as Plan } from "@/lib/types";

const marks = (value: number | null) =>
  value === null ? "marks not recorded" : `≈${Number(value.toFixed(1))} marks`;

/**
 * The answer, first: which topics to study, in order, and the marks each one
 * typically carries in a paper. Every number is counted from the corpus, and
 * the plan describes what was asked rather than forecasting what will be.
 */
export function StudyPlan({
  plan,
  questionCount,
  paperCount,
}: {
  plan: Plan;
  questionCount: number;
  paperCount: number;
}) {
  if (plan.topics.length === 0) {
    return (
      <p className="text-ink-2">
        No questions were extracted, so there is no study plan yet.
      </p>
    );
  }
  const count = plan.topics.length;

  // Set like an exam paper: the rank in the left margin, the marks in the right.
  return (
    <Card className="max-w-[760px]">
      <h2 className="text-xl sm:text-2xl">Study these first</h2>

      <ol className="mt-6 border-t border-ink">
        {plan.topics.map((topic, index) => (
          <li
            key={topic.topic}
            className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-rule py-3 sm:grid-cols-[3rem_minmax(0,1fr)_auto]"
          >
            <span className="font-outlier text-sm text-ink-2">{index + 1}</span>
            <span className="min-w-0">
              {/* The plan is a prefix of the ranking, so rank finds the row. */}
              <a
                href={`#${topicAnchor(index + 1)}`}
                className="break-words text-lg font-semibold underline decoration-rule underline-offset-4 transition-[text-decoration-color] duration-(--dur-micro) ease-out hover:decoration-accent"
              >
                {topic.topic}
              </a>
              <span className="mt-1 block text-sm text-ink-2">
                asked {topic.count} time{topic.count === 1 ? "" : "s"} in{" "}
                {topic.paperCount} of {paperCount} paper
                {paperCount === 1 ? "" : "s"}
              </span>
            </span>
            <span className="text-right font-outlier text-sm whitespace-nowrap">
              {marks(topic.marksPerPaper)}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-6 max-w-[60ch] font-semibold">
        These {count} topic{count === 1 ? "" : "s"}
        {plan.marksPerPaper === null
          ? ""
          : ` carry ${marks(plan.marksPerPaper)} a paper and`}{" "}
        cover {plan.coveragePct.toFixed(1)}% of the {questionCount} questions
        asked.
      </p>
      <p className="mt-2 max-w-[60ch] text-sm text-ink-2">
        Marks are the average per paper. This describes what these papers have
        already asked. It is not a forecast of the next one.
      </p>
    </Card>
  );
}
