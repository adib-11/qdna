import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { SavedCorpora } from "@/components/SavedCorpora";
import { UploadZone } from "@/components/UploadZone";
import { HighlightPill, Pill } from "@/components/ui/Pill";

export default function Home() {
  return (
    <main className="page-shell py-[64px]">
      <section className="max-w-[900px]">
        <Pill tone="sky-tint">Evidence-weighted, never a forecast</Pill>

        <h1 className="mt-[24px] text-display-sm md:text-display font-medium text-ink-black">
          Every course has a question{" "}
          <HighlightPill tone="marigold">genome</HighlightPill>
        </h1>

        <p className="mt-[24px] font-lyon-text text-[18px] leading-[1.56] text-graphite max-w-[640px]">
          Upload the past papers you already have. qDNA reads every scanned
          page, extracts each question with its marks and provenance, and
          computes what actually recurs — topic frequency, Pareto coverage,
          and the lineage of questions that keep coming back in new clothes.
        </p>
      </section>

      <section className="mt-[64px]">
        <UploadZone />
      </section>

      <section className="mt-[64px]">
        <SavedCorpora />
      </section>

      <section className="mt-[80px] grid gap-[24px] md:grid-cols-3">
        <Card tone="white">
          <CardTitle>Genome map</CardTitle>
          <CardBody className="mt-[8px]">
            Topics down, papers across. Cell density shows where a course
            spends its marks, semester after semester.
          </CardBody>
        </Card>
        <Card tone="white">
          <CardTitle>Question lineage</CardTitle>
          <CardBody className="mt-[8px]">
            Near-identical questions cluster together, even when the numbers
            change and the wording is rewritten.
          </CardBody>
        </Card>
        <Card tone="marigold">
          <CardTitle>Pareto coverage</CardTitle>
          <p className="mt-[8px] text-body text-[rgba(0,0,0,0.7)]">
            How few topics account for most of the paper — computed from your
            corpus, not asserted.
          </p>
        </Card>
      </section>
    </main>
  );
}
