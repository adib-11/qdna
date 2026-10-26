import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "text" | "outlined";

const VARIANT_CLASS: Record<Variant, string> = {
  // The only filled button in the system: ink with paper text, one per screen.
  primary: "border-ink bg-ink text-surface hover:border-ink-2 hover:bg-ink-2",
  // The quiet pair to the primary: a ruled edge on the second surface.
  ghost: "border-rule bg-surface-2 text-ink hover:border-muted hover:bg-surface-3",
  // Typographic: an underline that turns teal on hover.
  text: "border-transparent bg-transparent text-ink underline decoration-rule underline-offset-4 hover:decoration-accent",
  // Stops something that is running.
  outlined: "border-ink bg-transparent text-ink hover:bg-surface-2",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-control border px-4 text-sm font-semibold whitespace-nowrap transition-[background-color,border-color,text-decoration-color,translate] duration-(--dur-micro) ease-out active:translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
