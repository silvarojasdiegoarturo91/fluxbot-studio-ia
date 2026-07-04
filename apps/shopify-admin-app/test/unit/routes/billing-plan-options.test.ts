import { describe, expect, it } from "vitest";
import type { ActiveSubscription, BillingPlan } from "../../../app/services/billing.server";
import { buildBillingPlanCards, resolveActivePlanId } from "../../../app/routes/app.billing";

function makePlan(id: "starter" | "growth" | "pro", amountUsd: number, name?: string): BillingPlan {
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
    makePlan("starter", 19, "FluxBot Starter"),
    makePlan("growth", 49, "FluxBot Growth"),
    makePlan("pro", 99, "FluxBot Pro"),
  ];

  it("merchant with no active plan sees all plans", () => {
    const cards = buildBillingPlanCards({
      plans,
      activePlanId: null,
      hasUnknownActivePlan: false,
      isEs: false,
    });

    expect(cards.map((card) => card.plan.id)).toEqual(["starter", "growth", "pro"]);
    expect(cards.every((card) => card.direction === "initial")).toBe(true);
  });

  it("merchant with free/unknown active plan only gets upgrade options", () => {
    const cards = buildBillingPlanCards({
      plans,
      activePlanId: null,
      hasUnknownActivePlan: true,
      isEs: false,
    });

    expect(cards).toHaveLength(3);
    expect(cards.every((card) => card.direction === "upgrade")).toBe(true);
  });

  it("merchant on starter does not see starter and only sees upgrades", () => {
    const cards = buildBillingPlanCards({
      plans,
      activePlanId: "starter",
      hasUnknownActivePlan: false,
      isEs: false,
    });

    expect(cards.map((card) => card.plan.id)).toEqual(["growth", "pro"]);
    expect(cards.every((card) => card.direction === "upgrade")).toBe(true);
  });

  it("merchant on growth sees downgrade and upgrade labels", () => {
    const cards = buildBillingPlanCards({
      plans,
      activePlanId: "growth",
      hasUnknownActivePlan: false,
      isEs: false,
    });

    expect(cards.map((card) => [card.plan.id, card.direction])).toEqual([
      ["starter", "downgrade"],
      ["pro", "upgrade"],
    ]);
  });

  it("merchant on highest plan only sees downgrades", () => {
    const cards = buildBillingPlanCards({
      plans,
      activePlanId: "pro",
      hasUnknownActivePlan: false,
      isEs: false,
    });

    expect(cards.map((card) => card.plan.id)).toEqual(["starter", "growth"]);
    expect(cards.every((card) => card.direction === "downgrade")).toBe(true);
  });

  it("resolves active plan id from usage code or subscription names", () => {
    expect(
      resolveActivePlanId({
        plans,
        activePlanCode: "growth",
        subscriptions: [],
      }),
    ).toBe("growth");

    expect(
      resolveActivePlanId({
        plans,
        activePlanCode: undefined,
        subscriptions: [makeSubscription("FluxBot Pro")],
      }),
    ).toBe("pro");
  });

  it("provides card metadata for visual pricing cards", () => {
    const cards = buildBillingPlanCards({
      plans,
      activePlanId: "starter",
      hasUnknownActivePlan: false,
      isEs: false,
    });

    expect(cards[0].badgeLabel).toBe("Upgrade");
    expect(cards[0].ctaLabel).toContain("Upgrade to");
    expect(cards[0].iconLabel).toBe("G");
    expect(cards[0].featureBullets.length).toBeGreaterThanOrEqual(5);
  });
});
