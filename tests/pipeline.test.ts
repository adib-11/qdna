import { describe, expect, it } from "vitest";
import { batchPages } from "@/lib/pdf/batch";
import { createLimiter } from "@/lib/queue/rateLimiter";
import { BATCH_PAGES, MAX_BATCH_BYTES } from "@/lib/config";
import type { PageImage } from "@/lib/types";

const page = (pageIndex: number, bytes: number): PageImage => ({
  pageIndex,
  base64: "x".repeat(8),
  bytes,
  mimeType: "image/jpeg",
});

describe("batchPages", () => {
  // TEST-005
  it("never emits a batch exceeding the byte ceiling", () => {
    const pages = Array.from({ length: 40 }, (_, i) =>
      page(i, 400_000 + ((i * 137_000) % 900_000)),
    );

    for (const batch of batchPages(pages)) {
      const total = batch.reduce((sum, p) => sum + p.bytes, 0);
      if (batch.length > 1) expect(total).toBeLessThanOrEqual(MAX_BATCH_BYTES);
      expect(batch.length).toBeLessThanOrEqual(BATCH_PAGES);
    }
  });

  it("keeps every page exactly once, in order", () => {
    const pages = Array.from({ length: 17 }, (_, i) => page(i, 100_000));
    const flat = batchPages(pages).flat();
    expect(flat.map((p) => p.pageIndex)).toEqual(pages.map((p) => p.pageIndex));
  });

  it("gives an oversized page its own batch rather than dropping it", () => {
    const pages = [page(0, 100), page(1, MAX_BATCH_BYTES + 1), page(2, 100)];
    const batches = batchPages(pages);
    expect(batches.flat()).toHaveLength(3);
    expect(batches.find((b) => b.some((p) => p.pageIndex === 1))).toHaveLength(1);
  });

  it("returns nothing for no pages", () => {
    expect(batchPages([])).toEqual([]);
  });
});

describe("createLimiter", () => {
  // TEST-006
  it("spaces 10 tasks at minIntervalMs = 100 over at least 900 ms", async () => {
    const limiter = createLimiter({ maxConcurrent: 1, minIntervalMs: 100 });
    const started = Date.now();

    await Promise.all(
      Array.from({ length: 10 }, () => limiter.schedule(async () => undefined)),
    );

    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  it("holds concurrency at the configured ceiling", async () => {
    const limiter = createLimiter({ maxConcurrent: 1, minIntervalMs: 0 });
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 6 }, () =>
        limiter.schedule(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 10));
          active--;
        }),
      ),
    );

    expect(peak).toBe(1);
  });

  it("releases its slot when a task throws", async () => {
    const limiter = createLimiter({ maxConcurrent: 1, minIntervalMs: 0 });
    await expect(
      limiter.schedule(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(limiter.schedule(async () => "recovered")).resolves.toBe(
      "recovered",
    );
  });
});
