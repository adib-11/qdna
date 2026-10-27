import { Pill } from "@/components/ui/Pill";

/**
 * Shown only on a lineage that spans more than one offering of the course.
 *
 * Worth its own badge because it is the least expected finding the tool
 * produces: the same question set into two departments' papers, which means a
 * student can revise from a course they were never enrolled in.
 */
export function CrossDeptBadge({ courseCodes }: { courseCodes: string[] }) {
  if (courseCodes.length <= 1) return null;

  return (
    <Pill tone="on" title={courseCodes.join(" · ")}>
      asked in both departments
    </Pill>
  );
}
