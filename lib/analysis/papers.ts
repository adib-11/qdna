import { normalizeText } from "@/lib/analysis/normalize";
import type { PaperRef, Question } from "@/lib/types";

/**
 * Distinct course names in the corpus, most-asked first.
 *
 * One course prints its name several ways, and a mixed upload holds several
 * courses until it is split. Spellings are folded ("Electromagnetic Fields & Waves" and "…and Waves" are one
 * course, and OCR will produce both), reporting the most common spelling.
 */
export function corpusCourses(questions: Question[]): string[] {
  const groups = new Map<string, Map<string, number>>();

  for (const question of questions) {
    const name = question.course?.trim();
    if (!name) continue;
    // "&" and "and" are the same word to a reader and different tokens to OCR.
    const key = normalizeText(name).replace(/\band\b/g, "").replace(/\s+/g, " ").trim();
    const spellings = groups.get(key) ?? new Map<string, number>();
    spellings.set(name, (spellings.get(name) ?? 0) + 1);
    groups.set(key, spellings);
  }

  const courses = [...groups.entries()]
    .map(([key, spellings]) => {
      const ranked = [...spellings.entries()].sort((a, b) => b[1] - a[1]);
      return {
        key,
        name: ranked[0][0],
        count: ranked.reduce((n, [, c]) => n + c, 0),
      };
    })
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  // A page whose header sat in another batch is transcribed under whatever
  // the question itself says the course is — "Software Engineering" for a
  // paper titled "Software Engineering and Information System Design". One
  // name contained in another is that, not a second course.
  return courses
    .filter(
      (course, i) =>
        !courses.some(
          (other, j) => j !== i && contains(other.key, course.key) &&
            (other.count > course.count || (other.count === course.count && j < i)),
        ),
    )
    .map((course) => course.name);
}

/** True when every word of `inner` appears, in order, inside `outer`. */
function contains(outer: string, inner: string): boolean {
  return outer !== inner && ` ${outer} `.includes(` ${inner} `);
}

/**
 * Distinct papers in the corpus, oldest first.
 *
 * The genome map's columns and every "appears in" list read from this, so the
 * ordering has to be stable and chronological rather than whatever order the
 * user happened to drop the files in. Papers whose year OCR could not read sort
 * last, since a missing year is more likely a scan problem than a 1970s paper.
 */
export function paperOrder(questions: Question[]): PaperRef[] {
  const byLabel = new Map<string, PaperRef>();
  for (const question of questions) {
    if (!byLabel.has(question.paper.label)) {
      byLabel.set(question.paper.label, question.paper);
    }
  }

  return [...byLabel.values()].sort((a, b) => {
    const ay = a.year ?? Number.POSITIVE_INFINITY;
    const by = b.year ?? Number.POSITIVE_INFINITY;
    if (ay !== by) return ay - by;
    return a.label.localeCompare(b.label);
  });
}
