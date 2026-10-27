import { corpusCourses } from "@/lib/analysis/papers";
import type { Question } from "@/lib/types";

/**
 * A corpus is past papers of exactly one course (ADR 0002). Papers belong to
 * one course when their printed course codes overlap, so a paper printing
 * ECE 3119 and EEE 3119 connects both code families. Offerings with no shared
 * code join only when the student says they are the same course.
 */
export interface Course {
  /** Paper labels, in the order the corpus first lists them. */
  papers: string[];
  /** Every code its papers print, the most printed first. */
  codes: string[];
}

export interface CourseSplit {
  /** The courses found, the one with the most papers first. */
  courses: Course[];
  /** Papers that print no code while several courses are present: the student picks a course for each. */
  unassigned: string[];
}

/** "ECE 3119", "ECE3119" and "ece 3119" are one code. */
export const codeKey = (code: string) => code.toUpperCase().replace(/\s+/g, "");

/**
 * The courses in `questions`. `sameCourse` lists groups of codes the student
 * said are one course. A paper with no printed code joins the only course
 * present, makes up the course when no paper prints a code, and otherwise
 * waits in `unassigned`; it never becomes a course of its own.
 */
export function splitCourses(questions: Question[], sameCourse: string[][] = []): CourseSplit {
  const { paperCodes, spelling } = readCodes(questions);

  // Union-find over codes: codes on one paper, or in one same-course group, are one course.
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    const up = parent.get(key) ?? key;
    if (up === key) return key;
    const root = find(up);
    parent.set(key, root);
    return root;
  };
  const union = (keys: string[]) => {
    for (const key of keys.slice(1)) parent.set(find(key), find(keys[0]));
  };
  for (const codes of paperCodes.values()) union([...codes]);
  for (const group of sameCourse) union(group.map(codeKey).filter((key) => spelling.has(key)));

  const byRoot = new Map<string, string[]>();
  const uncoded: string[] = [];
  for (const [label, codes] of paperCodes) {
    if (codes.size === 0) {
      uncoded.push(label);
      continue;
    }
    const root = find([...codes][0]);
    byRoot.set(root, [...(byRoot.get(root) ?? []), label]);
  }

  const courses = [...byRoot.values()]
    .map((papers) => ({ papers, codes: rankCodes(papers, paperCodes, spelling) }))
    .sort((a, b) => b.papers.length - a.papers.length);

  if (courses.length > 1) return { courses, unassigned: uncoded };
  if (courses.length === 1) courses[0].papers.push(...uncoded);
  else if (uncoded.length > 0) courses.push({ papers: uncoded, codes: [] });
  return { courses, unassigned: [] };
}

/**
 * Each paper's codes, gathered from all its questions: a page whose header sat
 * in another batch still belongs to the paper its label names. `spelling`
 * keeps each code as first printed.
 */
function readCodes(questions: Question[]) {
  const paperCodes = new Map<string, Set<string>>();
  const spelling = new Map<string, string>();
  for (const q of questions) {
    const codes = paperCodes.get(q.paper.label) ?? new Set<string>();
    for (const code of q.courseCodes) {
      const key = codeKey(code);
      if (!key) continue;
      codes.add(key);
      if (!spelling.has(key)) spelling.set(key, code.trim());
    }
    paperCodes.set(q.paper.label, codes);
  }
  return { paperCodes, spelling };
}

/** A course's codes, the one printed on the most papers first. */
function rankCodes(
  papers: string[],
  paperCodes: Map<string, Set<string>>,
  spelling: Map<string, string>,
): string[] {
  const counts = new Map<string, number>();
  for (const label of papers) {
    for (const key of paperCodes.get(label)!) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => spelling.get(key)!);
}

/**
 * Papers added to a corpus from another offering: those printing codes that
 * connect to none of the corpus's own, even through `sameCourse`, with every
 * code they print. A paper printing no code is never another offering; when
 * the corpus itself prints none there is nothing to compare, and the split
 * screen sorts out whatever the merge holds.
 */
export function otherOffering(
  corpus: Question[],
  added: Question[],
  sameCourse: string[][] = [],
): Course {
  const own = new Set(corpus.map((q) => q.paper.label));
  const { courses } = splitCourses([...corpus, ...added], sameCourse);
  if (!courses.some((course) => course.papers.some((label) => own.has(label)))) {
    return { papers: [], codes: [] };
  }
  const others = courses.filter((course) => !course.papers.some((label) => own.has(label)));
  return { papers: others.flatMap((c) => c.papers), codes: others.flatMap((c) => c.codes) };
}

/** True when the corpus holds more than one course, or a paper waits for the student to pick its course. */
export function needsSplit(split: CourseSplit): boolean {
  return split.courses.length > 1 || split.unassigned.length > 0;
}

/**
 * The corpus's questions as one set per course, the course with the most
 * papers first. `assigned` maps each unassigned paper to an index into
 * `split.courses`. Every question lands in exactly one set.
 */
export function splitCorpus(
  questions: Question[],
  split: CourseSplit,
  assigned: Record<string, number>,
): Question[][] {
  const missing = split.unassigned.filter((label) => split.courses[assigned[label]] === undefined);
  if (missing.length > 0) throw new Error(`Pick a course for ${missing.join(", ")}`);

  const courseOf = new Map<string, number>();
  split.courses.forEach((course, i) => course.papers.forEach((label) => courseOf.set(label, i)));
  for (const label of split.unassigned) courseOf.set(label, assigned[label]);

  const parts = split.courses.map(() => [] as Question[]);
  for (const q of questions) parts[courseOf.get(q.paper.label)!].push(q);
  const paperCount = (part: Question[]) => new Set(part.map((q) => q.paper.label)).size;
  return parts.sort((a, b) => paperCount(b) - paperCount(a));
}

/**
 * What a corpus is called: the course name for one offering; for several, the
 * name of the offering with the most papers, with every code listed.
 */
export function corpusTitle(questions: Question[]): { name: string; codes: string[] } {
  const { paperCodes, spelling } = readCodes(questions);
  const codes = rankCodes([...paperCodes.keys()], paperCodes, spelling);
  // Whole papers, so a page that lost its header's code still counts.
  const top = codes[0] && codeKey(codes[0]);
  const offering = top
    ? questions.filter((q) => paperCodes.get(q.paper.label)!.has(top))
    : questions;
  return { name: corpusCourses(offering)[0] ?? "your corpus", codes };
}

export interface PaperInfo {
  /** Year and sitting, e.g. "2024 Final" or "CT2, undated". */
  name: string;
  /** The codes the paper prints ("no code" when none), or null when the corpus has one offering. */
  code: string | null;
  /** True when its questions sit in more than one section. */
  sectioned: boolean;
}

/** A paper's on-screen name, or its printed label when it has none. */
export const paperName = (names: Map<string, PaperInfo>, label: string) =>
  names.get(label)?.name ?? label;

/** "Final", or the class test's number when the label prints one: "CT2" for "CT2 ECE 3121" or "2nd CT". */
function sittingOf(paper: Question["paper"]): string {
  if (paper.type === "Final") return "Final";
  const n = paper.label.match(/CT\s?(\d)/i) ?? paper.label.match(/(\d)(?:st|nd|rd|th)\s*CT/i);
  return n ? `CT${n[1]}` : "CT";
}

/**
 * How each paper is named on screen, by label. Where two papers of one
 * offering would read the same, the printed label is added to tell them apart.
 */
export function describePapers(questions: Question[]): Map<string, PaperInfo> {
  const { paperCodes, spelling } = readCodes(questions);
  const multi = new Set([...paperCodes.values()].flatMap((codes) => [...codes])).size > 1;

  const refs = new Map<string, Question["paper"]>();
  const sections = new Map<string, Set<string>>();
  for (const q of questions) {
    refs.set(q.paper.label, refs.get(q.paper.label) ?? q.paper);
    const seen = sections.get(q.paper.label) ?? new Set<string>();
    if (q.paper.section) seen.add(q.paper.section);
    sections.set(q.paper.label, seen);
  }

  const base = (p: Question["paper"]) =>
    p.year ? `${p.year} ${sittingOf(p)}` : `${sittingOf(p)}, undated`;
  const codeOf = (label: string) =>
    multi ? [...paperCodes.get(label)!].map((key) => spelling.get(key)!).join(" · ") || "no code" : null;
  const key = (p: Question["paper"]) => `${base(p)}|${codeOf(p.label)}`;
  const uses = new Map<string, number>();
  for (const p of refs.values()) uses.set(key(p), (uses.get(key(p)) ?? 0) + 1);

  return new Map(
    [...refs.values()].map((p) => [
      p.label,
      {
        name: uses.get(key(p))! > 1 ? `${base(p)}, printed “${p.label}”` : base(p),
        code: codeOf(p.label),
        sectioned: sections.get(p.label)!.size > 1,
      },
    ]),
  );
}
