/**
 * Settings page E2E tests.
 * Tests the bot configuration settings form.
 */
import { expect, test } from "../fixtures";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/settings", { waitUntil: "domcontentloaded", timeout: 15_000 });
  });

  test("settings page loads without error", async ({ page }) => {
    const response = await page.request.get("/app/settings");
    expect(response.status()).toBeLessThan(500);
  });

  test("settings page has a form", async ({ page }) => {
    await expect(page.locator("form")).toBeVisible({ timeout: 10_000 });
  });

  test("settings page has save button", async ({ page }) => {
    const saveBtn = page
      .locator("button[type='submit'], button")
      .filter({ hasText: /save|guardar/i })
      .first();
    await expect(saveBtn).toBeVisible({ timeout: 10_000 });
  });
});
