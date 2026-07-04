import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: vi.fn(),
}));

vi.mock("../../app/services/shop-context.server", () => ({
  ensureShopForSession: vi.fn(),
}));

vi.mock("../../app/services/billing.server", () => ({
  BillingService: {
    getStatus: vi.fn(),
    getPlan: vi.fn(),
  },
}));

import { authenticateAdminRequest } from "../../app/utils/authenticate-admin.server";
import { ensureShopForSession } from "../../app/services/shop-context.server";
import { BillingService } from "../../app/services/billing.server";

const mockAuthenticateAdminRequest = vi.mocked(authenticateAdminRequest);
const mockEnsureShopForSession = vi.mocked(ensureShopForSession);
const mockBillingService = vi.mocked(BillingService);

describe("app.billing.thank-you route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateAdminRequest.mockResolvedValue({
      session: { shop: "shop.example.myshopify.com" },
    } as any);
    mockEnsureShopForSession.mockResolvedValue({
      id: "shop-1",
      domain: "shop.example.myshopify.com",
    } as any);
    mockBillingService.getStatus.mockResolvedValue({
      hasActiveSubscription: true,
      subscriptions: [],
    } as any);
    mockBillingService.getPlan.mockReturnValue({
      id: "starter",
      name: "FluxBot Starter",
      includedMessages: 500,
    } as any);
  });

  it("loads thank-you data and redirects back to dashboard with embedded context", async () => {
    const { loader } = await import("../../app/routes/app.billing.thank-you");

    const data = await loader({
      request: new Request(
        "http://localhost/app/billing/thank-you?shop=shop.example.myshopify.com&host=dGVzdA==&embedded=1&plan=starter",
      ),
    } as any);

    expect(data.dashboardUrl).toBe("/app?shop=shop.example.myshopify.com&host=dGVzdA%3D%3D&embedded=1");
    expect(data.hasActiveSubscription).toBe(true);
    expect(data.selectedPlan?.id).toBe("starter");
  });

  it("falls back to /app when return query has no embedded context", async () => {
    const { loader } = await import("../../app/routes/app.billing.thank-you");
    const data = await loader({
      request: new Request("http://localhost/app/billing/thank-you?plan=starter"),
    } as any);

    expect(data.dashboardUrl).toBe("/app");
  });
});
