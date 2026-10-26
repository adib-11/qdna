import { isQuestion, isRecord } from "@/lib/corpus/corpusFile";
import type { ExtractionOutcome, Question } from "@/lib/types";

/**
 * Saved corpora, kept in localStorage so a semester's work outlives the tab.
 *
 * The prefix is deliberately outside the extraction cache's namespace
 * (`CACHE_PREFIX`): the cache evicts its whole namespace when storage fills,
 * and that must never take a student's saved corpora with it. Corpora never
 * leave the browser except through an export the student starts.
 */
const CORPUS_PREFIX = "qdna:corpus:v1:";
const OPEN_KEY = "qdna:open-corpus:v1";

const SAMPLE_PREFIX = "sample-";

/**
 * The fixed id a bundled sample is saved under, so opening it again replaces
 * its saved copy instead of piling up duplicates.
 */
export function sampleCorpusId(sampleId: string): string {
  return `${SAMPLE_PREFIX}${sampleId}`;
}

export type KeyValueStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;

export interface SavedCorpus {
  id: string;
  /** Epoch milliseconds of the last save. */
  savedAt: number;
  outcome: ExtractionOutcome;
}

export function createCorpusStore(
  storage: KeyValueStorage,
  now: () => number = Date.now,
) {
  function read(id: string): SavedCorpus | null {
    try {
      const raw = storage.getItem(CORPUS_PREFIX + id);
      const corpus: unknown = raw ? JSON.parse(raw) : null;
      return isSavedCorpus(corpus) ? corpus : null;
    } catch {
      return null;
    }
  }

  function ids(): string[] {
    const found: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(CORPUS_PREFIX)) found.push(key.slice(CORPUS_PREFIX.length));
    }
    return found;
  }

  /** Save a corpus (replacing any under the same id) and make it the open one. */
  function save(
    outcome: ExtractionOutcome,
    id: string = crypto.randomUUID(),
  ): SavedCorpus {
    const corpus: SavedCorpus = { id, savedAt: now(), outcome };
    try {
      storage.setItem(CORPUS_PREFIX + id, JSON.stringify(corpus));
      storage.setItem(OPEN_KEY, id);
    } catch {
      throw new Error(
        "Your browser's storage is full, so this corpus could not be saved. Delete a saved corpus and try again.",
      );
    }
    return corpus;
  }

  return {
    /** Every saved corpus, most recently saved first. */
    list(): SavedCorpus[] {
      return ids()
        .map(read)
        .filter((c): c is SavedCorpus => c !== null)
        .sort((a, b) => b.savedAt - a.savedAt);
    },

    save,

    /**
     * Save the questions an import merged into `corpus`, and open the result.
     * A sample's id is reserved for the pristine sample, which opening the
     * sample again overwrites, so a merge into a sample becomes a new corpus.
     */
    saveImport(corpus: SavedCorpus, questions: Question[]): SavedCorpus {
      const id = corpus.id.startsWith(SAMPLE_PREFIX) ? undefined : corpus.id;
      return save({ ...corpus.outcome, questions }, id);
    },

    /** Make a saved corpus the open one. Null when no such corpus exists. */
    open(id: string): SavedCorpus | null {
      const corpus = read(id);
      if (corpus) storage.setItem(OPEN_KEY, id);
      return corpus;
    },

    /** The corpus the analysis view shows, or null when none is open. */
    current(): SavedCorpus | null {
      const id = storage.getItem(OPEN_KEY);
      return id ? read(id) : null;
    },

    remove(id: string): void {
      storage.removeItem(CORPUS_PREFIX + id);
      if (storage.getItem(OPEN_KEY) === id) storage.removeItem(OPEN_KEY);
    },
  };
}

/** Enough of a shape check that a damaged entry is skipped rather than crashing the analysis. */
function isSavedCorpus(value: unknown): value is SavedCorpus {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.savedAt === "number" &&
    isRecord(value.outcome) &&
    Array.isArray(value.outcome.questions) &&
    value.outcome.questions.every(isQuestion)
  );
}

export type CorpusStore = ReturnType<typeof createCorpusStore>;

/** The store over this browser's localStorage, or null during server rendering. */
export function browserCorpusStore(): CorpusStore | null {
  return typeof window === "undefined"
    ? null
    : createCorpusStore(window.localStorage);
}
