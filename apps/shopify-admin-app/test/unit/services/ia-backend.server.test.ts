import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ia-backend.server", () => {
  const originalEnv = {
    IA_BACKEND_URL: process.env.IA_BACKEND_URL,
    IA_BACKEND_API_KEY: process.env.IA_BACKEND_API_KEY,
    IA_BACKEND_TIMEOUT_MS: process.env.IA_BACKEND_TIMEOUT_MS,
    IA_BACKEND_MAX_RETRIES: process.env.IA_BACKEND_MAX_RETRIES,
    IA_BACKEND_RETRY_BACKOFF_MS: process.env.IA_BACKEND_RETRY_BACKOFF_MS,
  };

  beforeEach(() => {
    vi.resetModules();
    process.env.IA_BACKEND_URL = "http://localhost:3001";
    process.env.IA_BACKEND_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ["IA_BACKEND_URL", "IA_BACKEND_API_KEY", "IA_BACKEND_TIMEOUT_MS", "IA_BACKEND_MAX_RETRIES", "IA_BACKEND_RETRY_BACKOFF_MS"]) {
      const originalValue = originalEnv[key as keyof typeof originalEnv];
      if (typeof originalValue === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
  });

  it("describes nested backend error payloads without object serialization", async () => {
    const { describeBackendErrorPayload } = await import("../../../app/services/ia-backend.server");

    const message = describeBackendErrorPayload({
      error: {
        code: "SYNC_ERROR",
        message: "Error al sincronizar el catálogo",
      },
      requestId: "req-1",
    });

    expect(message).toContain("Error al sincronizar el catálogo");
    expect(message).toContain("Código: SYNC_ERROR");
    expect(message).not.toContain("[object Object]");
  });

  it("throws catalog sync errors with a readable backend message", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "SYNC_ERROR",
            message: "Error al sincronizar el catálogo",
          },
          requestId: "req-1",
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const { iaClient } = await import("../../../app/services/ia-backend.server");

    let thrown: Error | null = null;
    try {
      await iaClient.catalog.sync({ shopId: "shop-1", fullSync: true }, "store.myshopify.com");
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown?.message).toContain("Error al sincronizar el catálogo");
    expect(thrown?.message).not.toContain("[object Object]");
  });

  it("unwraps successful catalog sync envelopes and posts the shop domain header", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            chunksIndexed: 6,
            productsProcessed: 6,
            durationMs: 378,
            errors: [],
          },
          requestId: "req-1",
          timestamp: "2026-07-05T00:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const { iaClient } = await import("../../../app/services/ia-backend.server");

    const result = await iaClient.catalog.sync({ shopId: "shop-1", fullSync: true }, "store.myshopify.com");

    expect(result).toEqual({
      chunksIndexed: 6,
      productsProcessed: 6,
      durationMs: 378,
      errors: [],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/catalog/sync",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "X-Shop-Domain": "store.myshopify.com",
        }),
        body: JSON.stringify({ shopId: "shop-1", fullSync: true }),
      }),
    );
  });

  it("registers privacy requests without logging or exposing the customer identifier", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { requestId: "privacy-1", operation: "CUSTOMER_REDACT", status: "ACCEPTED" },
          requestId: "req-1",
          timestamp: "2026-07-19T00:00:00.000Z",
        }),
        { status: 202, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { iaClient } = await import("../../../app/services/ia-backend.server");

    await iaClient.privacy.register(
      { operation: "CUSTOMER_REDACT", customerId: "gid://shopify/Customer/123" },
      "store.myshopify.com",
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/privacy/requests",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Shop-Domain": "store.myshopify.com" }),
      }),
    );
    expect(info.mock.calls.flat().join(" ")).not.toContain("gid://shopify/Customer/123");
  });

  it("fails fast with a 503 when the IA backend stalls (timeout)", async () => {
    process.env.IA_BACKEND_TIMEOUT_MS = "20";
    process.env.IA_BACKEND_MAX_RETRIES = "0";
    const mockFetch = vi.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
        }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const { iaClient, IABackendError } = await import("../../../app/services/ia-backend.server");

    let thrown: unknown = null;
    try {
      await iaClient.providers.list();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IABackendError);
    expect((thrown as IABackendError).statusCode).toBe(503);
    expect(String((thrown as Error).message)).toContain("timed out");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries GET requests once on a transient network error", async () => {
    process.env.IA_BACKEND_MAX_RETRIES = "1";
    process.env.IA_BACKEND_RETRY_BACKOFF_MS = "5";
    const okResponse = new Response(
      JSON.stringify({ data: { providers: [] }, requestId: "req-1" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(okResponse);
    vi.stubGlobal("fetch", mockFetch);

    const { iaClient } = await import("../../../app/services/ia-backend.server");

    const result = await iaClient.providers.list();

    expect(result).toEqual({ providers: [] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenLastCalledWith(
      "http://localhost:3001/api/v1/providers",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
  });

  it("retries GET requests once on a 5xx response", async () => {
    process.env.IA_BACKEND_MAX_RETRIES = "1";
    process.env.IA_BACKEND_RETRY_BACKOFF_MS = "5";
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "boom" }), { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { providers: [] }, requestId: "req-1" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    const { iaClient } = await import("../../../app/services/ia-backend.server");

    const result = await iaClient.providers.list();

    expect(result).toEqual({ providers: [] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries 5xx responses for non-GET calls (server-side failure)", async () => {
    process.env.IA_BACKEND_MAX_RETRIES = "1";
    process.env.IA_BACKEND_RETRY_BACKOFF_MS = "5";
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { message: "ok" }, requestId: "req-1" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    const { iaClient } = await import("../../../app/services/ia-backend.server");

    const result = await iaClient.rag.index([{ chunkId: "c1" }]);

    expect(result).toEqual({ message: "ok" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-GET requests on a network error (ambiguous write)", async () => {
    process.env.IA_BACKEND_MAX_RETRIES = "1";
    const mockFetch = vi.fn().mockRejectedValue(new Error("fetch failed"));
    vi.stubGlobal("fetch", mockFetch);

    const { iaClient, IABackendError } = await import("../../../app/services/ia-backend.server");

    let thrown: unknown = null;
    try {
      await iaClient.shops.sync(
        { shop: { id: "shop-1", domain: "store.myshopify.com" } },
        "store.myshopify.com",
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IABackendError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-retryable HTTP errors (4xx)", async () => {
    process.env.IA_BACKEND_MAX_RETRIES = "1";
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: "bad" }), { status: 400 }));
    vi.stubGlobal("fetch", mockFetch);

    const { iaClient, IABackendError } = await import("../../../app/services/ia-backend.server");

    let thrown: unknown = null;
    try {
      await iaClient.providers.list();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IABackendError);
    expect((thrown as IABackendError).statusCode).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
