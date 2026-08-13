import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunShopifyGraphqlRequest } = vi.hoisted(() => ({
  mockRunShopifyGraphqlRequest: vi.fn(),
}));

vi.mock("../../../app/services/shopify-graphql-client.server", () => ({
  runShopifyGraphqlRequest: mockRunShopifyGraphqlRequest,
}));

const cacheState: Record<string, { value: unknown; setAt: number }> = {};

vi.mock("../../../app/services/shop-connection-cache.server", () => ({
  getCachedShopConnection: (shopId: string) => {
    const entry = cacheState[shopId];
    if (!entry) return null;
    return { value: entry.value, ageMs: Date.now() - entry.setAt };
  },
  setCachedShopConnection: (shopId: string, value: unknown) => {
    cacheState[shopId] = { value, setAt: Date.now() };
  },
  clearShopConnectionCache: () => {
    for (const key of Object.keys(cacheState)) delete cacheState[key];
  },
}));

import { fetchShopConnection, SHOP_CONNECTION_QUERY } from "../../../app/services/shop-connection.server";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeAdmin(overrides: { graphql?: (...args: any[]) => Promise<Response> } = {}) {
  return {
    graphql: overrides.graphql ?? vi.fn(),
  };
}

const shopPayload = {
  data: {
    shop: {
      name: "Mi Tienda",
      myshopifyDomain: "mi-tienda.myshopify.com",
      primaryDomain: { host: "mi-tienda.com" },
      plan: { displayName: "Shopify Plus" },
    },
  },
};

describe("shop-connection.server — fetchShopConnection", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRunShopifyGraphqlRequest.mockReset();
    for (const key of Object.keys(cacheState)) delete cacheState[key];
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a disconnected connection when shopId is missing", async () => {
    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: null });

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toBe("Shop context unavailable.");
    expect(result.alerts).toEqual(["Unable to resolve shop context."]);
    expect(result.cacheHit).toBe(false);
    expect(mockRunShopifyGraphqlRequest).not.toHaveBeenCalled();
  });

  it("returns a disconnected connection on 401 with a session-expired message", async () => {
    mockRunShopifyGraphqlRequest.mockResolvedValue({
      response: jsonResponse({}, 401),
      attempts: 1,
    });

    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: "shop-1" });

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toContain("expiró");
    expect(result.alerts[0]).toContain("expiró");
    expect(mockRunShopifyGraphqlRequest).toHaveBeenCalledWith(
      expect.anything(),
      SHOP_CONNECTION_QUERY,
      expect.objectContaining({ shopId: "shop-1", queryName: "DashboardShopConnection" }),
    );
  });

  it("falls back to cache when response is not ok and cache exists", async () => {
    cacheState["shop-1"] = {
      value: { connected: true, name: "Cache Name", error: null },
      setAt: Date.now() - 10_000,
    };
    mockRunShopifyGraphqlRequest.mockResolvedValue({
      response: jsonResponse({}, 500),
      attempts: 1,
    });

    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: "shop-1" });

    expect(result.cacheHit).toBe(true);
    expect(result.shopConnection).toEqual(cacheState["shop-1"].value);
    expect(result.alerts[0]).toContain("caché");
    expect(result.cacheAgeMs).not.toBeNull();
  });

  it("returns a disconnected connection when response is 500 and no cache", async () => {
    mockRunShopifyGraphqlRequest.mockResolvedValue({
      response: jsonResponse({}, 500),
      attempts: 1,
    });

    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: "shop-1" });

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toContain("Verifica tu conexión a internet");
    expect(result.alerts[0]).toContain("Verifica tu conexión a internet");
  });

  it("returns a disconnected connection for 4xx without cache", async () => {
    mockRunShopifyGraphqlRequest.mockResolvedValue({
      response: jsonResponse({}, 422),
      attempts: 1,
    });

    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: "shop-1" });

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toContain("Verifica tu conexión a internet");
  });

  it("parses graphql errors and falls back to cache when present", async () => {
    cacheState["shop-1"] = {
      value: { connected: true, name: "Cache Name", error: null },
      setAt: Date.now() - 5_000,
    };
    mockRunShopifyGraphqlRequest.mockResolvedValue({
      response: jsonResponse({ errors: [{ message: "GraphQL Client: access denied" }] }),
      attempts: 1,
    });

    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: "shop-1" });

    expect(result.cacheHit).toBe(true);
    expect(result.shopConnection).toEqual(cacheState["shop-1"].value);
  });

  it("returns a disconnected connection when graphql errors exist and no cache", async () => {
    mockRunShopifyGraphqlRequest.mockResolvedValue({
      response: jsonResponse({ errors: [{ message: "access denied" }] }),
      attempts: 1,
    });

    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: "shop-1" });

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toBe("access denied");
  });

  it("sanitizes a fetch-failed graphql error message", async () => {
    mockRunShopifyGraphqlRequest.mockResolvedValue({
      response: jsonResponse({ errors: [{ message: "Http request error, no response available: fetch failed" }] }),
      attempts: 1,
    });

    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: "shop-1" });

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toContain("Verifica tu conexión a internet");
  });

  it("falls back to cache when no shop data returned", async () => {
    cacheState["shop-1"] = {
      value: { connected: true, name: "Cache Name", error: null },
      setAt: Date.now() - 3_000,
    };
    mockRunShopifyGraphqlRequest.mockResolvedValue({
      response: jsonResponse({ data: {} }),
      attempts: 1,
    });

    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: "shop-1" });

    expect(result.cacheHit).toBe(true);
    expect(result.shopConnection).toEqual(cacheState["shop-1"].value);
  });

  it("returns disconnected connection when no shop data and no cache", async () => {
    mockRunShopifyGraphqlRequest.mockResolvedValue({
      response: jsonResponse({ data: {} }),
      attempts: 1,
    });

    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: "shop-1" });

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toBe("No shop data returned by Admin API.");
  });

  it("builds a connected connection and caches it", async () => {
    mockRunShopifyGraphqlRequest.mockResolvedValue({
      response: jsonResponse(shopPayload),
      attempts: 1,
    });

    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: "shop-1" });

    expect(result.shopConnection.connected).toBe(true);
    expect(result.shopConnection.name).toBe("Mi Tienda");
    expect(result.shopConnection.myshopifyDomain).toBe("mi-tienda.myshopify.com");
    expect(result.shopConnection.primaryDomainHost).toBe("mi-tienda.com");
    expect(result.shopConnection.planName).toBe("Shopify Plus");
    expect(result.cacheHit).toBe(false);
    expect(cacheState["shop-1"]).toBeDefined();
  });

  it("adds a retry alert when attempts > 1", async () => {
    mockRunShopifyGraphqlRequest.mockResolvedValue({
      response: jsonResponse(shopPayload),
      attempts: 2,
    });

    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: "shop-1" });

    expect(result.shopConnection.connected).toBe(true);
    expect(result.alerts).toEqual(["Shopify respondió tras reintentos automáticos."]);
  });

  it("falls back to cache when the request throws", async () => {
    cacheState["shop-1"] = {
      value: { connected: true, name: "Cache Name", error: null },
      setAt: Date.now() - 8_000,
    };
    mockRunShopifyGraphqlRequest.mockRejectedValue(new Error("boom"));

    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: "shop-1" });

    expect(result.cacheHit).toBe(true);
    expect(result.shopConnection).toEqual(cacheState["shop-1"].value);
  });

  it("returns a sanitized disconnected connection when the request throws and no cache", async () => {
    mockRunShopifyGraphqlRequest.mockRejectedValue(
      new Error("Http request error, no response available: fetch failed"),
    );

    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: "shop-1" });

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toContain("Verifica tu conexión a internet");
    expect(result.alerts[0]).toContain("Verifica tu conexión a internet");
  });

  it("handles invalid JSON payload from response", async () => {
    mockRunShopifyGraphqlRequest.mockResolvedValue({
      response: new Response("not json", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
      attempts: 1,
    });

    const result = await fetchShopConnection({ admin: makeAdmin(), shopId: "shop-1" });

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toBe("No shop data returned by Admin API.");
  });
});
