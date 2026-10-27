import type { ReactNode } from "react";

/** A well: the second surface with a ruled edge, flat, never a shadow. */
export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-card border border-rule bg-surface-2 p-4 text-ink sm:p-10 ${className}`}>
      {children}
    </div>
  );
}
