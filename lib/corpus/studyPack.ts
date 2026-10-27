import { paperOrder } from "@/lib/analysis/papers";
import { corpusTitle } from "@/lib/corpus/courses";
import type { AnalysisResult, Question } from "@/lib/types";

/**
 * The one fixed instruction a study pack opens with, so a general-purpose
 * chatbot behaves as a tutor from its first reply.
 */
export const TUTOR_INSTRUCTIONS = `> **Instructions for you, the tutor**
>
> Tutor me on these topics in this order. Quiz me. Give hints before answers. Cite the source question (paper and question number) for everything you ask me. Work only from the real past exam questions below. How often a topic was asked is evidence of what this examiner values, not a forecast of the next exam.`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const round = (n: number) => Number(n.toFixed(1));

/** Prefix a printed label unless the paper already printed it, as "SECTION-A" or "Q.2(b)" do. */
const prefixed = (prefix: string, label: string) =>
  label.toLowerCase().startsWith(prefix.trim().toLowerCase()) ? label : prefix + label;

/** A question with its source, its text kept verbatim. */
function cite(q: Question): string {
  const section = q.paper.section ? `, ${prefixed("Section ", q.paper.section)}` : "";
  const marks = q.marks === null ? "marks not stated" : plural(q.marks, "mark");
  return `**${q.paper.label}${section}, ${prefixed("Q", q.qNo)}, ${marks}**\n${q.text}`;
}

/**
 * The study pack: a Markdown export of the study plan and its evidence, made
 * to be pasted into a chatbot. The tutor instruction, then the study plan,
 * then every topic's questions in study plan order, then the lineages.
 */
export function studyPack(result: AnalysisResult): string {
  const { studyPlan, stats, lineages, paperCount, questionCount } = result;
  const papers = paperOrder(result.questions).map((p) => p.label);
  const total = studyPlan.marksPerPaper;
  const { name, codes } = corpusTitle(result.questions);

  const out = [
    TUTOR_INSTRUCTIONS,
    `# Study pack: ${name}${codes.length > 1 ? ` (${codes.join(" · ")})` : ""}`,
    `${plural(questionCount, "question")} from ${plural(paperCount, "paper")}: ${papers.join("; ")}.`,
  ];
  if (result.lowConfidence) {
    out.push(
      `With only ${plural(paperCount, "paper")}, how often a topic was asked is weak evidence.`,
    );
  }

  out.push(
    "## Study plan",
    `These ${plural(studyPlan.topics.length, "topic")} cover ${studyPlan.coveragePct.toFixed(1)}% of every question asked` +
      (total === null ? "." : ` and carry about ${round(total)} marks per paper.`),
    studyPlan.topics
      .map(
        (t, i) =>
          `${i + 1}. **${t.topic}**: ` +
          (t.marksPerPaper === null
            ? "marks not recorded"
            : `about ${round(t.marksPerPaper)} marks per paper`) +
          `, asked ${plural(t.count, "time")} in ${t.paperCount} of ${plural(paperCount, "paper")}`,
      )
      .join("\n"),
    "## Questions by topic",
  );
  for (const stat of stats) {
    out.push(`### ${stat.topic}`, ...stat.questions.map(cite));
  }

  out.push(
    "## Lineages",
    lineages.length === 0
      ? "No question was asked again in these papers."
      : "Each lineage is the same question asked again, with its numbers or wording changed.",
  );
  lineages.forEach((lineage, i) => {
    out.push(
      `### Lineage ${i + 1}: ${lineage.topic} (${plural(lineage.members.length, "variant")})`,
      ...lineage.members.map(cite),
    );
  });

  return out.join("\n\n") + "\n";
}
