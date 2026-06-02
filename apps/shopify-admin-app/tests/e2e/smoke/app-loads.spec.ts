/**
 * Smoke tests — verify the app server is running and public routes respond.
 *
 * These tests do NOT require Shopify authentication.
 * They only hit public or unauthenticated routes.
 *
 * Run: npm run test:e2e:smoke
 */
import { expect, test } from "../fixtures";

const TEST_SHOP_DOMAIN =
  process.env.SHOPIFY_SHOP ||
  process.env.SHOPIFY_DEV_STORE_URL ||
  "quickstart-c8cc9986.myshopify.com";

test.describe("App smoke — server health", () => {
  test("root URL responds (not 5xx)", async ({ request }) => {
    // The root redirects to Shopify OAuth — any non-5xx status is acceptable
    const response = await request.get("/", { maxRedirects: 0 });
    expect(response.status()).toBeLessThan(500);
  });

  test("GET /llms.txt without shop param returns 400", async ({ request }) => {
    // Public route — no auth needed.
    // Returns 400 when shop param is missing (expected behaviour).
    const response = await request.get("/llms.txt");
    expect(response.status()).toBe(400);

    const body = await response.text();
    expect(body).toContain("Missing shop");
  });

  test("GET /llms.txt with shop param returns 200 or graceful error", async ({
    request,
  }) => {
    // Supply the shop param so the route processes the request.
    // In test mode the IA backend may not be available, so we accept 200 or 502.
    const response = await request.get(
      `/llms.txt?shop=${TEST_SHOP_DOMAIN}`,
    );
    expect([200, 400, 502, 503]).toContain(response.status());
  });

  test("Storefront widget endpoint responds (no auth required)", async ({
    request,
  }) => {
    // The storefront chat endpoints are public (no Shopify session needed)
    const response = await request.get(
      `/widget-config?shop=${TEST_SHOP_DOMAIN}`,
      { maxRedirects: 0 },
    );
    // Any non-5xx means routing is working
    expect(response.status()).toBeLessThan(500);
  });
});
