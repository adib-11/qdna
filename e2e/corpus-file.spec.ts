import { readFile } from "node:fs/promises";
import { expect, openSample, test } from "./fixtures";

test("a corpus file exports, imports into a new corpus, and reports what it merged", async ({
  page,
  gemini,
}) => {
  await openSample(page);
  const title = await page.getByRole("heading", { level: 1 }).innerText();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export corpus file" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^software-engineering[a-z-]*\.qdna\.json$/);
  const path = await download.path();
  const file = JSON.parse(await readFile(path, "utf8")) as {
    format: string;
    papers: { label: string }[];
  };
  expect(file.format).toBe("qdna-corpus");
  const labels = file.papers.map((paper) => paper.label);
  expect(labels.length).toBeGreaterThan(1);

  // Importing the same file into the open corpus adds nothing and says so.
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(path);
  await expect(page.getByRole("status").filter({ hasText: "already present" })).toHaveText(
    `No papers added. ${labels.length} already present, your copy kept (${labels.join(", ")}).`,
  );

  // Importing it from the landing page starts a new saved corpus with every paper.
  await page.goto("/");
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(path);
  await expect(page.getByRole("status").filter({ hasText: "added" })).toHaveText(
    `${labels.length} papers added (${labels.join(", ")}).`,
  );
  await page
    .getByRole("button", { name: new RegExp(`^Reopen ${title}, ${labels.length} papers`) })
    .last()
    .click();
  await expect(page).toHaveURL(/\/analyze$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);

  // An import makes no model request, and with no key held, no grouping runs.
  expect(gemini.calls).toEqual([]);
});
