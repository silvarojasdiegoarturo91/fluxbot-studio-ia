/**
 * Shop factory — creates test shop objects for use in Playwright tests.
 *
 * These are pure in-memory objects (no DB writes).
 * For DB seeding helpers, see the Vitest factories in test/factories/.
 */

export interface TestShop {
  domain: string;
  accessToken: string;
  name: string;
}

export function buildTestShop(overrides: Partial<TestShop> = {}): TestShop {
  return {
    domain:
      process.env.SHOPIFY_SHOP ||
      process.env.SHOPIFY_DEV_STORE_URL ||
      "quickstart-c8cc9986.myshopify.com",
    accessToken: "test_access_token_e2e",
    name: "FluxBot Test Store",
    ...overrides,
  };
}
