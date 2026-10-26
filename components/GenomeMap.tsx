import { paperOrder } from "@/lib/analysis/papers";
import type { Question, TopicStat } from "@/lib/types";

/** A single hit is faint but must still be visible against the canvas. */
const MIN_ALPHA = 0.14;
const MAX_ALPHA = 0.92;

function alphaFor(count: number, max: number): number {
  if (count === 0) return 0;
  if (max <= 1) return MAX_ALPHA;
  return MIN_ALPHA + ((count - 1) / (max - 1)) * (MAX_ALPHA - MIN_ALPHA);
}

/**
 * The genome map: topics down, papers across, density where the marks are.
 *
 * Reading a column tells you what one paper covered; reading a row tells you
 * how persistent a topic is. Empty cells stay canvas-coloured rather than white
 * so absence reads as absence and not as a faint hit.
 */
export function GenomeMap({
  questions,
  stats,
}: {
  questions: Question[];
  stats: TopicStat[];
}) {
  const papers = paperOrder(questions);

  const counts = new Map<string, number>();
  for (const question of questions) {
    const key = `${question.topic.trim().toLowerCase()}|${question.paper.label}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const cellCount = (topic: string, label: string) =>
    counts.get(`${topic.trim().toLowerCase()}|${label}`) ?? 0;

  const max = Math.max(1, ...counts.values());

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-pure-white">
      <div className="p-[var(--card-padding)] pb-[16px]">
        <h3 className="text-heading-sm font-bold tracking-[-0.242px]">
          Genome map
        </h3>
        <p className="mt-[8px] text-body-sm text-graphite">
          {stats.length} topic{stats.length === 1 ? "" : "s"} across{" "}
          {papers.length} paper{papers.length === 1 ? "" : "s"}. Cell density is
          the number of questions that paper asked on that topic.
        </p>
      </div>

      {/* Focusable so a keyboard can scroll it sideways on a phone. */}
      <div
        role="region"
        aria-label="Genome map, scrolls sideways"
        tabIndex={0}
        className="overflow-x-auto px-[var(--card-padding)] pb-[var(--card-padding)] print:overflow-visible"
      >
        <table className="w-full border-collapse text-caption">
          <caption className="sr-only">
            Question counts by topic and paper
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-pure-white py-[8px] pr-[16px] text-left align-bottom font-medium text-[rgba(0,0,0,0.6)]"
              >
                Topic
              </th>
              {papers.map((paper) => (
                <th
                  key={paper.label}
                  scope="col"
                  className="min-w-[72px] px-[4px] pb-[8px] align-bottom font-medium text-[rgba(0,0,0,0.6)] print:min-w-0"
                >
                  {/* Labels wrap, so a phone fits more than two papers across. */}
                  <span className="block break-words">{paper.label}</span>
                </th>
              ))}
              <th
                scope="col"
                className="min-w-[48px] pl-[16px] pb-[8px] align-bottom text-right font-medium text-[rgba(0,0,0,0.6)]"
              >
                All
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => (
              <tr key={stat.topic}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-[120px] bg-pure-white py-[4px] pr-[8px] text-left align-middle font-normal text-[rgba(0,0,0,0.95)] sm:max-w-[260px] sm:pr-[16px]"
                >
                  {/* Wraps rather than truncates: a phone has no hover to show the rest. */}
                  <span className="block break-words">{stat.topic}</span>
                </th>
                {papers.map((paper) => {
                  const count = cellCount(stat.topic, paper.label);
                  return (
                    <td key={paper.label} className="p-[2px]">
                      <div
                        title={`${stat.topic} · ${paper.label} · ${count} question${count === 1 ? "" : "s"}`}
                        className="flex h-[28px] items-center justify-center rounded-[var(--radius-md)] tabular-nums"
                        style={{
                          backgroundColor:
                            count === 0
                              ? "var(--color-paper-warmth)"
                              : `color-mix(in srgb, var(--color-notion-blue) ${(alphaFor(count, max) * 100).toFixed(1)}%, transparent)`,
                          color:
                            alphaFor(count, max) > 0.55
                              ? "var(--color-pure-white)"
                              : "rgba(0,0,0,0.6)",
                        }}
                      >
                        {count === 0 ? "" : count}
                      </div>
                    </td>
                  );
                })}
                <td className="pl-[16px] text-right align-middle font-medium tabular-nums text-[rgba(0,0,0,0.95)]">
                  {stat.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
