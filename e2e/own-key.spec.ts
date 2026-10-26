import type { Page } from "@playwright/test";
import { STUB_HINT, STUB_KEY, expect, openSample, test } from "./fixtures";

const keyPrompt = (page: Page) => page.getByRole("dialog", { name: "Use your own Gemini key" });
const hintButton = (page: Page) => page.getByRole("button", { name: /^Hint/ }).first();

async function pasteKey(page: Page, key: string, { remember = false } = {}) {
  const prompt = keyPrompt(page);
  await prompt.getByLabel("Gemini API key").fill(key);
  if (remember) await prompt.getByLabel("Remember this key in this browser").check();
  await prompt.getByRole("button", { name: "Use this key" }).click();
}

test("a sample and its analysis need no key and no model call", async ({ page, gemini }) => {
  await openSample(page);
  await expect(keyPrompt(page)).toHaveCount(0);
  expect(gemini.calls).toEqual([]);
});

test("a rejected key is explained, and nothing runs on it", async ({ page, gemini }) => {
  await openSample(page);
  await hintButton(page).click();
  await pasteKey(page, "not-a-real-key");

  const field = keyPrompt(page).getByLabel("Gemini API key");
  await expect(keyPrompt(page).getByRole("alert")).toHaveText(/Google rejected that key/);
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAccessibleDescription(/Google rejected that key/);
  expect(gemini.calls).toEqual([]);
});

test("an accepted key is held for this tab only, and can be forgotten", async ({
  page,
  gemini,
}) => {
  await openSample(page);
  await hintButton(page).click();
  await pasteKey(page, STUB_KEY);

  await expect(page.getByRole("dialog").getByText(STUB_HINT)).toBeVisible();
  expect(gemini.calls).toEqual(["verify-key", "hint"]);
  await page.keyboard.press("Escape");

  await expect(page.getByText("Your Gemini key is held in memory for this tab only.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("qdna:own-key:v1"))).toBeNull();

  await page.getByRole("button", { name: "Forget key" }).click();
  await expect(page.getByRole("button", { name: "Forget key" })).toHaveCount(0);
  await hintButton(page).click();
  await expect(keyPrompt(page)).toBeVisible();
});

test("a remembered key survives a reload", async ({ page, gemini }) => {
  await openSample(page);
  await hintButton(page).click();
  await pasteKey(page, STUB_KEY, { remember: true });
  await expect(page.getByRole("dialog").getByText(STUB_HINT)).toBeVisible();

  await page.reload();
  await expect(page.getByText("Your Gemini key is remembered in this browser.")).toBeVisible();
  await hintButton(page).click();
  await expect(page.getByRole("dialog").getByText(STUB_HINT)).toBeVisible();
  // Checked once, when it was pasted; a remembered key is not re-checked.
  expect(gemini.calls).toEqual(["verify-key", "hint", "hint"]);
});
