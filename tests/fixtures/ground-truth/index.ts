/**
 * Ground truth for six RUET papers, one file per course.
 *
 * Agent-drafted from each PDF's text layer (where it has one), a model pass
 * through the repo's own extraction script (where it succeeded) and a read of
 * every page image. The maintainer corrects them; every item the drafter was
 * unsure of carries an `uncertain` note. The topic groupings are the
 * maintainer's call.
 */
import type { GroundTruthCourse } from "@/lib/eval/groundTruth";
import basicMechanical from "./basic-mechanical.json";
import communication from "./communication.json";
import computerArchitecture from "./computer-architecture.json";
import electricalMachines from "./electrical-machines.json";
import microprocessors from "./microprocessors.json";
import softwareEngineering from "./software-engineering.json";

// JSON imports widen string unions such as `capture` to `string`.
export const GROUND_TRUTH = [
  computerArchitecture,
  microprocessors,
  basicMechanical,
  electricalMachines,
  softwareEngineering,
  communication,
] as GroundTruthCourse[];
