import type { TopicOverride } from "@/lib/analysis/topics";
import type { Question } from "@/lib/types";

/**
 * The corpus file (`.qdna.json`): a portable copy of a corpus that a classmate
 * imports without spending a single model request.
 *
 * Bump the version whenever the shape changes in a way an older reader would
 * misread. A reader rejects any version it does not know rather than guessing.
 */
export const CORPUS_FILE_VERSION = 1;
export const CORPUS_FILE_FORMAT = "qdna-corpus";
export const CORPUS_FILE_EXTENSION = ".qdna.json";

/**
 * One paper's questions. Each question keeps its own paper reference, because
 * the section in it differs from question to question within one paper.
 */
interface FilePaper {
  label: string;
  questions: Question[];
}

export interface CorpusFile {
  format: typeof CORPUS_FILE_FORMAT;
  version: typeof CORPUS_FILE_VERSION;
  papers: FilePaper[];
  /** The student's topic overrides, in the order they were made. */
  topicOverrides: TopicOverride[];
  /** Groups of course codes the student said are one course. Absent from older files. */
  sameCourse?: string[][];
}

export function exportCorpusFile(
  questions: Question[],
  topicOverrides: TopicOverride[] = [],
  sameCourse: string[][] = [],
): string {
  const papers = new Map<string, FilePaper>();
  for (const question of questions) {
    const { label } = question.paper;
    const group = papers.get(label) ?? { label, questions: [] };
    group.questions.push(question);
    papers.set(label, group);
  }

  const file: CorpusFile = {
    format: CORPUS_FILE_FORMAT,
    version: CORPUS_FILE_VERSION,
    papers: [...papers.values()],
    topicOverrides,
    sameCourse,
  };
  return JSON.stringify(file, null, 2);
}

export type ImportResult =
  | {
      ok: true;
      /** The merged corpus. */
      questions: Question[];
      /** Paper labels the import added, in file order. */
      added: string[];
      /** Paper labels already in the corpus, whose existing copy was kept. */
      skipped: string[];
      /** The importer's overrides, plus the imported ones that do not contradict them. */
      topicOverrides: TopicOverride[];
      /** The importer's same-course groups, then the imported ones. */
      sameCourse: string[][];
    }
  | { ok: false; error: string };

/**
 * Merge a corpus file into an existing corpus, paper by paper. A paper already
 * present (same label) keeps its existing copy. On any error the caller's
 * corpus is returned to it untouched, because nothing here mutates it.
 */
export function importCorpusFile(
  existing: Question[],
  text: string,
  existingOverrides: TopicOverride[] = [],
  existingSameCourse: string[][] = [],
): ImportResult {
  const parsed = parseCorpusFile(text);
  if (!parsed.ok) return parsed;
  const file = parsed.file;

  return {
    ok: true,
    ...mergePapers(existing, file.papers.flatMap((paper) => paper.questions)),
    topicOverrides: mergeOverrides(existingOverrides, file.topicOverrides),
    sameCourse: [...existingSameCourse, ...(file.sameCourse ?? [])],
  };
}

/**
 * Add `incoming` to `existing`, paper by paper. A paper already present (same
 * label) keeps its existing copy, whether it comes from a corpus file or from
 * extracting the paper again.
 */
export function mergePapers(
  existing: Question[],
  incoming: Question[],
): { questions: Question[]; added: string[]; skipped: string[] } {
  const present = new Set(existing.map((q) => q.paper.label));
  const labels = [...new Set(incoming.map((q) => q.paper.label))];
  return {
    questions: [...existing, ...incoming.filter((q) => !present.has(q.paper.label))],
    added: labels.filter((label) => !present.has(label)),
    skipped: labels.filter((label) => present.has(label)),
  };
}

/**
 * The importer's overrides win: an imported override touching any topic the
 * importer's own overrides touch is dropped, and the importer's are applied
 * last, so nothing imported can undo or redirect one of their choices.
 */
export function mergeOverrides(
  own: TopicOverride[],
  imported: TopicOverride[],
): TopicOverride[] {
  const touched = new Set(own.flatMap((o) => [...o.from, o.to]));
  const kept = imported.filter((o) => ![...o.from, o.to].some((t) => touched.has(t)));
  return [...kept, ...own];
}

/** The import summary a student reads, e.g. "2 papers added (…). 1 already present, your copy kept (…)." */
export function describeImport(added: string[], skipped: string[]): string {
  const papers = (n: number) => `${n} paper${n === 1 ? "" : "s"}`;
  const addedPart =
    added.length === 0
      ? "No papers added."
      : `${papers(added.length)} added (${added.join(", ")}).`;
  const skippedPart =
    skipped.length === 0
      ? ""
      : ` ${skipped.length} already present, your copy kept (${skipped.join(", ")}).`;
  return addedPart + skippedPart;
}

const NOT_A_CORPUS_FILE = "This is not a qDNA corpus file.";
const DAMAGED =
  "This corpus file is damaged: some of its questions could not be read. Ask for a fresh export.";

type Parsed = { ok: true; file: CorpusFile } | { ok: false; error: string };

/** Read and fully validate a corpus file before anything is merged from it. */
function parseCorpusFile(text: string): Parsed {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: NOT_A_CORPUS_FILE };
  }

  if (!isRecord(data) || data.format !== CORPUS_FILE_FORMAT) {
    return { ok: false, error: NOT_A_CORPUS_FILE };
  }
  if (typeof data.version !== "number") return { ok: false, error: DAMAGED };
  if (data.version !== CORPUS_FILE_VERSION) {
    return {
      ok: false,
      error: `This corpus file is format version ${String(data.version)}, which this version of qDNA cannot read. It reads version ${CORPUS_FILE_VERSION}.`,
    };
  }
  if (
    !Array.isArray(data.papers) ||
    !isOptionalOverrides(data.topicOverrides) ||
    !isOptionalSameCourse(data.sameCourse)
  ) {
    return { ok: false, error: DAMAGED };
  }
  if (data.papers.length === 0) {
    return { ok: false, error: "This corpus file has no papers in it." };
  }
  if (!data.papers.every(isFilePaper)) return { ok: false, error: DAMAGED };
  // The same paper twice would make "existing copy wins" depend on file order.
  const labels = new Set(data.papers.map((paper) => paper.label));
  if (labels.size !== data.papers.length) return { ok: false, error: DAMAGED };

  return {
    ok: true,
    file: {
      format: CORPUS_FILE_FORMAT,
      version: CORPUS_FILE_VERSION,
      papers: data.papers,
      topicOverrides: data.topicOverrides ?? [],
      sameCourse: data.sameCourse ?? [],
    },
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalOverrides(value: unknown): value is TopicOverride[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every(isTopicOverride));
}

const isString = (value: unknown): value is string => typeof value === "string";

export function isOptionalSameCourse(value: unknown): value is string[][] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((group) => Array.isArray(group) && group.every(isString)))
  );
}

export function isTopicOverride(value: unknown): value is TopicOverride {
  return (
    isRecord(value) &&
    Array.isArray(value.from) &&
    value.from.length > 0 &&
    value.from.every(isString) &&
    isString(value.to) &&
    value.to.trim() !== ""
  );
}
const isNumberOrNull = (value: unknown) =>
  value === null || (typeof value === "number" && Number.isFinite(value));

function isFilePaper(value: unknown): value is FilePaper {
  return (
    isRecord(value) &&
    isString(value.label) &&
    Array.isArray(value.questions) &&
    value.questions.length > 0 &&
    value.questions.every(
      (q) => isQuestion(q) && q.paper.label === value.label,
    )
  );
}

export function isQuestion(value: unknown): value is Question {
  if (!isRecord(value) || !isRecord(value.paper)) return false;
  const { paper } = value;
  return (
    isString(value.id) &&
    isString(value.course) &&
    Array.isArray(value.courseCodes) &&
    value.courseCodes.every(isString) &&
    isString(value.qNo) &&
    isNumberOrNull(value.marks) &&
    isString(value.text) &&
    isString(value.topic) &&
    typeof value.isNumerical === "boolean" &&
    (paper.type === "CT" || paper.type === "Final") &&
    isString(paper.label) &&
    (paper.section === null || isString(paper.section)) &&
    isNumberOrNull(paper.year)
  );
}
