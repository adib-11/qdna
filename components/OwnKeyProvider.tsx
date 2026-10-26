"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ownKeyStore, verifyKey } from "@/lib/key/ownKey";

type RequestKey = () => Promise<string | null>;

const RequestKeyContext = createContext<RequestKey | null>(null);

/**
 * Asks for the student's own Gemini key at the moment a model action starts,
 * and never before: nothing here renders on page load, and the bundled samples
 * and all analysis never call it.
 */
export function OwnKeyProvider({ children }: { children: ReactNode }) {
  const resolver = useRef<((key: string | null) => void) | null>(null);
  const [prompting, setPrompting] = useState(false);

  const requestKey = useCallback<RequestKey>(() => {
    const held = ownKeyStore().get();
    if (held) return Promise.resolve(held);
    // A second request while the prompt is open supersedes the first.
    resolver.current?.(null);
    return new Promise((resolve) => {
      resolver.current = resolve;
      setPrompting(true);
    });
  }, []);

  const settle = useCallback((key: string | null) => {
    resolver.current?.(key);
    resolver.current = null;
    setPrompting(false);
  }, []);

  return (
    <RequestKeyContext.Provider value={requestKey}>
      {children}
      {prompting && <KeyPrompt onDone={settle} />}
    </RequestKeyContext.Provider>
  );
}

/** Resolves to the student's key, prompting for one if none is held; null if they decline. */
export function useRequestKey(): RequestKey {
  const requestKey = useContext(RequestKeyContext);
  if (!requestKey) throw new Error("useRequestKey needs an OwnKeyProvider");
  return requestKey;
}

/** The held key and whether this browser remembers it. Null while server rendering. */
export function useOwnKey(): { key: string | null; remembered: boolean } {
  const store = ownKeyStore();
  const key = useSyncExternalStore(store.subscribe, store.get, () => null);
  const remembered = useSyncExternalStore(store.subscribe, store.remembered, () => false);
  return { key, remembered };
}

/** Where the key is held, and a way to forget it. Renders nothing when no key is held. */
export function OwnKeyStatus() {
  const { key, remembered } = useOwnKey();
  if (!key) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
      <span>
        {remembered
          ? "Your Gemini key is remembered in this browser."
          : "Your Gemini key is held in memory for this tab only."}
      </span>
      <Button variant="text" onClick={() => ownKeyStore().forget()}>
        Forget key
      </Button>
    </div>
  );
}

function KeyPrompt({ onDone }: { onDone: (key: string | null) => void }) {
  const titleId = useId();
  const inputId = useId();
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setChecking(true);
    setError(null);
    const check = await verifyKey(value);
    setChecking(false);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    ownKeyStore().set(check.key, remember);
    onDone(check.key);
  }

  return (
    <Dialog
      labelledBy={titleId}
      onClose={() => onDone(null)}
      initialFocus={inputRef}
      className="max-h-full w-full max-w-[480px] overflow-y-auto rounded-card bg-surface p-6 shadow-card sm:p-10"
    >
      <form onSubmit={submit}>
        <h2 id={titleId} className="text-2xl">
          Use your own Gemini key
        </h2>
        <p className="mt-4 text-ink-2">
          This needs a Gemini model. qDNA calls it from your browser with your
          own key, which is sent only to Google and never to qDNA&apos;s server.
        </p>

        <ol className="mt-4 list-decimal space-y-1 pl-6 text-ink-2">
          <li>
            Open{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-ink underline decoration-ink-2 hover:decoration-accent"
            >
              Google AI Studio
            </a>{" "}
            and sign in with a Google account.
          </li>
          <li>Choose &ldquo;Create API key&rdquo;. The free tier is enough.</li>
          <li>Copy the key and paste it below.</li>
        </ol>

        <label htmlFor={inputId} className="mt-6 block text-sm font-semibold">
          Gemini API key
        </label>
        <input
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="mt-2 min-h-11 w-full rounded-control border border-muted bg-surface px-3 aria-invalid:border-error"
        />

        <label className="mt-3 flex min-h-11 items-center gap-2 text-ink-2">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 accent-ink"
          />
          Remember this key in this browser
        </label>

        <p
          id={`${inputId}-error`}
          role="alert"
          className="mt-3 min-h-6 text-sm text-error"
        >
          {error}
        </p>

        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="text" onClick={() => onDone(null)}>
            Cancel
          </Button>
          <Button type="submit" disabled={checking || !value.trim()}>
            {checking ? "Checking key…" : "Use this key"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
