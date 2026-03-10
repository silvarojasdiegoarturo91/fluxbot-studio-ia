/**
 * Intent Detection Engine - Phase 2
 * 
 * Analyzes behavioral events to detect user intentions and calculate scores.
 * Uses rule-based heuristics combined with behavioral patterns.
 * 
 * Intent types detected:
 * - PURCHASE_INTENT: Likelihood user will make a purchase
 * - ABANDONMENT_RISK: Risk of cart/session abandonment
 * - NEEDS_HELP: User appears confused or stuck
 * - PRICE_SHOPPER: User comparing prices or looking for deals
 * - BROWSE_INTENT: Casual browsing without purchase intent
 */

import prisma from "../db.server";
import { EventTrackingService, type BehaviorEventRecord } from "./event-tracking.server";

export interface IntentScore {
  purchaseIntent: number;      // 0-1: likelihood of purchase
  abandonmentRisk: number;     // 0-1: risk of abandoning cart/session
  needsHelp: number;           // 0-1: appears confused or needs assistance
  priceShopperRisk: number;    // 0-1: comparing prices, discount hunting
  browseIntent: number;        // 0-1: casual browsing without intent
}

export interface IntentAnalysis {
  sessionId: string;
  scores: IntentScore;
  dominantIntent: string;
  confidence: number;
  triggers: string[];
  recommendations: string[];
  lastAnalyzedAt: Date;
}

export interface IntentSignalRecord {
  id: string;
  shopId: string;
  sessionId: string;
  visitorId?: string | null;
  signalType: string;
  confidence: number;
  triggerData: any;
  actionTaken?: string | null;
  outcome?: string | null;
  createdAt: Date;
}

export class IntentDetectionEngine {
  /**
   * Analyze session behavior and calculate intent scores
   */
  static async analyzeSession(sessionId: string): Promise<IntentAnalysis> {
    // Get session events and stats
    const events = await EventTrackingService.getSessionEvents(sessionId, 100);
    const stats = await EventTrackingService.getSessionStats(sessionId);
    const patterns = await EventTrackingService.detectSessionPatterns(sessionId);

    if (events.length === 0) {
      return this.createEmptyAnalysis(sessionId);
    }

    // Calculate individual intent scores
    const purchaseIntent = this.calculatePurchaseIntent(events, stats, patterns);
    const abandonmentRisk = this.calculateAbandonmentRisk(events, stats, patterns);
    const needsHelp = this.calculateNeedsHelp(events, stats, patterns);
    const priceShopperRisk = this.calculatePriceShopperRisk(events, stats, patterns);
    const browseIntent = this.calculateBrowseIntent(events, stats, patterns);

    const scores: IntentScore = {
      purchaseIntent,
      abandonmentRisk,
      needsHelp,
      priceShopperRisk,
      browseIntent,
    };

    // Determine dominant intent
    const { dominantIntent, confidence } = this.getDominantIntent(scores);

    // Generate triggers and recommendations
    const triggers = this.identifyTriggers(scores, patterns);
    const recommendations = this.generateRecommendations(scores, patterns, stats);

    return {
      sessionId,
      scores,
      dominantIntent,
      confidence,
      triggers,
      recommendations,
      lastAnalyzedAt: new Date(),
    };
  }

  /**
   * Calculate purchase intent score
   * Factors: product views, dwell time, cart adds, engagement
   */
  private static calculatePurchaseIntent(
    events: BehaviorEventRecord[],
    stats: any,
    patterns: any
  ): number {
    let score = 0;

    // Product views (higher is better, diminishing returns)
    if (stats.uniqueProductsViewed >= 1) score += 0.2;
    if (stats.uniqueProductsViewed >= 2) score += 0.1;
    if (stats.uniqueProductsViewed >= 3) score += 0.05;

    // Add to cart is strong signal
    if (stats.addToCartCount > 0) {
      score += 0.5;
      // Multiple adds = higher intent
      if (stats.addToCartCount >= 2) score += 0.1;
    }

    // Dwell time on products (look for PRODUCT_VIEW events with high dwell)
    const productViews = events.filter((e) => e.eventType === "PRODUCT_VIEW");
    const avgDwellTime = this.calculateAverageDwellTime(productViews);
    if (avgDwellTime > 30000) score += 0.3; // > 30 seconds
    if (avgDwellTime > 60000) score += 0.2; // > 1 minute

    // High engagement (scroll depth, page views)
    if (patterns.isEngaged) score += 0.2;

    // Cart value indicates serious interest
    if (stats.estimatedCartValue > 0) {
      score += Math.min(0.3, stats.estimatedCartValue / 1000); // up to +0.3
    }

    return Math.min(1.0, score);
  }

  /**
   * Calculate abandonment risk score
   * Factors: exit intent, inactivity, cart status
   */
  private static calculateAbandonmentRisk(
    events: BehaviorEventRecord[],
    stats: any,
    patterns: any
  ): number {
    let score = 0;

    // Exit intent is strongest signal
    if (stats.exitIntentCount > 0) {
      score += 0.7;
      if (stats.exitIntentCount >= 2) score += 0.2; // multiple exit attempts
    }

    // Has items in cart but hasn't converted
    if (patterns.hasAbandonedCart) score += 0.5;

    // Inactivity detection (time since last event)
    const lastEvent = events[0]; // Most recent (desc order)
    const timeSinceLastActivity = Date.now() - lastEvent.timestamp.getTime();
    if (timeSinceLastActivity > 60000) score += 0.4; // > 1 minute idle
    if (timeSinceLastActivity > 180000) score += 0.3; // > 3 minutes idle

    // Removing items from cart (second thoughts)
    if (stats.removeFromCartCount > 0) score += 0.3;

    // Browse heavily without adding to cart (analysis paralysis)
    if (patterns.isBrowsingHeavily && stats.addToCartCount === 0) {
      score += 0.2;
    }

    return Math.min(1.0, score);
  }

  /**
   * Calculate "needs help" score
   * Factors: confusion signals, repeated actions, low engagement
   */
  private static calculateNeedsHelp(
    events: BehaviorEventRecord[],
    stats: any,
    patterns: any
  ): number {
    let score = 0;

    // Repeated product views without action (indecision)
    const productViews = events.filter((e) => e.eventType === "PRODUCT_VIEW");
    const uniqueProducts = new Set(
      productViews.map((e) => (e.eventData as any)?.productId).filter(Boolean)
    );
    if (productViews.length > 5 && uniqueProducts.size <= 2) {
      score += 0.4; // viewing same products repeatedly
    }

    // Low scroll depth (not engaging with content)
    if (stats.maxScrollDepth > 0 && stats.maxScrollDepth < 25) {
      score += 0.3; // barely scrolling
    }

    // Multiple page views but low engagement
    const pageViewCount = stats.eventCounts["PAGE_VIEW"] || 0;
    if (pageViewCount >= 5 && !patterns.isEngaged) {
      score += 0.3; // bouncing around without engaging
    }

    // Cart churn (adding/removing repeatedly)
    if (stats.addToCartCount > 0 && stats.removeFromCartCount > 0) {
      const churnRatio = stats.removeFromCartCount / stats.addToCartCount;
      if (churnRatio > 0.5) score += 0.4; // high churn = confusion
    }

    // Search events (user looking for something specific)
    const searchCount = stats.eventCounts["SEARCH"] || 0;
    if (searchCount >= 2) score += 0.2; // multiple searches
    if (searchCount >= 4) score += 0.2; // many searches = can't find

    return Math.min(1.0, score);
  }

  /**
   * Calculate price shopper risk score
   * Factors: multiple similar products, cart churn, low engagement
   */
  private static calculatePriceShopperRisk(
    events: BehaviorEventRecord[],
    stats: any,
    patterns: any
  ): number {
    let score = 0;

    // Pattern detection flagged price shopping
    if (patterns.likelyPriceShopping) score += 0.6;

    // Multiple products viewed in same category
    if (stats.uniqueProductsViewed >= 4) score += 0.3;
    if (stats.uniqueProductsViewed >= 6) score += 0.2;

    // Adding and removing items (comparing)
    if (stats.addToCartCount > 1 && stats.removeFromCartCount > 0) {
      score += 0.4;
    }

    // Low dwell time per product (quick comparisons)
    const productViews = events.filter((e) => e.eventType === "PRODUCT_VIEW");
    const avgDwellTime = this.calculateAverageDwellTime(productViews);
    if (avgDwellTime < 15000 && productViews.length >= 3) {
      score += 0.3; // < 15s per product, many products
    }

    return Math.min(1.0, score);
  }

  /**
   * Calculate browse intent score
   * Factors: casual engagement, no cart activity
   */
  private static calculateBrowseIntent(
    events: BehaviorEventRecord[],
    stats: any,
    patterns: any
  ): number {
    let score = 0;

    // Many page views but no cart activity
    const pageViewCount = stats.eventCounts["PAGE_VIEW"] || 0;
    if (pageViewCount >= 3 && stats.addToCartCount === 0) {
      score += 0.5;
    }

    // Browsing products without deep engagement
    if (stats.uniqueProductsViewed >= 2 && stats.maxScrollDepth < 50) {
      score += 0.3; // shallow browsing
    }

    // No exit intent or abandonment signals (casual visit)
    if (stats.exitIntentCount === 0 && !patterns.hasAbandonedCart) {
      score += 0.2;
    }

    return Math.min(1.0, score);
  }

  /**
   * Determine dominant intent from scores
   */
  private static getDominantIntent(scores: IntentScore): {
    dominantIntent: string;
    confidence: number;
  } {
    const intents = [
      { type: "PURCHASE_INTENT", score: scores.purchaseIntent },
      { type: "ABANDONMENT_RISK", score: scores.abandonmentRisk },
      { type: "NEEDS_HELP", score: scores.needsHelp },
      { type: "PRICE_SHOPPER", score: scores.priceShopperRisk },
      { type: "BROWSE_INTENT", score: scores.browseIntent },
    ];

    // Sort by score descending
    intents.sort((a, b) => b.score - a.score);

    const top = intents[0];
    const second = intents[1];

    // Confidence is how much stronger top intent is vs second
    const confidence = top.score - second.score;

    return {
      dominantIntent: top.type,
      confidence: Math.min(1.0, confidence + 0.3), // baseline confidence
    };
  }

  /**
   * Identify specific triggers for proactive action
   */
  private static identifyTriggers(scores: IntentScore, patterns: any): string[] {
    const triggers: string[] = [];

    if (scores.abandonmentRisk > 0.6) triggers.push("HIGH_ABANDONMENT_RISK");
    if (scores.purchaseIntent > 0.7) triggers.push("HIGH_PURCHASE_INTENT");
    if (scores.needsHelp > 0.5) triggers.push("CUSTOMER_NEEDS_HELP");
    if (scores.priceShopperRisk > 0.6) triggers.push("PRICE_SHOPPING_DETECTED");
    if (patterns.showedExitIntent) triggers.push("EXIT_INTENT_DETECTED");
    if (patterns.hasAbandonedCart) triggers.push("CART_ABANDONED");

    return triggers;
  }

  /**
   * Generate recommendations for merchant/agent
   */
  private static generateRecommendations(
    scores: IntentScore,
    patterns: any,
    stats: any
  ): string[] {
    const recommendations: string[] = [];

    if (scores.abandonmentRisk > 0.6) {
      recommendations.push("Send retention message with incentive");
      if (stats.estimatedCartValue > 0) {
        recommendations.push(`Offer discount on cart value: $${stats.estimatedCartValue.toFixed(2)}`);
      }
    }

    if (scores.purchaseIntent > 0.7 && stats.addToCartCount > 0) {
      recommendations.push("Show urgency message (limited stock, time-sensitive offer)");
      recommendations.push("Offer express checkout option");
    }

    if (scores.needsHelp > 0.5) {
      recommendations.push("Proactively offer assistance");
      recommendations.push("Show product comparison tool or FAQ");
    }

    if (scores.priceShopperRisk > 0.6) {
      recommendations.push("Highlight value proposition (quality, warranty, reviews)");
      recommendations.push("Show price match guarantee if available");
    }

    if (patterns.isBrowsingHeavily && scores.purchaseIntent < 0.4) {
      recommendations.push("Show personalized recommendations");
      recommendations.push("Offer guided shopping experience");
    }

    return recommendations;
  }

  /**
   * Helper: Calculate average dwell time from product view events
   */
  private static calculateAverageDwellTime(productViews: BehaviorEventRecord[]): number {
    if (productViews.length === 0) return 0;

    const dwellTimes = productViews
      .map((e) => (e.eventData as any)?.dwellTimeMs)
      .filter((t) => typeof t === "number" && t > 0);

    if (dwellTimes.length === 0) return 0;

    const sum = dwellTimes.reduce((acc, t) => acc + t, 0);
    return sum / dwellTimes.length;
  }

  /**
   * Create empty analysis for sessions with no events
   */
  private static createEmptyAnalysis(sessionId: string): IntentAnalysis {
    return {
      sessionId,
      scores: {
        purchaseIntent: 0,
        abandonmentRisk: 0,
        needsHelp: 0,
        priceShopperRisk: 0,
        browseIntent: 0,
      },
      dominantIntent: "UNKNOWN",
      confidence: 0,
      triggers: [],
      recommendations: [],
      lastAnalyzedAt: new Date(),
    };
  }

  /**
   * Store intent signal in database
   */
  static async recordIntentSignal(params: {
    shopId: string;
    sessionId: string;
    visitorId?: string;
    signalType: string;
    confidence: number;
    triggerData: Record<string, any>;
    actionTaken?: string;
  }): Promise<IntentSignalRecord> {
    const signal = await prisma.intentSignal.create({
      data: {
        shopId: params.shopId,
        sessionId: params.sessionId,
        visitorId: params.visitorId,
        signalType: params.signalType,
        confidence: params.confidence,
        triggerData: params.triggerData,
        actionTaken: params.actionTaken,
      },
    });

    return signal as IntentSignalRecord;
  }

  /**
   * Get recent intent signals for a session
   */
  static async getSessionSignals(sessionId: string): Promise<IntentSignalRecord[]> {
    const signals = await prisma.intentSignal.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return signals as IntentSignalRecord[];
  }

  /**
   * Update intent signal outcome (when action is taken)
   */
  static async updateSignalOutcome(
    signalId: string,
    outcome: string
  ): Promise<void> {
    await prisma.intentSignal.update({
      where: { id: signalId },
      data: { outcome },
    });
  }

  /**
   * Analyze and store intent signal
   * Returns both analysis and stored signal
   */
  static async analyzeAndRecord(
    shopId: string,
    sessionId: string,
    visitorId?: string
  ): Promise<{
    analysis: IntentAnalysis;
    signal: IntentSignalRecord | null;
  }> {
    const analysis = await this.analyzeSession(sessionId);

    // Only record if there's a clear dominant intent with sufficient confidence
    let signal: IntentSignalRecord | null = null;
    if (analysis.confidence > 0.5 && analysis.triggers.length > 0) {
      signal = await this.recordIntentSignal({
        shopId,
        sessionId,
        visitorId,
        signalType: analysis.dominantIntent,
        confidence: analysis.confidence,
        triggerData: {
          scores: analysis.scores,
          triggers: analysis.triggers,
          recommendations: analysis.recommendations,
        },
      });
    }

    return { analysis, signal };
  }

  /**
   * Batch analyze multiple sessions
   * Useful for background processing
   */
  static async analyzeSessions(sessionIds: string[]): Promise<IntentAnalysis[]> {
    const analyses: IntentAnalysis[] = [];

    for (const sessionId of sessionIds) {
      try {
        const analysis = await this.analyzeSession(sessionId);
        analyses.push(analysis);
      } catch (error) {
        console.error(`[Intent Detection] Failed to analyze session ${sessionId}:`, error);
      }
    }

    return analyses;
  }
}
