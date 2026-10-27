import type { TopicGrouping, TopicOverride } from "@/lib/analysis/topics";
import {
  isOptionalSameCourse,
  isQuestion,
  isRecord,
  isTopicOverride,
} from "@/lib/corpus/corpusFile";
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
  /** The latest topic grouping, absent until it has run. */
  topicGrouping?: TopicGrouping;
  /** The student's topic overrides, in the order they were made. */
  topicOverrides?: TopicOverride[];
  /** Groups of course codes the student said are one course. */
  sameCourse?: string[][];
}

/** What a corpus keeps besides its questions. */
type CorpusTopics = Pick<SavedCorpus, "topicGrouping" | "topicOverrides">;
type CorpusExtras = CorpusTopics & Pick<SavedCorpus, "sameCourse">;

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

  function write(corpus: SavedCorpus, open: boolean): SavedCorpus {
    try {
      storage.setItem(CORPUS_PREFIX + corpus.id, JSON.stringify(corpus));
      if (open) storage.setItem(OPEN_KEY, corpus.id);
    } catch {
      throw new Error(
        "Your browser's storage is full, so this corpus could not be saved. Delete a saved corpus and try again.",
      );
    }
    return corpus;
  }

  /** Save a corpus (replacing any under the same id) and make it the open one. */
  function save(
    outcome: ExtractionOutcome,
    id: string = crypto.randomUUID(),
    extras: CorpusExtras = {},
  ): SavedCorpus {
    return write({ id, savedAt: now(), outcome, ...extras }, true);
  }

  /**
   * Save `corpus` with new questions (papers imported, added or removed), and
   * open the result.
   * A sample's id is reserved for the pristine sample, which opening the
   * sample again overwrites, so a merge into a sample becomes a new corpus.
   */
  function saveImport(
    corpus: SavedCorpus,
    questions: Question[],
    topicOverrides = corpus.topicOverrides,
    sameCourse = corpus.sameCourse,
  ): SavedCorpus {
    const id = corpus.id.startsWith(SAMPLE_PREFIX) ? undefined : corpus.id;
    return save({ ...corpus.outcome, questions }, id, {
      topicGrouping: corpus.topicGrouping,
      topicOverrides,
      sameCourse,
    });
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

    /** One saved corpus, without opening it. Null when no such corpus exists. */
    get: read,

    saveImport,

    /**
     * Remove one paper's questions from `corpus` and open the result. Topics
     * only that paper asked leave the analysis with them.
     */
    removePaper(corpus: SavedCorpus, label: string): SavedCorpus {
      return saveImport(
        corpus,
        corpus.outcome.questions.filter((q) => q.paper.label !== label),
      );
    },

    /**
     * Replace a corpus holding several courses with one corpus per course,
     * each keeping its topic grouping and overrides, and open the first.
     * `sameCourse` is the student's say on which codes are one course. When
     * storage fills partway, nothing changes.
     */
    split(corpus: SavedCorpus, parts: Question[][], sameCourse = corpus.sameCourse): SavedCorpus[] {
      const saved: SavedCorpus[] = [];
      try {
        for (const questions of parts) {
          saved.push(
            write(
              {
                id: crypto.randomUUID(),
                savedAt: now(),
                outcome: { ...corpus.outcome, questions },
                topicGrouping: corpus.topicGrouping,
                topicOverrides: corpus.topicOverrides,
                sameCourse,
              },
              false,
            ),
          );
        }
      } catch (err) {
        for (const part of saved) storage.removeItem(CORPUS_PREFIX + part.id);
        throw err;
      }
      storage.removeItem(CORPUS_PREFIX + corpus.id);
      storage.setItem(OPEN_KEY, saved[0].id);
      return saved;
    },

    /**
     * Replace a saved corpus's topic grouping or overrides, keeping the rest,
     * and without opening it: a grouping can finish after the student has
     * moved on. Null when the corpus is gone, as when it was deleted meanwhile.
     */
    saveTopics(id: string, topics: CorpusTopics): SavedCorpus | null {
      const corpus = read(id);
      return corpus ? write({ ...corpus, ...topics, savedAt: now() }, false) : null;
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
    value.outcome.questions.every(isQuestion) &&
    (value.topicGrouping === undefined ||
      (isRecord(value.topicGrouping) &&
        Object.values(value.topicGrouping).every((t) => typeof t === "string"))) &&
    (value.topicOverrides === undefined ||
      (Array.isArray(value.topicOverrides) && value.topicOverrides.every(isTopicOverride))) &&
    isOptionalSameCourse(value.sameCourse)
  );
}

export type CorpusStore = ReturnType<typeof createCorpusStore>;

/** The store over this browser's localStorage, or null during server rendering. */
export function browserCorpusStore(): CorpusStore | null {
  return typeof window === "undefined"
    ? null
    : createCorpusStore(window.localStorage);
}
