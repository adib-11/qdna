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
      <p className="text-body-sm text-graphite">
        No questions were extracted, so there is no study plan yet.
      </p>
    );
  }
  const count = plan.topics.length;

  return (
    <Card tone="marigold" className="max-w-[760px] p-[20px] sm:p-[36px]">
      <h2 className="text-caption font-medium uppercase tracking-[0.12px] text-[rgba(0,0,0,0.7)]">
        Study these first
      </h2>

      <ol className="mt-[12px]">
        {plan.topics.map((topic, index) => (
          <li
            key={topic.topic}
            className="flex items-baseline gap-[12px] border-t border-[rgba(0,0,0,0.12)] py-[10px] first:border-t-0"
          >
            <span className="w-[20px] shrink-0 text-body-sm tabular-nums text-[rgba(0,0,0,0.7)]">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              {/* The plan is a prefix of the ranking, so rank finds the row. */}
              <a
                href={`#${topicAnchor(index + 1)}`}
                className="block break-words text-body font-medium text-ink-black underline decoration-[rgba(0,0,0,0.3)] underline-offset-[3px] hover:decoration-ink-black"
              >
                {topic.topic}
              </a>
              <span className="mt-[2px] block text-caption text-[rgba(0,0,0,0.7)]">
                asked {topic.count} time{topic.count === 1 ? "" : "s"} in{" "}
                {topic.paperCount} of {paperCount} paper
                {paperCount === 1 ? "" : "s"}
              </span>
            </span>
            <span className="shrink-0 text-body-sm font-medium tabular-nums">
              {marks(topic.marksPerPaper)}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-[12px] text-body-sm font-medium">
        These {count} topic{count === 1 ? "" : "s"}
        {plan.marksPerPaper === null
          ? ""
          : ` carry ${marks(plan.marksPerPaper)} a paper and`}{" "}
        cover {plan.coveragePct.toFixed(1)}% of the {questionCount} questions
        asked.
      </p>
      <p className="mt-[8px] text-caption text-[rgba(0,0,0,0.7)]">
        Marks are the average per paper. This describes what these papers have
        already asked. It is not a forecast of the next one.
      </p>
    </Card>
  );
}
