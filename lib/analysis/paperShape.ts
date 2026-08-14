import type { PaperShape, PaperType, Question, SectionShape } from "@/lib/types";

/** Label used for questions that sit under no printed section. */
export const UNSECTIONED = "—";

/**
 * The shape of a paper in this corpus, measured rather than assumed.
 *
 * Prediction has to produce a paper that looks like the ones the student
 * actually sits: the same sections, roughly the same number of questions, the
 * same mark denominations. All of that is derivable from the extracted corpus,
 * so it is derived here — deterministically — and handed to the model as a
 * constraint instead of being left to its idea of what an exam looks like.
 *
 * Medians rather than means throughout: one over-extracted paper should not
 * stretch the predicted paper to eighteen questions.
 */
export function inferPaperShape(questions: Question[]): PaperShape | null {
  if (questions.length === 0) return null;

  const byPaper = new Map<string, Question[]>();
  for (const question of questions) {
    const list = byPaper.get(question.paper.label);
    if (list) list.push(question);
    else byPaper.set(question.paper.label, [question]);
  }

  const papers = [...byPaper.values()];

  // Per-section counts, one entry per paper the section appears in. A section
  // missing from a paper contributes nothing rather than a zero — otherwise a
  // section unique to finals would be halved by every CT in the corpus.
  const countsBySection = new Map<string, number[]>();
  for (const paperQuestions of papers) {
    const perSection = new Map<string, number>();
    for (const question of paperQuestions) {
      const name = question.paper.section?.trim() || UNSECTIONED;
      perSection.set(name, (perSection.get(name) ?? 0) + 1);
    }
    for (const [name, count] of perSection) {
      const counts = countsBySection.get(name);
      if (counts) counts.push(count);
      else countsBySection.set(name, [count]);
    }
  }

  const sections: SectionShape[] = [...countsBySection.entries()]
    .map(([name, counts]) => ({
      name,
      questionsPerPaper: Math.max(1, Math.round(median(counts))),
      papersPresentIn: counts.length,
      markValues: commonMarkValues(
        questions.filter(
          (q) => (q.paper.section?.trim() || UNSECTIONED) === name,
        ),
      ),
    }))
    .sort(sectionOrder);

  const marksPerPaper = papers
    .map((paperQuestions) =>
      paperQuestions.reduce((sum, q) => sum + (q.marks ?? 0), 0),
    )
    .filter((total) => total > 0);

  return {
    course: modal(questions.map((q) => q.course).filter(Boolean)) ?? "",
    courseCodes: [...new Set(questions.flatMap((q) => q.courseCodes ?? []))],
    type: (modal(papers.map((p) => p[0].paper.type)) ?? "Final") as PaperType,
    sections,
    questionsPerPaper: Math.max(
      1,
      Math.round(median(papers.map((p) => p.length))),
    ),
    marksPerPaper:
      marksPerPaper.length > 0 ? Math.round(median(marksPerPaper)) : null,
    paperCount: papers.length,
  };
}

/** Mark denominations the examiner actually uses, most common first. */
function commonMarkValues(questions: Question[]): number[] {
  const counts = new Map<number, number>();
  for (const question of questions) {
    if (question.marks === null) continue;
    counts.set(question.marks, (counts.get(question.marks) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 4)
    .map(([value]) => value);
}

/** Sections read A, B, C on the paper; unsectioned questions come last. */
function sectionOrder(a: SectionShape, b: SectionShape): number {
  if (a.name === UNSECTIONED) return 1;
  if (b.name === UNSECTIONED) return -1;
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function modal<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
