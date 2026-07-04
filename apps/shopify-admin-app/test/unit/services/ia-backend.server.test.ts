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
});
