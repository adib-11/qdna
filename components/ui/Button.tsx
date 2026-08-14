import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "text" | "outlined";

const VARIANT_CLASS: Record<Variant, string> = {
  // The only filled button colour in the system — one per screen.
  primary: "bg-notion-blue text-pure-white hover:bg-signal-blue px-[15px] py-[6px] rounded-[var(--radius-lg)]",
  ghost: "bg-sky-tint text-notion-blue hover:bg-[#d8ecfd] px-[15px] py-[6px] rounded-[var(--radius-lg)]",
  text: "bg-transparent text-[rgba(0,0,0,0.95)] hover:bg-[rgba(0,0,0,0.04)] px-[15px] py-[6px] rounded-[var(--radius-lg)]",
  outlined:
    "bg-transparent text-[rgba(0,0,0,0.9)] border border-[rgba(0,0,0,0.9)] px-[10px] py-[5px] rounded-[var(--radius-md)]",
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
      className={`text-body-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
