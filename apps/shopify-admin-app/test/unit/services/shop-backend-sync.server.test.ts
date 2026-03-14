import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockShopSync = vi.fn();

vi.mock("../../../app/services/ia-backend.server", () => ({
  iaClient: {
    shops: {
      sync: mockShopSync,
    },
  },
}));

describe("shop-backend-sync.server", () => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    IA_EXECUTION_MODE: process.env.IA_EXECUTION_MODE,
    IA_BACKEND_URL: process.env.IA_BACKEND_URL,
    IA_BACKEND_API_KEY: process.env.IA_BACKEND_API_KEY,
    IA_BACKEND_SYNC_IN_TEST: process.env.IA_BACKEND_SYNC_IN_TEST,
  };

  function restoreEnv(key: keyof typeof originalEnv, value: string | undefined) {
    if (typeof value === "undefined") {
      delete process.env[key];
      return;
    }

    process.env[key] = value;
  }

  beforeEach(() => {
    vi.resetModules();
    mockShopSync.mockReset();
    process.env.NODE_ENV = "test";
    process.env.IA_EXECUTION_MODE = "remote";
    process.env.IA_BACKEND_URL = "http://127.0.0.1:3001";
    process.env.IA_BACKEND_API_KEY = "test-key";
    process.env.IA_BACKEND_SYNC_IN_TEST = "true";
  });

  afterEach(() => {
    restoreEnv("NODE_ENV", originalEnv.NODE_ENV);
    restoreEnv("IA_EXECUTION_MODE", originalEnv.IA_EXECUTION_MODE);
    restoreEnv("IA_BACKEND_URL", originalEnv.IA_BACKEND_URL);
    restoreEnv("IA_BACKEND_API_KEY", originalEnv.IA_BACKEND_API_KEY);
    restoreEnv("IA_BACKEND_SYNC_IN_TEST", originalEnv.IA_BACKEND_SYNC_IN_TEST);
  });

  it("syncs a normalized shop reference to the IA backend", async () => {
    mockShopSync.mockResolvedValue({
      shop: { id: "shop-1", domain: "store.myshopify.com" },
      created: true,
      syncedAt: "2026-03-13T10:00:00.000Z",
    });

    const { _resetShopSyncThrottle, syncShopReferenceToIABackend } = await import(
      "../../../app/services/shop-backend-sync.server"
    );

    _resetShopSyncThrottle();

    const synced = await syncShopReferenceToIABackend({
      id: "shop-1",
      domain: " Store.MyShopify.com ",
    });

    expect(synced).toBe(true);
    expect(mockShopSync).toHaveBeenCalledWith(
      { shop: { id: "shop-1", domain: "store.myshopify.com" } },
      "store.myshopify.com",
    );
  });

  it("throttles repeated shop sync calls for the same domain", async () => {
    mockShopSync.mockResolvedValue({
      shop: { id: "shop-1", domain: "store.myshopify.com" },
      created: false,
      syncedAt: "2026-03-13T10:00:00.000Z",
    });

    const { _resetShopSyncThrottle, syncShopReferenceToIABackend } = await import(
      "../../../app/services/shop-backend-sync.server"
    );

    _resetShopSyncThrottle();

    const first = await syncShopReferenceToIABackend({ id: "shop-1", domain: "store.myshopify.com" });
    const second = await syncShopReferenceToIABackend({ id: "shop-1", domain: "store.myshopify.com" });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(mockShopSync).toHaveBeenCalledTimes(1);
  });

  it("skips sync when IA backend execution is local", async () => {
    process.env.IA_EXECUTION_MODE = "local";

    const { _resetShopSyncThrottle, syncShopReferenceToIABackend } = await import(
      "../../../app/services/shop-backend-sync.server"
    );

    _resetShopSyncThrottle();

    const synced = await syncShopReferenceToIABackend({ id: "shop-1", domain: "store.myshopify.com" });

    expect(synced).toBe(false);
    expect(mockShopSync).not.toHaveBeenCalled();
  });
});