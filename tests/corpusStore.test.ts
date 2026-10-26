import { describe, expect, it } from "vitest";
import { createCorpusStore, type KeyValueStorage } from "@/lib/corpus/store";
import { sampleOutcome } from "@/lib/samples";
import { EMF_QUESTIONS } from "@/tests/fixtures/emf";

/** An in-memory stand-in for localStorage, which outlives any one store. */
function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** A clock that ticks once per call, so save order is unambiguous. */
function tickingClock() {
  let t = 1_000;
  return () => (t += 1);
}

const ct3 = sampleOutcome(EMF_QUESTIONS.filter((q) => q.paper.label === "CT3"));
const finals = sampleOutcome(
  EMF_QUESTIONS.filter((q) => q.paper.label.startsWith("2024")),
);

describe("saved corpora", () => {
  it("keeps a saved corpus, open, after the page that saved it is gone", () => {
    const storage = memoryStorage();
    const saved = createCorpusStore(storage).save(ct3);

    // A fresh store over the same storage is a new visit to the site.
    const revisit = createCorpusStore(storage);
    expect(revisit.current()?.id).toBe(saved.id);
    expect(revisit.current()?.outcome).toEqual(ct3);
  });

  it("lists every saved corpus, most recently saved first", () => {
    const store = createCorpusStore(memoryStorage(), tickingClock());
    const first = store.save(ct3);
    const second = store.save(finals);

    expect(store.list().map((c) => c.id)).toEqual([second.id, first.id]);
  });

  it("reopens a saved corpus from the list", () => {
    const store = createCorpusStore(memoryStorage(), tickingClock());
    const first = store.save(ct3);
    store.save(finals);

    expect(store.open(first.id)?.outcome).toEqual(ct3);
    expect(store.current()?.id).toBe(first.id);
    expect(store.open("no-such-corpus")).toBeNull();
  });

  it("replaces a corpus saved again under the same id", () => {
    const store = createCorpusStore(memoryStorage(), tickingClock());
    const { id } = store.save(ct3);
    store.save(finals, id);

    expect(store.list()).toHaveLength(1);
    expect(store.current()?.outcome).toEqual(finals);
  });

  it("deletes a corpus, and closes it if it was open", () => {
    const store = createCorpusStore(memoryStorage(), tickingClock());
    const first = store.save(ct3);
    const second = store.save(finals);

    store.remove(first.id);
    expect(store.list().map((c) => c.id)).toEqual([second.id]);
    expect(store.current()?.id).toBe(second.id);

    store.remove(second.id);
    expect(store.list()).toEqual([]);
    expect(store.current()).toBeNull();
  });

  it("explains a full browser storage", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };

    expect(() => createCorpusStore(storage).save(ct3)).toThrow(/storage is full/i);
  });
});
