import { describe, expect, it } from "vitest";
import {
  corpusTitle,
  describePapers,
  needsSplit,
  splitCorpus,
  splitCourses,
} from "@/lib/corpus/courses";
import type { Question } from "@/lib/types";

/** `n` questions on one paper, printing `codes`. */
function paper(label: string, codes: string[], course = "Course", n = 1): Question[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${label}::${i + 1}`,
    course,
    courseCodes: codes,
    paper: { type: "Final", label, section: null, year: 2024 },
    qNo: String(i + 1),
    marks: 5,
    text: `${label} question ${i + 1}`,
    topic: "Topic",
    isNumerical: false,
  }));
}

const labels = (questions: Question[]) => [...new Set(questions.map((q) => q.paper.label))];

describe("splitCourses", () => {
  it("groups papers into courses by printed course code", () => {
    const split = splitCourses([
      ...paper("CAD 2023", ["ECE 3119"]),
      ...paper("CAD 2024", ["ECE 3119"]),
      ...paper("SWE 2024", ["ECE 3117"]),
    ]);

    expect(split.courses.map((c) => c.papers)).toEqual([["CAD 2023", "CAD 2024"], ["SWE 2024"]]);
    expect(split.courses.map((c) => c.codes)).toEqual([["ECE 3119"], ["ECE 3117"]]);
    expect(split.unassigned).toEqual([]);
  });

  it("connects two code families through a paper that prints both", () => {
    const split = splitCourses([
      ...paper("ECE only", ["ECE 3119"]),
      ...paper("EEE only", ["EEE 3119"]),
      ...paper("Shared", ["ECE 3119", "EEE 3119"]),
    ]);

    expect(split.courses).toHaveLength(1);
    expect(split.courses[0].codes).toEqual(["ECE 3119", "EEE 3119"]);
    expect(needsSplit(split)).toBe(false);
  });

  it("reads a code the same whatever its spacing or case", () => {
    const split = splitCourses([...paper("A", ["ECE 3119"]), ...paper("B", ["ece3119"])]);

    expect(split.courses).toHaveLength(1);
    expect(split.courses[0].codes).toEqual(["ECE 3119"]);
  });

  it("keeps offerings with no shared code apart until the student says they are the same course", () => {
    const corpus = [...paper("ECE", ["ECE 3121"]), ...paper("EEE", ["EEE 2107"])];

    expect(splitCourses(corpus).courses).toHaveLength(2);
    expect(splitCourses(corpus, [["ECE 3121", "EEE 2107"]]).courses).toHaveLength(1);
  });

  it("puts the course with the most papers first", () => {
    const split = splitCourses([
      ...paper("Lone", ["MATH 2101"], "Maths", 9),
      ...paper("One", ["EEE 2107"]),
      ...paper("Two", ["EEE 2107"]),
    ]);

    expect(split.courses[0].codes).toEqual(["EEE 2107"]);
  });
});

describe("papers with no printed code", () => {
  it("join the only coded course present, silently", () => {
    const split = splitCourses([...paper("Final", ["ECE 3119"]), ...paper("CT CAD", [])]);

    expect(split.courses.map((c) => c.papers)).toEqual([["Final", "CT CAD"]]);
    expect(needsSplit(split)).toBe(false);
  });

  it("make up the one course when no paper prints a code", () => {
    const split = splitCourses([...paper("CT1", []), ...paper("CT2", [])]);

    expect(split.courses.map((c) => c.papers)).toEqual([["CT1", "CT2"]]);
    expect(needsSplit(split)).toBe(false);
  });

  it("wait for the student when several coded courses are present, never becoming a course of their own", () => {
    const split = splitCourses([
      ...paper("CAD", ["ECE 3119"]),
      ...paper("SWE", ["ECE 3117"]),
      ...paper("CT", []),
    ]);

    expect(split.courses.map((c) => c.papers)).toEqual([["CAD"], ["SWE"]]);
    expect(split.unassigned).toEqual(["CT"]);
    expect(needsSplit(split)).toBe(true);
  });
});

describe("splitCorpus, an old multi-course corpus", () => {
  // A whole-semester corpus as saved before one course per corpus.
  const semester = [
    ...paper("2024 Final EEE 2107", ["EEE 2107"], "Electromagnetic Fields & Waves", 4),
    ...paper("2023 Final EEE 2107", ["EEE 2107"], "Electromagnetic Fields & Waves", 3),
    ...paper("2024 Final ME 2101", ["ME 2101"], "Basic Mechanical Engineering", 3),
    ...paper("2023 Final ME 2101", ["ME 2101"], "Basic Mechanical Engineering", 2),
    ...paper("Final Exam", [], "Electromagnetic Fields and Waves", 2),
  ];
  const split = splitCourses(semester);

  it("splits into one corpus per course once every uncoded paper is assigned, repeating and losing no question", () => {
    const eee = split.courses.findIndex((c) => c.codes.includes("EEE 2107"));
    const parts = splitCorpus(semester, split, { "Final Exam": eee });

    expect(parts.map(labels)).toEqual([
      ["2024 Final EEE 2107", "2023 Final EEE 2107", "Final Exam"],
      ["2024 Final ME 2101", "2023 Final ME 2101"],
    ]);
    const ids = parts.flat().map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(semester.map((q) => q.id).sort());
  });

  it("puts the course with the most papers first, counting its assigned papers", () => {
    const me = split.courses.findIndex((c) => c.codes.includes("ME 2101"));
    const parts = splitCorpus(semester, split, { "Final Exam": me });

    expect(parts.map(labels)).toEqual([
      ["2024 Final ME 2101", "2023 Final ME 2101", "Final Exam"],
      ["2024 Final EEE 2107", "2023 Final EEE 2107"],
    ]);
  });

  it("refuses to split while a paper is unassigned", () => {
    expect(() => splitCorpus(semester, split, {})).toThrow(/Final Exam/);
  });
});

describe("corpusTitle", () => {
  it("names one offering by its course name", () => {
    expect(corpusTitle(paper("A", ["ECE 3119"], "Computer Architecture"))).toEqual({
      name: "Computer Architecture",
      codes: ["ECE 3119"],
    });
  });

  it("names several offerings after the one with the most papers, listing every code", () => {
    const title = corpusTitle([
      ...paper("EEE", ["EEE 2107"], "Electromagnetic Fields & Waves"),
      ...paper("ECE 1", ["ECE 3121"], "Electromagnetic Fields and Waves"),
      ...paper("ECE 2", ["ECE 3121"], "Electromagnetic Fields and Waves"),
    ]);

    expect(title).toEqual({
      name: "Electromagnetic Fields and Waves",
      codes: ["ECE 3121", "EEE 2107"],
    });
  });

  it("names the offering from its whole papers, even pages that lost the header's code", () => {
    const [header, ...rest] = paper("A", ["ECE 3119"], "Computer Architecture", 3);
    const title = corpusTitle([header, ...rest.map((q) => ({ ...q, courseCodes: [], course: "Pipelining" }))]);

    expect(title.name).toBe("Pipelining");
  });

  it("falls back to the printed name when no code is printed", () => {
    expect(corpusTitle(paper("CT", [], "Optics"))).toEqual({ name: "Optics", codes: [] });
    expect(corpusTitle([])).toEqual({ name: "your corpus", codes: [] });
  });
});

/** One question on a paper, with the fields paper names read. */
function sitting(
  label: string,
  type: "CT" | "Final",
  year: number | null,
  codes: string[],
  section: string | null = null,
): Question {
  return { ...paper(label, codes)[0], id: `${label}::${section}`, paper: { type, label, section, year } };
}

describe("describePapers", () => {
  it("names a paper by year and sitting", () => {
    const papers = describePapers([
      sitting("2024 Final ECE 3119", "Final", 2024, ["ECE 3119"]),
      sitting("2nd CT", "CT", null, ["ECE 3119"]),
      sitting("CT CAD", "CT", null, ["ECE 3119"]),
    ]);
    expect(papers.get("2024 Final ECE 3119")?.name).toBe("2024 Final");
    expect(papers.get("2nd CT")?.name).toBe("CT2, undated");
    expect(papers.get("CT CAD")?.name).toBe("CT, undated");
  });

  it("adds the printed label where two papers would read the same", () => {
    const papers = describePapers([
      sitting("2nd CT", "CT", null, ["ECE 3121"]),
      sitting("CT2 ECE 3121", "CT", null, ["ECE 3121"]),
      sitting("CT1", "CT", null, ["ECE 3121"]),
    ]);
    expect(papers.get("2nd CT")?.name).toBe("CT2, undated, printed “2nd CT”");
    expect(papers.get("CT2 ECE 3121")?.name).toBe("CT2, undated, printed “CT2 ECE 3121”");
    expect(papers.get("CT1")?.name).toBe("CT1, undated");
  });

  it("shows a paper's code only when the corpus has more than one offering", () => {
    const one = describePapers([sitting("2024 Final", "Final", 2024, ["ECE 3121"])]);
    expect(one.get("2024 Final")?.code).toBeNull();

    const two = describePapers([
      sitting("2024 ECE 3121", "Final", 2024, ["ECE 3121"]),
      sitting("2024 EEE 2107", "Final", 2024, ["EEE 2107"]),
    ]);
    expect(two.get("2024 ECE 3121")).toMatchObject({ name: "2024 Final", code: "ECE 3121" });
    expect(two.get("2024 EEE 2107")).toMatchObject({ name: "2024 Final", code: "EEE 2107" });
  });

  it("says a paper prints no code when the other offerings do", () => {
    const papers = describePapers([
      sitting("2024 ECE 3121", "Final", 2024, ["ECE 3121"]),
      sitting("2024 EEE 2107", "Final", 2024, ["EEE 2107"]),
      sitting("Final Exam", "Final", null, []),
    ]);
    expect(papers.get("Final Exam")?.code).toBe("no code");
  });

  it("marks a paper sectioned only when its questions sit in more than one section", () => {
    const papers = describePapers([
      sitting("CAD 2024", "Final", 2024, ["ECE 3119"], "A"),
      sitting("CAD 2024", "Final", 2024, ["ECE 3119"], "B"),
      sitting("CT4", "CT", null, ["ECE 3119"], "A"),
    ]);
    expect(papers.get("CAD 2024")?.sectioned).toBe(true);
    expect(papers.get("CT4")?.sectioned).toBe(false);
  });
});
