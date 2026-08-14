import type { PaperRef, Question } from "@/lib/types";

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
