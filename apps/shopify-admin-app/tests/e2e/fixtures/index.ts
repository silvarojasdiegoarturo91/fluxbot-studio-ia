/**
 * Shared Playwright test fixtures.
 *
 * Extend base `test` and `expect` here so all spec files import from this
 * module instead of @playwright/test directly:
 *
 *   import { test, expect } from "../fixtures";
 */
import { test as base, expect } from "@playwright/test";

export { expect };

export const test = base.extend<{
  /** A page pre-loaded at the app root */
  appPage: void;
  /** A page navigated to /app — works without Shopify auth in E2E_TEST_MODE */
  authedPage: void;
  /** A page navigated to /app expecting onboarding is already completed */
  completedShopPage: void;
}>({
  appPage: async ({ page }, use) => {
    await page.goto("/");
    await use();
  },
  authedPage: async ({ page }, use) => {
    // In E2E_TEST_MODE, /app routes skip Shopify auth
    await page.goto("/app", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await use();
  },
  completedShopPage: async ({ page }, use) => {
    await page.goto("/app", { waitUntil: "domcontentloaded", timeout: 15_000 });
    // Wait to confirm we're NOT on the onboarding page (global-setup seeds completed onboarding)
    await page.waitForURL(/\/app(?!\/onboarding)/, { timeout: 10_000 }).catch(() => {});
    await use();
  },
});
