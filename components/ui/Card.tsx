import type { ReactNode } from "react";

type CardTone = "white" | "marigold" | "coral" | "sky-wash" | "sky-tint" | "midnight";

const TONE_CLASS: Record<CardTone, string> = {
  // White Feature Card — the default: hairline border, never a shadow.
  white: "bg-pure-white border border-[var(--border-hairline)] text-ink-black",
  // Accent Feature Cards — full-bleed single-hue fills, no border.
  marigold: "bg-marigold text-ink-black",
  coral: "bg-coral text-ink-black",
  "sky-wash": "bg-sky-wash text-ink-black",
  "sky-tint": "bg-sky-tint text-ink-black",
  // Dark Feature Card — the sparing "dark island" on the light page.
  midnight: "bg-midnight-ink text-pure-white",
};

export function Card({
  tone = "white",
  className = "",
  children,
}: {
  tone?: CardTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-[var(--radius-xl)] p-[var(--card-padding)] ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <h3
      className={`text-heading-sm font-bold tracking-[-0.242px] ${className}`}
    >
      {children}
    </h3>
  );
}

export function CardBody({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p className={`text-body text-graphite ${className}`}>{children}</p>
  );
}
