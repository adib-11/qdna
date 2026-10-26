import { describe, expect, it } from "vitest";
import type { GenerateContentParameters } from "@google/genai";
import { EXTRACTION_MODEL } from "@/lib/config";
import { extractQuestions } from "@/lib/gemini/extract";
import { describeModelError, type ModelClient } from "@/lib/gemini/generate";
import { writeHint } from "@/lib/gemini/hint";
import { writePracticePaper } from "@/lib/gemini/practicePaper";
import type { PaperShape } from "@/lib/types";

/** A client that answers every request with `text`, recording what it was sent. */
function replying(text: string | undefined) {
  const requests: GenerateContentParameters[] = [];
  const client: ModelClient = {
    models: {
      generateContent: async (params) => {
        requests.push(params);
        return { text };
      },
    },
  };
  return { client, requests };
}

const shape: PaperShape = {
  course: "Software Engineering",
  courseCodes: ["CSE 3205"],
  type: "Final",
  sections: [
    { name: "A", questionsPerPaper: 2, papersPresentIn: 3, markValues: [10] },
  ],
  questionsPerPaper: 2,
  marksPerPaper: 20,
  paperCount: 3,
};

describe("extractQuestions", () => {
  it("sends each page with its own image type and gives every question an id", async () => {
    const { client, requests } = replying(
      JSON.stringify({
        questions: [{ paper: { label: "2024 Final" }, qNo: "1(a)", text: "Define SDLC." }],
      }),
    );

    const questions = await extractQuestions(client, [
      { base64: "AAAA", mimeType: "image/jpeg" },
      { base64: "BBBB", mimeType: "image/heic" },
    ]);

    expect(requests[0].model).toBe(EXTRACTION_MODEL);
    const parts = (requests[0].contents as { parts: unknown[] }[])[0].parts;
    expect(parts.slice(1)).toEqual([
      { inlineData: { mimeType: "image/jpeg", data: "AAAA" } },
      { inlineData: { mimeType: "image/heic", data: "BBBB" } },
    ]);
    expect(questions[0].id).toBe("2024 Final::1(a)");
  });
});

describe("writePracticePaper", () => {
  const topics = [{ topic: "SDLC", count: 6, papers: ["a", "b"], examples: ["Explain SDLC."] }];

  it("keeps only questions on corpus topics and sections", async () => {
    const { client } = replying(
      JSON.stringify({
        title: "",
        instructions: "Answer all.",
        questions: [
          { section: "A", qNo: "1", text: "Explain the waterfall model.", marks: 10, topic: "SDLC", isNumerical: false, rationale: "Asked 6 times." },
          { section: "A", qNo: "2", text: "Off-corpus topic.", marks: 10, topic: "Invented", isNumerical: false, rationale: "" },
          { section: "Z", qNo: "3", text: "Off-shape section.", marks: 10, topic: "SDLC", isNumerical: false, rationale: "" },
        ],
      }),
    );

    const paper = await writePracticePaper(client, { shape, topics });

    expect(paper.questions.map((q) => q.qNo)).toEqual(["1"]);
    expect(paper.title).toBe("Software Engineering — practice paper");
  });

  it("fails clearly when nothing usable comes back", async () => {
    const { client } = replying(JSON.stringify({ questions: [] }));
    await expect(writePracticePaper(client, { shape, topics })).rejects.toThrow(
      /no usable questions/,
    );
  });
});

describe("writeHint", () => {
  it("returns the trimmed hint, and fails on an empty one", async () => {
    const input = { question: { text: "Define coupling." } };
    await expect(writeHint(replying("  Think about dependencies.  ").client, input)).resolves.toBe(
      "Think about dependencies.",
    );
    await expect(writeHint(replying("   ").client, input)).rejects.toThrow(/empty hint/);
  });
});

describe("describeModelError", () => {
  it("names a rejected key and spent quota plainly", () => {
    const rejected = Object.assign(new Error("API key not valid. Please pass a valid API key."), { status: 400 });
    const spent = Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });

    expect(describeModelError(rejected, "x")).toMatch(/rejected your Gemini key/);
    expect(describeModelError(spent, "x")).toMatch(/out of quota/);
    expect(describeModelError("weird", "fallback")).toBe("fallback");
  });
});
