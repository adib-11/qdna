import type { Page } from "@playwright/test";
import {
  PAGE_PHOTO,
  STUB_PAPER,
  expect,
  expectNoAxeViolations,
  openSample,
  rememberKey,
  test,
} from "./fixtures";

/** The stubbed paper prints STB 1101, which the Software Engineering sample never does. */
async function addStubPaper(page: Page) {
  await page.locator('input[type="file"][multiple]').setInputFiles(PAGE_PHOTO);
}

/** The Software Engineering sample's title, as its papers print it. */
const TITLE = "Software Engineering & Information System Design";

const removeButtons = (page: Page) =>
  page.getByRole("button", { name: /^Remove / });

test("a paper from another offering asks first, then joins the corpus on yes", async ({
  page,
  gemini,
}) => {
  await rememberKey(page);
  await openSample(page);
  await expect(removeButtons(page)).toHaveCount(7);

  await addStubPaper(page);
  const ask = page.getByRole("alertdialog", { name: `Same course as ${TITLE}?` });
  await expect(ask).toContainText(`${STUB_PAPER} is printed STB 1101`);
  await expect(ask.getByRole("button", { name: "Yes, same course" })).toBeFocused();
  await expectNoAxeViolations(page);

  await ask.getByRole("button", { name: "Yes, same course" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Added/ })).toHaveText(
    new RegExp(`^Added ${STUB_PAPER}: 3 questions, 1 new topic`),
  );
  await expect(removeButtons(page)).toHaveCount(8);
  expect(gemini.calls.filter((c) => c !== "verify-key")).toEqual(["extract", "group-new-labels"]);
  await expectNoAxeViolations(page);

  // The same paper again is skipped, and the cache means no second extraction.
  await addStubPaper(page);
  await expect(
    page.getByRole("status").filter({ hasText: `${STUB_PAPER} is already in this corpus, skipped.` }),
  ).toBeVisible();
  await expect(removeButtons(page)).toHaveCount(8);
  expect(gemini.calls.filter((c) => c === "extract")).toHaveLength(1);
});

test("a paper from another offering is saved as its own corpus on no", async ({ page }) => {
  await rememberKey(page);
  await openSample(page);

  await addStubPaper(page);
  await page.getByRole("button", { name: "No, save it on its own" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved STB 1101 as its own corpus" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITLE);
  await expect(removeButtons(page)).toHaveCount(7);
});

test("a paper can be removed after confirmation", async ({ page }) => {
  await openSample(page);
  const paper = "2018 Final ECE 3117";

  await page.getByRole("button", { name: `Remove ${paper}` }).click();
  const confirm = page.getByRole("alertdialog", { name: new RegExp(`^Remove ${paper}\\?`) });
  await expect(confirm.getByRole("button", { name: "Keep it" })).toBeFocused();
  await expectNoAxeViolations(page);

  await confirm.getByRole("button", { name: "Keep it" }).click();
  await expect(removeButtons(page)).toHaveCount(7);

  await page.getByRole("button", { name: `Remove ${paper}` }).click();
  await page.getByRole("button", { name: `Remove ${paper}`, exact: true }).last().click();
  await expect(page.getByRole("status").filter({ hasText: `Removed ${paper}.` })).toBeVisible();
  await expect(removeButtons(page)).toHaveCount(6);
});
