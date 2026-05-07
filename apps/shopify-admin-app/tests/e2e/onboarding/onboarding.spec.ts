/**
 * Onboarding E2E tests.
 * Tests the 7-step onboarding flow using the E2E auth bypass.
 * Run: npm run test:e2e -- tests/e2e/onboarding/
 */
import { expect, test } from "../fixtures";

test.describe("Onboarding flow", () => {
  test.beforeEach(async ({ page }) => {
    // In test mode, navigating to /app redirects to onboarding if not completed
    await page.goto("/app", { waitUntil: "domcontentloaded", timeout: 15_000 });
  });

  test("redirects to onboarding for new shops", async ({ page }) => {
    // New test shop should redirect to /app/onboarding
    await expect(page).toHaveURL(/\/app\/onboarding/, { timeout: 10_000 });
  });

  test("onboarding page renders step 1", async ({ page }) => {
    await page.goto("/app/onboarding?step=1", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1, h2, [data-testid='onboarding-title']").first()).toBeVisible({ timeout: 10_000 });
  });
});
