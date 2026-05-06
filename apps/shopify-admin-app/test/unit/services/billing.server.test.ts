import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma before importing the service
// ---------------------------------------------------------------------------
vi.mock("../../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn(),
    },
  },
}));

import prisma from "../../../app/db.server";
import { BillingService } from "../../../app/services/billing.server";

// ---------------------------------------------------------------------------
// Static / pure methods — no DB or network involved
// ---------------------------------------------------------------------------
describe("BillingService.listPlans", () => {
  it("returns all three billing plans", () => {
    const plans = BillingService.listPlans();
    expect(plans).toHaveLength(3);
    const ids = plans.map((p) => p.id);
    expect(ids).toContain("starter");
    expect(ids).toContain("growth");
    expect(ids).toContain("pro");
  });

  it("every plan has the required shape", () => {
    const plans = BillingService.listPlans();
    for (const plan of plans) {
      expect(typeof plan.id).toBe("string");
      expect(typeof plan.name).toBe("string");
      expect(typeof plan.amountUsd).toBe("number");
      expect(plan.amountUsd).toBeGreaterThan(0);
      expect(plan.interval).toBe("EVERY_30_DAYS");
      expect(typeof plan.description).toBe("string");
      expect(plan.description.length).toBeGreaterThan(0);
    }
  });

  it("plans are ordered by ascending price", () => {
    const plans = BillingService.listPlans();
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i].amountUsd).toBeGreaterThanOrEqual(plans[i - 1].amountUsd);
    }
  });

  it("starter plan costs $19/month", () => {
    const starter = BillingService.listPlans().find((p) => p.id === "starter");
    expect(starter?.amountUsd).toBe(19);
  });

  it("growth plan costs $49/month", () => {
    const growth = BillingService.listPlans().find((p) => p.id === "growth");
    expect(growth?.amountUsd).toBe(49);
  });

  it("pro plan costs $99/month", () => {
    const pro = BillingService.listPlans().find((p) => p.id === "pro");
    expect(pro?.amountUsd).toBe(99);
  });
});

describe("BillingService.getPlan", () => {
  it("returns the starter plan when requested by id", () => {
    const plan = BillingService.getPlan("starter");
    expect(plan).not.toBeNull();
    expect(plan?.id).toBe("starter");
    expect(plan?.name).toBe("FluxBot Starter");
  });

  it("returns the growth plan when requested by id", () => {
    const plan = BillingService.getPlan("growth");
    expect(plan?.id).toBe("growth");
    expect(plan?.name).toBe("FluxBot Growth");
  });

  it("returns the pro plan when requested by id", () => {
    const plan = BillingService.getPlan("pro");
    expect(plan?.id).toBe("pro");
    expect(plan?.name).toBe("FluxBot Pro");
  });

  it("returns null for an unknown plan id", () => {
    expect(BillingService.getPlan("enterprise")).toBeNull();
    expect(BillingService.getPlan("")).toBeNull();
    expect(BillingService.getPlan("STARTER")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BillingService.getStatus — requires mocked DB + fetch
// ---------------------------------------------------------------------------
describe("BillingService.getStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("throws when shop is not found", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue(null);
    await expect(BillingService.getStatus("unknown-shop-id")).rejects.toThrow("Shop not found");
  });

  it("throws when shop has a pending access token", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      domain: "myshop.myshopify.com",
      accessToken: "__pending_access_token__",
    } as any);
    await expect(BillingService.getStatus("shop-id")).rejects.toThrow(
      "Shop missing offline access token",
    );
  });

  it("returns a status with no active subscriptions when Shopify returns an empty list", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          currentAppInstallation: {
            activeSubscriptions: [],
          },
        },
      }),
    });

    const status = await BillingService.getStatus("shop-id");
    expect(status.hasActiveSubscription).toBe(false);
    expect(status.subscriptions).toHaveLength(0);
  });

  it("maps a single active subscription correctly", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          currentAppInstallation: {
            activeSubscriptions: [
              {
                id: "gid://shopify/AppSubscription/1",
                name: "FluxBot Growth",
                status: "ACTIVE",
                test: false,
                lineItems: [
                  {
                    plan: {
                      pricingDetails: {
                        __typename: "AppRecurringPricing",
                        price: { amount: "49.00", currencyCode: "USD" },
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
    });

    const status = await BillingService.getStatus("shop-id");
    expect(status.hasActiveSubscription).toBe(true);
    expect(status.subscriptions).toHaveLength(1);
    const sub = status.subscriptions[0];
    expect(sub.id).toBe("gid://shopify/AppSubscription/1");
    expect(sub.name).toBe("FluxBot Growth");
    expect(sub.status).toBe("ACTIVE");
    expect(sub.test).toBe(false);
    expect(sub.priceAmount).toBe("49.00");
    expect(sub.priceCurrency).toBe("USD");
    expect(sub.interval).toBe("EVERY_30_DAYS");
  });

  it("throws when Shopify returns a non-ok HTTP status", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 503 });

    await expect(BillingService.getStatus("shop-id")).rejects.toThrow(
      "Shopify billing request failed with HTTP 503",
    );
  });

  it("throws when Shopify returns GraphQL errors", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        errors: [{ message: "Access denied" }],
      }),
    });

    await expect(BillingService.getStatus("shop-id")).rejects.toThrow("Access denied");
  });
});

// ---------------------------------------------------------------------------
// BillingService.createSubscription
// ---------------------------------------------------------------------------
describe("BillingService.createSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("throws for an invalid plan id", async () => {
    await expect(
      BillingService.createSubscription({
        shopId: "shop-id",
        planId: "unknown" as any,
        returnUrl: "https://app.example.com/billing",
      }),
    ).rejects.toThrow("Invalid billing plan");
  });

  it("throws when shop is not found", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue(null);
    await expect(
      BillingService.createSubscription({
        shopId: "shop-id",
        planId: "starter",
        returnUrl: "https://app.example.com/billing",
      }),
    ).rejects.toThrow("Shop not found");
  });

  it("returns confirmationUrl and subscriptionId on success", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          appSubscriptionCreate: {
            confirmationUrl: "https://myshop.myshopify.com/admin/confirm/sub",
            appSubscription: { id: "gid://shopify/AppSubscription/42" },
            userErrors: [],
          },
        },
      }),
    });

    const result = await BillingService.createSubscription({
      shopId: "shop-id",
      planId: "starter",
      returnUrl: "https://app.example.com/billing",
    });

    expect(result.confirmationUrl).toBe("https://myshop.myshopify.com/admin/confirm/sub");
    expect(result.subscriptionId).toBe("gid://shopify/AppSubscription/42");
  });

  it("throws when Shopify returns userErrors", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          appSubscriptionCreate: {
            userErrors: [{ field: "name", message: "Name already taken" }],
          },
        },
      }),
    });

    await expect(
      BillingService.createSubscription({
        shopId: "shop-id",
        planId: "growth",
        returnUrl: "https://app.example.com/billing",
      }),
    ).rejects.toThrow("Name already taken");
  });

  it("throws when confirmationUrl is missing in the response", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid_token",
    } as any);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          appSubscriptionCreate: {
            userErrors: [],
            appSubscription: { id: "gid://shopify/AppSubscription/1" },
            // confirmationUrl intentionally missing
          },
        },
      }),
    });

    await expect(
      BillingService.createSubscription({
        shopId: "shop-id",
        planId: "pro",
        returnUrl: "https://app.example.com/billing",
      }),
    ).rejects.toThrow("Shopify did not return confirmation URL");
  });
});
