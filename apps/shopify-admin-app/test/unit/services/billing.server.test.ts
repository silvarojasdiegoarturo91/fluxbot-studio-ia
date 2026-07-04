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
import { BillingService, resolveBillingEnvironmentMode } from "../../../app/services/billing.server";

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
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("creates billing subscription in development test mode", async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({
      domain: "shop.example.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);

    process.env.NODE_ENV = "development";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          appSubscriptionCreate: {
            confirmationUrl: "https://shopify.example/confirm",
            appSubscription: {
              id: "gid://shopify/AppSubscription/42",
              lineItems: [
                {
                  id: "gid://shopify/AppSubscriptionLineItem/1",
                  plan: {
                    pricingDetails: {
                      __typename: "AppUsagePricing",
                    },
                  },
                },
              ],
            },
            userErrors: [],
          },
        },
      }),
    }) as any;

    const result = await BillingService.createSubscription({
      shopId: "shop-1",
      planId: "starter",
      returnUrl: "https://app.example.com/app/billing",
    });

    expect(result.confirmationUrl).toBe("https://shopify.example/confirm");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(options.body)) as { query: string; variables: { test: boolean } };
    expect(payload.query).toContain("appSubscriptionCreate");
    expect(payload.variables.test).toBe(true);
  });

  it("creates billing subscription in production real-charge mode", async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({
      domain: "shop.example.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);

    process.env.NODE_ENV = "production";
    process.env.SHOPIFY_APP_URL = "https://app.fluxbot.ai";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          appSubscriptionCreate: {
            confirmationUrl: "https://shopify.example/confirm",
            appSubscription: {
              id: "gid://shopify/AppSubscription/99",
              lineItems: [],
            },
            userErrors: [],
          },
        },
      }),
    }) as any;

    await BillingService.createSubscription({
      shopId: "shop-1",
      planId: "starter",
      returnUrl: "https://app.example.com/app/billing",
    });

    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(options.body)) as { query: string; variables: { test: boolean } };
    expect(payload.query).toContain("appSubscriptionCreate");
    expect(payload.variables.test).toBe(false);
  });
});

describe("resolveBillingEnvironmentMode", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("prefers explicit BILLING_ENV_MODE when provided", () => {
    process.env.BILLING_ENV_MODE = "production";
    expect(resolveBillingEnvironmentMode(process.env)).toBe("production");
  });

  it("defaults to development for local app urls", () => {
    process.env.NODE_ENV = "production";
    process.env.SHOPIFY_APP_URL = "https://fluxbot-local-dev.invalid";
    expect(resolveBillingEnvironmentMode(process.env)).toBe("development");
  });

  it("resolves production for non-local production urls", () => {
    process.env.NODE_ENV = "production";
    process.env.SHOPIFY_APP_URL = "https://admin.fluxbot.ai";
    expect(resolveBillingEnvironmentMode(process.env)).toBe("production");
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
