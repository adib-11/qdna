import { afterEach, describe, expect, it, vi } from "vitest";
import { hashImage } from "@/lib/cache/hashCache";
import { BATCH_PAGES, GEMINI_INLINE_LIMIT_BYTES } from "@/lib/config";
import { describeModelError } from "@/lib/gemini/generate";
import {
  emptyRunMessage,
  runExtraction,
  shortfallNote,
  type ExtractionCache,
} from "@/lib/extract/runExtraction";
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

  describe("when every batch fails", () => {
    afterEach(() => vi.useRealTimers());

    it("keeps the last model error, so spent quota is reported as quota, not as a bad scan", async () => {
      // Only timeouts are faked: hashing still runs on the real event loop.
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const pages = { "a.pdf": [0, 1, 2].map((i) => page("a", i)) };
      const running = runExtraction([file("a.pdf")], {
        loadPages: loadPagesFrom(pages),
        cache: memoryCache(),
        minIntervalMs: 0,
        extractBatch: async () => {
          throw Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });
        },
      });
      // Retries back off; let every backoff run out.
      let settled = false;
      void running.finally(() => (settled = true));
      while (!settled) {
        await new Promise((r) => setImmediate(r));
        await vi.advanceTimersByTimeAsync(1_000);
      }
      const run = await running;

      expect(run.outcome.questions).toHaveLength(0);
      expect(run.lastError).toMatchObject({ status: 429 });
      expect(emptyRunMessage(run, (e) => describeModelError(e, "x"))).toMatch(/out of quota/);
    });
  });

  it("blames the scans only when the model answered with nothing", async () => {
    const run = await runExtraction([file("a.pdf")], {
      loadPages: loadPagesFrom({ "a.pdf": [page("a", 0)] }),
      cache: memoryCache(),
      minIntervalMs: 0,
      extractBatch: async () => [],
    });
    expect(run.lastError).toBeUndefined();
    expect(emptyRunMessage(run, () => "model error")).toMatch(/faint or rotated/);
  });

  it("skips a page over Gemini's inline limit with its own reason, without sending it", async () => {
    let calls = 0;
    const huge = { ...page("big", 0), bytes: GEMINI_INLINE_LIMIT_BYTES + 1 };

    const run = await runExtraction([file("big.jpg"), file("ok.jpg")], {
      loadPages: loadPagesFrom({ "big.jpg": [huge], "ok.jpg": [page("ok", 0)] }),
      cache: memoryCache(),
      minIntervalMs: 0,
      extractBatch: async (batch) => {
        calls++;
        return oneQuestionPerBatch(batch);
      },
    });

    expect(calls).toBe(1);
    expect(run.files[0]).toMatchObject({ pagesTooLarge: 1, pagesFailed: 1, pagesDone: 0 });
    expect(run.files[1]).toMatchObject({ pagesTooLarge: 0, pagesDone: 1 });

    const onlyHuge = await runExtraction([file("big.jpg")], {
      loadPages: loadPagesFrom({ "big.jpg": [huge] }),
      cache: memoryCache(),
      minIntervalMs: 0,
      extractBatch: async () => [],
    });
    expect(emptyRunMessage(onlyHuge, () => "model error")).toMatch(/too large/);
  });

  it("honours a cancel while pages are still being prepared", async () => {
    const controller = new AbortController();
    const seenSignals: (AbortSignal | undefined)[] = [];
    let calls = 0;

    const run = await runExtraction([file("a.pdf"), file("b.pdf")], {
      signal: controller.signal,
      cache: memoryCache(),
      minIntervalMs: 0,
      loadPages: async (_file, signal) => {
        seenSignals.push(signal);
        // The student cancels mid-render; the renderer stops between pages.
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      },
      extractBatch: async () => {
        calls++;
        return [];
      },
    });

    expect(seenSignals).toEqual([controller.signal]);
    expect(run.cancelled).toBe(true);
    expect(calls).toBe(0);
    expect(run.files.map((f) => f.status)).toEqual(["cancelled", "cancelled"]);
  });
});

describe("shortfallNote", () => {
  const progress = { questionsFound: 0, batchesFailed: 1 };

  it("names unreadable pages, a cancel, or both", () => {
    expect(shortfallNote({ ...progress, pagesDone: 2, pagesFailed: 2, pagesTotal: 4 })).toBe(
      "2 pages could not be read.",
    );
    expect(shortfallNote({ ...progress, pagesDone: 2, pagesFailed: 0, pagesTotal: 4 })).toBe(
      "the extraction was cancelled before the rest.",
    );
    expect(shortfallNote({ ...progress, pagesDone: 2, pagesFailed: 1, pagesTotal: 5 })).toBe(
      "1 page could not be read, and the extraction was cancelled before the rest.",
    );
    expect(
      shortfallNote({ ...progress, pagesDone: 1, pagesFailed: 2, pagesTooLarge: 1, pagesTotal: 3 }),
    ).toBe("1 page could not be read, and 1 page was too large to send to Gemini.");
  });
});
