/**
 * Event Tracking Service - Phase 2
 * 
 * Captures and processes behavioral events from storefront visitors.
 * Events are used for intent detection, proactive triggers, and analytics.
 * 
 * Event types:
 * - PAGE_VIEW: User views a page (with dwell time)
 * - PRODUCT_VIEW: User views a product detail page
 * - ADD_TO_CART: User adds product(s) to cart
 * - REMOVE_FROM_CART: User removes product(s) from cart
 * - EXIT_INTENT: User shows exit intent (mouse leaves viewport)
 * - SCROLL_DEPTH: User scrolls to certain depth (25%, 50%, 75%, 100%)
 * - FORM_INTERACTION: User interacts with forms
 * - SEARCH: User searches for products
 */

import prisma from "../db.server";

export interface TrackEventParams {
  shopId: string;
  sessionId: string;
  visitorId?: string;
  customerId?: string;
  eventType: string;
  eventData: Record<string, any>;
}

export interface BehaviorEventRecord {
  id: string;
  shopId: string;
  sessionId: string;
  visitorId?: string | null;
  customerId?: string | null;
  eventType: string;
  eventData: any;
  timestamp: Date;
}

export class EventTrackingService {
  /**
   * Track a single behavioral event
   */
  static async trackEvent(params: TrackEventParams): Promise<BehaviorEventRecord> {
    const { shopId, sessionId, visitorId, customerId, eventType, eventData } = params;

    // Validate required fields
    if (!shopId || !sessionId || !eventType) {
      throw new Error("Missing required fields: shopId, sessionId, eventType");
    }

    // Create event record
    const event = await prisma.behaviorEvent.create({
      data: {
        shopId,
        sessionId,
        visitorId,
        customerId,
        eventType,
        eventData,
        timestamp: new Date(),
      },
    });

    return event as BehaviorEventRecord;
  }

  /**
   * Track multiple events in batch
   */
  static async trackEventsBatch(events: TrackEventParams[]): Promise<number> {
    if (events.length === 0) {
      return 0;
    }

    // Validate all events
    for (const event of events) {
      if (!event.shopId || !event.sessionId || !event.eventType) {
        throw new Error("Invalid event in batch: missing required fields");
      }
    }

    // Create all events
    const result = await prisma.behaviorEvent.createMany({
      data: events.map((e) => ({
        shopId: e.shopId,
        sessionId: e.sessionId,
        visitorId: e.visitorId,
        customerId: e.customerId,
        eventType: e.eventType,
        eventData: e.eventData,
        timestamp: new Date(),
      })),
    });

    return result.count;
  }

  /**
   * Get recent events for a session
   * Used for intent detection and context building
   */
  static async getSessionEvents(
    sessionId: string,
    limit: number = 50
  ): Promise<BehaviorEventRecord[]> {
    const events = await prisma.behaviorEvent.findMany({
      where: { sessionId },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    return events as BehaviorEventRecord[];
  }

  /**
   * Get events by type for a session
   * Useful for specific behavior analysis (e.g., all product views)
   */
  static async getSessionEventsByType(
    sessionId: string,
    eventType: string
  ): Promise<BehaviorEventRecord[]> {
    const events = await prisma.behaviorEvent.findMany({
      where: {
        sessionId,
        eventType,
      },
      orderBy: { timestamp: "desc" },
    });

    return events as BehaviorEventRecord[];
  }

  /**
   * Get timeline of events for a session
   * Returns chronologically ordered events with time gaps
   */
  static async getSessionTimeline(sessionId: string): Promise<{
    events: BehaviorEventRecord[];
    totalEvents: number;
    firstEvent: Date | null;
    lastEvent: Date | null;
    sessionDurationMs: number | null;
  }> {
    const events = await prisma.behaviorEvent.findMany({
      where: { sessionId },
      orderBy: { timestamp: "asc" },
    });

    if (events.length === 0) {
      return {
        events: [],
        totalEvents: 0,
        firstEvent: null,
        lastEvent: null,
        sessionDurationMs: null,
      };
    }

    const firstEvent = events[0].timestamp;
    const lastEvent = events[events.length - 1].timestamp;
    const sessionDurationMs = lastEvent.getTime() - firstEvent.getTime();

    return {
      events: events as BehaviorEventRecord[],
      totalEvents: events.length,
      firstEvent,
      lastEvent,
      sessionDurationMs,
    };
  }

  /**
   * Get aggregate stats for a session
   * Returns counts by event type, products viewed, cart value, etc.
   */
  static async getSessionStats(sessionId: string): Promise<{
    totalEvents: number;
    eventCounts: Record<string, number>;
    uniqueProductsViewed: number;
    addToCartCount: number;
    removeFromCartCount: number;
    exitIntentCount: number;
    maxScrollDepth: number;
    estimatedCartValue: number;
  }> {
    const events = await prisma.behaviorEvent.findMany({
      where: { sessionId },
    });

    const eventCounts: Record<string, number> = {};
    const productIds = new Set<string>();
    let addToCartCount = 0;
    let removeFromCartCount = 0;
    let exitIntentCount = 0;
    let maxScrollDepth = 0;
    let estimatedCartValue = 0;

    for (const event of events) {
      // Count by type
      eventCounts[event.eventType] = (eventCounts[event.eventType] || 0) + 1;

      // Product tracking
      if (event.eventType === "PRODUCT_VIEW" && event.eventData) {
        const data = event.eventData as any;
        if (data.productId) {
          productIds.add(data.productId);
        }
      }

      // Cart actions
      if (event.eventType === "ADD_TO_CART") {
        addToCartCount++;
        const data = event.eventData as any;
        if (data?.price) {
          estimatedCartValue += Number(data.price) || 0;
        }
      }

      if (event.eventType === "REMOVE_FROM_CART") {
        removeFromCartCount++;
        const data = event.eventData as any;
        if (data?.price) {
          estimatedCartValue -= Number(data.price) || 0;
        }
      }

      // Exit intent
      if (event.eventType === "EXIT_INTENT") {
        exitIntentCount++;
      }

      // Scroll depth
      if (event.eventType === "SCROLL_DEPTH" && event.eventData) {
        const data = event.eventData as any;
        if (data?.depth) {
          maxScrollDepth = Math.max(maxScrollDepth, Number(data.depth) || 0);
        }
      }
    }

    return {
      totalEvents: events.length,
      eventCounts,
      uniqueProductsViewed: productIds.size,
      addToCartCount,
      removeFromCartCount,
      exitIntentCount,
      maxScrollDepth,
      estimatedCartValue: Math.max(0, estimatedCartValue),
    };
  }

  /**
   * Clean up old events (data retention)
   * Should be called periodically via cron job
   */
  static async cleanupOldEvents(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.behaviorEvent.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }

  /**
   * Get active sessions (sessions with recent events)
   */
  static async getActiveSessions(
    shopId: string,
    inactivityThresholdMs: number = 300000 // 5 minutes default
  ): Promise<string[]> {
    const cutoffTime = new Date(Date.now() - inactivityThresholdMs);

    // Get distinct session IDs with events after cutoff
    const result = await prisma.behaviorEvent.findMany({
      where: {
        shopId,
        timestamp: {
          gte: cutoffTime,
        },
      },
      distinct: ["sessionId"],
      select: {
        sessionId: true,
      },
    });

    return result.map((r: { sessionId: string }) => r.sessionId);
  }

  /**
   * Detect patterns in session behavior
   * Returns computed insights like abandoned cart, browsing intent, etc.
   */
  static async detectSessionPatterns(sessionId: string): Promise<{
    hasAbandonedCart: boolean;
    isBrowsingHeavily: boolean;
    showedExitIntent: boolean;
    isEngaged: boolean; // High scroll depth + multiple page views
    likelyPriceShopping: boolean; // Multiple similar product views + cart adds/removes
  }> {
    const stats = await this.getSessionStats(sessionId);
    const events = await this.getSessionEvents(sessionId, 100);

    const hasAbandonedCart = stats.addToCartCount > 0 && stats.removeFromCartCount === 0;
    const isBrowsingHeavily = stats.uniqueProductsViewed >= 3;
    const showedExitIntent = stats.exitIntentCount > 0;
    const isEngaged = stats.maxScrollDepth >= 75 && (stats.eventCounts["PAGE_VIEW"] || 0) >= 3;

    // Detect price shopping: multiple similar products + cart churn
    const cartChurn = stats.addToCartCount > 0 && stats.removeFromCartCount > 0;
    const multipleViews = stats.uniqueProductsViewed >= 2;
    const likelyPriceShopping = cartChurn && multipleViews;

    return {
      hasAbandonedCart,
      isBrowsingHeavily,
      showedExitIntent,
      isEngaged,
      likelyPriceShopping,
    };
  }
}
