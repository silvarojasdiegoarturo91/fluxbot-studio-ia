import type { Page } from "@playwright/test";

/**
 * Navigate to a route and wait for the network to be idle.
 * Useful for SPA transitions that don't trigger full page loads.
 */
export async function gotoAndWait(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "networkidle" });
}

/**
 * Wait until the Polaris spinner is gone (app has loaded).
 * The Shopify admin shell renders a loading skeleton while JS hydrates.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page
    .locator("[data-polaris-spinner]")
    .waitFor({ state: "hidden", timeout: 10_000 })
    .catch(() => {
      // Spinner may not be present — that's fine
    });
}
