import { paperName, type PaperInfo } from "@/lib/corpus/courses";
import type { Question } from "@/lib/types";

/** A per-paper average, as the marks columns print it: "≈2.4". */
export const approx = (value: number) => `≈${Number(value.toFixed(1))}`;

/**
 * The red pen: marks in the right margin, as an examiner writes them. Red
 * means marks and nothing else; marks the paper does not print show as a
 * quiet dash.
 */
export function Marks({
  value,
  bare = false,
  className = "",
}: {
  value: string | number | null;
  /** The text around it already says "marks". */
  bare?: boolean;
  className?: string;
}) {
  return value === null ? (
    <span className={`whitespace-nowrap text-pen-quiet ${className}`}>
      <span aria-hidden>—</span>
      <span className="sr-only">marks not printed</span>
    </span>
  ) : (
    <span className={`whitespace-nowrap font-semibold tabular-nums text-pen ${className}`}>
      {value}
      {!bare && <span className="sr-only"> marks</span>}
    </span>
  );
}

/** The question type, each in its own tint. */
export function TypeTag({ numerical }: { numerical: boolean }) {
  return (
    <span
      className={`inline-block rounded-[4px] px-2 text-xs font-semibold whitespace-nowrap ${
        numerical ? "bg-type-numerical text-type-numerical-ink" : "bg-type-theory text-type-theory-ink"
      }`}
    >
      {numerical ? "Numerical" : "Theory"}
    </span>
  );
}

/**
 * Where a question was asked: the paper's year and sitting, its code when the
 * corpus has more than one offering, and its section when the paper has more
 * than one.
 */
export function PaperLabel({ question, names }: { question: Question; names: Map<string, PaperInfo> }) {
  const paper = names.get(question.paper.label);
  return (
    <>
      <span className="font-semibold text-ink">{paperName(names, question.paper.label)}</span>{" "}
      {paper?.code && <span className="font-outlier text-xs text-ink-2">{paper.code}</span>}{" "}
      {paper?.sectioned && question.paper.section && (
        <span className="text-muted">
          {/^section/i.test(question.paper.section) ? "" : "Section "}
          {question.paper.section}
        </span>
      )}
    </>
  );
}
