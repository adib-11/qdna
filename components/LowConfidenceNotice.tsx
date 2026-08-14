import { MIN_PAPERS_FOR_CONFIDENCE } from "@/lib/config";

/**
 * Ghost-styled banner: the same sky-tint/blue pairing as a secondary action, so
 * it reads as guidance rather than as an error.
 *
 * Shown whenever the corpus is too thin for recurrence to mean anything. A
 * topic that appears twice in one paper is not a pattern, and the tool says so
 * rather than letting a confident-looking chart imply otherwise (REQ-011,
 * CON-008).
 */
export function LowConfidenceNotice({
  lowConfidence,
  paperCount,
}: {
  lowConfidence: boolean;
  paperCount: number;
}) {
  if (!lowConfidence) return null;

  return (
    <div
      role="note"
      className="rounded-[var(--radius-lg)] bg-sky-tint px-[24px] py-[16px]"
    >
      <p className="text-body-sm font-medium text-notion-blue">
        Upload {MIN_PAPERS_FOR_CONFIDENCE} or more papers from the same course
        for reliable pattern detection.
      </p>
      <p className="mt-[4px] text-caption text-[rgba(0,0,0,0.6)]">
        {paperCount === 1
          ? "One paper was detected"
          : `${paperCount} papers were detected`}
        , so frequency below is a description of this corpus rather than
        evidence of recurrence.
      </p>
    </div>
  );
}
