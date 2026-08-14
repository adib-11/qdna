import { CACHE_PREFIX } from "@/lib/config";
import type { Question } from "@/lib/types";

/**
 * Content-addressed extraction cache. Re-analysing the same pages must cost
 * zero API quota — the daily request ceiling is the constraint that actually
 * ends a build day, and it does not reset in time to recover from.
 */

/** SHA-256 over the concatenated base64 payloads of a batch. */
export async function hashImage(base64: string | string[]): Promise<string> {
  const joined = Array.isArray(base64) ? base64.join("|") : base64;
  const bytes = new TextEncoder().encode(joined);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getCached(hash: string): Question[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + hash);
    return raw ? (JSON.parse(raw) as Question[]) : null;
  } catch {
    return null;
  }
}

export function setCached(hash: string, questions: Question[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + hash, JSON.stringify(questions));
  } catch {
    // Quota exhausted: evict this namespace and retry once. A cache miss is
    // recoverable; a thrown error mid-extraction is not.
    try {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith(CACHE_PREFIX)) window.localStorage.removeItem(key);
      }
      window.localStorage.setItem(CACHE_PREFIX + hash, JSON.stringify(questions));
    } catch {
      /* proceed uncached */
    }
  }
}
