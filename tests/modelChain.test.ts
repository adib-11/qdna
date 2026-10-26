import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateWithFallback,
  type GenerateOptions,
  type ModelClient,
} from "@/lib/gemini/generate";

type Behaviour = (signal: AbortSignal | undefined) => Promise<{ text?: string }>;

/** A model client whose every model behaves as scripted, recording the order it was asked in. */
function fakeClient(behaviours: Record<string, Behaviour>) {
  const tried: string[] = [];
  const client: ModelClient = {
    models: {
      generateContent: async ({ model, config }) => {
        tried.push(model);
        const behaviour = behaviours[model];
        if (!behaviour) throw new Error(`unscripted model ${model}`);
        return behaviour(config?.abortSignal);
      },
    },
  };
  return { client, tried };
}

const answers = (text: string): Behaviour => async () => ({ text });
const fails = (status: number, message = `upstream ${status}`): Behaviour => async () => {
  throw Object.assign(new Error(message), { status });
};
/** Never answers on its own; only an abort ends it. */
const hangs: Behaviour = (signal) =>
  new Promise((_, reject) => {
    signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError")),
    );
  });

const options = (models: string[], extra: Partial<GenerateOptions> = {}): GenerateOptions => ({
  parts: [{ text: "hello" }],
  models,
  budgetMs: 60_000,
  maxAttemptMs: 20_000,
  ...extra,
});

describe("generateWithFallback", () => {
  it("returns the first model's answer without trying the rest", async () => {
    const { client, tried } = fakeClient({ a: answers("from a"), b: answers("from b") });
    await expect(generateWithFallback(client, options(["a", "b"]))).resolves.toBe("from a");
    expect(tried).toEqual(["a"]);
  });

  it("walks the chain in order on quota, overload and missing-model errors", async () => {
    const { client, tried } = fakeClient({
      a: fails(429, "RESOURCE_EXHAUSTED"),
      b: fails(503),
      c: fails(404),
      d: answers("from d"),
    });
    await expect(
      generateWithFallback(client, options(["a", "b", "c", "d"])),
    ).resolves.toBe("from d");
    expect(tried).toEqual(["a", "b", "c", "d"]);
  });

  it("stops on any other error, because another model would only repeat it", async () => {
    const { client, tried } = fakeClient({
      a: fails(400, "API key not valid"),
      b: answers("from b"),
    });
    await expect(generateWithFallback(client, options(["a", "b"]))).rejects.toThrow(
      "API key not valid",
    );
    expect(tried).toEqual(["a"]);
  });

  it("throws the last quota error once every model is spent", async () => {
    const { client, tried } = fakeClient({ a: fails(429), b: fails(429) });
    await expect(generateWithFallback(client, options(["a", "b"]))).rejects.toMatchObject({
      status: 429,
    });
    expect(tried).toEqual(["a", "b"]);
  });

  describe("deadlines", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("abandons a model that will not answer within the attempt cap and tries the next", async () => {
      const { client, tried } = fakeClient({ a: hangs, b: answers("from b") });
      const run = generateWithFallback(client, options(["a", "b"]));

      await vi.advanceTimersByTimeAsync(20_000);

      await expect(run).resolves.toBe("from b");
      expect(tried).toEqual(["a", "b"]);
    });

    it("stops walking once the budget cannot fit another attempt", async () => {
      const { client, tried } = fakeClient({ a: hangs, b: hangs, c: answers("from c") });
      // 30s budget, 20s cap: a runs 20s, b gets the 7s left (under the 8s floor), so c never starts.
      const run = generateWithFallback(
        client,
        options(["a", "b", "c"], { budgetMs: 30_000 }),
      );
      const settled = expect(run).rejects.toThrow(/did not answer/);

      await vi.advanceTimersByTimeAsync(30_000);

      await settled;
      expect(tried).toEqual(["a"]);
    });

    it("ends at once when the caller cancels, without trying another model", async () => {
      const { client, tried } = fakeClient({ a: hangs, b: answers("from b") });
      const controller = new AbortController();
      const run = generateWithFallback(
        client,
        options(["a", "b"], { signal: controller.signal }),
      );
      const settled = expect(run).rejects.toMatchObject({ name: "AbortError" });

      await vi.advanceTimersByTimeAsync(1_000);
      controller.abort();

      await settled;
      expect(tried).toEqual(["a"]);
    });
  });
});
