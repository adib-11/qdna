import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis";
import { studyPack, TUTOR_INSTRUCTIONS } from "@/lib/corpus/studyPack";
import { EMF_QUESTIONS } from "@/tests/fixtures/emf";

const result = analyze(EMF_QUESTIONS);
const pack = studyPack(result);

describe("study pack", () => {
  it("opens with the fixed tutor instruction block", () => {
    expect(pack.startsWith(TUTOR_INSTRUCTIONS)).toBe(true);
    expect(TUTOR_INSTRUCTIONS).toContain(
      "Tutor me on these topics in this order. Quiz me. Give hints before answers. Cite the source question",
    );
  });

  it("contains every question verbatim", () => {
    for (const q of result.questions) expect(pack).toContain(q.text);
  });

  it("lists the study plan, then every topic, in study plan order", () => {
    const at = (topic: string) => pack.indexOf(`### ${topic}`);
    const order = result.stats.map((s) => at(s.topic));

    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const plan = result.studyPlan.topics.map((t, i) =>
      pack.indexOf(`${i + 1}. **${t.topic}**`),
    );
    expect(plan.every((i) => i > pack.indexOf("## Study plan"))).toBe(true);
    expect([...plan].sort((a, b) => a - b)).toEqual(plan);
    expect(plan.at(-1)).toBeLessThan(order[0]);
  });

  it("cites each question's paper, number and marks", () => {
    const q = EMF_QUESTIONS[0];
    const marked = studyPack(
      analyze([{ ...q, marks: 7, qNo: "3(c)", paper: { ...q.paper, label: "2024 Final", section: "B" } }]),
    );
    expect(marked).toContain(`**2024 Final, Section B, Q3(c), 7 marks**\n${q.text}`);

    const printed = studyPack(
      analyze([{ ...q, marks: null, qNo: "Q.1(b)", paper: { ...q.paper, section: "SECTION-A" } }]),
    );
    expect(printed).toContain(`, SECTION-A, Q.1(b), marks not stated**`);
  });

  it("ends with the lineages", () => {
    const lineages = pack.indexOf("## Lineages");
    expect(lineages).toBeGreaterThan(0);
    expect(pack.lastIndexOf("### ")).toBeGreaterThan(lineages);
  });
});
