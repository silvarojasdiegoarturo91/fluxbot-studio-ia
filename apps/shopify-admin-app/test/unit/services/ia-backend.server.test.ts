import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ia-backend.server", () => {
  const originalEnv = {
    IA_BACKEND_URL: process.env.IA_BACKEND_URL,
    IA_BACKEND_API_KEY: process.env.IA_BACKEND_API_KEY,
  };

  beforeEach(() => {
    vi.resetModules();
    process.env.IA_BACKEND_URL = "http://localhost:3001";
    process.env.IA_BACKEND_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (typeof originalEnv.IA_BACKEND_URL === "undefined") {
      delete process.env.IA_BACKEND_URL;
    } else {
      process.env.IA_BACKEND_URL = originalEnv.IA_BACKEND_URL;
    }
    if (typeof originalEnv.IA_BACKEND_API_KEY === "undefined") {
      delete process.env.IA_BACKEND_API_KEY;
    } else {
      process.env.IA_BACKEND_API_KEY = originalEnv.IA_BACKEND_API_KEY;
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
});
