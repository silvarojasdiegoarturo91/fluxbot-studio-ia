/**
 * Unit Tests — analytics.server.ts
 *
 * Complements test/integration/analytics.test.ts by covering the branches not
 * exercised there:
 *  - getSummaryStats (header-card aggregation)
 *  - attributeOrder when both a proactive message and a conversation match
 *  - attributeOrder when proactiveMessage.update rejects (non-fatal)
 *  - attributeOrder when only a proactive message matches (no record)
 *  - recordConversion early return without a conversationId
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "../../../app/services/analytics.server";

vi.mock("../../../app/db.server", () => ({
  default: {
    conversation: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    conversationMessage: {
      groupBy: vi.fn(),
    },
    handoffRequest: {
      count: vi.fn(),
    },
    conversionEvent: {
      groupBy: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    proactiveMessage: {
      groupBy: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    intentSignal: {
      groupBy: vi.fn(),
    },
    proactiveTrigger: {
      findMany: vi.fn(),
    },
  },
}));

import prisma from "../../../app/db.server";

const SHOP_ID = "test-shop.myshopify.com";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AnalyticsService.getSummaryStats", () => {
  it("aggregates conversation, revenue and proactive metrics for header cards", async () => {
    vi.mocked(prisma.conversation.count)
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(10) // escalated
      .mockResolvedValueOnce(5) // activeNow
      .mockResolvedValueOnce(100); // revenue conversions denominator
    vi.mocked(prisma.conversationMessage.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.handoffRequest.count).mockResolvedValue(20);
    vi.mocked(prisma.conversionEvent.groupBy).mockResolvedValue([
      { attributionType: "ASSISTED", _sum: { revenue: 300 }, _count: { id: 6 } },
    ]);
    vi.mocked(prisma.proactiveMessage.groupBy).mockResolvedValue([
      { status: "CONVERTED", _count: { id: 4 } },
    ]);

    const summary = await AnalyticsService.getSummaryStats(SHOP_ID, 7);

    expect(summary.conversations).toBe(100);
    expect(summary.resolutionRate).toBeCloseTo(0.9);
    expect(summary.assistedRevenue).toBe(300);
    expect(summary.proactiveConversions).toBe(4);
    expect(summary.handoffRate).toBeCloseTo(0.2);
  });
});

describe("AnalyticsService.attributeOrder — proactive + conversation", () => {
  it("records a PROACTIVE_TRIGGER conversion when both match", async () => {
    const recentConv = { id: "conv-recent", shopId: SHOP_ID };
    const recentProactive = { id: "pm-1", shopId: SHOP_ID, status: "DELIVERED" };

    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(recentConv as any);
    vi.mocked(prisma.proactiveMessage.findFirst).mockResolvedValue(recentProactive as any);
    vi.mocked(prisma.proactiveMessage.update).mockResolvedValue({} as any);
    vi.mocked(prisma.conversionEvent.create).mockResolvedValue({ id: "evt-1" } as any);

    await AnalyticsService.attributeOrder(SHOP_ID, "customer-1", "order-1", 99);

    expect(prisma.proactiveMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pm-1" },
        data: { status: "CONVERTED", outcome: "purchase" },
      }),
    );
    expect(prisma.conversionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopId: SHOP_ID,
          orderId: "order-1",
          conversationId: "conv-recent",
          revenue: 99,
          attributionType: "PROACTIVE_TRIGGER",
        }),
      }),
    );
  });

  it("does not record anything when only a proactive message matches", async () => {
    const recentProactive = { id: "pm-2", shopId: SHOP_ID, status: "DELIVERED" };

    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.proactiveMessage.findFirst).mockResolvedValue(recentProactive as any);
    vi.mocked(prisma.proactiveMessage.update).mockResolvedValue({} as any);

    await AnalyticsService.attributeOrder(SHOP_ID, "customer-2", "order-2", 50);

    expect(prisma.proactiveMessage.update).toHaveBeenCalled();
    expect(prisma.conversionEvent.create).not.toHaveBeenCalled();
  });

  it("keeps going when the proactive update fails (non-fatal)", async () => {
    const recentConv = { id: "conv-recent", shopId: SHOP_ID };
    const recentProactive = { id: "pm-3", shopId: SHOP_ID, status: "DELIVERED" };

    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(recentConv as any);
    vi.mocked(prisma.proactiveMessage.findFirst).mockResolvedValue(recentProactive as any);
    vi.mocked(prisma.proactiveMessage.update).mockRejectedValue(new Error("race"));
    vi.mocked(prisma.conversionEvent.create).mockResolvedValue({ id: "evt-2" } as any);

    await expect(
      AnalyticsService.attributeOrder(SHOP_ID, "customer-3", "order-3", 42),
    ).resolves.toBeUndefined();

    expect(prisma.conversionEvent.create).toHaveBeenCalled();
  });
});

describe("AnalyticsService.recordConversion", () => {
  it("returns early without writing when there is no conversationId", async () => {
    await AnalyticsService.recordConversion({
      shopId: SHOP_ID,
      orderId: "order-x",
      revenue: 10,
      currency: "USD",
      attributionType: "ASSISTED",
    });

    expect(prisma.conversionEvent.create).not.toHaveBeenCalled();
  });

  it("merges metadata into the conversion event", async () => {
    vi.mocked(prisma.conversionEvent.create).mockResolvedValue({ id: "evt-3" } as any);

    await AnalyticsService.recordConversion({
      shopId: SHOP_ID,
      orderId: "order-y",
      revenue: 25.5,
      currency: "EUR",
      conversationId: "conv-1",
      attributionType: "ASSISTED",
      productIds: ["p1"],
      sessionId: "sess-1",
      metadata: { channel: "web" },
    });

    expect(prisma.conversionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            currency: "EUR",
            productIds: ["p1"],
            sessionId: "sess-1",
            channel: "web",
          }),
        }),
      }),
    );
  });
});
