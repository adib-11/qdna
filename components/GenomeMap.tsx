import { paperOrder } from "@/lib/analysis/papers";
import { mixOver, readableInk } from "@/lib/contrast";
import type { Question, TopicStat } from "@/lib/types";

/** `--color-ink` over `--color-surface` (app/tokens.css), as hex so contrast can be computed. Change both together. */
export const CELL_INK = "#0d0d0d";
export const CELL_GROUND = "#fefdfb";

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
 * how persistent a topic is. Empty cells take the second surface rather than
 * the page's, so absence reads as absence and not as a faint hit.
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
    <div>
      <div className="pb-6">
        <h3 className="text-xl sm:text-2xl">Genome map</h3>
        <p className="mt-3 max-w-[65ch] text-ink-2">
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
        className="overflow-x-auto border-t border-ink print:overflow-visible"
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Question counts by topic and paper
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface py-2 pr-4 text-left align-bottom font-semibold text-ink-2"
              >
                Topic
              </th>
              {papers.map((paper) => (
                <th
                  key={paper.label}
                  scope="col"
                  className="min-w-[72px] px-1 py-2 align-bottom font-semibold text-ink-2 print:min-w-0"
                >
                  {/* Labels wrap, so a phone fits more than two papers across. */}
                  <span className="block break-words">{paper.label}</span>
                </th>
              ))}
              <th
                scope="col"
                className="min-w-[48px] py-2 pl-4 align-bottom text-right font-semibold text-ink-2"
              >
                All
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => (
              <tr key={stat.topic} className="border-t border-rule-2">
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-[120px] bg-surface py-1 pr-2 text-left align-middle font-normal sm:max-w-[260px] sm:pr-4"
                >
                  {/* Wraps rather than truncates: a phone has no hover to show the rest. */}
                  <span className="block break-words">{stat.topic}</span>
                </th>
                {papers.map((paper) => {
                  const count = cellCount(stat.topic, paper.label);
                  // An explicit shade, so the ink can be picked against it.
                  const shade = count === 0 ? null : mixOver(CELL_INK, alphaFor(count, max), CELL_GROUND);
                  return (
                    <td key={paper.label} className="p-0.5">
                      <div
                        title={`${stat.topic} · ${paper.label} · ${count} question${count === 1 ? "" : "s"}`}
                        className="flex h-7 items-center justify-center rounded-sm font-outlier"
                        style={{
                          backgroundColor: shade ?? "var(--color-surface-2)",
                          color: shade ? readableInk(shade) : undefined,
                        }}
                      >
                        {count === 0 ? "" : count}
                      </div>
                    </td>
                  );
                })}
                <td className="pl-4 text-right align-middle font-outlier">
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
