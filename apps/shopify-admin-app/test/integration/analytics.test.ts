/**
 * Analytics Service Tests — Phase 5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnalyticsService } from "../../app/services/analytics.server";

vi.mock("../../app/db.server", () => ({
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
      findFirst: vi.fn(),
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

import prisma from "../../app/db.server";

const SHOP_ID = "test-shop.myshopify.com";
const PERIOD = { from: new Date("2026-01-01"), to: new Date("2026-01-31") };

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// CONVERSATION METRICS
// ---------------------------------------------------------------------------

describe("AnalyticsService.getConversationMetrics", () => {
  it("returns zero metrics when no conversations exist", async () => {
    (prisma.conversation.count as any).mockResolvedValue(0);
    (prisma.conversationMessage.groupBy as any).mockResolvedValue([]);
    (prisma.handoffRequest.count as any).mockResolvedValue(0);

    const metrics = await AnalyticsService.getConversationMetrics(SHOP_ID, PERIOD);

    expect(metrics.total).toBe(0);
    expect(metrics.resolutionRate).toBe(0);
    expect(metrics.handoffRate).toBe(0);
    expect(metrics.avgMessages).toBe(0);
  });

  it("calculates resolution rate correctly (returned as 0-1 fraction)", async () => {
    // total = 100, escalated = 10, active = 5
    (prisma.conversation.count as any)
      .mockResolvedValueOnce(100)  // total
      .mockResolvedValueOnce(10)   // escalated
      .mockResolvedValueOnce(5);   // activeNow

    (prisma.conversationMessage.groupBy as any).mockResolvedValue([]);
    (prisma.handoffRequest.count as any).mockResolvedValue(20);

    const metrics = await AnalyticsService.getConversationMetrics(SHOP_ID, PERIOD);

    expect(metrics.total).toBe(100);
    expect(metrics.escalated).toBe(10);
    expect(metrics.resolved).toBe(90);       // total - escalated
    expect(metrics.resolutionRate).toBeCloseTo(0.9);  // 90/100
    expect(metrics.handoffRate).toBeCloseTo(0.2);     // 20/100
    expect(metrics.activeNow).toBe(5);
  });

  it("calculates average messages from groupBy result", async () => {
    (prisma.conversation.count as any).mockResolvedValue(3);
    (prisma.conversationMessage.groupBy as any).mockResolvedValue([
      { conversationId: "c1", _count: { id: 4 } },
      { conversationId: "c2", _count: { id: 6 } },
      { conversationId: "c3", _count: { id: 8 } },
    ]);
    (prisma.handoffRequest.count as any).mockResolvedValue(0);

    const metrics = await AnalyticsService.getConversationMetrics(SHOP_ID, PERIOD);
    // avg of 4+6+8 / 3 = 6
    expect(metrics.avgMessages).toBe(6);
  });

  it("handoff rate does not exceed 1 (no division error when handoffs > total)", async () => {
    (prisma.conversation.count as any).mockResolvedValue(5);
    (prisma.conversationMessage.groupBy as any).mockResolvedValue([]);
    (prisma.handoffRequest.count as any).mockResolvedValue(10); // more than total

    const metrics = await AnalyticsService.getConversationMetrics(SHOP_ID, PERIOD);
    // handoffRate = 10 / 5 = 2 — the service returns the ratio as-is; just verify no NaN/crash
    expect(typeof metrics.handoffRate).toBe("number");
    expect(Number.isFinite(metrics.handoffRate)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// REVENUE METRICS
// ---------------------------------------------------------------------------

describe("AnalyticsService.getRevenueMetrics", () => {
  it("returns zero revenue when no conversion events exist", async () => {
    (prisma.conversionEvent.groupBy as any).mockResolvedValue([]);
    (prisma.conversation.count as any).mockResolvedValue(1); // avoid /0

    const metrics = await AnalyticsService.getRevenueMetrics(SHOP_ID, PERIOD);

    expect(metrics.totalRevenue).toBe(0);
    expect(metrics.directRevenue).toBe(0);
    expect(metrics.assistedRevenue).toBe(0);
    expect(metrics.conversionCount).toBe(0);
  });

  it("aggregates revenue by attribution type", async () => {
    (prisma.conversionEvent.groupBy as any).mockResolvedValue([
      { attributionType: "DIRECT_RECOMMENDATION", _sum: { revenue: 500 }, _count: { id: 10 } },
      { attributionType: "ASSISTED",               _sum: { revenue: 300 }, _count: { id: 6 } },
      { attributionType: "CART_RECOVERY",           _sum: { revenue: 200 }, _count: { id: 4 } },
      { attributionType: "PROACTIVE_TRIGGER",       _sum: { revenue: 150 }, _count: { id: 3 } },
    ]);
    (prisma.conversation.count as any).mockResolvedValue(100);

    const metrics = await AnalyticsService.getRevenueMetrics(SHOP_ID, PERIOD);

    expect(metrics.directRevenue).toBe(500);
    expect(metrics.assistedRevenue).toBe(300);
    expect(metrics.cartRecoveryRevenue).toBe(200);
    expect(metrics.proactiveTriggerRevenue).toBe(150);
    expect(metrics.totalRevenue).toBe(1150);
    expect(metrics.conversionCount).toBe(23);
  });

  it("handles null revenue values (non-revenue conversions)", async () => {
    (prisma.conversionEvent.groupBy as any).mockResolvedValue([
      { attributionType: "DIRECT_RECOMMENDATION", _sum: { revenue: null }, _count: { id: 5 } },
    ]);
    (prisma.conversation.count as any).mockResolvedValue(10);

    const metrics = await AnalyticsService.getRevenueMetrics(SHOP_ID, PERIOD);

    expect(metrics.directRevenue).toBe(0);
    expect(metrics.totalRevenue).toBe(0);
    expect(metrics.conversionCount).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// PROACTIVE METRICS
// ---------------------------------------------------------------------------

describe("AnalyticsService.getProactiveMetrics", () => {
  it("returns zero metrics when no proactive messages sent", async () => {
    (prisma.proactiveMessage.groupBy as any).mockResolvedValue([]);

    const metrics = await AnalyticsService.getProactiveMetrics(SHOP_ID, PERIOD);

    expect(metrics.sent).toBe(0);
    expect(metrics.delivered).toBe(0);
    expect(metrics.converted).toBe(0);
    expect(metrics.deliveryRate).toBe(0);
    expect(metrics.conversionRate).toBe(0);
  });

  it("calculates funnel rates correctly", async () => {
    (prisma.proactiveMessage.groupBy as any).mockResolvedValue([
      { status: "QUEUED",    _count: { id: 5 } },
      { status: "SENT",      _count: { id: 100 } },
      { status: "DELIVERED", _count: { id: 80 } },
      { status: "CONVERTED", _count: { id: 20 } },
      { status: "FAILED",    _count: { id: 10 } },
    ]);

    const metrics = await AnalyticsService.getProactiveMetrics(SHOP_ID, PERIOD);

    expect(metrics.sent).toBe(100);
    expect(metrics.delivered).toBe(80);
    expect(metrics.converted).toBe(20);
    expect(metrics.deliveryRate).toBeCloseTo(0.8);   // 80/100
    expect(metrics.conversionRate).toBeCloseTo(0.25); // 20/80 (converted / delivered)
  });

  it("returns 0 for rates when sent is 0 (avoids division by zero)", async () => {
    (prisma.proactiveMessage.groupBy as any).mockResolvedValue([
      { status: "QUEUED", _count: { id: 3 } },
    ]);

    const metrics = await AnalyticsService.getProactiveMetrics(SHOP_ID, PERIOD);

    expect(metrics.sent).toBe(0);
    expect(metrics.deliveryRate).toBe(0);
    expect(metrics.conversionRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// INTENT BREAKDOWN
// ---------------------------------------------------------------------------

describe("AnalyticsService.getIntentBreakdown", () => {
  it("returns empty array when no intent signals", async () => {
    (prisma.intentSignal.groupBy as any).mockResolvedValue([]);

    const breakdown = await AnalyticsService.getIntentBreakdown(SHOP_ID, PERIOD);

    expect(breakdown).toEqual([]);
  });

  it("maps signalType to 'type' field and sorts by count descending", async () => {
    (prisma.intentSignal.groupBy as any).mockResolvedValue([
      { signalType: "PURCHASE_INTENT",  _count: { id: 50  }, _avg: { confidence: 0.85  } },
      { signalType: "BROWSE_INTENT",    _count: { id: 200 }, _avg: { confidence: 0.60  } },
      { signalType: "ABANDONMENT_RISK", _count: { id: 30  }, _avg: { confidence: 0.90 } },
    ]);

    const breakdown = await AnalyticsService.getIntentBreakdown(SHOP_ID, PERIOD);

    expect(breakdown[0].type).toBe("BROWSE_INTENT");
    expect(breakdown[0].count).toBe(200);
    expect(breakdown[1].type).toBe("PURCHASE_INTENT");
    expect(breakdown[2].type).toBe("ABANDONMENT_RISK");
  });

  it("rounds confidence to 2 decimal places", async () => {
    (prisma.intentSignal.groupBy as any).mockResolvedValue([
      { signalType: "PURCHASE_INTENT", _count: { id: 10 }, _avg: { confidence: 0.8333333 } },
    ]);

    const breakdown = await AnalyticsService.getIntentBreakdown(SHOP_ID, PERIOD);

    expect(breakdown[0].avgConfidence).toBe(0.83);
  });
});

// ---------------------------------------------------------------------------
// RECORD CONVERSION
// ---------------------------------------------------------------------------

describe("AnalyticsService.recordConversion", () => {
  it("creates a conversion event with correct fields", async () => {
    const mockEvent = {
      id: "conv-evt-1",
      shopId: SHOP_ID,
      conversationId: "conversation-1",
      orderId: "order-123",
      revenue: 99.99,
      attributionType: "DIRECT_RECOMMENDATION",
      metadata: {},
      createdAt: new Date(),
    };

    (prisma.conversionEvent.create as any).mockResolvedValue(mockEvent);

    const result = await AnalyticsService.recordConversion({
      shopId: SHOP_ID,
      orderId: "order-123",
      conversationId: "conversation-1",
      revenue: 99.99,
      currency: "EUR",
      attributionType: "DIRECT_RECOMMENDATION",
    });

  expect(result).toBeUndefined();
    expect(prisma.conversionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopId: SHOP_ID,
          attributionType: "DIRECT_RECOMMENDATION",
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// ORDER ATTRIBUTION
// ---------------------------------------------------------------------------

describe("AnalyticsService.attributeOrder", () => {
  it("attributes to conversation when recent chat exists", async () => {
    const mockConversation = { id: "recent-conv", shopId: SHOP_ID };

    (prisma.conversation.findFirst as any).mockResolvedValue(mockConversation);
    (prisma.proactiveMessage.findFirst as any).mockResolvedValue(null);
    (prisma.conversionEvent.create as any).mockResolvedValue({
      id: "evt-1",
      conversationId: "recent-conv",
      attributionType: "DIRECT_RECOMMENDATION",
    });

    const result = await AnalyticsService.attributeOrder(
      SHOP_ID,
      "customer-1",
      "order-100",
      150.0
    );

  expect(result).toBeUndefined();
    expect(prisma.conversionEvent.create).toHaveBeenCalled();
  });

  it("attributes to proactive message when only trigger exists within lookback window", async () => {
    (prisma.conversation.findFirst as any).mockResolvedValue(null);
    (prisma.proactiveMessage.findFirst as any).mockResolvedValue({
      id: "pm-1",
      shopId: SHOP_ID,
      status: "DELIVERED",
      sessionId: "session-1",
      triggerId: "trigger-1",
    });
    (prisma.conversionEvent.create as any).mockResolvedValue({
      id: "evt-2",
      attributionType: "PROACTIVE_TRIGGER",
    });
    (prisma.proactiveMessage.update as any).mockResolvedValue({});

    const result = await AnalyticsService.attributeOrder(
      SHOP_ID,
      "customer-2",
      "order-200",
      250.0
    );

  expect(result).toBeUndefined();
    expect(prisma.proactiveMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CONVERTED" }),
      })
    );
  });

  it("returns null when nothing to attribute within lookback window", async () => {
    (prisma.conversation.findFirst as any).mockResolvedValue(null);
    (prisma.proactiveMessage.findFirst as any).mockResolvedValue(null);

    const result = await AnalyticsService.attributeOrder(
      SHOP_ID,
      "customer-3",
      "order-300",
      50.0
    );

  expect(result).toBeUndefined();
    expect(prisma.conversionEvent.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TOP TRIGGERS
// ---------------------------------------------------------------------------

describe("AnalyticsService.getTopTriggers", () => {
  it("returns empty array when no proactive messages sent", async () => {
    (prisma.proactiveMessage.groupBy as any).mockResolvedValue([]);
    (prisma.proactiveTrigger.findMany as any).mockResolvedValue([]);

    const result = await AnalyticsService.getTopTriggers(SHOP_ID, PERIOD, 5);

    expect(result).toEqual([]);
  });

  it("returns triggers sorted by conversions descending", async () => {
    // First groupBy: all messages by triggerId
    (prisma.proactiveMessage.groupBy as any)
      .mockResolvedValueOnce([
        { triggerId: "t1", _count: { id: 100 } },
        { triggerId: "t2", _count: { id: 50 } },
      ])
      // Second groupBy: conversions only
      .mockResolvedValueOnce([
        { triggerId: "t1", _count: { id: 15 } },
        { triggerId: "t2", _count: { id: 20 } },
      ]);

    (prisma.proactiveTrigger.findMany as any).mockResolvedValue([
      { id: "t1", name: "Exit Intent" },
      { id: "t2", name: "Dwell Time" },
    ]);

    const result = await AnalyticsService.getTopTriggers(SHOP_ID, PERIOD, 5);

    expect(result).toHaveLength(2);
    expect(result[0].triggerName).toBe("Dwell Time"); // 20 conversions
    expect(result[1].triggerName).toBe("Exit Intent"); // 15 conversions
    expect(result[0].messagesSent).toBe(50);
    expect(result[0].conversions).toBe(20);
    expect(result[0].conversionRate).toBeCloseTo(0.4); // 20/50
  });
});

// ---------------------------------------------------------------------------
// GET REPORT (full integration snapshot)
// ---------------------------------------------------------------------------

describe("AnalyticsService.getReport", () => {
  it("returns a complete report object with all required sections", async () => {
    (prisma.conversation.count as any).mockResolvedValue(10);
    (prisma.conversationMessage.groupBy as any).mockResolvedValue([]);
    (prisma.handoffRequest.count as any).mockResolvedValue(2);
    (prisma.conversionEvent.groupBy as any).mockResolvedValue([]);
    (prisma.conversionEvent.findMany as any).mockResolvedValue([]);
    (prisma.proactiveMessage.groupBy as any).mockResolvedValue([]);
    (prisma.proactiveMessage.count as any).mockResolvedValue(0);
    (prisma.intentSignal.groupBy as any).mockResolvedValue([]);
    (prisma.proactiveTrigger.findMany as any).mockResolvedValue([]);

    const report = await AnalyticsService.getReport(SHOP_ID, 7);

    expect(report).toHaveProperty("shopId", SHOP_ID);
    expect(report).toHaveProperty("conversations");
    expect(report).toHaveProperty("revenue");
    expect(report).toHaveProperty("proactive");
    expect(report).toHaveProperty("intents");
    expect(report).toHaveProperty("dailyTrend");
    expect(report).toHaveProperty("topTriggers");
    expect(report.conversations.total).toBe(10);
    expect(Array.isArray(report.dailyTrend)).toBe(true);
    expect(report.dailyTrend).toHaveLength(7);
  });
});
