import { describe, expect, it } from "vitest";
import { hashImage } from "@/lib/cache/hashCache";
import { BATCH_PAGES } from "@/lib/config";
import { runExtraction, type ExtractionCache } from "@/lib/extract/runExtraction";
import { pagesOf, uploadKind } from "@/lib/extract/uploads";
import type { PageImage, Question } from "@/lib/types";

const page = (file: string, pageIndex: number, mimeType = "image/jpeg"): PageImage => ({
  pageIndex,
  base64: btoa(`${file}-page-${pageIndex}`),
  bytes: 100,
  mimeType,
});

const question = (label: string, qNo: string): Question => ({
  id: `${label}::${qNo}`,
  course: "Test Course",
  courseCodes: ["TST 1001"],
  paper: { type: "Final", label, section: null, year: 2024 },
  qNo,
  marks: 5,
  text: `Question ${qNo} of ${label}`,
  topic: "Testing",
  isNumerical: false,
});

/** One question per batch, named after the batch's first page, so results are traceable. */
const oneQuestionPerBatch = async (pages: PageImage[]) => [
  question(atob(pages[0].base64).split("-page-")[0], String(pages[0].pageIndex)),
];

function memoryCache(): ExtractionCache & { data: Map<string, Question[]> } {
  const data = new Map<string, Question[]>();
  return { data, get: (h) => data.get(h) ?? null, set: (h, q) => void data.set(h, q) };
}

const file = (name: string, type = "") => new File(["x"], name, { type });

/** Each file name maps to its pages; no rendering happens in these tests. */
const loadPagesFrom = (pagesByFile: Record<string, PageImage[]>) => async (f: File) =>
  pagesByFile[f.name];

describe("uploadKind", () => {
  it("accepts PDFs, and JPG, PNG and HEIC photos, by type or by extension", () => {
    expect(uploadKind(file("paper.pdf", "application/pdf"))).toEqual({ kind: "pdf" });
    expect(uploadKind(file("PAPER.PDF"))).toEqual({ kind: "pdf" });
    expect(uploadKind(file("page.jpg", "image/jpeg"))).toEqual({ kind: "image", mimeType: "image/jpeg" });
    expect(uploadKind(file("page.JPEG"))).toEqual({ kind: "image", mimeType: "image/jpeg" });
    expect(uploadKind(file("page.png", "image/png"))).toEqual({ kind: "image", mimeType: "image/png" });
    expect(uploadKind(file("IMG_0001.HEIC", "image/heic"))).toEqual({ kind: "image", mimeType: "image/heic" });
    // Many browsers report no type at all for HEIC.
    expect(uploadKind(file("IMG_0002.heic"))).toEqual({ kind: "image", mimeType: "image/heic" });
  });

  it("rejects anything else", () => {
    expect(uploadKind(file("notes.docx"))).toBeNull();
    expect(uploadKind(file("scan.gif", "image/gif"))).toBeNull();
  });
});

describe("pagesOf", () => {
  it("turns a photo into one page, as is, with its own image type", async () => {
    const photo = new File([new Uint8Array([0xde, 0xad, 0xbe, 0xef])], "IMG_0003.heic");
    const pages = await pagesOf(photo);
    expect(pages).toEqual([
      { pageIndex: 0, base64: "3q2+7w==", bytes: 8, mimeType: "image/heic" },
    ]);
  });
});

describe("runExtraction", () => {
  it("sends photos through the same batching and extraction as PDF pages", async () => {
    const seen: PageImage[][] = [];
    const photos = [
      new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array([2])], "b.png", { type: "image/png" }),
      new File([new Uint8Array([3])], "c.heic"),
    ];

    const { outcome } = await runExtraction(photos, {
      extractBatch: async (pages) => {
        seen.push(pages);
        return [question("Photo paper", String(seen.length))];
      },
      cache: memoryCache(),
      minIntervalMs: 0,
    });

    expect(seen.map((batch) => batch.map((p) => p.mimeType))).toEqual([
      ["image/jpeg"],
      ["image/png"],
      ["image/heic"],
    ]);
    expect(outcome.questions).toHaveLength(3);
    expect(outcome.partial).toBe(false);
  });

  it("reports progress per paper, never batching across files", async () => {
    const seen: PageImage[][] = [];
    const snapshots: { name: string; pagesDone: number; pagesTotal: number }[][] = [];
    const pages = {
      "a.pdf": [0, 1, 2].map((i) => page("a", i)),
      "b.pdf": [page("b", 0)],
    };

    const { files } = await runExtraction([file("a.pdf"), file("b.pdf")], {
      loadPages: loadPagesFrom(pages),
      extractBatch: async (batch) => {
        seen.push(batch);
        return oneQuestionPerBatch(batch);
      },
      onProgress: (progress) =>
        snapshots.push(progress.map(({ name, pagesDone, pagesTotal }) => ({ name, pagesDone, pagesTotal }))),
      cache: memoryCache(),
      minIntervalMs: 0,
    });

    for (const batch of seen) {
      expect(batch.length).toBeLessThanOrEqual(BATCH_PAGES);
      expect(new Set(batch.map((p) => atob(p.base64).split("-")[0])).size).toBe(1);
    }
    expect(files.map(({ name, pagesDone, pagesTotal, status }) => ({ name, pagesDone, pagesTotal, status }))).toEqual([
      { name: "a.pdf", pagesDone: 3, pagesTotal: 3, status: "done" },
      { name: "b.pdf", pagesDone: 1, pagesTotal: 1, status: "done" },
    ]);
    // Mid-run, the first paper moves while the second is still waiting.
    expect(snapshots).toContainEqual([
      { name: "a.pdf", pagesDone: 2, pagesTotal: 3 },
      { name: "b.pdf", pagesDone: 0, pagesTotal: 1 },
    ]);
  });

  it("stops on cancel, keeping and caching the pages that already finished", async () => {
    const controller = new AbortController();
    const cache = memoryCache();
    const pages = { "a.pdf": [0, 1, 2, 3, 4].map((i) => page("a", i)) };
    let calls = 0;

    const { outcome, cancelled, files } = await runExtraction([file("a.pdf")], {
      loadPages: loadPagesFrom(pages),
      signal: controller.signal,
      cache,
      minIntervalMs: 0,
      extractBatch: async (batch, signal) => {
        calls++;
        if (calls === 1) return oneQuestionPerBatch(batch);
        // The student cancels while the second batch is in flight.
        controller.abort();
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        return [];
      },
    });

    expect(cancelled).toBe(true);
    expect(calls).toBe(2);
    expect(outcome.questions.map((q) => q.qNo)).toEqual(["0"]);
    expect(outcome.progress).toMatchObject({ pagesDone: 2, pagesTotal: 5, pagesFailed: 0 });
    expect(outcome.partial).toBe(true);
    expect(files[0].status).toBe("cancelled");
    // The finished batch is cached, so running again does not pay for it.
    const firstBatchHash = await hashImage(pages["a.pdf"].slice(0, 2).map((p) => p.base64));
    expect(cache.data.get(firstBatchHash)?.map((q) => q.qNo)).toEqual(["0"]);
  });

  it("never pays twice for pages already in the cache", async () => {
    const cache = memoryCache();
    const pages = { "a.pdf": [0, 1].map((i) => page("a", i)) };
    const options = { loadPages: loadPagesFrom(pages), cache, minIntervalMs: 0 };
    let calls = 0;
    const counting = async (batch: PageImage[]) => {
      calls++;
      return oneQuestionPerBatch(batch);
    };

    await runExtraction([file("a.pdf")], { ...options, extractBatch: counting });
    const again = await runExtraction([file("a.pdf")], { ...options, extractBatch: counting });

    expect(calls).toBe(1);
    expect(again.outcome.questions).toHaveLength(1);
  });

  it("records a failed batch and keeps the rest", async () => {
    const pages = { "a.pdf": [0, 1, 2, 3].map((i) => page("a", i)) };

    const { outcome, files } = await runExtraction([file("a.pdf")], {
      loadPages: loadPagesFrom(pages),
      cache: memoryCache(),
      minIntervalMs: 0,
      extractBatch: async (batch) => {
        if (batch[0].pageIndex === 0) {
          throw Object.assign(new Error("Bad request"), { status: 400 });
        }
        return oneQuestionPerBatch(batch);
      },
    });

    expect(outcome.questions.map((q) => q.qNo)).toEqual(["2"]);
    expect(outcome.partial).toBe(true);
    expect(outcome.progress).toMatchObject({ pagesFailed: 2, batchesFailed: 1, pagesDone: 2 });
    expect(files[0]).toMatchObject({ pagesFailed: 2, status: "done" });
  });

  it("stops at once when Google rejects the key, since every batch would fail the same way", async () => {
    const pages = { "a.pdf": [0, 1, 2, 3].map((i) => page("a", i)) };
    let calls = 0;

    await expect(
      runExtraction([file("a.pdf")], {
        loadPages: loadPagesFrom(pages),
        cache: memoryCache(),
      minIntervalMs: 0,
        extractBatch: async () => {
          calls++;
          throw Object.assign(new Error("API key not valid. Please pass a valid API key."), {
            status: 400,
          });
        },
      }),
    ).rejects.toThrow(/API key not valid/);
    expect(calls).toBe(1);
  });
});
