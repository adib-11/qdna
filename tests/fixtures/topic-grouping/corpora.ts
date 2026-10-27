/**
 * The corpora topic grouping is proved on: every bundled corpus, and one
 * corpus per ground-truth paper holding the extractor's output for it.
 *
 * Read with `fs` rather than imported, so the live grouping script can load
 * this module under plain Node as well as under Vitest.
 *
 * `extractions/` holds the extractor's own output for the ground-truth papers
 * that no bundled corpus contains. `groupings/` holds the topic grouping the
 * live model returned for each corpus, written by `scripts/group-topics.mjs`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ungroupedLabels, type TopicGrouping } from "@/lib/analysis/topics";
import { parseGrouping } from "@/lib/gemini/groupTopics";
import type { GroundTruthCourse } from "@/lib/eval/groundTruth";
import type { Question } from "@/lib/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const GROUND_TRUTH_DIR = path.join(ROOT, "tests/fixtures/ground-truth");

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;

export const GROUND_TRUTH_COURSES: GroundTruthCourse[] = fs
  .readdirSync(GROUND_TRUTH_DIR)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => readJson(path.join(GROUND_TRUTH_DIR, file)));

/**
 * What a corpus must show for topic grouping to ship, by the owner's call:
 * holdout coverage and pair F1 both rise on the bundled corpora; pair F1
 * rises on each single-paper ground-truth set, where holdout coverage cannot
 * be measured (there is no second paper to hold out).
 */
export type GroupingGate = "coverage and pair F1" | "pair F1";

export const GATE_LABEL: Record<GroupingGate, string> = {
  "coverage and pair F1": "holdout coverage and pair F1 must rise",
  "pair F1": "pair F1 must rise (coverage not measurable: one paper)",
};

export interface GroupingCorpus {
  name: string;
  questions: Question[];
  gate: GroupingGate;
}

const bundled = (name: string, gate: GroupingGate): GroupingCorpus => ({
  name: `data/${name}.json`,
  questions: readJson(path.join(ROOT, "data", `${name}.json`)),
  gate,
});

/** The questions on one ground-truth paper, from an extraction that holds it. */
function groundTruthPaper(slug: string, from: Question[]): GroupingCorpus {
  const course = readJson<GroundTruthCourse>(path.join(GROUND_TRUTH_DIR, `${slug}.json`));
  const labels = new Set(course.papers.map((paper) => paper.label));
  return {
    name: `ground truth: ${slug}`,
    questions: from.filter((q) => labels.has(q.paper.label)),
    gate: "pair F1",
  };
}

const extraction = (slug: string): Question[] =>
  readJson(path.join(HERE, "extractions", `${slug}.json`));

export function groupingCorpora(): GroupingCorpus[] {
  const cad = bundled("cad", "coverage and pair F1");
  return [
    bundled("swe", "coverage and pair F1"),
    cad,
    // The 2024 CAD paper's only extraction is the one in the bundled corpus.
    groundTruthPaper("computer-architecture", cad.questions),
    ...["microprocessors", "basic-mechanical", "electrical-machines", "software-engineering", "communication"].map(
      (slug) => groundTruthPaper(slug, extraction(slug)),
    ),
  ];
}

const groupingFile = (corpus: GroupingCorpus) =>
  path.join(HERE, "groupings", `${corpus.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}.json`);

/**
 * The live model's grouping for a corpus, parsed from its saved raw response
 * the way the app parses it. Null before the script has requested it.
 */
export function savedGrouping(corpus: GroupingCorpus): TopicGrouping | null {
  const file = groupingFile(corpus);
  if (!fs.existsSync(file)) return null;
  return parseGrouping(fs.readFileSync(file, "utf8"), ungroupedLabels(corpus.questions));
}

/** Save the model's raw response, so a change to parsing never needs a new request. */
export function saveResponse(corpus: GroupingCorpus, response: string): void {
  fs.writeFileSync(groupingFile(corpus), `${JSON.stringify(JSON.parse(response), null, 2)}\n`);
}
