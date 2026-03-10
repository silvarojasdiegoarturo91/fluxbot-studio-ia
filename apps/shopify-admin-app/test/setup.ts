import { beforeAll, afterAll, afterEach } from "vitest";

// Ensure critical env vars exist before test files import app modules.
if (!process.env.SHOPIFY_API_KEY) {
  process.env.SHOPIFY_API_KEY = "test_api_key_12345";
}
if (!process.env.SHOPIFY_API_SECRET) {
  process.env.SHOPIFY_API_SECRET = "test_secret_67890";
}
if (!process.env.SHOPIFY_APP_URL) {
  process.env.SHOPIFY_APP_URL = "https://test.ngrok.io";
}
if (!process.env.SCOPES) {
  process.env.SCOPES = "read_products,write_products,read_orders";
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
}
process.env.NODE_ENV = "test";

// Keep a hook for explicit test lifecycle clarity.
beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
  }
});

afterEach(() => {
  // Clear module cache to ensure fresh imports per test
});

afterAll(() => {
  // Cleanup
});
