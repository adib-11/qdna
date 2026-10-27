import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis";
import { describeAdded } from "@/lib/corpus/addPapers";
import type { Question } from "@/lib/types";

/** One question per topic in `topics`, on paper `label`. */
function paper(label: string, topics: string[]): Question[] {
  return topics.map((topic, i) => ({
    id: `${label}::${i + 1}`,
    course: "Computer Architecture",
    courseCodes: ["ECE 3119"],
    paper: { type: "Final", label, section: null, year: 2024 },
    qNo: String(i + 1),
    marks: 5,
    text: `${label} question ${i + 1} on ${topic}`,
    topic,
    isNumerical: false,
  }));
}

describe("describeAdded", () => {
  const before = analyze([
    ...paper("2021 Final", ["Cache", "Cache", "Cache", "Pipelining"]),
    ...paper("2022 Final", ["Pipelining", "Interrupts"]),
  ]);

  it("names the paper, the questions it added, its new topics and the biggest rank move", () => {
    const after = analyze([
      ...before.questions,
      ...paper("2023 Final", ["Interrupts", "Interrupts", "Interrupts", "Buses"]),
    ]);

    expect(describeAdded(before, after, ["2023 Final"], [])).toBe(
      "Added 2023 Final: 4 questions, 1 new topic, Interrupts moved from 3rd to 1st.",
    );
  });

  it("leaves out the move when no topic moved, and names every skipped paper", () => {
    const after = analyze([
      ...before.questions,
      ...paper("2023 Final", ["Cache", "Buses"]),
      ...paper("2023 CT", ["Memory"]),
    ]);

    expect(describeAdded(before, after, ["2023 Final", "2023 CT"], ["2022 Final"])).toBe(
      "Added 2023 Final and 2023 CT: 3 questions, 2 new topics. 2022 Final is already in this corpus, skipped.",
    );
  });

  it("never reports a topic that only fell, pushed down by a new one", () => {
    const after = analyze([
      ...before.questions,
      ...paper("2023 Final", ["Buses", "Buses", "Buses", "Buses"]),
    ]);

    expect(describeAdded(before, after, ["2023 Final"], [])).toBe(
      "Added 2023 Final: 4 questions, 1 new topic.",
    );
  });

  it("says when every paper was skipped", () => {
    expect(describeAdded(before, before, [], ["2021 Final", "2022 Final"])).toBe(
      "2021 Final and 2022 Final are already in this corpus, skipped.",
    );
  });
});
