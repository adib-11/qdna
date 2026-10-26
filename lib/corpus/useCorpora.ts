"use client";

import { useMemo, useSyncExternalStore } from "react";
import { browserCorpusStore, type SavedCorpus } from "@/lib/corpus/store";
import { browserModelClient } from "@/lib/gemini/browserClient";
import { groupTopics } from "@/lib/gemini/groupTopics";

/**
 * React views of the saved corpora. localStorage is an external store, so it
 * is read through `useSyncExternalStore`: nothing during server rendering,
 * then the stored value once hydrated, then again after every `corpusChanged`.
 *
 * Other tabs' writes are not followed live, so a tab keeps showing the corpus
 * it read. The open-corpus pointer itself is shared by every tab, though: a
 * reload shows whichever corpus any tab opened or saved most recently.
 */
const listeners = new Set<() => void>();
let revision = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Call after writing to the corpus store so every view re-reads it. */
export function corpusChanged(): void {
  revision++;
  for (const listener of listeners) listener();
}

/** -1 while server rendering or hydrating, when storage cannot be read yet. */
function useRevision(): number {
  return useSyncExternalStore(
    subscribe,
    () => revision,
    () => -1,
  );
}

/** The open corpus: undefined until storage is readable, null when none is open. */
export function useOpenCorpus(): SavedCorpus | null | undefined {
  const rev = useRevision();
  return useMemo(
    () => (rev < 0 ? undefined : (browserCorpusStore()?.current() ?? null)),
    [rev],
  );
}

/** Every saved corpus, most recent first; empty until storage is readable. */
export function useSavedCorpora(): SavedCorpus[] {
  const rev = useRevision();
  return useMemo(
    () => (rev < 0 ? [] : (browserCorpusStore()?.list() ?? [])),
    [rev],
  );
}

/**
 * Run topic grouping over a saved corpus, on the student's own key, and save
 * the grouping with it. Throws the model's error; until a grouping is saved,
 * the analysis view offers "Group topics" as a pending action.
 */
export async function groupSavedCorpus(id: string, apiKey: string): Promise<void> {
  const corpus = browserCorpusStore()?.get(id);
  if (!corpus) return;
  const topicGrouping = await groupTopics(
    browserModelClient(apiKey),
    corpus.outcome.questions,
  );
  browserCorpusStore()?.saveTopics(id, { topicGrouping });
  corpusChanged();
}
