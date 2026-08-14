import type { ExtractionOutcome, Question } from "@/lib/types";

/**
 * Corpora extracted once and committed, so the tool can be demonstrated
 * without spending a single request of the binding daily quota (RISK-001) and
 * without a network round-trip at all.
 *
 * These are a convenience path, never the primary one (REQ-002): each was
 * produced by running the shipped extraction pipeline over the same PDFs a
 * user would have uploaded — see `scripts/extract-corpus.mjs`.
 */
export interface Sample {
  id: string;
  /** Course as it should read on a button. */
  name: string;
  /** What is in the corpus, in one line. */
  blurb: string;
  load: () => Promise<Question[]>;
}

/** Dynamic imports so three corpora do not ride along in the landing bundle. */
export const SAMPLES: Sample[] = [
  {
    id: "swe",
    name: "Software Engineering",
    blurb: "RUET ECE 3117 finals, several years of them",
    load: () => import("@/data/swe.json").then((m) => m.default as Question[]),
  },
  {
    id: "cad",
    name: "Computer Architecture",
    blurb: "RUET ECE 3119 finals, several years of them",
    load: () => import("@/data/cad.json").then((m) => m.default as Question[]),
  },
  {
    // Not a course corpus at all — one PDF carrying a whole semester's finals
    // across five different courses. It is bundled precisely because it is
    // messy: it shows the pipeline separating papers it was handed in a heap.
    id: "semester",
    name: "A whole semester",
    blurb: "Five courses' 2024 finals, uploaded as one bundle",
    load: () =>
      import("@/data/semester.json").then((m) => m.default as Question[]),
  },
];

/**
 * A bundled corpus dressed as an extraction outcome.
 *
 * Pages are reported as zero rather than as a remembered page count: nothing
 * was rendered in this session, and inventing a figure for the progress line
 * would be a hardcoded user-facing number (GUD-006).
 */
export function sampleOutcome(questions: Question[]): ExtractionOutcome {
  return {
    questions,
    progress: {
      pagesDone: 0,
      pagesTotal: 0,
      questionsFound: questions.length,
      batchesFailed: 0,
      pagesFailed: 0,
    },
    partial: false,
  };
}
