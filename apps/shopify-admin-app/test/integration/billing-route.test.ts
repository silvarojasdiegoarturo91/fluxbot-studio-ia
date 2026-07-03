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
    getUsageStatus: vi.fn(),
    listPlans: vi.fn(),
    getPlan: vi.fn(),
    createSubscription: vi.fn(),
  },
}));

import { authenticateAdminRequest } from "../../app/utils/authenticate-admin.server";
import { ensureShopForSession } from "../../app/services/shop-context.server";
import { BillingService } from "../../app/services/billing.server";

const mockAuthenticateAdminRequest = vi.mocked(authenticateAdminRequest);
const mockEnsureShopForSession = vi.mocked(ensureShopForSession);
const mockBillingService = vi.mocked(BillingService);

function makePostRequest(fields: Record<string, string>, query = "") {
  return new Request(`http://localhost/app/billing${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("app.billing route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthenticateAdminRequest.mockResolvedValue({
      session: { shop: "shop.example.myshopify.com" },
    } as any);
    mockEnsureShopForSession.mockResolvedValue({
      id: "shop-1",
      domain: "shop.example.myshopify.com",
    } as any);
    mockBillingService.listPlans.mockReturnValue([
      {
        id: "starter",
        name: "Starter",
        amountUsd: 19,
        interval: "EVERY_30_DAYS",
        description: "Starter plan",
      },
      {
        id: "growth",
        name: "Growth",
        amountUsd: 49,
        interval: "EVERY_30_DAYS",
        description: "Growth plan",
      },
    ] as any);
    mockBillingService.getStatus.mockResolvedValue({
      hasActiveSubscription: true,
      subscriptions: [
        {
          id: "sub-1",
          name: "Starter",
          status: "ACTIVE",
          test: true,
          priceAmount: "19",
          priceCurrency: "USD",
          interval: "EVERY_30_DAYS",
        },
      ],
    } as any);
    mockBillingService.getUsageStatus.mockResolvedValue({
      currentUsage: 125,
      includedUsage: 500,
      billedBlocks: 0,
      cappedAmount: 100,
      status: "active",
    } as any);
    mockBillingService.getPlan.mockReturnValue({
      id: "starter",
      name: "Starter",
      amountUsd: 19,
      interval: "EVERY_30_DAYS",
      description: "Starter plan",
    } as any);
  });

  it("loads billing status and plans", async () => {
    const { loader } = await import("../../app/routes/app.billing");
    const data = await loader({ request: new Request("http://localhost/app/billing") } as any);

    expect(data.shop.id).toBe("shop-1");
    expect(data.status.hasActiveSubscription).toBe(true);
    expect(data.plans).toHaveLength(2);
    expect(data.error).toBeNull();
  });

  it("falls back when billing status cannot be loaded", async () => {
    mockBillingService.getStatus.mockRejectedValue(new Error("Billing unavailable"));

    const { loader } = await import("../../app/routes/app.billing");
    const data = await loader({ request: new Request("http://localhost/app/billing") } as any);

    expect(data.status.hasActiveSubscription).toBe(false);
    expect(data.status.subscriptions).toEqual([]);
    expect(data.error).toBe("Billing unavailable");
  });

  it("creates a Shopify subscription and redirects to the confirmation URL", async () => {
    mockBillingService.createSubscription.mockResolvedValue({
      confirmationUrl: "https://shopify.example/confirm",
      subscriptionId: "sub-123",
    } as any);

    const { action } = await import("../../app/routes/app.billing");
    const response = await action({
      request: makePostRequest(
        {
          intent: "create_subscription",
          planId: "starter",
          testMode: "true",
        },
        "?source=admin",
      ),
    } as any);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("https://shopify.example/confirm");
    expect(mockBillingService.createSubscription).toHaveBeenCalledWith({
      shopId: "shop-1",
      planId: "starter",
      returnUrl: "http://localhost/app/billing?source=admin",
      test: true,
    });
  });

  it("rejects unsupported billing intents and invalid plans", async () => {
    const { action } = await import("../../app/routes/app.billing");

    const unsupported = await action({
      request: makePostRequest({
        intent: "unsupported",
        planId: "starter",
      }),
    } as any);
    expect(unsupported).toEqual({ ok: false, error: "Unsupported action" });

    mockBillingService.getPlan.mockReturnValue(null);
    const invalidPlan = await action({
      request: makePostRequest({
        intent: "create_subscription",
        planId: "enterprise",
      }),
    } as any);
    expect(invalidPlan).toEqual({ ok: false, error: "Invalid billing plan" });
  });

  it("rejects non-POST requests and missing shops", async () => {
    const { action } = await import("../../app/routes/app.billing");

    const methodNotAllowed = await action({
      request: new Request("http://localhost/app/billing", { method: "GET" }),
    } as any);
    expect(methodNotAllowed).toEqual({ ok: false, error: "Method not allowed" });

    mockEnsureShopForSession.mockResolvedValueOnce(null);
    const missingShop = await action({
      request: makePostRequest({
        intent: "create_subscription",
        planId: "starter",
      }),
    } as any);
    expect(missingShop).toEqual({ ok: false, error: "Shop not found" });
  });
});
