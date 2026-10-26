import type { Page } from "@playwright/test";
import { STUB_HINT, expect, openSample, rememberKey, test } from "./fixtures";

/** True when the focused element is inside the open dialog. */
const focusInDialog = (page: Page) =>
  page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));

test.describe("hint dialog", () => {
  test.beforeEach(async ({ page }) => {
    await rememberKey(page);
    await openSample(page);
  });

  test("takes focus, traps it, makes the page behind inert, and gives focus back", async ({
    page,
  }) => {
    const opener = page.getByRole("button", { name: /^Hint/ }).first();
    await opener.click();
    const dialog = page.getByRole("dialog", { name: /Hint for question/ });
    await expect(dialog.getByText(STUB_HINT)).toBeVisible();

    // Initial focus is inside the dialog.
    expect(await focusInDialog(page)).toBe(true);

    // Tab and Shift+Tab never leave it.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(await focusInDialog(page)).toBe(true);
    }
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await focusInDialog(page)).toBe(true);
    }

    // The page behind is inert: out of the tab order and the accessibility tree.
    for (const landmark of ["header", "nav", "main"]) {
      await expect(page.locator(landmark).first()).toHaveJSProperty("inert", true);
    }

    // Escape closes it and focus returns to the button that opened it.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(page.locator("main")).toHaveJSProperty("inert", false);
  });

  test("Close returns focus to the opener", async ({ page }) => {
    const opener = page.getByRole("button", { name: /^Hint/ }).nth(1);
    await opener.click();
    await page.getByRole("dialog").getByRole("button", { name: "Close hint" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

test.describe("key prompt", () => {
  test("focuses the key field, traps focus, and gives focus back on Escape", async ({ page }) => {
    await openSample(page);
    const opener = page.getByRole("button", { name: /^Hint/ }).first();
    await opener.click();

    const dialog = page.getByRole("dialog", { name: "Use your own Gemini key" });
    await expect(dialog.getByLabel("Gemini API key")).toBeFocused();
    await expect(page.locator("main")).toHaveJSProperty("inert", true);

    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(await focusInDialog(page)).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});
