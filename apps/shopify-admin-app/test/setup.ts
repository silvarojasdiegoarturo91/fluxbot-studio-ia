import { beforeAll, afterAll, afterEach } from "vitest";

// Mock environment variables for tests
beforeAll(() => {
  process.env.SHOPIFY_API_KEY = "test_api_key_12345";
  process.env.SHOPIFY_API_SECRET = "test_secret_67890";
  process.env.SHOPIFY_APP_URL = "https://test.ngrok.io";
  process.env.SCOPES = "read_products,write_products,read_orders";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  // Clear module cache to ensure fresh imports per test
});

afterAll(() => {
  // Cleanup
});
