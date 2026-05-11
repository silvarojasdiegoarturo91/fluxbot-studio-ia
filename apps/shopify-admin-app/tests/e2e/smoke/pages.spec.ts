/**
 * Page-level smoke tests — verify each key route renders without crashing.
 *
 * These tests act as the "open the browser and check" layer:
 * if an AI implements a feature incorrectly (broken imports, missing component,
 * wrong export), the build will fail OR these tests will fail.
 *
 * Run: npm run test:e2e:smoke
 *
 * @smoke
 */
import { expect, test } from "../fixtures";

// ─── Data Sources page ────────────────────────────────────────────────────────

test.describe("Data Sources page @smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/data-sources", {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
  });

  test("page loads without server error", async ({ page }) => {
    // Must not be a 500-level error page
    const title = await page.title();
    expect(title).not.toMatch(/error|500|crash/i);
  });

  test("page renders visible content (not blank)", async ({ page }) => {
    const body = page.locator("body");
    await expect(body).not.toBeEmpty({ timeout: 10_000 });
  });

  test("page has a heading", async ({ page }) => {
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("product management section is present", async ({ page }) => {
    // The section title 'Productos aprendidos' / 'Learned products' must be visible
    const section = page.getByText(/productos aprendidos|learned products/i);
    await expect(section).toBeVisible({ timeout: 10_000 });
  });

  test("product table has column headers", async ({ page }) => {
    // The DataTable renders Producto / Product column header
    const productCol = page.getByRole("columnheader", {
      name: /producto|product/i,
    });
    await expect(productCol).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Product FAQ management page ─────────────────────────────────────────────

test.describe("Product FAQ page @smoke", () => {
  test("route /app/data-sources/products/:id/faq does not 500", async ({
    request,
  }) => {
    // Use a fake product ID — the route should return 404 or redirect, not 500
    const response = await request.get(
      "/app/data-sources/products/nonexistent-product-id/faq",
      { maxRedirects: 0 },
    );
    expect(response.status()).toBeLessThan(500);
  });
});

// ─── Other key routes ─────────────────────────────────────────────────────────

test.describe("Core app routes @smoke", () => {
  const routes = [
    { path: "/app", name: "Dashboard" },
    { path: "/app/data-sources", name: "Data Sources" },
    { path: "/app/onboarding", name: "Onboarding" },
  ];

  for (const { path, name } of routes) {
    test(`${name} (${path}) responds without 5xx`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBeLessThan(500);
    });
  }
});
