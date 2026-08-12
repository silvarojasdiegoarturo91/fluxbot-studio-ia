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
    resolveCurrentPlan: vi.fn(),
    syncPlansWithBackend: vi.fn(),
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
      session: { shop: "shop.example.myshopify.com", accessToken: "mock-access-token" },
    } as any);
    mockEnsureShopForSession.mockResolvedValue({
      id: "shop-1",
      domain: "shop.example.myshopify.com",
    } as any);
    mockBillingService.listPlans.mockResolvedValue([
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
    mockBillingService.resolveCurrentPlan.mockResolvedValue({
      planId: "starter",
      source: "shopify",
      hasActiveSubscription: true,
    } as any);
    mockBillingService.syncPlansWithBackend.mockResolvedValue({
      inSync: true,
      remoteCount: 5,
      drift: [],
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

  it("creates a Shopify subscription and returns the confirmation URL as data", async () => {
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
        },
        "?source=admin",
      ),
    } as any);

    // Action now returns data instead of a redirect so the client can navigate
    // window.top (required for Shopify embedded apps to break out of the iframe).
    expect(response).not.toBeInstanceOf(Response);
    expect((response as any).ok).toBe(true);
    expect((response as any).confirmationUrl).toBe("https://shopify.example/confirm");
    expect(mockBillingService.createSubscription).toHaveBeenCalledWith({
      shopId: "shop-1",
      planId: "starter",
      returnUrl: "http://localhost/app/billing/thank-you?shop=shop.example.myshopify.com&plan=starter",
      shopDomain: "shop.example.myshopify.com",
      accessToken: "mock-access-token",
    });
  });

  it("preserves embedded shop/host context in the billing return URL", async () => {
    mockBillingService.createSubscription.mockResolvedValue({
      confirmationUrl: "https://shopify.example/confirm",
      subscriptionId: "sub-456",
    } as any);

    const { action } = await import("../../app/routes/app.billing");
    await action({
      request: makePostRequest(
        {
          intent: "create_subscription",
          planId: "starter",
        },
        "?shop=shop.example.myshopify.com&host=dGVzdC1ob3N0&embedded=1",
      ),
    } as any);

    expect(mockBillingService.createSubscription).toHaveBeenCalledWith({
      shopId: "shop-1",
      planId: "starter",
      returnUrl:
        "http://localhost/app/billing/thank-you?shop=shop.example.myshopify.com&host=dGVzdC1ob3N0&embedded=1&plan=starter",
      shopDomain: "shop.example.myshopify.com",
      accessToken: "mock-access-token",
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

  it("returns controlled error when backend blocks same-plan purchase", async () => {
    mockBillingService.createSubscription.mockRejectedValue(
      new Error("You are already subscribed to this plan."),
    );
    const { action } = await import("../../app/routes/app.billing");
    const response = await action({
      request: makePostRequest({
        intent: "create_subscription",
        planId: "starter",
      }),
    } as any);

    expect(response).toEqual({
      ok: false,
      error: "You are already subscribed to this plan.",
    });
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

  it("builds a bounded billing return URL when host is too long", async () => {
    const { buildBillingReturnUrl } = await import("../../app/routes/app.billing");
    const veryLongHost = "a".repeat(320);
    const builtUrl = buildBillingReturnUrl({
      requestUrl: new URL(`http://localhost/app/billing?shop=shop.example.myshopify.com&host=${veryLongHost}&embedded=1`),
      planId: "starter",
      sessionShopDomain: "shop.example.myshopify.com",
    });

    expect(builtUrl.length).toBeLessThanOrEqual(255);
    expect(builtUrl).toContain("shop=shop.example.myshopify.com");
  });

  it("throws a 404 when the shop has no local record", async () => {
    mockEnsureShopForSession.mockResolvedValueOnce(null);

    const { loader } = await import("../../app/routes/app.billing");
    await expect(
      loader({ request: new Request("http://localhost/app/billing") } as any),
    ).rejects.toMatchObject({ status: 404 });
    expect(mockBillingService.getStatus).not.toHaveBeenCalled();
  });
});

describe("app.billing route — plan resolution helpers", () => {
  const plans = [
    { id: "free", name: "Free", amountUsd: 0, includedMessages: 75, extraBlockSize: 0, extraBlockPrice: 0, cappedAmountUsd: 0 },
    { id: "starter", name: "FluxBot Starter", amountUsd: 19, includedMessages: 500, extraBlockSize: 500, extraBlockPrice: 10, cappedAmountUsd: 100 },
    { id: "growth", name: "FluxBot Growth", amountUsd: 49, includedMessages: 2000, extraBlockSize: 2000, extraBlockPrice: 10, cappedAmountUsd: 200 },
    { id: "pro", name: "FluxBot Pro", amountUsd: 99, includedMessages: 10000, extraBlockSize: 5000, extraBlockPrice: 10, cappedAmountUsd: 500 },
    { id: "scale", name: "FluxBot Scale", amountUsd: 199, includedMessages: 50000, extraBlockSize: 10000, extraBlockPrice: 10, cappedAmountUsd: 1000 },
  ] as any;

  it("resolves the active plan from a live subscription name", async () => {
    const { resolveActivePlanId } = await import("../../app/routes/app.billing");

    expect(
      resolveActivePlanId({
        plans,
        subscriptions: [{ name: "FluxBot Growth", status: "ACTIVE" }],
      }),
    ).toBe("growth");
    expect(
      resolveActivePlanId({
        plans,
        subscriptions: [{ name: "Growth", status: "ACCEPTED" }],
      }),
    ).toBe("growth");
  });

  it("token-matches multi-word subscription names", async () => {
    const { resolveActivePlanId } = await import("../../app/routes/app.billing");

    expect(
      resolveActivePlanId({
        plans,
        subscriptions: [{ name: "FluxBot Pro Plan", status: "PENDING" }],
      }),
    ).toBe("pro");
    expect(
      resolveActivePlanId({
        plans,
        subscriptions: [{ name: "Enterprise Scale Deal", status: "FROZEN" }],
      }),
    ).toBe("scale");
  });

  it("skips non-live subscriptions and falls back to the active plan code", async () => {
    const { resolveActivePlanId } = await import("../../app/routes/app.billing");

    expect(
      resolveActivePlanId({
        plans,
        subscriptions: [{ name: "FluxBot Pro", status: "CANCELLED" }],
        activePlanCode: "starter",
      }),
    ).toBe("starter");
    expect(
      resolveActivePlanId({
        plans,
        subscriptions: [{ name: "FluxBot Pro", status: "EXPIRED" }],
        activePlanCode: "fluxbot-starter",
      }),
    ).toBe("starter");
  });

  it("returns null when no subscription or plan code matches", async () => {
    const { resolveActivePlanId } = await import("../../app/routes/app.billing");

    expect(
      resolveActivePlanId({
        plans,
        subscriptions: [],
        activePlanCode: undefined,
      }),
    ).toBeNull();
    expect(
      resolveActivePlanId({
        plans,
        subscriptions: [{ name: "Custom Deal", status: "ACTIVE" }],
        activePlanCode: "unknown-tier",
      }),
    ).toBeNull();
  });

  it("builds plan cards with upgrade/downgrade directions and a recommended plan", async () => {
    const { buildBillingPlanCards } = await import("../../app/routes/app.billing");

    const cards = buildBillingPlanCards({
      plans,
      activePlanId: "starter",
      hasUnknownActivePlan: false,
      isEs: false,
    });

    expect(cards.map((card) => [card.plan.id, card.direction])).toEqual([
      ["free", "downgrade"],
      ["growth", "upgrade"],
      ["pro", "upgrade"],
      ["scale", "upgrade"],
    ]);
    const recommended = cards.filter((card) => card.isRecommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0].plan.id).toBe("growth");
    expect(cards[0].ctaLabel).toBe("Downgrade to Free");
    expect(cards[1].ctaLabel).toBe("Upgrade to FluxBot Growth");
  });

  it("builds initial-direction cards with Spanish labels when there is no active plan", async () => {
    const { buildBillingPlanCards } = await import("../../app/routes/app.billing");

    const cards = buildBillingPlanCards({
      plans,
      activePlanId: null,
      hasUnknownActivePlan: false,
      isEs: true,
    });

    expect(cards).toHaveLength(5);
    expect(cards.every((card) => card.direction === "initial")).toBe(true);
    expect(cards[0].ctaLabel).toBe("Elegir Free");
    expect(cards[0].featureBullets).toContain("75 conversaciones/mes");
  });

  it("marks every card as an upgrade when the active plan is unknown", async () => {
    const { buildBillingPlanCards } = await import("../../app/routes/app.billing");

    const cards = buildBillingPlanCards({
      plans,
      activePlanId: null,
      hasUnknownActivePlan: true,
      isEs: false,
    });

    expect(cards.every((card) => card.direction === "upgrade")).toBe(true);
    expect(cards[0].iconLabel).toBe("F");
    expect(cards[2].iconLabel).toBe("G");
  });
});
