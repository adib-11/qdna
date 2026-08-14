import type { ExtractionOutcome } from "@/lib/types";

/**
 * Hand-off between the upload page and the analysis view. sessionStorage
 * rather than a store: the corpus survives a reload, and nothing about it
 * needs to outlive the tab.
 */
const SESSION_KEY = "qdna:v1:session";

export function saveSession(outcome: ExtractionOutcome): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(outcome));
}

export function loadSession(): ExtractionOutcome | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as ExtractionOutcome) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SESSION_KEY);
}
