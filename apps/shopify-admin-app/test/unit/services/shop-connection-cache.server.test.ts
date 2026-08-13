import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setCachedShopConnection,
  getCachedShopConnection,
  clearShopConnectionCache,
  getShopConnectionCacheSnapshot,
} from "../../../app/services/shop-connection-cache.server";

const validConnection = {
  connected: true,
  name: "Tienda",
  myshopifyDomain: "tienda.myshopify.com",
  primaryDomainHost: "tienda.com",
  planName: null,
  error: null,
  source: "live" as const,
};

describe("shop-connection-cache.server", () => {
  beforeEach(() => {
    clearShopConnectionCache();
    delete process.env.SHOP_CONNECTION_CACHE_TTL_MS;
  });

  afterEach(() => {
    clearShopConnectionCache();
  });

  it("returns null for an unknown shopId", () => {
    expect(getCachedShopConnection("missing")).toBeNull();
  });

  it("stores and retrieves a connection marking the source as cache", () => {
    setCachedShopConnection("shop-1", validConnection);

    const entry = getCachedShopConnection("shop-1");

    expect(entry).not.toBeNull();
    expect(entry!.value.connected).toBe(true);
    expect(entry!.value.source).toBe("cache");
    expect(entry!.ageMs).toBeGreaterThanOrEqual(0);
  });

  it("expires entries past their TTL", () => {
    vi.useFakeTimers();
    try {
      process.env.SHOP_CONNECTION_CACHE_TTL_MS = "50";
      setCachedShopConnection("shop-1", validConnection);

      vi.advanceTimersByTime(100);

      expect(getCachedShopConnection("shop-1")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes expired entries from the cache map", () => {
    vi.useFakeTimers();
    try {
      process.env.SHOP_CONNECTION_CACHE_TTL_MS = "50";
      setCachedShopConnection("shop-1", validConnection);

      vi.advanceTimersByTime(100);
      expect(getCachedShopConnection("shop-1")).toBeNull();

      expect(getShopConnectionCacheSnapshot()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the default TTL for invalid env values", () => {
    vi.useFakeTimers();
    try {
      process.env.SHOP_CONNECTION_CACHE_TTL_MS = "abc";
      setCachedShopConnection("shop-1", validConnection);

      // Default TTL is 5 minutes; nothing should expire at 2 minutes.
      vi.advanceTimersByTime(2 * 60 * 1000);
      expect(getCachedShopConnection("shop-1")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces an existing entry on re-set", () => {
    setCachedShopConnection("shop-1", validConnection);
    setCachedShopConnection("shop-1", { ...validConnection, name: "Otra Tienda" });

    const entry = getCachedShopConnection("shop-1");
    expect(entry!.value.name).toBe("Otra Tienda");
  });

  it("clears all entries", () => {
    setCachedShopConnection("shop-1", validConnection);
    setCachedShopConnection("shop-2", validConnection);

    clearShopConnectionCache();

    expect(getCachedShopConnection("shop-1")).toBeNull();
    expect(getCachedShopConnection("shop-2")).toBeNull();
  });

  it("returns a snapshot of cached entries", () => {
    setCachedShopConnection("shop-1", validConnection);

    const snapshot = getShopConnectionCacheSnapshot();

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].shopId).toBe("shop-1");
    expect(new Date(snapshot[0].cachedAt).getTime()).not.toBeNaN();
    expect(new Date(snapshot[0].expiresAt).getTime()).toBeGreaterThan(
      new Date(snapshot[0].cachedAt).getTime(),
    );
  });
});
