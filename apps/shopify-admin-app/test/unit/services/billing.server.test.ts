import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    shopInstallation: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../../../app/services/ia-backend.server", () => ({
  iaClient: {
    billing: {
      plans: vi.fn(),
      status: vi.fn(),
      subscribe: vi.fn(),
      webhook: vi.fn(),
    },
  },
}));

import prisma from "../../../app/db.server";
import { iaClient } from "../../../app/services/ia-backend.server";
import {
  BillingService,
  normalizePlanId,
  resolveBillingEnvironmentMode,
  findActivePlanIdBySubscriptionName,
} from "../../../app/services/billing.server";

const mockPrisma = vi.mocked(prisma);
const mockBilling = vi.mocked(iaClient.billing);

describe("BillingService.listPlans", () => {
  it("returns built-in plans when no shop is provided", async () => {
    const plans = await BillingService.listPlans();
    expect(plans).toHaveLength(5);
    expect(plans[0].id).toBe("free");
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
    expect(plans[0].amountUsd).toBe(19);
  });
});

describe("BillingService.getPlan", () => {
  it("returns known plans synchronously for validation", () => {
    expect(BillingService.getPlan("starter")?.name).toBe("FluxBot Starter");
    expect(BillingService.getPlan("FREE")?.id).toBe("free");
    expect(BillingService.getPlan("FluxBot Scale")?.id).toBe("scale");
    expect(BillingService.getPlan("unknown")).toBeNull();
  });
});

describe("normalizePlanId", () => {
  it("normalizes Shopify plan labels and mixed case", () => {
    expect(normalizePlanId("FluxBot Starter")).toBe("starter");
    expect(normalizePlanId("starter")).toBe("starter");
    expect(normalizePlanId("FREE")).toBe("free");
    expect(normalizePlanId("Free")).toBe("free");
    expect(normalizePlanId("FluxBot Growth")).toBe("growth");
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

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            currentAppInstallation: {
              activeSubscriptions: [],
            },
          },
        }),
      } as any)
      .mockResolvedValueOnce({
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
      } as any);

    const result = await BillingService.createSubscription({
      shopId: "shop-1",
      planId: "starter",
      returnUrl: "https://app.example.com/app/billing",
    });

    expect(result.confirmationUrl).toBe("https://shopify.example/confirm");
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [, options] = vi.mocked(global.fetch).mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(String(options.body)) as { query: string; variables: { test: boolean } };
    expect(payload.query).toContain("appSubscriptionCreate");
    expect(payload.variables.test).toBe(true);
    expect((payload.variables as any).replacementBehavior).toBe("STANDARD");
  });

  it("creates billing subscription in production real-charge mode", async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({
      domain: "shop.example.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);

    process.env.NODE_ENV = "production";
    process.env.SHOPIFY_APP_URL = "https://app.fluxbot.ai";

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            currentAppInstallation: {
              activeSubscriptions: [],
            },
          },
        }),
      } as any)
      .mockResolvedValueOnce({
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
      } as any);

    await BillingService.createSubscription({
      shopId: "shop-1",
      planId: "starter",
      returnUrl: "https://app.example.com/app/billing",
    });

    const [, options] = vi.mocked(global.fetch).mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(String(options.body)) as { query: string; variables: { test: boolean } };
    expect(payload.query).toContain("appSubscriptionCreate");
    expect(payload.variables.test).toBe(false);
  });

  it("rejects creating the same active plan twice", async () => {
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
                id: "gid://shopify/AppSubscription/42",
                name: "FluxBot Starter",
                status: "ACTIVE",
              },
            ],
          },
        },
      }),
    }) as any;

    await expect(
      BillingService.createSubscription({
        shopId: "shop-1",
        planId: "starter",
        returnUrl: "https://app.example.com/app/billing",
      }),
    ).rejects.toThrow("You are already subscribed to this plan.");

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects attempting to subscribe to free plan via Shopify billing", async () => {
    await expect(
      BillingService.createSubscription({
        shopId: "shop-1",
        planId: "free",
        returnUrl: "https://app.example.com/app/billing",
      }),
    ).rejects.toThrow("Free plan does not require Shopify billing approval.");
  });

  it("uses immediate replacement for upgrade/downgrade proration", async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({
      domain: "shop.example.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);
    process.env.NODE_ENV = "production";
    process.env.SHOPIFY_APP_URL = "https://app.fluxbot.ai";

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            currentAppInstallation: {
              activeSubscriptions: [
                {
                  id: "gid://shopify/AppSubscription/42",
                  name: "FluxBot Starter",
                  status: "ACTIVE",
                },
              ],
            },
          },
        }),
      } as any)
      .mockResolvedValueOnce({
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
      } as any);

    await BillingService.createSubscription({
      shopId: "shop-1",
      planId: "growth",
      returnUrl: "https://app.example.com/app/billing",
    });

    describe("BillingService.resolveCurrentPlan", () => {
      beforeEach(() => {
        vi.clearAllMocks();
      });

      it("uses Shopify active subscription as source of truth and syncs local plan", async () => {
        mockPrisma.shop.findUnique
          .mockResolvedValueOnce({
            domain: "shop.example.myshopify.com",
            accessToken: "shpat_valid_token",
          } as any)
          .mockResolvedValueOnce({
            plan: "FREE",
            installations: [],
          } as any);
        mockPrisma.shop.update.mockResolvedValue({ id: "shop-1" } as any);
        mockPrisma.shopInstallation.updateMany.mockResolvedValue({ count: 1 } as any);

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

        const resolved = await BillingService.resolveCurrentPlan("shop-1");
        expect(resolved.planId).toBe("starter");
        expect(resolved.source).toBe("shopify");
        expect(mockPrisma.shop.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ plan: "starter" }),
          }),
        );
      });

      it("falls back to local normalized plan when Shopify has no active subscription", async () => {
        const status = {
          hasActiveSubscription: false,
          subscriptions: [],
        };
        mockPrisma.shop.findUnique.mockResolvedValue({
          plan: "FluxBot Growth",
          installations: [],
        } as any);

        const resolved = await BillingService.resolveCurrentPlan("shop-1", status as any);
        expect(resolved.planId).toBe("growth");
        expect(resolved.source).toBe("local");
      });

      it("defaults to free when Shopify has no active subscription and local plan is missing", async () => {
        const status = {
          hasActiveSubscription: false,
          subscriptions: [],
        };
        mockPrisma.shop.findUnique.mockResolvedValue({
          plan: null,
          installations: [],
        } as any);
        mockPrisma.shop.update.mockResolvedValue({ id: "shop-1" } as any);
        mockPrisma.shopInstallation.updateMany.mockResolvedValue({ count: 1 } as any);

        const resolved = await BillingService.resolveCurrentPlan("shop-1", status as any);
        expect(resolved.planId).toBe("free");
        expect(resolved.source).toBe("default");
      });
    });

    const [, options] = vi.mocked(global.fetch).mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(String(options.body)) as { variables: Record<string, string> };
    expect(payload.variables.replacementBehavior).toBe("APPLY_IMMEDIATELY");
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

describe("BillingService.syncPlansWithBackend", () => {
  function backendPlan(code: string, name: string, basePrice: number, includedMessages: number, cappedAmount: number | null) {
    return {
      code,
      name,
      billingMode: "shopify_app_pricing",
      currency: "USD",
      basePrice,
      includedMessages,
      includedPeriodType: "monthly",
      extraBlockSize: 500,
      extraBlockPrice: 10,
      cappedAmount,
    } as any;
  }

  const FULL_PLAN_SET = [
    backendPlan("free", "Free", 0, 75, 0),
    backendPlan("starter", "Starter", 19, 500, 100),
    backendPlan("growth", "Growth", 49, 2000, 100),
    backendPlan("pro", "Pro", 99, 10000, 100),
    backendPlan("scale", "Scale", 149, 30000, 100),
  ];

  it("reports inSync when backend plans match the local catalog", async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({ domain: "shop.example.myshopify.com" } as any);
    mockBilling.plans.mockResolvedValue(FULL_PLAN_SET);

    const report = await BillingService.syncPlansWithBackend("shop-1");

    expect(report.inSync).toBe(true);
    expect(report.remoteCount).toBe(5);
    expect(report.drift).toEqual([]);
    expect(mockBilling.plans).toHaveBeenCalledWith("shop.example.myshopify.com");
  });

  it("detects price and included-messages drift against the backend", async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({ domain: "shop.example.myshopify.com" } as any);
    const drifted = FULL_PLAN_SET.map((plan, index) =>
      index === 1 ? { ...plan, basePrice: 29, includedMessages: 300 } : plan,
    );
    mockBilling.plans.mockResolvedValue(drifted);

    const report = await BillingService.syncPlansWithBackend("shop-1");

    expect(report.inSync).toBe(false);
    expect(report.drift).toEqual([
      { code: "starter", reason: "values differ: basePrice, includedMessages" },
    ]);
  });

  it("flags local plans missing from the backend catalog", async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({ domain: "shop.example.myshopify.com" } as any);
    mockBilling.plans.mockResolvedValue([backendPlan("growth", "Growth", 49, 2000, 100)]);

    const report = await BillingService.syncPlansWithBackend("shop-1");

    expect(report.inSync).toBe(false);
    const missing = report.drift.filter((entry) => entry.reason === "plan missing in backend");
    expect(missing.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["free", "starter", "pro", "scale"]),
    );
    expect(missing).toHaveLength(4);
  });

  it("does not throw when the backend is unreachable", async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({ domain: "shop.example.myshopify.com" } as any);
    mockBilling.plans.mockRejectedValue(new Error("backend unreachable"));

    const report = await BillingService.syncPlansWithBackend("shop-1");

    expect(report.inSync).toBe(false);
    expect(report.remoteCount).toBe(0);
    expect(report.drift).toEqual([]);
  });
});

describe("findActivePlanIdBySubscriptionName", () => {
  it("matches known plan names via normalizePlanText", () => {
    expect(findActivePlanIdBySubscriptionName("FluxBot Scale")).toBe("scale");
    expect(findActivePlanIdBySubscriptionName("Fluxbot Growth")).toBe("growth");
    expect(findActivePlanIdBySubscriptionName("free")).toBe("free");
  });

  it("returns null for unknown subscription names", () => {
    expect(findActivePlanIdBySubscriptionName("Mystery Plan")).toBeNull();
  });
});

describe("BillingService.createSubscription error paths", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    mockPrisma.shop.findUnique.mockResolvedValue({
      domain: "shop.example.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws a friendly error when the Shopify network call fails", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { currentAppInstallation: { activeSubscriptions: [] } } }),
      } as any)
      .mockRejectedValueOnce(new Error("ECONNRESET"));

    await expect(
      BillingService.createSubscription({
        shopId: "shop-1",
        planId: "starter",
        returnUrl: "https://app.example.com/app/billing",
      }),
    ).rejects.toThrow("No se pudo iniciar la suscripción");
  });

  it("throws when the appSubscriptionCreate payload is missing", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { currentAppInstallation: { activeSubscriptions: [] } } }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} }),
      } as any);

    await expect(
      BillingService.createSubscription({
        shopId: "shop-1",
        planId: "starter",
        returnUrl: "https://app.example.com/app/billing",
      }),
    ).rejects.toThrow("No se pudo iniciar la suscripción");
  });

  it("throws the Shopify userError message when userErrors are present", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { currentAppInstallation: { activeSubscriptions: [] } } }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            appSubscriptionCreate: {
              confirmationUrl: "https://shopify.example/confirm",
              userErrors: [{ field: ["name"], message: "Name is required" }],
            },
          },
        }),
      } as any);

    await expect(
      BillingService.createSubscription({
        shopId: "shop-1",
        planId: "starter",
        returnUrl: "https://app.example.com/app/billing",
      }),
    ).rejects.toThrow("Name is required");
  });

  it("throws when confirmationUrl is missing", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { currentAppInstallation: { activeSubscriptions: [] } } }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            appSubscriptionCreate: {
              userErrors: [],
              appSubscription: { id: "gid://shopify/AppSubscription/1" },
            },
          },
        }),
      } as any);

    await expect(
      BillingService.createSubscription({
        shopId: "shop-1",
        planId: "starter",
        returnUrl: "https://app.example.com/app/billing",
      }),
    ).rejects.toThrow("No se pudo iniciar la suscripción");
  });

  it("accepts direct session credentials without a DB lookup", async () => {
    process.env.NODE_ENV = "development";

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { currentAppInstallation: { activeSubscriptions: [] } } }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            appSubscriptionCreate: {
              confirmationUrl: "https://shopify.example/confirm",
              appSubscription: { id: "gid://shopify/AppSubscription/7", lineItems: [] },
              userErrors: [],
            },
          },
        }),
      } as any);

    const result = await BillingService.createSubscription({
      shopId: "shop-1",
      planId: "starter",
      returnUrl: "https://app.example.com/app/billing",
      shopDomain: "session-shop.myshopify.com",
      accessToken: "session-token",
    });

    expect(result.confirmationUrl).toBe("https://shopify.example/confirm");
    expect(mockPrisma.shop.findUnique).not.toHaveBeenCalled();
    const [, options] = vi.mocked(global.fetch).mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(String(options.body)) as { variables: { test: boolean } };
    expect(payload.variables.test).toBe(true);
  });

  it("throws for an invalid plan id", async () => {
    await expect(
      BillingService.createSubscription({
        shopId: "shop-1",
        planId: "nope" as never,
        returnUrl: "https://app.example.com/app/billing",
      }),
    ).rejects.toThrow("Invalid billing plan");
  });
});

describe("BillingService.getStatus parsing edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles subscriptions without lineItems and with AppUsagePricing details", async () => {
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
              { id: "s1", name: "FluxBot Pro", status: "ACTIVE", test: true },
              {
                id: "s2",
                name: "FluxBot Scale",
                status: "EXPIRED",
                lineItems: [
                  {
                    plan: {
                      pricingDetails: {
                        __typename: "AppUsagePricing",
                        price: { amount: 0 },
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
    expect(status.subscriptions).toHaveLength(2);
    expect(status.subscriptions[1].priceAmount).toBe("");
    expect(status.subscriptions[1].interval).toBe("");
  });

  it("handles missing or non-array subscriptions", async () => {
    mockPrisma.shop.findUnique.mockResolvedValue({
      domain: "shop.example.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { currentAppInstallation: {} } }),
    }) as any;

    const status = await BillingService.getStatus("shop-1");

    expect(status.hasActiveSubscription).toBe(false);
    expect(status.subscriptions).toEqual([]);
  });
});

describe("BillingService.resolveCurrentPlan edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.shop.update.mockResolvedValue({ id: "shop-1" } as any);
    mockPrisma.shopInstallation.updateMany.mockResolvedValue({ count: 1 } as any);
  });

  it("returns null planId when live subscriptions do not map to a known plan", async () => {
    const status = {
      hasActiveSubscription: true,
      subscriptions: [
        { id: "s1", name: "Legacy Custom Plan", status: "ACTIVE", test: false },
      ],
    };

    const resolved = await BillingService.resolveCurrentPlan("shop-1", status as any);

    expect(resolved.planId).toBeNull();
    expect(resolved.source).toBe("shopify");
    expect(resolved.hasActiveSubscription).toBe(true);
    expect(mockPrisma.shop.update).not.toHaveBeenCalled();
  });

  it("falls back to the installation billing plan when the shop plan is missing", async () => {
    const status = { hasActiveSubscription: false, subscriptions: [] };
    mockPrisma.shop.findUnique.mockResolvedValue({
      plan: null,
      installations: [
        { uninstalledAt: null, installedAt: new Date(), billingPlan: "FluxBot Pro" },
      ],
    } as any);

    const resolved = await BillingService.resolveCurrentPlan("shop-1", status as any);

    expect(resolved.planId).toBe("pro");
    expect(resolved.source).toBe("local");
  });
});
