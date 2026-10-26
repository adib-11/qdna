import type { ReactNode } from "react";

/**
 * `neutral` names a category. `in` is the one teal, for a match. `out` is a
 * quiet outline (a miss is never red). `on` is ink, for the finding that stands out.
 */
type PillTone = "neutral" | "in" | "out" | "on";

const TONE_CLASS: Record<PillTone, string> = {
  neutral: "bg-surface-3 text-ink-2",
  in: "bg-accent-soft text-accent-soft-ink",
  out: "bg-transparent text-muted ring-1 ring-inset ring-rule",
  on: "bg-ink text-surface",
};

/** Pill Tag — category label or status indicator. */
export function Pill({
  tone = "neutral",
  className = "",
  title,
  wrap = false,
  children,
}: {
  tone?: PillTone;
  className?: string;
  title?: string;
  /**
   * Allow the label to break across lines. Off by default — a pill is a tag and
   * should read as one line — but a pill carrying a long inferred topic name has
   * to wrap rather than push the page into horizontal scroll at 375 px.
   */
  wrap?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-pill px-3 py-1 text-sm font-semibold ${
        wrap ? "max-w-full text-left" : "whitespace-nowrap"
      } ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
