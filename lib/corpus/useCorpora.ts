"use client";

import { useMemo, useSyncExternalStore } from "react";
import { browserCorpusStore, type SavedCorpus } from "@/lib/corpus/store";

/**
 * React views of the saved corpora. localStorage is an external store, so it
 * is read through `useSyncExternalStore`: nothing during server rendering,
 * then the stored value once hydrated, then again after every `corpusChanged`.
 *
 * Other tabs' writes are deliberately not followed: two tabs may have two
 * different corpora open, and one should not switch the other's.
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
