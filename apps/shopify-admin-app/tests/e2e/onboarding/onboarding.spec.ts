/**
 * Onboarding E2E tests.
 * Tests the 7-step onboarding flow using the E2E auth bypass.
 * Run: npm run test:e2e -- tests/e2e/onboarding/
 *
 * NOTE: The global-setup seeds the test shop with onboardingCompleted=true so
 * that dashboard/settings tests can run. Direct navigation to /app/onboarding
 * still works regardless of completion state.
 */
import { expect, test } from "../fixtures";

test.describe("Onboarding flow", () => {
  test("completed shop stays on dashboard (no redirect to onboarding)", async ({ page }) => {
    // The seeded test shop has onboardingCompleted=true, so /app should stay at /app
    await page.goto("/app", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/app\/onboarding/, { timeout: 10_000 });
  });

  test("onboarding page renders step 1", async ({ page }) => {
    await page.goto("/app/onboarding?step=1", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1, h2, [data-testid='onboarding-title']").first()).toBeVisible({ timeout: 10_000 });
  });

  test("can navigate to step 2", async ({ page }) => {
    await page.goto("/app/onboarding?step=2", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1, h2, [data-testid]").first()).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/step=2/, { timeout: 5_000 });
  });
});
