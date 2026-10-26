/**
 * The student's own Gemini key (ADR 0001). It is the only key qDNA ever uses,
 * and it is only ever sent to Google.
 *
 * Held in memory by default, so it is gone when the tab closes. "Remember this
 * key" is an explicit opt-in that keeps a copy in this browser's localStorage,
 * and forgetting clears both.
 */
import { describeModelError, isKeyRejected } from "@/lib/gemini/generate";

const REMEMBER_KEY = "qdna:own-key:v1";

/** Where Gemini lives. The browser calls it directly; CORS allows it. */
export const GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com";

type KeyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createKeyStore(storage: KeyStorage | null) {
  let key: string | null = read();
  const listeners = new Set<() => void>();

  function read(): string | null {
    try {
      return storage?.getItem(REMEMBER_KEY) || null;
    } catch {
      return null;
    }
  }

  function write(value: string | null) {
    try {
      if (value) storage?.setItem(REMEMBER_KEY, value);
      else storage?.removeItem(REMEMBER_KEY);
    } catch {
      // Storage refused: the key still works for this tab.
    }
  }

  function changed() {
    for (const listener of listeners) listener();
  }

  return {
    get: (): string | null => key,

    /** True when this browser keeps a copy across visits. */
    remembered: (): boolean => key !== null && read() === key,

    set(value: string, remember: boolean): void {
      key = value;
      write(remember ? value : null);
      changed();
    },

    forget(): void {
      key = null;
      write(null);
      changed();
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type KeyStore = ReturnType<typeof createKeyStore>;

export type KeyCheck = { ok: true; key: string } | { ok: false; message: string };

/**
 * Check a pasted key with the cheapest call Gemini has, listing one model,
 * before anything costly runs on it. A typo shows up here, not halfway
 * through an extraction.
 */
export async function verifyKey(
  pasted: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KeyCheck> {
  const key = pasted.trim();
  if (!key) return { ok: false, message: "Paste your Gemini API key first." };

  let response: Response;
  try {
    response = await fetchImpl(`${GEMINI_API_ORIGIN}/v1beta/models?pageSize=1`, {
      headers: { "x-goog-api-key": key },
    });
  } catch {
    return {
      ok: false,
      message: "Couldn't reach Google to check the key. Check your connection and try again.",
    };
  }

  if (response.ok) return { ok: true, key };
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return {
      ok: false,
      message:
        "Google rejected that key. Check you copied all of it, or create a new one in Google AI Studio.",
    };
  }
  return {
    ok: false,
    message: `Google couldn't check the key right now (${response.status}). Try again in a moment.`,
  };
}

/**
 * What to tell the student when a model action fails. A key Google rejects
 * mid-session (revoked, deleted) is forgotten here, in memory and in this
 * browser, so the next model action prompts for a new one.
 */
export function handleModelError(
  error: unknown,
  fallback: string,
  store: KeyStore = ownKeyStore(),
): string {
  if (isKeyRejected(error)) store.forget();
  return describeModelError(error, fallback);
}

let browserStore: KeyStore | null = null;

/** The key store for this tab, shared by every component. */
export function ownKeyStore(): KeyStore {
  // Never cached on the server: a key belongs to one browser tab.
  if (typeof window === "undefined") return createKeyStore(null);
  browserStore ??= createKeyStore(window.localStorage);
  return browserStore;
}
