import { PAGE_PHOTO, STUB_KEY, STUB_PAPER, expect, test } from "./fixtures";

test("upload and extraction status is announced as it changes", async ({ page, gemini }) => {
  gemini.holdExtraction();
  await page.goto("/");
  const status = page.getByRole("status").filter({ hasText: /file|page|topic/ });

  await page.locator('input[type="file"][multiple]').setInputFiles(PAGE_PHOTO);
  await expect(status).toHaveText(/1 file ready to analyze/);

  await page.getByRole("button", { name: "Analyze papers" }).click();
  // The own key is asked for here, and checked before anything is extracted.
  const prompt = page.getByRole("dialog", { name: "Use your own Gemini key" });
  await prompt.getByLabel("Gemini API key").fill(STUB_KEY);
  await prompt.getByRole("button", { name: "Use this key" }).click();

  await expect(status).toHaveText(/Extracting: 0 of 1 page done/);
  const bar = page.getByRole("progressbar", { name: `${PAGE_PHOTO.name} extraction progress` });
  await expect(bar).toHaveAttribute("aria-valuenow", "0");
  await expect(bar).toHaveAttribute("aria-valuetext", "0 of 1 page");

  gemini.releaseExtraction();
  await expect(page).toHaveURL(/\/analyze$/);
  await expect(page.getByText(STUB_PAPER).first()).toBeVisible();
  expect(gemini.calls).toEqual(["verify-key", "extract", "group-topics"]);
});
