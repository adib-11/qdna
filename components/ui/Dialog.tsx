"use client";

import { useEffect, useRef, type ReactNode, type RefObject, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

const PLACEMENT = {
  /** A centred card, for a short form. */
  center: "z-[60] items-center justify-center p-[16px]",
  /** A sheet along the right edge, for reading. */
  end: "z-50 justify-end",
} as const;

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog. While it is open the rest of the page is inert, so neither
 * Tab nor a screen reader can wander behind it; focus moves into it, Tab
 * cycles within it, Escape or the backdrop closes it, and focus goes back to
 * whatever opened it.
 *
 * It renders into `document.body`, beside the page rather than inside it, so
 * making the page inert never reaches the dialog itself.
 */
export function Dialog({
  label,
  labelledBy,
  onClose,
  initialFocus,
  placement = "center",
  className = "",
  children,
}: {
  /** The dialog's accessible name, when no visible heading names it. */
  label?: string;
  /** Id of the visible heading that names the dialog. */
  labelledBy?: string;
  onClose: () => void;
  /** Focused on open; the dialog itself when absent. */
  initialFocus?: RefObject<HTMLElement | null>;
  placement?: keyof typeof PLACEMENT;
  className?: string;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Callers pass inline closures; the open/close effect must not re-run for them.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement;
    const host = hostRef.current;
    const madeInert: HTMLElement[] = [];
    for (const element of Array.from(document.body.children)) {
      if (element === host || !(element instanceof HTMLElement) || element.inert) continue;
      element.inert = true;
      madeInert.push(element);
    }
    (initialFocus?.current ?? panelRef.current)?.focus();

    return () => {
      // The page comes back first: an inert element cannot take focus.
      for (const element of madeInert) element.inert = false;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
    // Runs once per opening; the initial focus target is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close.current();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;

    const tabbable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(TABBABLE),
    ).filter((element) => element.getClientRects().length > 0);
    const first = tabbable[0];
    const last = tabbable[tabbable.length - 1];
    const active = document.activeElement;

    if (!first) {
      event.preventDefault();
      panelRef.current.focus();
    } else if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div ref={hostRef} className={`fixed inset-0 flex ${PLACEMENT[placement]}`}>
      <div
        className="absolute inset-0 bg-[rgba(0,0,0,0.4)]"
        onClick={() => close.current()}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`relative focus:outline-none ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
