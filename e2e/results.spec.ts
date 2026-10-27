import {
  STUB_HINT,
  expect,
  expectNoAxeViolations,
  openSample,
  openTab,
  rememberKey,
  test,
} from "./fixtures";

const TABS = [
  ["Plan", "plan", "Study these first"],
  ["Questions", "questions", "Questions"],
  ["Lineages", "lineages", "Lineages"],
  ["Practice", "practice", "Write me a practice paper"],
  ["How we know", "how-we-know", "How we know"],
] as const;

test("each tab opens its own panel and is kept in ?tab=", async ({ page }) => {
  await openSample(page);
  const heading = (name: string) => page.getByRole("heading", { level: 2, name, exact: true });
  await expect(heading("Study these first")).toBeVisible();

  for (const [name, id, title] of TABS) {
    await openTab(page, name);
    await expect(page).toHaveURL(new RegExp(`/analyze\\?tab=${id}$`));
    await expect(heading(title)).toBeVisible();
    // Only the open tab shows on screen.
    for (const [, , other] of TABS) if (other !== title) await expect(heading(other)).toBeHidden();
  }

  // Back and forward walk the tabs, and a reload stays on the open one.
  await page.goBack();
  await expect(page).toHaveURL(/\?tab=practice$/);
  await expect(heading("Write me a practice paper")).toBeVisible();
  await expect(page.getByRole("link", { name: "Practice", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goForward();
  await expect(heading("How we know")).toBeVisible();
  await page.reload();
  await expect(heading("How we know")).toBeVisible();
  await expect(heading("Study these first")).toBeHidden();
});

test("a topic in the plan opens its questions", async ({ page }) => {
  await openSample(page);
  // The second topic: the first starts open anyway.
  const link = page.locator("#plan ol a").nth(1);
  const topic = await link.innerText();
  await link.click();
  await expect(page).toHaveURL(/\?tab=questions#topic-2$/);
  const row = page.locator("#topic-2");
  const toggle = row.getByRole("button").first();
  await expect(toggle).toContainText(topic);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(row.locator("ol li").first()).toBeVisible();
});

test("the Pareto chart has a text summary and a table equivalent", async ({ page }) => {
  await openSample(page);
  await openTab(page, "How we know");
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
  await openTab(page, "Questions");
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
  await expect(page.getByRole("navigation", { name: "Results" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
  await expect(page.getByRole("button", { name: /^Hint/ }).first()).toBeHidden();
  await expect(page.getByText("Write me a practice paper")).toBeHidden();

  // The chart is too wide for a page, so its numbers print instead.
  await expect(page.getByRole("region", { name: "Pareto chart, scrolls sideways" })).toBeHidden();
  await expect(page.getByRole("table", { name: "Pareto coverage by topic" })).toBeVisible();

  // Every tab prints, not only the one open on screen.
  for (const [, , title] of TABS.filter(([name]) => name !== "Practice")) {
    await expect(page.getByRole("heading", { level: 2, name: title, exact: true })).toBeVisible();
  }

  // Every topic prints its questions, not only the one open on screen.
  const lastTopic = page.locator("#questions [id^='topic-']").last();
  await expect(lastTopic.locator("ol li").first()).toBeVisible();
});
