import Link from "next/link";
import { approx, Marks } from "@/components/Marks";
import { topicAnchor } from "@/components/TopicDossier";
import type { StudyPlan as Plan } from "@/lib/types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The answer, first: which topics to study, in order. How often each was asked
 * is the largest figure, on a highlighter stroke as long as the times asked;
 * the marks it carries a paper are in red pen in the right margin. Every number
 * is counted from the corpus, and the plan describes what was asked rather
 * than forecasting what will be.
 */
export function StudyPlan({
  plan,
  questionCount,
}: {
  plan: Plan;
  questionCount: number;
}) {
  if (plan.topics.length === 0) {
    return (
      <p className="text-ink-2">
        No questions were extracted, so there is no study plan yet.
      </p>
    );
  }
  const count = plan.topics.length;
  const most = plan.topics[0].count;

  return (
    <div>
      <h2 className="text-2xl sm:text-3xl">Study these first</h2>

      <ol className="mt-6 border-t border-ink">
        {plan.topics.map((topic, index) => (
          <li
            key={topic.topic}
            className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-2 border-b border-rule py-4 [grid-template-areas:'r_t_m'_'._a_a'] sm:grid-cols-[4rem_minmax(0,4fr)_minmax(0,6fr)_9rem] sm:items-center sm:gap-x-6 sm:[grid-template-areas:'r_t_a_m']"
          >
            <span className="font-outlier text-sm text-muted [grid-area:r]">{index + 1}</span>
            {/* The plan is a prefix of the ranking, so rank finds the topic's row. */}
            <Link
              href={`?tab=questions#${topicAnchor(index + 1)}`}
              className="text-lg font-semibold break-words underline decoration-rule underline-offset-[5px] transition-[text-decoration-color] duration-(--dur-micro) ease-out [grid-area:t] hover:decoration-accent"
            >
              {topic.topic}
            </Link>
            <span className="relative block py-2 [grid-area:a]">
              <span
                aria-hidden
                className="stroke absolute top-1/2 -left-[0.2em] h-[1.55em] -translate-y-1/2"
                style={{ width: `calc(${(topic.count / most) * 100}% + 0.2em)` }}
              />
              <span className="relative text-ink-2 sm:whitespace-nowrap">
                <b className="mr-1 text-xl tracking-[-0.02em] text-ink">
                  Asked {plural(topic.count, "time")}
                </b>{" "}
                in {plural(topic.paperCount, "paper")}
              </span>
            </span>
            <span className="grid justify-items-end text-right [grid-area:m]">
              <Marks
                value={topic.marksPerPaper === null ? null : approx(topic.marksPerPaper)}
                className="text-lg"
              />
              {topic.marksPerPaper !== null && (
                <span aria-hidden className="text-xs text-muted">marks a paper</span>
              )}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-6 max-w-[62ch] font-semibold">
        These {plural(count, "topic")}
        {plan.marksPerPaper === null ? (
          ""
        ) : (
          <>
            {" "}carry <Marks value={approx(plan.marksPerPaper)} bare /> marks a paper and
          </>
        )}{" "}
        cover {plan.coveragePct.toFixed(1)}% of the {questionCount} questions asked.
      </p>
      <p className="mt-2 max-w-[60ch] text-sm text-muted">
        Marks are the average per paper. This describes what these papers have
        already asked. It is not a forecast of the next one.
      </p>
    </div>
  );
}
