import { paperOrder } from "@/lib/analysis/papers";
import { mixOver, readableInk } from "@/lib/contrast";
import type { PaperInfo } from "@/lib/corpus/courses";
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
  names,
}: {
  questions: Question[];
  stats: TopicStat[];
  names: Map<string, PaperInfo>;
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
      <div className="pb-4">
        <h3 className="text-lg tracking-[-0.02em]">Genome map</h3>
        <p className="mt-2 max-w-[65ch] text-sm text-ink-2">
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
        className="overflow-x-auto print:overflow-visible"
      >
        <table className="w-full border-separate border-spacing-[3px] text-xs">
          <caption className="sr-only">
            Question counts by topic and paper
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface p-1 text-left align-bottom font-semibold text-ink-2"
              >
                Topic
              </th>
              {papers.map((paper) => (
                <th
                  key={paper.label}
                  scope="col"
                  className="p-1 text-left align-bottom font-outlier font-normal whitespace-nowrap text-ink print:whitespace-normal"
                >
                  <span className="block">{names.get(paper.label)?.name ?? paper.label}</span>
                  {names.get(paper.label)?.code && (
                    <span className="block text-ink-2">{names.get(paper.label)?.code}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => (
              <tr key={stat.topic}>
                <th
                  scope="row"
                  title={stat.topic}
                  className="sticky left-0 z-10 max-w-[14ch] truncate bg-surface p-1 text-left align-middle font-normal sm:max-w-[22ch]"
                >
                  {stat.topic}
                </th>
                {papers.map((paper) => {
                  const count = cellCount(stat.topic, paper.label);
                  // An explicit shade, so the ink can be picked against it.
                  const shade = count === 0 ? null : mixOver(CELL_INK, alphaFor(count, max), CELL_GROUND);
                  return (
                    <td key={paper.label} className="p-0">
                      <div
                        title={`${stat.topic} · ${names.get(paper.label)?.name ?? paper.label} · ${count} question${count === 1 ? "" : "s"}`}
                        className="flex h-[26px] min-w-12 items-center justify-center rounded-[3px] tabular-nums"
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
