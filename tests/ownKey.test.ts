import { describe, expect, it } from "vitest";
import { createKeyStore, handleModelError, verifyKey } from "@/lib/key/ownKey";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const FAKE_KEY = "fake-key-for-tests";

describe("own key store", () => {
  it("holds a key in memory only, by default", () => {
    const storage = memoryStorage();
    const store = createKeyStore(storage);

    store.set(FAKE_KEY, false);

    expect(store.get()).toBe(FAKE_KEY);
    expect(store.remembered()).toBe(false);
    expect(storage.data.size).toBe(0);
    // A fresh page load (a new store over the same storage) has no key.
    expect(createKeyStore(storage).get()).toBeNull();
  });

  it("remembers a key in this browser when the student opts in", () => {
    const storage = memoryStorage();
    createKeyStore(storage).set(FAKE_KEY, true);

    const reloaded = createKeyStore(storage);
    expect(reloaded.get()).toBe(FAKE_KEY);
    expect(reloaded.remembered()).toBe(true);
  });

  it("forgets a remembered key everywhere", () => {
    const storage = memoryStorage();
    const store = createKeyStore(storage);
    store.set(FAKE_KEY, true);

    store.forget();

    expect(store.get()).toBeNull();
    expect(store.remembered()).toBe(false);
    expect(createKeyStore(storage).get()).toBeNull();
  });

  it("drops a remembered copy when a key is later set for this tab only", () => {
    const storage = memoryStorage();
    const store = createKeyStore(storage);
    store.set("old-fake-key", true);

    store.set(FAKE_KEY, false);

    expect(store.get()).toBe(FAKE_KEY);
    expect(createKeyStore(storage).get()).toBeNull();
  });

  it("tells subscribers when the key changes", () => {
    const store = createKeyStore(memoryStorage());
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);

    store.set(FAKE_KEY, false);
    store.forget();
    unsubscribe();
    store.set(FAKE_KEY, false);

    expect(calls).toBe(2);
  });

  it("works with no storage at all, in memory", () => {
    const store = createKeyStore(null);
    store.set(FAKE_KEY, true);
    expect(store.get()).toBe(FAKE_KEY);
  });
});

describe("verifyKey", () => {
  /** A fetch stub that records the request and answers with the given status. */
  function stubFetch(status: number | Error) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (status instanceof Error) throw status;
      return new Response("{}", { status });
    };
    return { calls, fetchImpl: fetchImpl as typeof fetch };
  }

  it("checks the key with a cheap models-list call sent to Google only", async () => {
    const { calls, fetchImpl } = stubFetch(200);

    await expect(verifyKey(` ${FAKE_KEY} `, fetchImpl)).resolves.toEqual({
      ok: true,
      key: FAKE_KEY,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin).toBe("https://generativelanguage.googleapis.com");
    expect(url.pathname).toBe("/v1beta/models");
    // The key travels in a header, never in the URL.
    expect(calls[0].url).not.toContain(FAKE_KEY);
    expect(new Headers(calls[0].init?.headers).get("x-goog-api-key")).toBe(FAKE_KEY);
  });

  it("gives an invalid key a clear message", async () => {
    const { fetchImpl } = stubFetch(400);
    const result = await verifyKey(FAKE_KEY, fetchImpl);
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/rejected/i) });
  });

  it("says so when Google cannot be reached, rather than blaming the key", async () => {
    const { fetchImpl } = stubFetch(new TypeError("Failed to fetch"));
    const result = await verifyKey(FAKE_KEY, fetchImpl);
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/reach Google/i) });
  });

  it("asks for a key before calling anything when the field is empty", async () => {
    const { calls, fetchImpl } = stubFetch(200);
    const result = await verifyKey("   ", fetchImpl);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("handleModelError", () => {
  it("forgets a key Google rejects mid-session, so the next model action prompts again", () => {
    const storage = memoryStorage();
    const store = createKeyStore(storage);
    store.set(FAKE_KEY, true);
    const rejected = Object.assign(new Error("API key not valid. Please pass a valid API key."), {
      status: 400,
    });

    const message = handleModelError(rejected, "fallback", store);

    expect(message).toMatch(/rejected your Gemini key/);
    expect(store.get()).toBeNull();
    expect(createKeyStore(storage).get()).toBeNull();
  });

  it("keeps the key for any other failure, such as spent quota", () => {
    const store = createKeyStore(memoryStorage());
    store.set(FAKE_KEY, false);

    const message = handleModelError(Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 }), "x", store);

    expect(message).toMatch(/out of quota/);
    expect(store.get()).toBe(FAKE_KEY);
  });
});
