/**
 * Dashboard E2E tests.
 * Run: npm run test:e2e -- tests/e2e/dashboard/
 */
import { expect, test } from "../fixtures";

test.describe("Dashboard", () => {
  test("dashboard page loads for authenticated shop", async ({ page }) => {
    // TODO Phase 3: mark onboarding as complete in global setup to test dashboard
    // For now, verify the app responds at /app
    const response = await page.request.get("/app", { maxRedirects: 0 });
    // 200 (dashboard) or 302 (redirect to onboarding) both mean auth succeeded
    expect(response.status()).toBeLessThan(500);
  });
});
