/**
 * Regression tests — verify critical routes don't return 5xx errors.
 * These run against a fully seeded test shop (onboarding complete).
 *
 * Add any route that has broken in the past to this file.
 */
import { expect, test } from "../fixtures";

const PROTECTED_ROUTES = [
  "/app",
  "/app/settings",
  "/app/widget-settings",
  "/app/conversations",
  "/app/analytics",
  "/app/campaigns",
  "/app/data-sources",
  "/app/operations",
  "/app/billing",
];

test.describe("Regression — critical routes don't 5xx", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`${route} returns non-5xx`, async ({ request }) => {
      const response = await request.get(route, { maxRedirects: 5 });
      expect(response.status()).toBeLessThan(500);
    });
  }
});

test.describe("Regression — public routes", () => {
  test("GET /llms.txt without shop → 400 (not 5xx)", async ({ request }) => {
    const res = await request.get("/llms.txt");
    expect(res.status()).toBe(400);
  });

  test("GET /widget-config → non-5xx", async ({ request }) => {
    const res = await request.get("/widget-config", { maxRedirects: 3 });
    expect(res.status()).toBeLessThan(500);
  });
});
