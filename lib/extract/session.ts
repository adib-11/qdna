import { browserCorpusStore, type SavedCorpus } from "@/lib/corpus/store";
import type { ExtractionOutcome } from "@/lib/types";

/**
 * Hand-off between the upload page and the analysis view. Every corpus handed
 * over is saved, so it survives closing the tab and appears in the saved
 * corpora list. Pass an `id` to replace a corpus rather than add a new one.
 */
export function saveSession(
  outcome: ExtractionOutcome,
  id?: string,
): SavedCorpus | undefined {
  return browserCorpusStore()?.save(outcome, id);
}
