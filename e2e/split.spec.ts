import { exportCorpusFile } from "../lib/corpus/corpusFile";
import type { Question } from "../lib/types";
import { expect, expectNoAxeViolations, openSample, test } from "./fixtures";

/** A corpus file holding one paper of another course, which the bundled sample is not. */
function otherCourse(code: string) {
  const question: Question = {
    id: "2024 Final CSE 2201::1(a)",
    course: "Data Structures",
    courseCodes: [code],
    paper: { type: "Final", label: "2024 Final CSE 2201", section: null, year: 2024 },
    qNo: "1(a)",
    marks: 10,
    text: "Insert 5, 3 and 8 into an empty binary search tree.",
    topic: "Binary search trees",
    isNumerical: false,
  };
  return {
    name: "other-course.qdna.json",
    mimeType: "application/json",
    buffer: Buffer.from(exportCorpusFile([question])),
  };
}

test("an import of another course is split into one corpus per course", async ({ page, gemini }) => {
  await openSample(page);
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(otherCourse("CSE 2201"));

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Found 2 courses");
  // The sample's paper with no printed code now waits for the student.
  await expect(page.getByRole("heading", { name: "Unassigned: which course?" })).toBeVisible();
  const analyze = page.getByRole("button", { name: "Analyze 2 courses" });
  await expect(analyze).toBeDisabled();
  await expectNoAxeViolations(page);

  await page.getByLabel("Course for Final Exam").selectOption({ index: 1 });
  await analyze.click();

  // The course with the most papers opens; the other is saved beside it.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Software Engineering/);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Reopen Data Structures, 1 paper/ })).toBeVisible();
  expect(gemini.calls).toEqual([]);
});

test("courses the student says are the same stay in one corpus", async ({ page }) => {
  await openSample(page);
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(otherCourse("EEE 3117"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Found 2 courses");

  for (const box of await page.getByRole("checkbox", { name: /Same course/ }).all()) await box.check();
  await page.getByRole("button", { name: "These are the same course" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Found 1 course");
  await page.getByRole("button", { name: "Analyze 1 course" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Software Engineering/);
  await expect(page.getByText("ECE 3117 · EEE 3117")).toBeVisible();
  // Reloading keeps the student's say: the corpus is not split again.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Software Engineering/);
});
