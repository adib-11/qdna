"use client";

import { useMemo, useSyncExternalStore } from "react";
import { keepOverriddenTopics } from "@/lib/analysis/topics";
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
 * the grouping with it, keeping the topic names the student's overrides refer
 * to. Throws the model's error, or on `signal`; until a grouping is saved,
 * the analysis view offers "Group topics" as a pending action.
 */
export async function groupSavedCorpus(
  id: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<void> {
  const corpus = browserCorpusStore()?.get(id);
  if (!corpus) return;
  const regrouped = await groupTopics(
    browserModelClient(apiKey),
    corpus.outcome.questions,
    signal,
  );
  // A skip that lands as the answer arrives still means skip.
  signal?.throwIfAborted();
  // Read again: the student may have changed an override while the model worked.
  const latest = browserCorpusStore()?.get(id);
  if (!latest) return;
  const topicGrouping = keepOverriddenTopics(
    latest.outcome.questions,
    latest.topicGrouping,
    regrouped,
    latest.topicOverrides ?? [],
  );
  browserCorpusStore()?.saveTopics(id, { topicGrouping });
  corpusChanged();
}
