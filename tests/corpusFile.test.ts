import { describe, expect, it } from "vitest";
import {
  CORPUS_FILE_VERSION,
  describeImport,
  exportCorpusFile,
  importCorpusFile,
  mergePapers,
} from "@/lib/corpus/corpusFile";
import type { Question } from "@/lib/types";
import { EMF_QUESTIONS } from "@/tests/fixtures/emf";

const byId = (questions: Question[]) =>
  [...questions].sort((a, b) => a.id.localeCompare(b.id));

describe("corpus file", () => {
  it("round-trips a corpus through export and import", () => {
    const text = exportCorpusFile(EMF_QUESTIONS);
    const result = importCorpusFile([], text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The file groups questions by paper, so compare as a set.
    expect(byId(result.questions)).toEqual(byId(EMF_QUESTIONS));
  });

  it("carries a format version, the questions grouped by paper, and room for topic overrides", () => {
    const file = JSON.parse(exportCorpusFile(EMF_QUESTIONS));

    expect(file.version).toBe(CORPUS_FILE_VERSION);
    expect(file.papers.map((p: { label: string }) => p.label)).toEqual([
      ...new Set(EMF_QUESTIONS.map((q) => q.paper.label)),
    ]);
    expect(file.topicOverrides).toEqual([]);
  });
});

describe("importing a corpus file", () => {
  const ct2 = EMF_QUESTIONS.filter((q) => q.paper.label === "CT2 ECE 3121");
  const ct3 = EMF_QUESTIONS.filter((q) => q.paper.label === "CT3");
  const ct3Edited = ct3.map((q) => ({ ...q, text: `${q.text} (my copy)` }));

  it("adds papers the corpus lacks and keeps the existing copy of a paper it has", () => {
    const result = importCorpusFile(ct3Edited, exportCorpusFile([...ct2, ...ct3]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(byId(result.questions)).toEqual(byId([...ct3Edited, ...ct2]));
  });

  it("reports the papers added and the papers skipped as already present", () => {
    const result = importCorpusFile(ct3Edited, exportCorpusFile([...ct2, ...ct3]));

    expect(result.ok && result.added).toEqual(["CT2 ECE 3121"]);
    expect(result.ok && result.skipped).toEqual(["CT3"]);
  });

  it("summarises the import in one line, naming every paper", () => {
    expect(describeImport(["CT1", "CT2"], ["CT3"])).toBe(
      "2 papers added (CT1, CT2). 1 already present, your copy kept (CT3).",
    );
    expect(describeImport(["CT1"], [])).toBe("1 paper added (CT1).");
    expect(describeImport([], ["CT3", "CT4"])).toBe(
      "No papers added. 2 already present, your copy kept (CT3, CT4).",
    );
  });
});

describe("rejecting a corpus file", () => {
  const corpus = EMF_QUESTIONS.filter((q) => q.paper.label === "CT3");
  const valid = () => JSON.parse(exportCorpusFile(EMF_QUESTIONS));

  /** Imports `text` into a copy of `corpus` and returns the error message. */
  function rejection(text: string): string {
    const before = structuredClone(corpus);
    const result = importCorpusFile(corpus, text);
    expect(result.ok).toBe(false);
    expect(corpus).toEqual(before);
    return result.ok ? "" : result.error;
  }

  it("rejects text that is not JSON", () => {
    expect(rejection("{ not json")).toMatch(/not a qDNA corpus file/i);
  });

  it("rejects JSON that is not a corpus file", () => {
    expect(rejection(JSON.stringify({ hello: "world" }))).toMatch(
      /not a qDNA corpus file/i,
    );
    expect(rejection("[]")).toMatch(/not a qDNA corpus file/i);
  });

  it("rejects an unknown format version, naming it", () => {
    const file = { ...valid(), version: 2 };
    expect(rejection(JSON.stringify(file))).toMatch(/version 2/);
  });

  it("rejects a file whose questions are malformed", () => {
    const file = valid();
    delete file.papers[0].questions[0].text;
    expect(rejection(JSON.stringify(file))).toMatch(/damaged/i);

    const marks = valid();
    marks.papers[1].questions[0].marks = "ten";
    expect(rejection(JSON.stringify(marks))).toMatch(/damaged/i);
  });

  it("rejects a question filed under the wrong paper", () => {
    const file = valid();
    file.papers[0].questions[0].paper.label = "Some other paper";
    expect(rejection(JSON.stringify(file))).toMatch(/damaged/i);
  });

  it("rejects a corpus file that carries no version", () => {
    const { version, ...file } = valid();
    expect(version).toBe(CORPUS_FILE_VERSION);
    expect(rejection(JSON.stringify(file))).toMatch(/damaged/i);
  });

  it("rejects a file that lists the same paper twice", () => {
    const file = valid();
    file.papers.push(file.papers[0]);
    expect(rejection(JSON.stringify(file))).toMatch(/damaged/i);
  });

  it("rejects a file with no papers in it", () => {
    expect(rejection(JSON.stringify({ ...valid(), papers: [] }))).toMatch(
      /no papers/i,
    );
  });
});

describe("topic overrides in a corpus file", () => {
  const ct2 = EMF_QUESTIONS.filter((q) => q.paper.label === "CT2 ECE 3121");
  const ct3 = EMF_QUESTIONS.filter((q) => q.paper.label === "CT3");
  const theirs = [
    { from: ["Gauss's Law", "Electric Flux"], to: "Gauss" },
    { from: ["Capacitance"], to: "Capacitors" },
  ];

  it("travel in the file and come back on import", () => {
    const file = exportCorpusFile(ct2, theirs);

    expect(JSON.parse(file).topicOverrides).toEqual(theirs);
    const result = importCorpusFile([], file);
    expect(result.ok && result.topicOverrides).toEqual(theirs);
  });

  it("let the importer's own overrides win over the imported ones", () => {
    const mine = [{ from: ["Capacitance"], to: "Capacitance & Dielectrics" }];
    const result = importCorpusFile(ct3, exportCorpusFile(ct2, theirs), mine);

    expect(result.ok && result.topicOverrides).toEqual([theirs[0], ...mine]);
  });

  it("keep the importer's overrides when the import adds no papers", () => {
    const mine = [{ from: ["Capacitance"], to: "Capacitors" }];
    const result = importCorpusFile(ct3, exportCorpusFile(ct3, theirs), mine);

    expect(result.ok && result.added).toEqual([]);
    expect(result.ok && result.topicOverrides).toEqual([theirs[0], ...mine]);
  });

  it("reject a file whose overrides are malformed, leaving the corpus untouched", () => {
    for (const topicOverrides of [{}, [{ from: "Capacitance", to: "C" }], [{ from: [], to: "C" }], [{ from: ["C"], to: " " }]]) {
      const file = { ...JSON.parse(exportCorpusFile(ct2)), topicOverrides };
      const result = importCorpusFile(ct3, JSON.stringify(file));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/damaged/i);
    }
  });
});

describe("same-course groups in a corpus file", () => {
  const ct3 = EMF_QUESTIONS.filter((q) => q.paper.label === "CT3");
  const final = EMF_QUESTIONS.filter((q) => q.paper.label === "2024 EEE 2107");
  const joined = [["ECE 3121", "EEE 2107"]];

  it("travel in the file and come back on import, added to the importer's own", () => {
    const mine = [["ECE 3121", "ECE 3221"]];
    const result = importCorpusFile(ct3, exportCorpusFile(final, [], joined), [], mine);

    expect(result.ok && result.sameCourse).toEqual([...mine, ...joined]);
  });

  it("are optional, so a file from before them still imports", () => {
    const file = JSON.parse(exportCorpusFile(final));
    delete file.sameCourse;
    const result = importCorpusFile(ct3, JSON.stringify(file));

    expect(result.ok && result.sameCourse).toEqual([]);
  });

  it("reject a file whose groups are malformed", () => {
    const file = { ...JSON.parse(exportCorpusFile(final)), sameCourse: ["ECE 3121"] };

    expect(importCorpusFile(ct3, JSON.stringify(file)).ok).toBe(false);
  });
});

describe("adding extracted papers to a corpus", () => {
  const ct2 = EMF_QUESTIONS.filter((q) => q.paper.label === "CT2 ECE 3121");
  const ct3 = EMF_QUESTIONS.filter((q) => q.paper.label === "CT3");
  const ct3Again = ct3.map((q) => ({ ...q, text: `${q.text} (extracted again)` }));

  it("skips a paper already in the corpus, keeping the existing copy, as an import does", () => {
    const result = mergePapers(ct3, [...ct3Again, ...ct2]);

    expect(result.added).toEqual(["CT2 ECE 3121"]);
    expect(result.skipped).toEqual(["CT3"]);
    expect(byId(result.questions)).toEqual(byId([...ct3, ...ct2]));
  });
});
