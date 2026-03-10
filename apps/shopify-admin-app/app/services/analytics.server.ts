/**
 * Analytics Service — Phase 5
 *
 * Aggregates conversation, revenue, proactive messaging and intent metrics.
 * Provides the data layer for the Analytics dashboard and attribution.
 *
 * Key responsibilities:
 * - Conversation metrics (volume, resolution rate, handoff rate, avg messages)
 * - Revenue metrics (direct, assisted, cart recovery attribution)
 * - Proactive messaging performance (sent → delivered → converted funnel)
 * - Intent breakdown by type/confidence
 * - Daily / weekly time-series trend
 * - Conversion recording (called by order webhook)
 */

import prisma from "../db.server";

// ============================================================================
// TYPES
// ============================================================================

export interface DateRange {
  from: Date;
  to: Date;
}

export interface ConversationMetrics {
  total: number;
  resolved: number;
  escalated: number;
  resolutionRate: number; // 0-1
  handoffRate: number; // 0-1
  avgMessages: number;
  activeNow: number;
}

export interface RevenueMetrics {
  totalRevenue: number;
  directRevenue: number;
  assistedRevenue: number;
  cartRecoveryRevenue: number;
  proactiveTriggerRevenue: number;
  conversionCount: number;
  conversionRate: number; // conversions / conversations
}

export interface ProactiveMetrics {
  queued: number;
  sent: number;
  delivered: number;
  converted: number;
  failed: number;
  deliveryRate: number; // delivered / sent
  conversionRate: number; // converted / delivered
}

export interface IntentBreakdown {
  type: string;
  count: number;
  avgConfidence: number;
  conversionCount: number;
}

export interface DailyDataPoint {
  date: string; // ISO date string YYYY-MM-DD
  conversations: number;
  revenue: number;
  handoffs: number;
  proactiveMessages: number;
}

export interface TopTrigger {
  triggerId: string;
  triggerName: string;
  messagesSent: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
}

export interface AnalyticsReport {
  shopId: string;
  period: DateRange;
  generatedAt: Date;
  conversations: ConversationMetrics;
  revenue: RevenueMetrics;
  proactive: ProactiveMetrics;
  intents: IntentBreakdown[];
  dailyTrend: DailyDataPoint[];
  topTriggers: TopTrigger[];
}

// For recording a conversion event (called from order webhook)
export interface ConversionData {
  shopId: string;
  orderId: string;
  revenue: number;
  currency: string;
  conversationId?: string;
  sessionId?: string;
  attributionType: "DIRECT_RECOMMENDATION" | "ASSISTED" | "PROACTIVE_TRIGGER" | "CART_RECOVERY";
  productIds?: string[];
  metadata?: Record<string, any>;
}

// ============================================================================
// ANALYTICS SERVICE
// ============================================================================

export class AnalyticsService {
  /**
   * Generate full analytics report for a shop over a given number of days
   */
  static async getReport(shopId: string, days: number = 30): Promise<AnalyticsReport> {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const period: DateRange = { from, to };

    const [conversations, revenue, proactive, intents, dailyTrend, topTriggers] =
      await Promise.all([
        this.getConversationMetrics(shopId, period),
        this.getRevenueMetrics(shopId, period),
        this.getProactiveMetrics(shopId, period),
        this.getIntentBreakdown(shopId, period),
        this.getDailyTrend(shopId, days),
        this.getTopTriggers(shopId, period),
      ]);

    return {
      shopId,
      period,
      generatedAt: new Date(),
      conversations,
      revenue,
      proactive,
      intents,
      dailyTrend,
      topTriggers,
    };
  }

  // --------------------------------------------------------------------------
  // CONVERSATION METRICS
  // --------------------------------------------------------------------------

  static async getConversationMetrics(
    shopId: string,
    period: DateRange
  ): Promise<ConversationMetrics> {
    const [total, escalated, messageCounts, activeNow] = await Promise.all([
      prisma.conversation.count({
        where: {
          shopId,
          startedAt: { gte: period.from, lte: period.to },
        },
      }),
      prisma.conversation.count({
        where: {
          shopId,
          status: "ESCALATED",
          startedAt: { gte: period.from, lte: period.to },
        },
      }),
      prisma.conversationMessage.groupBy({
        by: ["conversationId"],
        where: {
          conversation: { shopId },
          createdAt: { gte: period.from, lte: period.to },
        },
        _count: { id: true },
      }),
      prisma.conversation.count({
        where: {
          shopId,
          status: "ACTIVE",
          OR: [
            {
              lastMessageAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
            },
            {
              AND: [
                { lastMessageAt: null },
                { startedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
              ],
            },
          ],
        },
      }),
    ]);

    const handoffRequests = await prisma.handoffRequest.count({
      where: {
        shopId,
        createdAt: { gte: period.from, lte: period.to },
      },
    });

    const avgMessages =
      messageCounts.length > 0
        ? messageCounts.reduce((sum, g) => sum + g._count.id, 0) / messageCounts.length
        : 0;

    return {
      total,
      resolved: Math.max(0, total - escalated),
      escalated,
      resolutionRate: total > 0 ? (total - escalated) / total : 0,
      handoffRate: total > 0 ? handoffRequests / total : 0,
      avgMessages: Math.round(avgMessages * 10) / 10,
      activeNow,
    };
  }

  // --------------------------------------------------------------------------
  // REVENUE METRICS
  // --------------------------------------------------------------------------

  static async getRevenueMetrics(shopId: string, period: DateRange): Promise<RevenueMetrics> {
    const conversionsByType = await prisma.conversionEvent.groupBy({
      by: ["attributionType"],
      where: {
        shopId,
        createdAt: { gte: period.from, lte: period.to },
      },
      _sum: { revenue: true },
      _count: { id: true },
    });

    const totalConversations =
      (await prisma.conversation.count({
        where: {
          shopId,
          startedAt: { gte: period.from, lte: period.to },
        },
      })) || 0;

    let totalRevenue = 0;
    let directRevenue = 0;
    let assistedRevenue = 0;
    let cartRecoveryRevenue = 0;
    let proactiveTriggerRevenue = 0;
    let conversionCount = 0;

    for (const group of conversionsByType) {
      const revenue = Number(group._sum.revenue ?? 0);
      const count = group._count.id;

      totalRevenue += revenue;
      conversionCount += count;

      switch (group.attributionType) {
        case "DIRECT_RECOMMENDATION":
          directRevenue += revenue;
          break;
        case "ASSISTED":
          assistedRevenue += revenue;
          break;
        case "CART_RECOVERY":
          cartRecoveryRevenue += revenue;
          break;
        case "PROACTIVE_TRIGGER":
          proactiveTriggerRevenue += revenue;
          break;
      }
    }

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      directRevenue: Math.round(directRevenue * 100) / 100,
      assistedRevenue: Math.round(assistedRevenue * 100) / 100,
      cartRecoveryRevenue: Math.round(cartRecoveryRevenue * 100) / 100,
      proactiveTriggerRevenue: Math.round(proactiveTriggerRevenue * 100) / 100,
      conversionCount,
      conversionRate: totalConversations > 0 ? conversionCount / totalConversations : 0,
    };
  }

  // --------------------------------------------------------------------------
  // PROACTIVE MESSAGING METRICS
  // --------------------------------------------------------------------------

  static async getProactiveMetrics(shopId: string, period: DateRange): Promise<ProactiveMetrics> {
    const statusCounts = await prisma.proactiveMessage.groupBy({
      by: ["status"],
      where: {
        shopId,
        createdAt: { gte: period.from, lte: period.to },
      },
      _count: { id: true },
    });

    const counts: Record<string, number> = {};
    statusCounts.forEach((g) => {
      counts[g.status] = g._count.id;
    });

    const queued = counts["QUEUED"] ?? 0;
    const sent = counts["SENT"] ?? 0;
    const delivered = counts["DELIVERED"] ?? 0;
    const converted = counts["CONVERTED"] ?? 0;
    const failed = counts["FAILED"] ?? 0;

    return {
      queued,
      sent,
      delivered,
      converted,
      failed,
      deliveryRate: sent > 0 ? delivered / sent : 0,
      conversionRate: delivered > 0 ? converted / delivered : 0,
    };
  }

  // --------------------------------------------------------------------------
  // INTENT BREAKDOWN
  // --------------------------------------------------------------------------

  static async getIntentBreakdown(
    shopId: string,
    period: DateRange
  ): Promise<IntentBreakdown[]> {
    const signals = await prisma.intentSignal.groupBy({
      by: ["signalType"],
      where: {
        shopId,
        createdAt: { gte: period.from, lte: period.to },
      },
      _count: { id: true },
      _avg: { confidence: true },
    });

    const breakdowns: IntentBreakdown[] = signals.map((g) => ({
      type: g.signalType,
      count: g._count.id,
      avgConfidence: Math.round((g._avg.confidence ?? 0) * 100) / 100,
      conversionCount: 0, // enriched below if needed
    }));

    // Sort by count descending
    return breakdowns.sort((a, b) => b.count - a.count);
  }

  // --------------------------------------------------------------------------
  // DAILY TREND
  // --------------------------------------------------------------------------

  static async getDailyTrend(shopId: string, days: number = 30): Promise<DailyDataPoint[]> {
    const result: DailyDataPoint[] = [];
    const now = new Date();

    // Build buckets for each day
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(now.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayStart.getDate() + 1);

      const dateStr = dayStart.toISOString().split("T")[0];

      // Run counts in parallel per day (coarse-grained)
      const [conversations, conversions, handoffs, proactiveMessages] = await Promise.all([
        prisma.conversation.count({
          where: { shopId, startedAt: { gte: dayStart, lt: dayEnd } },
        }),
        prisma.conversionEvent.findMany({
          where: { shopId, createdAt: { gte: dayStart, lt: dayEnd } },
          select: { revenue: true },
        }),
        prisma.handoffRequest.count({
          where: { shopId, createdAt: { gte: dayStart, lt: dayEnd } },
        }),
        prisma.proactiveMessage.count({
          where: { shopId, createdAt: { gte: dayStart, lt: dayEnd } },
        }),
      ]);

      const dayRevenue = conversions.reduce(
        (sum, c) => sum + Number(c.revenue ?? 0),
        0
      );

      result.push({
        date: dateStr,
        conversations,
        revenue: Math.round(dayRevenue * 100) / 100,
        handoffs,
        proactiveMessages,
      });
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // TOP TRIGGERS
  // --------------------------------------------------------------------------

  static async getTopTriggers(
    shopId: string,
    period: DateRange,
    limit: number = 5
  ): Promise<TopTrigger[]> {
    // Group proactive messages by trigger
    const messageCounts = await prisma.proactiveMessage.groupBy({
      by: ["triggerId"],
      where: {
        shopId,
        createdAt: { gte: period.from, lte: period.to },
      },
      _count: { id: true },
    });

    const conversionCounts = await prisma.proactiveMessage.groupBy({
      by: ["triggerId"],
      where: {
        shopId,
        status: "CONVERTED",
        createdAt: { gte: period.from, lte: period.to },
      },
      _count: { id: true },
    });

    const conversionMap = new Map(
      conversionCounts.map((g) => [g.triggerId, g._count.id])
    );

    // Load trigger names
    const triggerIds = messageCounts.map((m) => m.triggerId).filter(Boolean) as string[];
    const triggers = await prisma.proactiveTrigger.findMany({
      where: { id: { in: triggerIds } },
      select: { id: true, name: true },
    });
    const triggerNameMap = new Map(triggers.map((t) => [t.id, t.name]));

    const topTriggers: TopTrigger[] = messageCounts
      .filter((m) => m.triggerId)
      .map((m) => {
        const sent = m._count.id;
        const conversions = conversionMap.get(m.triggerId!) ?? 0;
        return {
          triggerId: m.triggerId!,
          triggerName: triggerNameMap.get(m.triggerId!) ?? m.triggerId!,
          messagesSent: sent,
          conversions,
          revenue: 0, // enrichment if needed
          conversionRate: sent > 0 ? conversions / sent : 0,
        };
      })
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, limit);

    return topTriggers;
  }

  // --------------------------------------------------------------------------
  // RECORD CONVERSION (called by order webhook)
  // --------------------------------------------------------------------------

  /**
   * Record a conversion event when an order is placed.
   * Looks for recent conversation or proactive message to attribute to.
   */
  static async recordConversion(data: ConversionData): Promise<void> {
    if (!data.conversationId) {
      return;
    }

    await prisma.conversionEvent.create({
      data: {
        shopId: data.shopId,
        orderId: data.orderId,
        conversationId: data.conversationId,
        revenue: data.revenue,
        attributionType: data.attributionType,
        metadata: {
          ...(data.metadata ?? {}),
          currency: data.currency,
          productIds: data.productIds ?? [],
          sessionId: data.sessionId,
        },
      },
    });
  }

  /**
   * Try to attribute an order to a recent conversation or proactive message.
   * Returns attribution type and optional IDs.
   */
  static async attributeOrder(
    shopId: string,
    customerId: string | undefined,
    orderId: string,
    orderRevenue: number
  ): Promise<void> {
    const lookbackMs = 24 * 60 * 60 * 1000; // 24h
    const lookbackDate = new Date(Date.now() - lookbackMs);

    // Find recent conversation from this customer
    const recentConv = customerId
      ? await prisma.conversation.findFirst({
          where: {
            shopId,
            customerId,
            OR: [
              { lastMessageAt: { gte: lookbackDate } },
              { startedAt: { gte: lookbackDate } },
            ],
          },
          orderBy: [{ lastMessageAt: "desc" }, { startedAt: "desc" }],
        })
      : null;

    // Find recent proactive message conversion
    const recentProactive = await prisma.proactiveMessage.findFirst({
      where: {
        shopId,
        status: { in: ["DELIVERED", "CONVERTED"] },
        updatedAt: { gte: lookbackDate },
      },
      orderBy: { updatedAt: "desc" },
    });

    let attributionType: ConversionData["attributionType"] | null = null;
    let conversationId: string | undefined;

    if (recentProactive) {
      // Mark proactive message as converted
      await prisma.proactiveMessage.update({
        where: { id: recentProactive.id },
        data: { status: "CONVERTED", outcome: "purchase" },
      }).catch(() => {
        // Non-fatal if message already updated
      });

      if (recentConv) {
        attributionType = "PROACTIVE_TRIGGER";
        conversationId = recentConv.id;
      } else {
        return;
      }
    } else if (recentConv) {
      attributionType = "ASSISTED";
      conversationId = recentConv.id;
    } else {
      return; // No attribution window found — do not record
    }

    await this.recordConversion({
      shopId,
      orderId,
      revenue: orderRevenue,
      currency: "USD",
      conversationId,
      attributionType: attributionType ?? "ASSISTED",
    });
  }

  // --------------------------------------------------------------------------
  // SUMMARY STATS (lightweight, for header cards)
  // --------------------------------------------------------------------------

  static async getSummaryStats(
    shopId: string,
    days: number = 7
  ): Promise<{
    conversations: number;
    resolutionRate: number;
    assistedRevenue: number;
    proactiveConversions: number;
    handoffRate: number;
  }> {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const period: DateRange = { from, to };

    const [convMetrics, revMetrics, proactiveMetrics] = await Promise.all([
      this.getConversationMetrics(shopId, period),
      this.getRevenueMetrics(shopId, period),
      this.getProactiveMetrics(shopId, period),
    ]);

    return {
      conversations: convMetrics.total,
      resolutionRate: convMetrics.resolutionRate,
      assistedRevenue: revMetrics.totalRevenue,
      proactiveConversions: proactiveMetrics.converted,
      handoffRate: convMetrics.handoffRate,
    };
  }
}
