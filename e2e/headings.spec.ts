import type { Page } from "@playwright/test";
import { expect, openSample, test } from "./fixtures";

/** Every heading on the page as "level text", in document order. */
const outline = (page: Page) =>
  page
    .locator("h1, h2, h3, h4, h5, h6")
    .evaluateAll((headings) =>
      headings.map((h) => `${h.tagName[1]} ${h.textContent?.replace(/\s+/g, " ").trim()}`),
    );

test("the landing page outline nests each part under its own heading", async ({ page }) => {
  await page.goto("/");
  expect(await outline(page)).toEqual([
    "1 Every course has a question genome",
    "2 Drop your exam paper PDFs or photos here",
    "2 Saved corpora",
    "2 What qDNA computes",
    "3 Genome map",
    "3 Question lineage",
    "3 Pareto coverage",
  ]);
});

test("the results outline never skips a level", async ({ page }) => {
  await openSample(page);
  const levels = (await outline(page)).map((entry) => Number(entry[0]));
  expect(levels[0]).toBe(1);
  levels.forEach((level, i) => {
    if (i > 0) expect(level).toBeLessThanOrEqual(levels[i - 1] + 1);
  });
});
