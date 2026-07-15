import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearShopConnectionCache,
  setCachedShopConnection,
} from "../../app/services/shop-connection-cache.server";
import { fetchShopConnection } from "../../app/services/shop-connection.server";

describe("Shop connection resilience", () => {
  beforeEach(() => {
    clearShopConnectionCache();
    vi.restoreAllMocks();
  });

  it("retries transient network failures before succeeding", async () => {
    const graphql = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              shop: {
                name: "Retry Shop",
                myshopifyDomain: "retry.myshopify.com",
                primaryDomain: { host: "retry.example.com" },
                plan: { displayName: "Shopify Plus" },
              },
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await fetchShopConnection({
      admin: { graphql: graphql as any },
      shopId: "retry.myshopify.com",
      requestId: "req-retry",
    });

    expect(graphql).toHaveBeenCalledTimes(3);
    expect(result.shopConnection.connected).toBe(true);
    expect(result.shopConnection.name).toBe("Retry Shop");
    expect(result.shopConnection.source).toBe("live");
    expect(result.alerts).toContain("Shopify respondió tras reintentos automáticos.");
  });

  it("serves cached shop data when live requests keep failing", async () => {
    setCachedShopConnection("cached.myshopify.com", {
      connected: true,
      name: "Cached Shop",
      myshopifyDomain: "cached.myshopify.com",
      primaryDomainHost: "cached.example.com",
      planName: "Shopify",
      error: null,
      source: "live",
    });

    const graphql = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const result = await fetchShopConnection({
      admin: { graphql: graphql as any },
      shopId: "cached.myshopify.com",
      requestId: "req-cache",
    });

    expect(graphql).toHaveBeenCalledTimes(3);
    expect(result.shopConnection.connected).toBe(true);
    expect(result.shopConnection.source).toBe("cache");
    expect(result.shopConnection.name).toBe("Cached Shop");
    expect(result.alerts[0]).toContain("Usando datos en caché de Shopify");
    expect(result.cacheHit).toBe(true);
  });

  it("returns a friendly message when no cache is available", async () => {
    const graphql = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const result = await fetchShopConnection({
      admin: { graphql: graphql as any },
      shopId: "fresh.myshopify.com",
      requestId: "req-fresh",
    });

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toBe("No pudimos conectar con Shopify. Verifica tu conexión a internet.");
    expect(result.alerts).toContain("No pudimos conectar con Shopify. Verifica tu conexión a internet.");
    expect(result.cacheHit).toBe(false);
  });

  it("classifies authentication errors without retrying", async () => {
    const graphql = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: "Unauthorized" }] }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchShopConnection({
      admin: { graphql: graphql as any },
      shopId: "auth.myshopify.com",
      requestId: "req-auth",
    });

    expect(graphql).toHaveBeenCalledTimes(1);
    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toBe("La sesión con Shopify expiró. Recarga la página.");
  });
});

