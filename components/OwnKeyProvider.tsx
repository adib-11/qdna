"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/Button";
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
    <div className="flex flex-wrap items-center gap-[8px] text-caption text-graphite">
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
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    returnFocus.current = document.activeElement;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onDone(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    };
  }, [onDone]);

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-[16px]">
      <div
        className="absolute inset-0 bg-[rgba(0,0,0,0.4)]"
        onClick={() => onDone(null)}
        aria-hidden
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        className="relative w-full max-w-[480px] rounded-[var(--radius-xl)] bg-pure-white p-[var(--card-padding)]"
      >
        <h2 id={titleId} className="text-heading-sm font-bold tracking-[-0.242px]">
          Use your own Gemini key
        </h2>
        <p className="mt-[8px] text-body-sm text-graphite">
          This needs a Gemini model. qDNA calls it from your browser with your
          own key, which is sent only to Google and never to qDNA&apos;s server.
        </p>

        <ol className="mt-[16px] list-decimal space-y-[4px] pl-[20px] text-body-sm text-graphite">
          <li>
            Open{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-notion-blue underline"
            >
              Google AI Studio
            </a>{" "}
            and sign in with a Google account.
          </li>
          <li>Choose &ldquo;Create API key&rdquo;. The free tier is enough.</li>
          <li>Copy the key and paste it below.</li>
        </ol>

        <label htmlFor={inputId} className="mt-[20px] block text-body-sm font-medium">
          Gemini API key
        </label>
        <input
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="mt-[8px] w-full rounded-[var(--radius-md)] border border-[var(--border-hairline)] px-[12px] py-[8px] text-body-sm"
        />

        <label className="mt-[12px] flex items-center gap-[8px] text-body-sm text-graphite">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember this key in this browser
        </label>

        <p
          id={`${inputId}-error`}
          role="alert"
          className="mt-[12px] min-h-[20px] text-body-sm text-vermillion"
        >
          {error}
        </p>

        <div className="mt-[8px] flex justify-end gap-[8px]">
          <Button type="button" variant="text" onClick={() => onDone(null)}>
            Cancel
          </Button>
          <Button type="submit" disabled={checking || !value.trim()}>
            {checking ? "Checking key…" : "Use this key"}
          </Button>
        </div>
      </form>
    </div>
  );
}
