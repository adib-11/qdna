import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelClient } from "@/lib/gemini/generate";
import type { GroundTruthCourse } from "@/lib/eval/groundTruth";
import {
  BATCH_SIZES,
  CONFIGURATIONS,
  formatResultsTable,
  gateFailures,
  rankRows,
  runConfiguration,
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
  const calls: Array<{ model: string; config: Record<string, unknown>; parts: unknown[] }> = [];
  const client: ModelClient = {
    models: {
      generateContent: async ({ model, config, contents }) => {
        const reply = replies[calls.length];
        calls.push({
          model,
          config: config as Record<string, unknown>,
          parts: (contents as Array<{ parts: unknown[] }>)[0].parts,
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

const chain: EvalConfiguration = { name: "Chain", models: ["a"] };

const evaluate = (
  client: ModelClient,
  options: Partial<Parameters<typeof runConfiguration>[1]> = {},
) =>
  settle(
    runConfiguration(client, {
      configuration: chain,
      batchSize: 2,
      papers: [paper()],
      truth,
      minIntervalMs: 0,
      ...options,
    }),
  );

describe("runConfiguration", () => {
  // Hashing runs on the real event loop; only timers and the clock are faked.
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }));
  afterEach(() => vi.useRealTimers());

  it("scores a run against the ground truth under the known paper label", async () => {
    const { client } = scripted([
      {
        latencyMs: 20_000,
        text: answer(["1(a)", 4, "Define noise figure.", "Noise"], ["1(b)", 5, "Explain AM.", "AM"]),
      },
    ]);
    const row = await evaluate(client);

    expect(row).toMatchObject({
      configuration: "Chain",
      batchSize: 2,
      run: 1,
      batches: 1,
      requests: 1,
      requestsPerPaper: 1,
      failureRate: 0,
      p50Ms: 20_000,
      p95Ms: 20_000,
      recall: 1,
      precision: 1,
      marksAccuracy: 0.5,
      topicsPerQuestion: 1,
      answeredBy: { a: 1 },
    });
  });

  it("splits a paper into batches of the given size and reports latency percentiles", async () => {
    const { client, calls } = scripted([
      { latencyMs: 10_000, text: answer() },
      { latencyMs: 30_000, text: answer() },
    ]);
    const row = await evaluate(client, { papers: [paper([page(0), page(1), page(2)])] });

    expect(calls.map((c) => c.parts.length - 1)).toEqual([2, 1]);
    expect(row).toMatchObject({ batches: 2, requests: 2, p50Ms: 10_000, p95Ms: 30_000 });
  });

  it("sends the configuration's models and settings over the app's prompt and schema", async () => {
    const { client, calls } = scripted([{ latencyMs: 1_000, text: answer() }]);
    await evaluate(client, {
      configuration: { name: "Lite", models: ["lite"], config: { thinkingConfig: { thinkingBudget: 0 } } },
      batchSize: 8,
    });

    expect(calls[0].model).toBe("lite");
    expect(calls[0].config).toMatchObject({
      responseMimeType: "application/json",
      temperature: 0,
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(calls[0].config.responseSchema).toBeDefined();
  });

  it("retries a rate-limited batch without counting the refused requests", async () => {
    const { client, calls } = scripted([
      { latencyMs: 1_000, error: { status: 429 } },
      { latencyMs: 1_000, error: { status: 429 } },
      { latencyMs: 5_000, text: answer(["1(a)", 4, "Define noise figure.", "Noise"]) },
    ]);
    const row = await evaluate(client);

    expect(calls).toHaveLength(3);
    expect(row).toMatchObject({ requests: 1, failureRate: 0, p50Ms: 5_000, recall: 0.5 });
  });

  it("stops when the quota stays spent, rather than scoring quota as failures", async () => {
    const spent = { latencyMs: 1_000, error: { status: 429 } };
    const { client } = scripted([spent, spent, spent]);
    await expect(evaluate(client)).rejects.toThrow(/quota/i);
  });

  it("records a batch that fails outright, and one that keeps timing out, as failures", async () => {
    const timeout = { latencyMs: 1_000, error: { status: 504 } };
    const { client } = scripted([{ latencyMs: 1_000, error: { status: 400 } }, timeout, timeout, timeout]);
    const row = await evaluate(client, { batchSize: 1 });

    expect(row).toMatchObject({ batches: 2, requests: 4, failureRate: 1, recall: 0 });
    expect(row.p95Ms).toBeNaN();
  });

  it("reads text-layer pages without the model and sends only the rest", async () => {
    const textPage = page(0, "Section A\nQ.1 (a) Define noise figure. 04\n".padEnd(400, " ."));
    const { client, calls } = scripted([
      { latencyMs: 1_000, text: answer(["1(b)", 4, "Explain AM.", "AM"]) },
    ]);
    const row = await evaluate(client, {
      configuration: { name: "Text first", models: ["a"], textLayerFirst: true },
      papers: [paper([textPage, page(1)])],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].parts).toHaveLength(2);
    expect(row).toMatchObject({ requests: 1, recall: 1 });
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
  it("cover the five configurations at 2, 4 and 8 pages per request", () => {
    expect(BATCH_SIZES).toEqual([2, 4, 8]);
    expect(CONFIGURATIONS).toHaveLength(5);
    expect(CONFIGURATIONS.filter((c) => c.textLayerFirst)).toHaveLength(1);
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
