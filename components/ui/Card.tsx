import type { ReactNode } from "react";

type CardTone = "well" | "sheet";

const TONE_CLASS: Record<CardTone, string> = {
  // A well: the second surface with a ruled edge, flat, never a shadow.
  well: "bg-surface-2 border border-rule",
  // A sheet: the page surface inside an ink edge, for the practice paper.
  sheet: "bg-surface border border-ink",
};

export function Card({
  tone = "well",
  className = "",
  children,
}: {
  tone?: CardTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-card p-4 text-ink sm:p-10 ${TONE_CLASS[tone]} ${className}`}>
      {children}
    </div>
  );
}
