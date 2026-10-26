import { SavedCorpora } from "@/components/SavedCorpora";
import { UploadZone } from "@/components/UploadZone";

/** What qDNA computes, set as rows: the name on the left, what it shows on the right. */
const COMPUTES = [
  [
    "Genome map",
    "Topics down, papers across. Cell density shows where a course spends its marks, semester after semester.",
  ],
  [
    "Question lineage",
    "Near-identical questions cluster together, even when the numbers change and the wording is rewritten.",
  ],
  [
    "Pareto coverage",
    "How few topics account for most of the paper — computed from your corpus, not asserted.",
  ],
] as const;

export default function Home() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="page-shell pb-(--section-gap) focus:outline-none"
    >
      {/* The drop zone is the hero's visual: the one thing a visitor came to do. */}
      <section className="grid gap-10 border-t-4 border-ink pt-10 lg:min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-16 lg:py-16">
        <div className="min-w-0">
          <h1>Every course has a question genome</h1>

          <p className="lead mt-6 text-ink-2">
            Upload the past papers you already have. qDNA reads every scanned
            page, extracts each question with its marks and provenance, and
            computes what actually recurs — topic frequency, Pareto coverage,
            and the lineage of questions that keep coming back in new clothes.
          </p>

          <p className="mt-6 max-w-[52ch] border-t border-ink pt-3 text-sm font-semibold">
            Evidence-weighted, never a forecast
          </p>
        </div>

        <div className="min-w-0">
          <UploadZone />
        </div>
      </section>

      <section className="mt-(--section-gap-s) border-t border-ink pt-10">
        <SavedCorpora />
      </section>

      <section
        aria-labelledby="what-qdna-computes"
        className="mt-(--section-gap) border-t border-ink"
      >
        {/* Names the rows' section, so they do not read as part of the one above. */}
        <h2 id="what-qdna-computes" className="sr-only">
          What qDNA computes
        </h2>
        {COMPUTES.map(([title, body]) => (
          <div
            key={title}
            className="grid gap-3 border-b border-rule py-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-8"
          >
            <h3>{title}</h3>
            <p className="max-w-[52ch] text-lg text-ink-2">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
