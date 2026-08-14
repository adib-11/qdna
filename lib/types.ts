export type PaperType = "CT" | "Final";

export interface PaperRef {
  /** Class test or end-of-semester final. */
  type: PaperType;
  /** Human label as printed on the paper, e.g. "2nd CT 2024" or "2024 EEE 2107". */
  label: string;
  /** Section within the paper, e.g. "A" or "B". Null when the paper has none. */
  section: string | null;
  /** Four-digit year, or null when the paper does not state one. */
  year: number | null;
}

export interface Question {
  /** Stable id derived from paper label and question number. */
  id: string;
  /** Course name as printed, e.g. "Electromagnetic Fields and Waves". */
  course: string;
  /** Every course code the paper carries, e.g. ["ECE 3121", "EEE 2107"]. */
  courseCodes: string[];
  paper: PaperRef;
  /** Question number as printed, e.g. "1(a)". */
  qNo: string;
  /** Marks awarded, or null when the paper does not state them. */
  marks: number | null;
  /** Verbatim question text with mathematical notation preserved. */
  text: string;
  /** Topic label inferred per-upload. Never drawn from a hardcoded taxonomy. */
  topic: string;
  /** True for calculation questions, false for theory/derivation. */
  isNumerical: boolean;
}

/** A rasterised PDF page awaiting extraction. */
export interface PageImage {
  /** Zero-based index in the source document, after blank pages are dropped. */
  pageIndex: number;
  /** Base64-encoded JPEG, without the data-URL prefix. */
  base64: string;
  /** Byte length of the base64 payload, used for batch packing. */
  bytes: number;
}

export interface ExtractionBatch {
  pages: PageImage[];
  bytes: number;
}

export interface ExtractionProgress {
  pagesDone: number;
  pagesTotal: number;
  questionsFound: number;
  batchesFailed: number;
  /** Pages belonging to batches that failed outright. */
  pagesFailed: number;
}

export interface ExtractionOutcome {
  questions: Question[];
  progress: ExtractionProgress;
  /** True when at least one batch failed after exhausting retries. */
  partial: boolean;
}

export interface TopicStat {
  topic: string;
  count: number;
  questions: Question[];
  /** Distinct paper labels this topic appears in. */
  papers: string[];
}

export interface LineageCluster {
  id: string;
  /** Representative topic for the cluster. */
  topic: string;
  members: Question[];
  /** Mean pairwise similarity across members, 0–1. */
  cohesion: number;
  /** Similarity of each member to the cluster's first member, 0–1. */
  pairwiseSimilarity: number[];
  /** Distinct course codes spanned by the members. */
  courseCodes: string[];
  /** True when members carry more than one course code. */
  crossDepartment: boolean;
}

export interface ParetoPoint {
  topic: string;
  count: number;
  cumulativePct: number;
}

export interface AnalysisResult {
  questions: Question[];
  stats: TopicStat[];
  pareto: ParetoPoint[];
  lineages: LineageCluster[];
  /** Mean marks per paper for each topic; null when no marks were recorded. */
  expectedMarks: Record<string, number | null>;
  paperCount: number;
  questionCount: number;
  /** True when fewer than MIN_PAPERS_FOR_CONFIDENCE papers were supplied. */
  lowConfidence: boolean;
}
