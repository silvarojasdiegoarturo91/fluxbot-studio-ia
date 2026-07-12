import { describe, expect, it } from "vitest";
import type { ActiveSubscription, BillingPlan } from "../../../app/services/billing.server";
import { buildBillingPlanCards, resolveActivePlanId } from "../../../app/routes/app.billing";

function makePlan(id: "free" | "starter" | "growth" | "pro" | "scale", amountUsd: number, name?: string): BillingPlan {
  return {
    id,
    name: name ?? `Plan ${id}`,
    amountUsd,
    interval: "EVERY_30_DAYS",
    description: `${id} plan`,
    includedMessages: 1000,
    extraBlockSize: 500,
    extraBlockPrice: 10,
    cappedAmountUsd: 100,
  };
}

function makeSubscription(name: string): ActiveSubscription {
  return {
    id: "sub-1",
    name,
    status: "ACTIVE",
    test: false,
    priceAmount: "19",
    priceCurrency: "USD",
    interval: "EVERY_30_DAYS",
  };
}

describe("billing plan options", () => {
  const plans: BillingPlan[] = [
    makePlan("free", 0, "Free"),
    makePlan("starter", 19, "FluxBot Starter"),
    makePlan("growth", 49, "FluxBot Growth"),
    makePlan("pro", 99, "FluxBot Pro"),
    makePlan("scale", 149, "FluxBot Scale"),
  ];

  it("merchant with no active plan sees all plans", () => {
    const cards = buildBillingPlanCards({
      plans,
      activePlanId: null,
      hasUnknownActivePlan: false,
      isEs: false,
    });

    expect(cards.map((card) => card.plan.id)).toEqual(["free", "starter", "growth", "pro", "scale"]);
    expect(cards.every((card) => card.direction === "initial")).toBe(true);
  });

  it("merchant with free/unknown active plan only gets upgrade options", () => {
    const cards = buildBillingPlanCards({
      plans,
      activePlanId: null,
      hasUnknownActivePlan: true,
      isEs: false,
    });

    expect(cards).toHaveLength(5);
    expect(cards.every((card) => card.direction === "upgrade")).toBe(true);
  });

  it("merchant on starter does not see starter and sees valid downgrade/upgrade options", () => {
    const cards = buildBillingPlanCards({
      plans,
      activePlanId: "starter",
      hasUnknownActivePlan: false,
      isEs: false,
    });

    expect(cards.map((card) => card.plan.id)).toEqual(["free", "growth", "pro", "scale"]);
    expect(cards.map((card) => [card.plan.id, card.direction])).toEqual([
      ["free", "downgrade"],
      ["growth", "upgrade"],
      ["pro", "upgrade"],
      ["scale", "upgrade"],
    ]);
  });

  it("merchant on growth sees downgrade and upgrade labels", () => {
    const cards = buildBillingPlanCards({
      plans,
      activePlanId: "growth",
      hasUnknownActivePlan: false,
      isEs: false,
    });

    expect(cards.map((card) => [card.plan.id, card.direction])).toEqual([
      ["free", "downgrade"],
      ["starter", "downgrade"],
      ["pro", "upgrade"],
      ["scale", "upgrade"],
    ]);
  });

  it("merchant on scale only sees downgrades", () => {
    const cards = buildBillingPlanCards({
      plans,
      activePlanId: "scale",
      hasUnknownActivePlan: false,
      isEs: false,
    });

    expect(cards.map((card) => card.plan.id)).toEqual(["free", "starter", "growth", "pro"]);
    expect(cards.every((card) => card.direction === "downgrade")).toBe(true);
  });

  it("resolves active plan id from usage code or subscription names", () => {
    expect(
      resolveActivePlanId({
        plans,
        activePlanCode: "FREE",
        subscriptions: [],
      }),
    ).toBe("free");

    expect(
      resolveActivePlanId({
        plans,
        activePlanCode: undefined,
        subscriptions: [makeSubscription("FluxBot Pro")],
      }),
    ).toBe("pro");

    expect(
      resolveActivePlanId({
        plans,
        activePlanCode: "free",
        subscriptions: [makeSubscription("FluxBot Starter")],
      }),
    ).toBe("starter");
  });

  it("provides card metadata for visual pricing cards", () => {
    const cards = buildBillingPlanCards({
      plans,
      activePlanId: "starter",
      hasUnknownActivePlan: false,
      isEs: false,
    });

    const growthCard = cards.find((card) => card.plan.id === "growth");
    expect(growthCard?.badgeLabel).toBe("Upgrade");
    expect(growthCard?.ctaLabel).toContain("Upgrade to");
    expect(growthCard?.iconLabel).toBe("G");
    expect((growthCard?.featureBullets.length ?? 0)).toBeGreaterThanOrEqual(5);
  });
});
