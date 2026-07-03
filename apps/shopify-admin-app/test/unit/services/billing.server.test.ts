import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../../app/services/ia-backend.server", () => ({
  iaClient: {
    billing: {
      plans: vi.fn(),
      status: vi.fn(),
      subscribe: vi.fn(),
    },
  },
}));

import prisma from "../../../app/db.server";
import { iaClient } from "../../../app/services/ia-backend.server";
import { BillingService } from "../../../app/services/billing.server";

const mockPrisma = vi.mocked(prisma);
const mockBilling = vi.mocked(iaClient.billing);

describe("BillingService.listPlans", () => {
  it("returns built-in plans when no shop is provided", async () => {
    const plans = await BillingService.listPlans();
    expect(plans).toHaveLength(3);
    expect(plans[0].id).toBe("starter");
  });

  it("loads plans from the backend when a shop id is provided", async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({ domain: "shop.example.myshopify.com" } as any);
    mockBilling.plans.mockResolvedValue([
      {
        code: "starter",
        name: "Starter",
        billingMode: "shopify_app_pricing",
        currency: "USD",
        basePrice: 18.5,
        includedMessages: 300,
        includedPeriodType: "monthly",
        extraBlockSize: 100,
        extraBlockPrice: 9,
        cappedAmount: 90,
      },
    ] as any);

    const plans = await BillingService.listPlans("shop-1");
    expect(mockBilling.plans).toHaveBeenCalledWith("shop.example.myshopify.com");
    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe("starter");
    expect(plans[0].amountUsd).toBe(18.5);
  });
});

describe("BillingService.getPlan", () => {
  it("returns known plans synchronously for validation", () => {
    expect(BillingService.getPlan("starter")?.name).toBe("FluxBot Starter");
    expect(BillingService.getPlan("unknown")).toBeNull();
  });
});

describe("BillingService.getStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches billing status from Shopify GraphQL", async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({
      domain: "shop.example.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          currentAppInstallation: {
            activeSubscriptions: [
              {
                id: "gid://shopify/AppSubscription/1",
                name: "FluxBot Starter",
                test: true,
                status: "ACTIVE",
                lineItems: [
                  {
                    plan: {
                      pricingDetails: {
                        __typename: "AppRecurringPricing",
                        price: { amount: "19.00", currencyCode: "USD" },
                        interval: "EVERY_30_DAYS",
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      }),
    }) as any;

    const status = await BillingService.getStatus("shop-1");
    expect(status.hasActiveSubscription).toBe(true);
    expect(status.subscriptions).toHaveLength(1);
  });
});

describe("BillingService.createSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the Shopify subscription through GraphQL", async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({
      domain: "shop.example.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        confirmationUrl: "https://shopify.example/confirm",
        subscriptionId: "gid://shopify/AppSubscription/42",
        usageLineItemId: "gid://shopify/AppSubscriptionLineItem/1",
      }),
    }) as any;

    const result = await BillingService.createSubscription({
      shopId: "shop-1",
      planId: "starter",
      returnUrl: "https://app.example.com/app/billing",
      test: true,
    });

    expect(result.confirmationUrl).toBe("https://shopify.example/confirm");
    expect(global.fetch).toHaveBeenCalled();
  });
});

describe("BillingService.getUsageStatus", () => {
  it("reuses the backend billing status endpoint", async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({ domain: "shop.example.myshopify.com" } as any);
    mockBilling.status.mockResolvedValue({
      hasActiveSubscription: false,
      subscriptions: [],
      activePlanCode: "free",
      billingCurrency: "USD",
      currentUsage: 0,
      includedUsage: 75,
      billableBlocks: 0,
      billedBlocks: 0,
      balanceUsed: 0,
      cappedAmount: 0,
      softCapAmount: 0,
      billingCycleStart: new Date().toISOString(),
      billingCycleEnd: new Date().toISOString(),
      status: "active",
    } as any);

    const status = await BillingService.getUsageStatus("shop-1");
    expect(status.currentUsage).toBe(0);
    expect(mockBilling.status).toHaveBeenCalledWith("shop.example.myshopify.com");
  });
});
