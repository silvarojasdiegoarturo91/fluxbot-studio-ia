import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * E2E Playwright configuration.
 *
 * - Uses a dedicated test server on port 3002
 * - Connects to the test PostgreSQL DB on port 5433
 * - Never touches dev (5432) or production databases
 * - Run `npm run dev:e2e` to start the test server before running tests,
 *   OR let Playwright start it automatically via webServer below.
 */

const E2E_BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3002";
const E2E_TIMEOUT = Number(process.env.E2E_TIMEOUT) || 30_000;

export default defineConfig({
  testDir: "./tests/e2e",
  /* Only look for .spec.ts files inside tests/e2e/ — never in test/ */
  testMatch: "**/*.spec.ts",

  /* Run in parallel, but limit workers during CI */
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,

  /* Fail the build if any test.only is accidentally committed */
  forbidOnly: !!process.env.CI,

  /* Retry failed tests once in CI */
  retries: process.env.CI ? 1 : 0,

  /* Timeouts */
  timeout: E2E_TIMEOUT,
  expect: { timeout: 5_000 },

  /* Reporter */
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "playwright-report",
        open: "never",
      },
    ],
  ],

  /* Shared settings for all tests */
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  /* Only run Chromium for now — add more browsers when tests are stable */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /**
   * Optionally start the app before running tests.
   * Set E2E_SKIP_SERVER=1 if you start the server manually with `npm run dev:e2e`.
   *
   * The server reads .env.test automatically (loaded by dev:e2e script).
   */
  webServer: process.env.E2E_SKIP_SERVER
    ? undefined
    : {
        command: "npm run dev:e2e",
        url: E2E_BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
        env: {
          NODE_ENV: "test",
          DATABASE_URL:
            "postgresql://test:test@localhost:5433/test_db?schema=public",
          PORT: "3002",
          SHOPIFY_APP_URL: "http://localhost:3002",
          E2E_TEST_MODE: "true",
        },
      },

  outputDir: "test-results",
});
