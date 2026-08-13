import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateAdminRequest,
  mockEnsureShopForSession,
  mockFetchShopConnection,
} = vi.hoisted(() => ({
  mockAuthenticateAdminRequest: vi.fn(),
  mockEnsureShopForSession: vi.fn(),
  mockFetchShopConnection: vi.fn(),
}));

vi.mock("../../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: mockAuthenticateAdminRequest,
}));

vi.mock("../../../app/services/shop-context.server", () => ({
  ensureShopForSession: mockEnsureShopForSession,
}));

vi.mock("../../../app/services/shop-connection.server", () => ({
  fetchShopConnection: mockFetchShopConnection,
}));

import { loader } from "../../../app/routes/api.health.shopify-connectivity";

function makeRequest(url = "http://localhost/api/health/shopify-connectivity") {
  return new Request(url);
}

function buildConnectedResult() {
  return {
    shopConnection: {
      connected: true,
      name: "Store",
      myshopifyDomain: "store.myshopify.com",
      primaryDomainHost: "store.myshopify.com",
      planName: "Shopify Plus",
      error: null,
      source: "live",
    },
    alerts: [],
    cacheHit: false,
    cacheAgeMs: null,
  };
}

describe("api.health.shopify-connectivity route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateAdminRequest.mockResolvedValue({
      session: { shop: "store.myshopify.com" },
      admin: { graphql: vi.fn() },
    } as never);
    mockEnsureShopForSession.mockResolvedValue({ id: "shop-1", domain: "store.myshopify.com" });
    mockFetchShopConnection.mockResolvedValue(buildConnectedResult());
  });

  it("reports a connected shop with its connection data", async () => {
    const response = await loader({ request: makeRequest(), params: {}, context: {} } as never);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.connected).toBe(true);
    expect(data.cached).toBe(false);
    expect(data.cacheAgeMs).toBeNull();
    expect(data.shopConnection.name).toBe("Store");
    expect(data.alerts).toEqual([]);
    expect(mockFetchShopConnection).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "store.myshopify.com" }),
    );
  });

  it("returns 400 when the shop context cannot be resolved", async () => {
    mockEnsureShopForSession.mockResolvedValue(null);

    const response = await loader({ request: makeRequest(), params: {}, context: {} } as never);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.connected).toBe(false);
  });

  it("surfaces a disconnected connection as ok=false", async () => {
    mockFetchShopConnection.mockResolvedValue({
      shopConnection: {
        connected: false,
        name: null,
        myshopifyDomain: null,
        primaryDomainHost: null,
        planName: null,
        error: "No pudimos conectar con Shopify.",
        source: "live",
      },
      alerts: ["No pudimos conectar con Shopify."],
      cacheHit: true,
      cacheAgeMs: 5000,
    });

    const response = await loader({ request: makeRequest(), params: {}, context: {} } as never);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.cached).toBe(true);
    expect(data.cacheAgeMs).toBe(5000);
  });

  it("returns 500 when the connection check throws a plain error", async () => {
    mockFetchShopConnection.mockRejectedValue(new Error("graphql exploded"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await loader({ request: makeRequest(), params: {}, context: {} } as never);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("graphql exploded");
    errorSpy.mockRestore();
  });

  it("re-throws Response errors (auth redirects) instead of converting them", async () => {
    const redirectResponse = new Response(null, { status: 302, headers: { Location: "/auth" } });
    mockFetchShopConnection.mockRejectedValue(redirectResponse);

    await expect(loader({ request: makeRequest(), params: {}, context: {} } as never)).rejects.toBe(
      redirectResponse,
    );
  });

  it("falls back to the session shop when resolving the shop id", async () => {
    mockEnsureShopForSession.mockResolvedValue({ id: "shop-1", domain: "store.myshopify.com" });
    mockAuthenticateAdminRequest.mockResolvedValue({
      session: { shop: "override.myshopify.com" },
      admin: {},
    } as never);

    await loader({ request: makeRequest(), params: {}, context: {} } as never);

    expect(mockFetchShopConnection).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "override.myshopify.com" }),
    );
  });
});
