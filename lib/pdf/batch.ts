import { BATCH_PAGES, MAX_BATCH_BYTES } from "@/lib/config";
import type { PageImage } from "@/lib/types";

/**
 * Group pages into extraction requests of at most `maxPages` (BATCH_PAGES
 * unless the eval is measuring another size), splitting any
 * group that would exceed the request-body ceiling.
 *
 * A single page larger than the ceiling still gets its own batch: dropping it
 * would silently lose questions, and an oversized request fails loudly, which
 * the retry path can report.
 */
export function batchPages(pages: PageImage[], maxPages = BATCH_PAGES): PageImage[][] {
  const batches: PageImage[][] = [];
  let current: PageImage[] = [];
  let bytes = 0;

  for (const page of pages) {
    const wouldOverflowCount = current.length >= maxPages;
    const wouldOverflowBytes =
      current.length > 0 && bytes + page.bytes > MAX_BATCH_BYTES;

    if (wouldOverflowCount || wouldOverflowBytes) {
      batches.push(current);
      current = [];
      bytes = 0;
    }

    current.push(page);
    bytes += page.bytes;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}
