/**
 * Ground truth: a hand-checked record of every question on a paper, with its
 * number, marks, text and canonical topic. Every extraction measurement is
 * compared against it.
 *
 * The fixtures live in `tests/fixtures/ground-truth/`, one file per course.
 */

/** How the source pages were captured, which bounds how hard they are to read. */
export type Capture = "phone-photo" | "scan";

export interface GroundTruthSource {
  /** Source PDF file name. The PDF itself is never committed. */
  file: string;
  /** One-based pages of that file the paper occupies. */
  pages: number[];
  capture: Capture;
  /** True when the PDF carries a selectable text layer on these pages. */
  textLayer: boolean;
}

export interface GroundTruthQuestion {
  /**
   * Question number as printed, e.g. "2(b)". A question is the smallest unit
   * with its own printed marks; if no sub-part is marked, the parent is it.
   */
  qNo: string;
  /** Section as printed, e.g. "A", or null when the paper has none. */
  section: string | null;
  /** Printed marks, or null when the paper prints none. */
  marks: number | null;
  /** Verbatim question text, including any unmarked sub-parts. */
  text: string;
  /** One of the course's canonical topics. */
  topic: string;
  /** Anything the drafter could not read or decide with confidence. */
  uncertain?: string;
}

export interface GroundTruthPaper {
  /** Paper label, shaped like the extractor's: "2024 Final ECE 3119". */
  label: string;
  /** Examination line as printed. */
  exam: string;
  year: number | null;
  source: GroundTruthSource;
  /** Paper-level drafting notes and uncertainties. */
  notes?: string[];
  questions: GroundTruthQuestion[];
}

export interface GroundTruthCourse {
  course: string;
  courseCodes: string[];
  /** Who has signed off the topic grouping. Until the maintainer has, it is a draft. */
  topicGroupingStatus: string;
  /**
   * The course's canonical topic grouping, about 8–15 topics, each roughly one
   * syllabus unit. The grouping agreement metric compares against it.
   */
  topics: string[];
  papers: GroundTruthPaper[];
}
