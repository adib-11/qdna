import { LOW_INK_THRESHOLD } from "@/lib/config";

/**
 * True when the page carries almost no ink — covers, separators, and blank
 * backs. Sending these to a vision model costs quota and returns nothing.
 *
 * Scanned pages are never pure white, so "ink" is anything meaningfully
 * darker than the paper rather than anything non-#fff.
 */
export function isLowInk(imageData: ImageData): boolean {
  const { data } = imageData;
  const INK_LUMA_CEILING = 200;
  let inked = 0;
  let sampled = 0;

  // Sample every 4th pixel; ink proportion is stable well below full scan.
  for (let i = 0; i < data.length; i += 16) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (luma < INK_LUMA_CEILING) inked++;
    sampled++;
  }

  if (sampled === 0) return true;
  return inked / sampled < LOW_INK_THRESHOLD;
}
