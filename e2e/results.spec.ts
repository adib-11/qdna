import { STUB_HINT, expect, expectNoAxeViolations, openSample, rememberKey, test } from "./fixtures";

test("the Pareto chart has a text summary and a table equivalent", async ({ page }) => {
  await openSample(page);
  const chart = page.getByRole("region", { name: "Pareto chart, scrolls sideways" });
  await expect(chart).toHaveAccessibleDescription(
    /^The top \d+ of \d+ topics cover \d+\.\d% of every question, the first to reach the 70% line\.$/,
  );

  const table = page.getByRole("table", { name: "Pareto coverage by topic" });
  await expect(table).toBeHidden();
  const toggle = page.getByRole("button", { name: "Show the numbers as a table" });
  await toggle.click();
  await expect(table).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide the table" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(table.getByRole("columnheader")).toHaveText([
    "Rank",
    "Topic",
    "Questions",
    "Cumulative",
  ]);
  // One row per topic: the same topics the dossier lists.
  const topics = await page.locator("#questions [id^='topic-']").count();
  await expect(table.locator("tbody tr")).toHaveCount(topics);
});

test("results stay clean on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openSample(page);
  await expectNoAxeViolations(page);
});

test("every region that scrolls can be scrolled from the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 420 });
  await rememberKey(page);
  await openSample(page);
  // The hint dialog scrolls too, on a short screen.
  await page.getByRole("button", { name: /^Hint/ }).first().click();
  await expect(page.getByRole("dialog").getByText(STUB_HINT)).toBeVisible();

  const unreachable = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((el) => {
        const { overflowX, overflowY } = getComputedStyle(el);
        const scrolls =
          (/auto|scroll/.test(overflowX) && el.scrollWidth > el.clientWidth) ||
          (/auto|scroll/.test(overflowY) && el.scrollHeight > el.clientHeight);
        // Focusable itself: Tab reaches it (0) or it takes focus on open (-1).
        // Or a row of links, each of which Tab scrolls into view.
        const allLinks = Array.from(el.children).every((child) =>
          child.querySelector("a[href], button"),
        );
        return scrolls && !el.hasAttribute("tabindex") && !allLinks;
      })
      .map((el) => el.outerHTML.slice(0, 120)),
  );
  expect(unreachable).toEqual([]);
});

test("the print view keeps the evidence and drops the controls", async ({ page }) => {
  await openSample(page);
  await page.emulateMedia({ media: "print" });

  // Controls and navigation are screen-only.
  await expect(page.getByRole("navigation", { name: "Sections" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
  await expect(page.getByRole("button", { name: /^Hint/ }).first()).toBeHidden();
  await expect(page.getByText("Write me a practice paper")).toBeHidden();

  // The chart is too wide for a page, so its numbers print instead.
  await expect(page.getByRole("region", { name: "Pareto chart, scrolls sideways" })).toBeHidden();
  await expect(page.getByRole("table", { name: "Pareto coverage by topic" })).toBeVisible();

  // Every topic prints its questions, not only the one open on screen.
  const lastTopic = page.locator("#questions [id^='topic-']").last();
  await expect(lastTopic.locator("ol li").first()).toBeVisible();
});
