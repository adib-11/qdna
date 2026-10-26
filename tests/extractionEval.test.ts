import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXTRACTION_SETUP } from "@/lib/config";
import type { ModelClient } from "@/lib/gemini/generate";
import type { GroundTruthCourse } from "@/lib/eval/groundTruth";
import {
  CONFIGURATIONS,
  formatResultsTable,
  gateFailures,
  rankRows,
  advanceEval,
  emptyProgress,
  evalRows,
  evalStatus,
  pendingWork,
  quotaDay,
  resultsDoc,
  setExtractionSetup,
  textLayerRecall,
  type EvalProgress,
  type EvalConfiguration,
  type EvalPaper,
  type EvalRow,
} from "@/lib/eval/run";
import { parseTextLayer } from "@/lib/eval/textLayer";

const LABEL = "2018 Final ECE 3207";

const truth: GroundTruthCourse[] = [
  {
    course: "Communication Engineering",
    courseCodes: ["ECE 3207"],
    topicGroupingStatus: "draft",
    topics: ["Noise", "AM"],
    papers: [
      {
        label: LABEL,
        exam: "Final 2018",
        year: 2018,
        source: { file: "pyq.pdf", pages: [1, 2], capture: "scan", textLayer: true },
        questions: [
          { qNo: "1(a)", section: "A", marks: 4, text: "Define noise figure.", topic: "Noise" },
          { qNo: "1(b)", section: "A", marks: 4, text: "Explain AM.", topic: "AM" },
        ],
      },
    ],
  },
];

const page = (pageIndex: number, text = "") => ({
  pageIndex,
  base64: `page-${pageIndex}`,
  mimeType: "image/jpeg",
  bytes: 10,
  text,
});

const paper = (pages = [page(0), page(1)]): EvalPaper => ({ label: LABEL, pages });

/** The model's JSON for the given questions, under a label the model made up. */
const answer = (...qs: Array<[string, number | null, string, string]>) =>
  JSON.stringify({
    questions: qs.map(([qNo, marks, text, topic]) => ({
      course: "Communication Engineering",
      courseCodes: ["ECE 3207"],
      paper: { type: "Final", label: "ECE 3207 (2018)", section: "A", year: 2018 },
      qNo,
      marks,
      text,
      topic,
      isNumerical: false,
    })),
  });

type Reply = { latencyMs: number; text?: string; error?: { status: number } };

/** A client that plays the replies in call order, each after its latency on the fake clock. */
function scripted(replies: Reply[]) {
  const calls: Array<{ model: string; config: Record<string, unknown>; parts: unknown[]; at: number }> = [];
  const client: ModelClient = {
    models: {
      generateContent: async ({ model, config, contents }) => {
        const reply = replies[calls.length];
        calls.push({
          model,
          config: config as Record<string, unknown>,
          parts: (contents as Array<{ parts: unknown[] }>)[0].parts,
          at: Date.now(),
        });
        if (!reply) throw new Error("unscripted request");
        await new Promise((r) => setTimeout(r, reply.latencyMs));
        if (reply.error) throw Object.assign(new Error(`upstream ${reply.error.status}`), reply.error);
        return { text: reply.text };
      },
    },
  };
  return { client, calls };
}

/** Runs the promise to completion, letting every latency and backoff elapse on the fake clock. */
async function settle<T>(running: Promise<T>): Promise<T> {
  let settled = false;
  void running.then(
    () => (settled = true),
    () => (settled = true),
  );
  while (!settled) {
    await new Promise((r) => setImmediate(r));
    await vi.advanceTimersByTimeAsync(1_000);
  }
  return running;
}

describe("quotaDay", () => {
  it("rolls over at midnight Pacific time, not UTC", () => {
    expect(quotaDay(new Date("2026-10-27T06:59:00Z"))).toBe("2026-10-26");
    expect(quotaDay(new Date("2026-10-27T07:00:00Z"))).toBe("2026-10-27");
  });
});

const chain: EvalConfiguration = { name: "Chain", models: ["a"] };
const NOON = new Date("2026-10-26T19:00:00Z"); // noon in Pacific time

type AdvanceOptions = Parameters<typeof advanceEval>[2];

function advance(client: ModelClient, progress: EvalProgress, options: Partial<AdvanceOptions> = {}) {
  return settle(
    advanceEval(client, progress, {
      truth,
      configurations: [chain],
      papers: [paper()],
      minIntervalMs: 0,
      ...options,
    }),
  );
}

const noiseAndAm = answer(["1(a)", 4, "Define noise figure.", "Noise"], ["1(b)", 5, "Explain AM.", "AM"]);

describe("advanceEval", () => {
  // Hashing runs on the real event loop; only timers and the clock are faked.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(NOON);
  });
  afterEach(() => vi.useRealTimers());

  it("measures every paper and scores it against the ground truth under the known label", async () => {
    const { client } = scripted([
      { latencyMs: 20_000, text: noiseAndAm },
      { latencyMs: 10_000, text: noiseAndAm },
    ]);
    const progress = emptyProgress();
    await advance(client, progress);

    expect(evalRows(progress, { truth, configurations: [chain] }, 1)).toEqual([
      expect.objectContaining({
        configuration: "Chain",
        batchSize: 2,
        run: 1,
        batches: 1,
        requests: 1,
        requestsPerPaper: 1,
        papersPerDay: 20,
        failureRate: 0,
        p50Ms: 20_000,
        p95Ms: 20_000,
        recall: 1,
        precision: 1,
        marksAccuracy: 0.5,
        topicsPerQuestion: 1,
        answeredBy: { a: 1 },
      }),
    ]);
  });

  it("re-runs the two best configurations once the first pass is complete", async () => {
    const noiseOnly = answer(["1(a)", 4, "Define noise figure.", "Noise"]);
    const { client, calls } = scripted([
      { latencyMs: 1_000, text: noiseOnly },
      { latencyMs: 1_000, text: noiseAndAm },
      { latencyMs: 1_000, text: answer() },
      { latencyMs: 1_000, text: noiseAndAm },
      { latencyMs: 1_000, text: noiseOnly },
    ]);
    const configurations = ["a", "b", "c"].map((m) => ({ name: m.toUpperCase(), models: [m] }));
    const progress = emptyProgress();
    await advance(client, progress, { configurations });

    expect(calls.map((c) => c.model)).toEqual(["a", "b", "c", "b", "a"]);
    expect(evalRows(progress, { truth, configurations }, 2).map((r) => r.configuration)).toEqual(["A", "B"]);
  });

  it("resumes from saved progress without repeating a measurement", async () => {
    const saved: string[] = [];
    const first = scripted([
      { latencyMs: 1_000, text: noiseAndAm },
      { latencyMs: 1_000, text: noiseAndAm },
    ]);
    await advance(first.client, emptyProgress(), { save: (p) => saved.push(JSON.stringify(p)) });

    const second = scripted([]);
    const progress = JSON.parse(saved.at(-1)!) as EvalProgress;
    await advance(second.client, progress);

    expect(first.calls).toHaveLength(2);
    expect(second.calls).toHaveLength(0);
    expect(evalRows(progress, { truth, configurations: [chain] }, 2)).toHaveLength(1);
  });

  it("stops before a model's daily cap, counting what today already spent", async () => {
    const { client, calls } = scripted([{ latencyMs: 1_000, text: noiseAndAm }]);
    const progress = emptyProgress();
    progress.usage["2026-10-26"] = { a: { requests: 2, spent: false } };
    await advance(client, progress, { caps: { a: 3 } });

    expect(calls).toHaveLength(1);
    expect(progress.usage["2026-10-26"].a.requests).toBe(3);
    expect(pendingWork(progress, { truth, configurations: [chain] }).phase).toBe("finalists");
  });

  it("gives every model a fresh budget on the next Pacific quota day", async () => {
    const { client, calls } = scripted([
      { latencyMs: 1_000, text: noiseAndAm },
      { latencyMs: 1_000, text: noiseAndAm },
    ]);
    const progress = emptyProgress();
    progress.usage["2026-10-25"] = { a: { requests: 3, spent: true } };
    await advance(client, progress, { caps: { a: 3 } });

    expect(calls).toHaveLength(2);
    expect(progress.usage["2026-10-26"].a).toEqual({ requests: 2, spent: false });
  });

  it("retries a rate-limited batch without counting the refused requests", async () => {
    const { client, calls } = scripted([
      { latencyMs: 1_000, error: { status: 429 } },
      { latencyMs: 1_000, error: { status: 429 } },
      { latencyMs: 5_000, text: answer(["1(a)", 4, "Define noise figure.", "Noise"]) },
      { latencyMs: 1_000, text: noiseAndAm },
    ]);
    const progress = emptyProgress();
    await advance(client, progress);
    const [first] = evalRows(progress, { truth, configurations: [chain] }, 1);

    expect(calls).toHaveLength(4);
    expect(first).toMatchObject({ requests: 1, failureRate: 0, recall: 0.5 });
    // The batch's latency is what a student waits: both refusals, both backoffs, the answer.
    expect(first.p50Ms).toBeGreaterThanOrEqual(1_000 + 2_000 + 1_000 + 4_000 + 5_000);
  });

  it("treats a 429 that outlasts the backoff as the model's daily quota, and saves it", async () => {
    const spent = { latencyMs: 1_000, error: { status: 429 } };
    const { client, calls } = scripted(Array(20).fill(spent));
    const saved: EvalProgress[] = [];
    await advance(client, emptyProgress(), { save: (p) => saved.push(structuredClone(p)) });

    expect(calls).toHaveLength(4);
    expect(calls[3].at - calls[2].at).toBeGreaterThanOrEqual(60_000);
    expect(saved.at(-1)).toEqual({
      measurements: {},
      usage: { "2026-10-26": { a: { requests: 4, spent: true } } },
    });
  });

  it("backs off and measures again after a 503 the app's retries could not get past", async () => {
    const busy = { latencyMs: 1_000, error: { status: 503 } };
    const { client, calls } = scripted([busy, busy, busy, { latencyMs: 1_000, text: noiseAndAm }]);
    const progress = emptyProgress();
    await advance(client, progress);

    expect(calls[3].at - calls[2].at).toBeGreaterThanOrEqual(60_000);
    expect(evalRows(progress, { truth, configurations: [chain] }, 1)[0]).toMatchObject({
      requests: 4,
      failureRate: 0,
      recall: 1,
    });
  });

  it("records a batch that keeps failing, or fails outright, as a failure", async () => {
    const busy = { latencyMs: 1_000, error: { status: 503 } };
    const { client, calls } = scripted([...Array(9).fill(busy), { latencyMs: 1_000, error: { status: 400 } }]);
    const progress = emptyProgress();
    await advance(client, progress);
    const spec = { truth, configurations: [chain] };

    expect(calls).toHaveLength(10);
    expect(evalRows(progress, spec, 1)[0]).toMatchObject({ batches: 1, requests: 9, failureRate: 1, recall: 0 });
    expect(evalRows(progress, spec, 1)[0].p95Ms).toBeNaN();
    expect(evalRows(progress, spec, 2)[0]).toMatchObject({ requests: 1, failureRate: 1 });
  });

  it("paces requests across measurements, not only within one", async () => {
    const { client, calls } = scripted([
      { latencyMs: 1_000, text: noiseAndAm },
      { latencyMs: 1_000, text: noiseAndAm },
    ]);
    await advance(client, emptyProgress(), { minIntervalMs: 12_000 });

    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(12_000);
  });
});

describe("evalStatus", () => {
  const configurations = [
    { name: "Flash", models: ["flash", "fallback"] },
    { name: "Flash, low res", models: ["flash", "fallback"] },
    { name: "Lite", models: ["lite"] },
  ];
  // Three papers of 1, 2 and 3 pages: 1, 1 and 2 requests at 2 pages a request.
  const threePapers: GroundTruthCourse[] = [
    {
      ...truth[0],
      papers: [1, 2, 3].map((pages) => ({
        ...truth[0].papers[0],
        label: `paper ${pages}`,
        source: { ...truth[0].papers[0].source, pages: Array.from({ length: pages }, (_, i) => i + 1) },
      })),
    },
  ];
  const spec = { truth: threePapers, configurations, caps: { flash: 5, lite: 3 } };

  it("plans the whole eval from nothing: requests per model, and days under the caps", () => {
    const status = evalStatus(emptyProgress(), spec, NOON);

    expect(status.phase).toBe("first pass");
    expect(status.models).toEqual([
      { model: "flash", cap: 5, usedToday: 0, spentToday: false, sent: 0, left: 8 },
      { model: "lite", cap: 3, usedToday: 0, spentToday: false, sent: 0, left: 4 },
    ]);
    // flash: 5 today, 3 tomorrow; then a day for the finalists.
    expect(status.daysLeft).toBe(3);
    expect(status.next).toBe("measure the first pass: Flash (3 papers), Flash, low res (3 papers), Lite (3 papers)");
  });

  it("counts what is done and what today has already spent", () => {
    const progress = emptyProgress();
    progress.usage["2026-10-25"] = { flash: { requests: 5, spent: true } };
    progress.usage["2026-10-26"] = { flash: { requests: 2, spent: false }, lite: { requests: 1, spent: true } };
    for (const label of ["paper 1", "paper 2", "paper 3"]) {
      progress.measurements[`1|Flash|${label}`] = {
        requests: {},
        answeredBy: {},
        latenciesMs: [],
        batches: 0,
        batchesFailed: 0,
        questions: [],
      };
    }
    const status = evalStatus(progress, spec, NOON);

    expect(status.models).toEqual([
      { model: "flash", cap: 5, usedToday: 2, spentToday: false, sent: 7, left: 4 },
      { model: "lite", cap: 3, usedToday: 1, spentToday: true, sent: 1, left: 4 },
    ]);
    // lite: none today, 3 tomorrow, 1 the day after; then the finalists.
    expect(status.daysLeft).toBe(4);
    expect(status.next).toBe("measure the first pass: Flash, low res (3 papers), Lite (3 papers)");
  });
});

const row = (overrides: Partial<EvalRow>): EvalRow => ({
  configuration: "C",
  batchSize: 2,
  run: 1,
  batches: 6,
  requests: 6,
  papers: 6,
  p50Ms: 20_000,
  p95Ms: 40_000,
  failureRate: 0,
  requestsPerPaper: 1,
  papersPerDay: 20,
  recall: 0.97,
  precision: 0.97,
  marksAccuracy: 0.98,
  topicsPerQuestion: 0.4,
  answeredBy: { m: 6 },
  ...overrides,
});

describe("gates and ranking", () => {
  it("names every gate a row fails", () => {
    expect(gateFailures(row({}))).toEqual([]);
    expect(
      gateFailures(row({ recall: 0.9, marksAccuracy: 0.94, failureRate: 0.03, p95Ms: 50_000 })),
    ).toHaveLength(4);
  });

  it("does not gate latency when no page needed the model", () => {
    expect(gateFailures(row({ batches: 0, requests: 0, p50Ms: NaN, p95Ms: NaN }))).toEqual([]);
  });

  it("ranks passing rows by fewest requests per paper, then failing rows by recall", () => {
    const ranked = rankRows([
      row({ configuration: "fails, best recall", recall: 0.99, p95Ms: 60_000 }),
      row({ configuration: "passes, 2 req", requestsPerPaper: 2 }),
      row({ configuration: "fails, low recall", recall: 0.5 }),
      row({ configuration: "passes, 1 req", requestsPerPaper: 1 }),
    ]);
    expect(ranked.map((r) => r.configuration)).toEqual([
      "passes, 1 req",
      "passes, 2 req",
      "fails, best recall",
      "fails, low recall",
    ]);
  });
});

describe("formatResultsTable", () => {
  it("prints one line per row with every metric and the failed gates", () => {
    const table = formatResultsTable([row({ configuration: "Chain", recall: 0.9 })]);
    const lines = table.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/p50.*p95.*Fail.*Requests.*Recall.*Precision.*Marks.*Topics/);
    expect(lines[2]).toContain("Chain");
    expect(lines[2]).toContain("recall");
  });
});

describe("the configurations", () => {
  it("run the four model setups live, and the app uses one of them", () => {
    expect(CONFIGURATIONS.map((c) => c.name)).toEqual([
      "Flash chain",
      "Flash-Lite, thinking off",
      "Gemma 4",
      "Low media resolution",
    ]);
    expect(CONFIGURATIONS.map((c) => c.name)).toContain(EXTRACTION_SETUP);
  });
});

describe("resultsDoc", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(NOON);
  });
  afterEach(() => vi.useRealTimers());

  it("reports the 2-page numbers for 2, 4 and 8, the re-runs, the winner and the text layer", async () => {
    const configurations = [
      { name: "A", models: ["a"] },
      { name: "B", models: ["b"] },
    ];
    const exact = answer(["1(a)", 4, "Define noise figure.", "Noise"], ["1(b)", 4, "Explain AM.", "AM"]);
    const { client } = scripted(Array(4).fill({ latencyMs: 1_000, text: exact }));
    const progress = emptyProgress();
    await advance(client, progress, { configurations });

    const { markdown, winner, why } = resultsDoc(progress, { truth, configurations }, [
      { label: LABEL, recall: 0.72 },
    ]);
    const tableLines = (heading: string) =>
      markdown.split(`## ${heading}`)[1].split("## ")[0].split("\n").filter((l) => /^\| [AB] \|/.test(l));

    expect(winner).toBe("A");
    expect(why).toMatch(/passes every gate/);
    expect(markdown).toContain("quota days 2026-10-26 to 2026-10-26");
    expect(tableLines("First pass").map((l) => l.split(" | ").slice(0, 3).join(" | "))).toEqual([
      "| A | 2 | 1",
      "| A | 4 | 1",
      "| A | 8 | 1",
      "| B | 2 | 1",
      "| B | 4 | 1",
      "| B | 8 | 1",
    ]);
    expect(tableLines("Finalists re-run")).toHaveLength(4);
    expect(markdown).toMatch(/1-2 pages/);
    expect(markdown).toContain(`${LABEL}: 0.72`);
  });
});

describe("textLayerRecall", () => {
  it("scores each paper with a text layer on the parser alone, and skips scans without one", () => {
    const text = "Section A\nQ.1 (a) Define noise figure. 04\n".padEnd(400, " .");
    const scanned = { ...truth[0].papers[0], label: "scan", source: { ...truth[0].papers[0].source, textLayer: false } };
    const both = [{ ...truth[0], papers: [...truth[0].papers, scanned] }];

    expect(
      textLayerRecall(
        [
          { label: LABEL, pages: [{ text }, { text: "" }] },
          { label: "scan", pages: [{ text: "" }] },
        ],
        both,
      ),
    ).toEqual([{ label: LABEL, recall: 0.5 }]);
  });
});

describe("setExtractionSetup", () => {
  it("finds the setting in the real config", () => {
    const source = readFileSync("lib/config.ts", "utf8");
    expect(setExtractionSetup(source, "Gemma 4", "why")).toContain('EXTRACTION_SETUP = "Gemma 4";');
  });

  it("points the app's config at the winner, citing the results table", () => {
    const source = [
      "export const EXTRACTION_MODEL = \"m\";",
      "// Pending: the extraction eval (docs/extraction-eval.md) is still in progress.",
      "export const EXTRACTION_SETUP = \"Flash chain\";",
      "export const OTHER = 1;",
    ].join("\n");

    expect(setExtractionSetup(source, "Gemma 4", "it passes every gate")).toBe(
      [
        "export const EXTRACTION_MODEL = \"m\";",
        "// Chosen by the extraction eval, docs/extraction-eval.md: it passes every gate.",
        "export const EXTRACTION_SETUP = \"Gemma 4\";",
        "export const OTHER = 1;",
      ].join("\n"),
    );
  });
});

describe("parseTextLayer", () => {
  it("reads question numbers, parts, sections and right-margin marks from a text layer", () => {
    const text = [
      "Course No: ECE 3207            Full Marks: 72",
      "                      Section A",
      "Q.1  (a)  Draw the block diagram of a communication system.     04",
      "     (b)  Classify channels based on fading",
      "          and interference.                                     03",
      "Q.2  (a)  Discuss noise in amplifiers.                          05",
      "                      Section B",
      "Q.5  (a)  State sampling theorem.                               04",
    ].join("\n");

    expect(parseTextLayer(text)).toEqual([
      { qNo: "1(a)", section: "A", marks: 4, text: "Draw the block diagram of a communication system." },
      { qNo: "1(b)", section: "A", marks: 3, text: "Classify channels based on fading and interference." },
      { qNo: "2(a)", section: "A", marks: 5, text: "Discuss noise in amplifiers." },
      { qNo: "5(a)", section: "B", marks: 4, text: "State sampling theorem." },
    ]);
  });
});
