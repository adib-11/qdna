import type { ReactNode } from "react";

type PillTone =
  | "neutral"
  | "marigold"
  | "coral"
  | "sky-tint"
  | "sky-wash"
  | "peach"
  | "midnight";

const TONE_CLASS: Record<PillTone, string> = {
  neutral: "bg-[rgba(0,0,0,0.06)] text-[rgba(0,0,0,0.6)]",
  marigold: "bg-marigold text-ink-black",
  coral: "bg-coral text-pure-white",
  "sky-tint": "bg-sky-tint text-notion-blue",
  "sky-wash": "bg-sky-wash text-ink-black",
  peach: "bg-peach text-ink-black",
  midnight: "bg-midnight-ink text-pure-white",
};

/** Pill Tag — category label or status indicator. */
export function Pill({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-full)] px-[12px] py-[4px] text-caption font-medium tracking-[0.12px] whitespace-nowrap ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Hero Highlight Pill — the signature typographic device: a colored pill
 * wrapping a single word inline in display copy.
 */
export function HighlightPill({
  tone = "marigold",
  className = "",
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-[var(--radius-full)] px-[24px] py-[8px] ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
