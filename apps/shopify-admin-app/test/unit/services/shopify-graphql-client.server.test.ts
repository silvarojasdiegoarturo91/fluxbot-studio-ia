import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runShopifyGraphqlRequest,
  type ShopifyGraphqlExecutor,
} from "../../../app/services/shopify-graphql-client.server";

const QUERY = `query Test { shop { name } }`;

const baseContext = {
  shopId: "shop-1",
  queryName: "TestQuery",
  requestId: "req-1",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("shopify-graphql-client.server", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete process.env.SHOPIFY_GRAPHQL_TIMEOUT_MS;
    delete process.env.SHOPIFY_GRAPHQL_MAX_RETRIES;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("success paths", () => {
    it("returns the response with attempts=1 on first-try success", async () => {
      const executor: ShopifyGraphqlExecutor = vi
        .fn()
        .mockResolvedValue(jsonResponse({ data: { shop: { name: "x" } } }));

      const result = await runShopifyGraphqlRequest(executor, QUERY, baseContext);

      expect(result.attempts).toBe(1);
      expect(result.response.status).toBe(200);
      expect(executor).toHaveBeenCalledTimes(1);
      expect(executor).toHaveBeenCalledWith(QUERY, { signal: expect.any(AbortSignal) });
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it("retries on 503 then succeeds on the second attempt", async () => {
      const executor = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, 503))
        .mockResolvedValueOnce(jsonResponse({ data: {} }));

      const promise = runShopifyGraphqlRequest(executor, QUERY, {
        ...baseContext,
        maxRetries: 3,
      });

      await vi.advanceTimersByTimeAsync(500);

      const result = await promise;
      expect(result.attempts).toBe(2);
      expect(executor).toHaveBeenCalledTimes(2);
      expect(console.warn).toHaveBeenCalled();
    });

    it("returns the final response after retryable HTTP statuses are exhausted (no throw)", async () => {
      const executor = vi.fn().mockResolvedValue(jsonResponse({}, 500));

      const promise = runShopifyGraphqlRequest(executor, QUERY, {
        ...baseContext,
        maxRetries: 2,
      });

      await vi.advanceTimersByTimeAsync(500 + 1000);

      const result = await promise;
      expect(result.attempts).toBe(2);
      expect(result.response.status).toBe(500);
      expect(executor).toHaveBeenCalledTimes(2);
    });
  });

  describe("non-retryable HTTP statuses", () => {
    it("returns 401 response immediately without retry", async () => {
      const executor = vi.fn().mockResolvedValue(jsonResponse({}, 401));

      const result = await runShopifyGraphqlRequest(executor, QUERY, baseContext);

      expect(result.attempts).toBe(1);
      expect(result.response.status).toBe(401);
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it("returns 422 response immediately without retry", async () => {
      const executor = vi.fn().mockResolvedValue(jsonResponse({}, 422));

      const result = await runShopifyGraphqlRequest(executor, QUERY, baseContext);

      expect(result.attempts).toBe(1);
      expect(result.response.status).toBe(422);
      expect(executor).toHaveBeenCalledTimes(1);
    });
  });

  describe("thrown errors", () => {
    it("classifies messages containing 'timeout' as retryable and throws the friendly message", async () => {
      const executor = vi.fn().mockRejectedValue(new Error("TimeoutError"));

      const promise = runShopifyGraphqlRequest(executor, QUERY, {
        ...baseContext,
        maxRetries: 2,
      });
      const assertion = expect(promise).rejects.toThrow(
        "No pudimos conectar con Shopify. Verifica tu conexión a internet.",
      );
      await vi.advanceTimersByTimeAsync(500 + 1000);

      await assertion;
      expect(executor.mock.calls.length).toBeGreaterThan(1);
    });

    it("retries network errors up to maxRetries then throws", async () => {
      const executor = vi.fn().mockRejectedValue(new Error("network error"));

      const promise = runShopifyGraphqlRequest(executor, QUERY, {
        ...baseContext,
        maxRetries: 2,
      });
      const assertion = expect(promise).rejects.toThrow(
        "No pudimos conectar con Shopify. Verifica tu conexión a internet.",
      );
      await vi.advanceTimersByTimeAsync(500 + 1000);

      await assertion;
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it("attaches the failure cause to the thrown error", async () => {
      const executor = vi.fn().mockRejectedValue(new Error("socket hang up"));

      const promise = runShopifyGraphqlRequest(executor, QUERY, baseContext);
      const assertion = expect(promise).rejects.toMatchObject({
        cause: {
          type: "NETWORK_ERROR",
          retryable: true,
        },
      });
      await vi.advanceTimersByTimeAsync(500 + 1000 + 2000);

      await assertion;
    });

    it("sanitizes unknown thrown errors into their raw message", async () => {
      const executor = vi.fn().mockRejectedValue(new Error("boom"));

      const promise = runShopifyGraphqlRequest(executor, QUERY, {
        ...baseContext,
        maxRetries: 1,
      });

      await expect(promise).rejects.toThrow("boom");
      expect(executor).toHaveBeenCalledTimes(1);
    });
  });

  describe("AbortController timeout", () => {
    it("aborts the executor signal and rejects when it never resolves", async () => {
      const executor: ShopifyGraphqlExecutor = vi.fn().mockImplementation((_query, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("Request timed out")));
        });
      });

      const promise = runShopifyGraphqlRequest(executor, QUERY, {
        ...baseContext,
        maxRetries: 1,
        timeoutMs: 100,
      });
      const assertion = expect(promise).rejects.toThrow("Request timed out");
      await vi.advanceTimersByTimeAsync(100);

      await assertion;
      expect(executor).toHaveBeenCalledTimes(1);
    });
  });

  describe("environment overrides", () => {
    it("uses SHOPIFY_GRAPHQL_MAX_RETRIES env to cap attempts", async () => {
      process.env.SHOPIFY_GRAPHQL_MAX_RETRIES = "1";
      const executor = vi.fn().mockRejectedValue(new Error("fetch failed"));

      await expect(runShopifyGraphqlRequest(executor, QUERY, baseContext)).rejects.toThrow(
        "No pudimos conectar con Shopify. Verifica tu conexión a internet.",
      );
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it("caps retries at 5 even if a larger env value is set", async () => {
      process.env.SHOPIFY_GRAPHQL_MAX_RETRIES = "99";
      const executor = vi.fn().mockRejectedValue(new Error("fetch failed"));

      const promise = runShopifyGraphqlRequest(executor, QUERY, baseContext);
      const assertion = expect(promise).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(500 + 1000 + 2000 + 2000 + 2000);

      await assertion;
      expect(executor.mock.calls.length).toBe(5);
    });
  });
});
