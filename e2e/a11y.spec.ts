import { exportCorpusFile } from "../lib/corpus/corpusFile";
import type { Question } from "../lib/types";
import {
  PAGE_PHOTO,
  STUB_HINT,
  expect,
  expectNoAxeViolations,
  openSample,
  openTab,
  rememberKey,
  test,
} from "./fixtures";

/** A corpus file holding one paper the bundled sample does not have. */
function corpusFile() {
  const question: Question = {
    id: "2026 Final::1(a)",
    course: "Software Engineering",
    courseCodes: ["ECE 3117"],
    paper: { type: "Final", label: "2026 Final", section: null, year: 2026 },
    qNo: "1(a)",
    marks: 10,
    text: "Explain the spiral model.",
    topic: "Software process models",
    isNumerical: false,
  };
  return {
    name: "classmate.qdna.json",
    mimeType: "application/json",
    buffer: Buffer.from(exportCorpusFile([question])),
  };
}

test.describe("axe finds no violations", () => {
  test("landing", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Choose files" })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("empty upload", async ({ page }) => {
    await page.goto("/analyze");
    await expect(page.getByRole("heading", { name: "Nothing to analyze yet" })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("files chosen", async ({ page }) => {
    await page.goto("/");
    await page.locator('input[type="file"][multiple]').setInputFiles(PAGE_PHOTO);
    await expect(page.getByRole("status").filter({ hasText: "1 file ready" })).toBeAttached();
    await expectNoAxeViolations(page);
  });

  test("extracting", async ({ page, gemini }) => {
    await rememberKey(page);
    gemini.holdExtraction();
    await page.goto("/");
    await page.locator('input[type="file"][multiple]').setInputFiles(PAGE_PHOTO);
    await page.getByRole("button", { name: "Analyze papers" }).click();
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel extraction" })).toBeVisible();
    await expectNoAxeViolations(page);
    gemini.releaseExtraction();
  });

  for (const tab of ["Plan", "Questions", "Lineages", "Practice", "How we know"]) {
    test(`results, ${tab}`, async ({ page }) => {
      await openSample(page);
      await openTab(page, tab);
      await expectNoAxeViolations(page);
    });
  }

  test("hint dialog open", async ({ page }) => {
    await rememberKey(page);
    await openSample(page);
    await openTab(page, "Questions");
    await page.getByRole("button", { name: /^Hint/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(STUB_HINT)).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("key prompt", async ({ page }) => {
    await openSample(page);
    await openTab(page, "Questions");
    await page.getByRole("button", { name: /^Hint/ }).first().click();
    await expect(page.getByRole("dialog", { name: "Use your own Gemini key" })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("import summary", async ({ page }) => {
    await openSample(page);
    await page.locator('input[type="file"][accept*="json"]').setInputFiles(corpusFile());
    await expect(page.getByRole("status").filter({ hasText: "2026 Final" })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("print view", async ({ page }) => {
    await openSample(page);
    await page.emulateMedia({ media: "print" });
    await expectNoAxeViolations(page);
  });
});
