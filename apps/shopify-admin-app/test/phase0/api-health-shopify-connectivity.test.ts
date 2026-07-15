import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: vi.fn(),
}));

vi.mock("../../app/services/shop-context.server", () => ({
  ensureShopForSession: vi.fn(),
}));

vi.mock("../../app/services/shop-connection.server", () => ({
  fetchShopConnection: vi.fn(),
}));

import { loader } from "../../app/routes/api.health.shopify-connectivity";
import { authenticateAdminRequest } from "../../app/utils/authenticate-admin.server";
import { ensureShopForSession } from "../../app/services/shop-context.server";
import { fetchShopConnection } from "../../app/services/shop-connection.server";

describe("API health shopify connectivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns connectivity and cache state", async () => {
    vi.mocked(authenticateAdminRequest).mockResolvedValue({
      admin: {},
      session: { shop: "health.myshopify.com" },
    } as any);
    vi.mocked(ensureShopForSession).mockResolvedValue({ id: "shop_1" } as any);
    vi.mocked(fetchShopConnection).mockResolvedValue({
      shopConnection: {
        connected: true,
        name: "Health Shop",
        myshopifyDomain: "health.myshopify.com",
        primaryDomainHost: "health.example.com",
        planName: "Shopify Plus",
        error: null,
        source: "live",
      },
      alerts: [],
      cacheHit: false,
      cacheAgeMs: null,
    } as any);

    const response = await loader({ request: new Request("http://localhost/api/health/shopify-connectivity") } as any);
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.connected).toBe(true);
    expect(body.cached).toBe(false);
    expect(body.shopConnection.source).toBe("live");
    expect(fetchShopConnection).toHaveBeenCalledWith({
      admin: {},
      shopId: "health.myshopify.com",
    });
  });
});

