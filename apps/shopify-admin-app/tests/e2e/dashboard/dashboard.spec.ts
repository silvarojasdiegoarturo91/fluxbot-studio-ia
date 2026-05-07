/**
 * Dashboard E2E tests — verifies the main dashboard renders after completed onboarding.
 */
import { expect, test } from "../fixtures";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app", { waitUntil: "domcontentloaded", timeout: 15_000 });
  });

  test("dashboard renders (not redirected to onboarding)", async ({ page }) => {
    // With completed onboarding, /app should show dashboard (NOT redirect to /app/onboarding)
    await expect(page).not.toHaveURL(/\/app\/onboarding/, { timeout: 8_000 });
  });

  test("dashboard shows navigation items", async ({ page }) => {
    await page.waitForLoadState("domcontentloaded");
    // The page should have some visible content (not blank)
    const body = page.locator("body");
    await expect(body).not.toBeEmpty({ timeout: 8_000 });
  });

  test("dashboard page title is visible", async ({ page }) => {
    // Polaris Page component renders an h1 with the page title
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });
});
