/**
 * Shared Playwright test fixtures.
 *
 * Extend base `test` and `expect` here so all spec files import from this
 * module instead of @playwright/test directly:
 *
 *   import { test, expect } from "../fixtures";
 *
 * Add authenticated fixtures (e.g., `authedPage`) in Phase 2 once the
 * E2E_TEST_MODE session bypass is implemented.
 */
import { test as base, expect } from "@playwright/test";

export { expect };

export const test = base.extend<{
  /** Placeholder for future: a page pre-loaded at the app root */
  appPage: void;
}>({
  appPage: async ({ page }, use) => {
    await page.goto("/");
    await use();
  },
});
