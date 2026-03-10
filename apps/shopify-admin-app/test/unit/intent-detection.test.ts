/**
 * Unit Tests: Intent Detection Engine
 * 
 * Tests scoring algorithms for:
 * - Purchase intent
 * - Abandonment risk
 * - Needs help
 * - Price shopper
 * - Browse intent
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { IntentDetectionEngine } from "../../app/services/intent-detection.server";
import { EventTrackingService } from "../../app/services/event-tracking.server";

// Mock dependencies
vi.mock("../../app/services/event-tracking.server");
vi.mock("../../app/db.server", () => ({
  default: {
    intentSignal: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("IntentDetectionEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("analyzeSession", () => {
    it("should return empty analysis for session with no events", async () => {
      vi.mocked(EventTrackingService.getSessionEvents).mockResolvedValue([]);
      vi.mocked(EventTrackingService.getSessionStats).mockResolvedValue({
        totalEvents: 0,
        uniqueProductsViewed: 0,
        addToCartCount: 0,
        removeFromCartCount: 0,
        exitIntentCount: 0,
        maxScrollDepth: 0,
        estimatedCartValue: 0,
        eventCounts: {},
      });
      vi.mocked(EventTrackingService.detectSessionPatterns).mockResolvedValue({
        hasAbandonedCart: false,
        isBrowsingHeavily: false,
        showedExitIntent: false,
        isEngaged: false,
        likelyPriceShopping: false,
      });

      const analysis = await IntentDetectionEngine.analyzeSession("test-session");

      expect(analysis.scores.purchaseIntent).toBe(0);
      expect(analysis.scores.abandonmentRisk).toBe(0);
      expect(analysis.dominantIntent).toBe("UNKNOWN");
      expect(analysis.confidence).toBe(0);
      expect(analysis.triggers).toHaveLength(0);
    });

    it("should detect high purchase intent with cart adds and product views", async () => {
      const mockEvents = [
        {
          id: "1",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "PRODUCT_VIEW",
          eventData: { productId: "prod1", dwellTimeMs: 45000 },
          timestamp: new Date(),
        },
        {
          id: "2",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "ADD_TO_CART",
          eventData: { productId: "prod1", price: 50 },
          timestamp: new Date(),
        },
      ];

      vi.mocked(EventTrackingService.getSessionEvents).mockResolvedValue(mockEvents as any);
      vi.mocked(EventTrackingService.getSessionStats).mockResolvedValue({
        totalEvents: 2,
        uniqueProductsViewed: 1,
        addToCartCount: 1,
        removeFromCartCount: 0,
        exitIntentCount: 0,
        maxScrollDepth: 75,
        estimatedCartValue: 50,
        eventCounts: { PRODUCT_VIEW: 1, ADD_TO_CART: 1 },
      });
      vi.mocked(EventTrackingService.detectSessionPatterns).mockResolvedValue({
        hasAbandonedCart: false,
        isBrowsingHeavily: false,
        showedExitIntent: false,
        isEngaged: true,
        likelyPriceShopping: false,
      });

      const analysis = await IntentDetectionEngine.analyzeSession("test-session");

      expect(analysis.scores.purchaseIntent).toBeGreaterThan(0.7);
      expect(analysis.dominantIntent).toBe("PURCHASE_INTENT");
      expect(analysis.triggers).toContain("HIGH_PURCHASE_INTENT");
    });

    it("should detect high abandonment risk with exit intent", async () => {
      const mockEvents = [
        {
          id: "1",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "ADD_TO_CART",
          eventData: { productId: "prod1", price: 100 },
          timestamp: new Date(Date.now() - 120000), // 2 minutes ago
        },
        {
          id: "2",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "EXIT_INTENT",
          eventData: {},
          timestamp: new Date(),
        },
      ];

      vi.mocked(EventTrackingService.getSessionEvents).mockResolvedValue(mockEvents as any);
      vi.mocked(EventTrackingService.getSessionStats).mockResolvedValue({
        totalEvents: 2,
        uniqueProductsViewed: 1,
        addToCartCount: 1,
        removeFromCartCount: 0,
        exitIntentCount: 1,
        maxScrollDepth: 30,
        estimatedCartValue: 100,
        eventCounts: { ADD_TO_CART: 1, EXIT_INTENT: 1 },
      });
      vi.mocked(EventTrackingService.detectSessionPatterns).mockResolvedValue({
        hasAbandonedCart: true,
        isBrowsingHeavily: false,
        showedExitIntent: true,
        isEngaged: false,
        likelyPriceShopping: false,
      });

      const analysis = await IntentDetectionEngine.analyzeSession("test-session");

      expect(analysis.scores.abandonmentRisk).toBeGreaterThan(0.6);
      expect(analysis.triggers).toContain("HIGH_ABANDONMENT_RISK");
      expect(analysis.triggers).toContain("EXIT_INTENT_DETECTED");
      expect(analysis.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining("retention message"),
        ])
      );
    });

    it("should detect needs help with repeated product views", async () => {
      const mockEvents = [
        {
          id: "1",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "PRODUCT_VIEW",
          eventData: { productId: "prod1" },
          timestamp: new Date(),
        },
        {
          id: "2",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "PRODUCT_VIEW",
          eventData: { productId: "prod1" },
          timestamp: new Date(),
        },
        {
          id: "3",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "PRODUCT_VIEW",
          eventData: { productId: "prod2" },
          timestamp: new Date(),
        },
        {
          id: "4",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "PRODUCT_VIEW",
          eventData: { productId: "prod1" },
          timestamp: new Date(),
        },
        {
          id: "5",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "PRODUCT_VIEW",
          eventData: { productId: "prod2" },
          timestamp: new Date(),
        },
        {
          id: "6",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "PRODUCT_VIEW",
          eventData: { productId: "prod1" },
          timestamp: new Date(),
        },
      ];

      vi.mocked(EventTrackingService.getSessionEvents).mockResolvedValue(mockEvents as any);
      vi.mocked(EventTrackingService.getSessionStats).mockResolvedValue({
        totalEvents: 6,
        uniqueProductsViewed: 2,
        addToCartCount: 0,
        removeFromCartCount: 0,
        exitIntentCount: 0,
        maxScrollDepth: 20,
        estimatedCartValue: 0,
        eventCounts: { PRODUCT_VIEW: 6 },
      });
      vi.mocked(EventTrackingService.detectSessionPatterns).mockResolvedValue({
        hasAbandonedCart: false,
        isBrowsingHeavily: false,
        showedExitIntent: false,
        isEngaged: false,
        likelyPriceShopping: false,
      });

      const analysis = await IntentDetectionEngine.analyzeSession("test-session");

      expect(analysis.scores.needsHelp).toBeGreaterThan(0.5);
      expect(analysis.triggers).toContain("CUSTOMER_NEEDS_HELP");
      expect(analysis.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining("assistance"),
        ])
      );
    });

    it("should detect price shopper with multiple product views and cart churn", async () => {
      const mockEvents = [
        {
          id: "1",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "PRODUCT_VIEW",
          eventData: { productId: "prod1", dwellTimeMs: 10000 },
          timestamp: new Date(),
        },
        {
          id: "2",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "PRODUCT_VIEW",
          eventData: { productId: "prod2", dwellTimeMs: 12000 },
          timestamp: new Date(),
        },
        {
          id: "3",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "PRODUCT_VIEW",
          eventData: { productId: "prod3", dwellTimeMs: 8000 },
          timestamp: new Date(),
        },
        {
          id: "4",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "ADD_TO_CART",
          eventData: { productId: "prod1" },
          timestamp: new Date(),
        },
        {
          id: "5",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "REMOVE_FROM_CART",
          eventData: { productId: "prod1" },
          timestamp: new Date(),
        },
      ];

      vi.mocked(EventTrackingService.getSessionEvents).mockResolvedValue(mockEvents as any);
      vi.mocked(EventTrackingService.getSessionStats).mockResolvedValue({
        totalEvents: 5,
        uniqueProductsViewed: 3,
        addToCartCount: 1,
        removeFromCartCount: 1,
        exitIntentCount: 0,
        maxScrollDepth: 40,
        estimatedCartValue: 0,
        eventCounts: { PRODUCT_VIEW: 3, ADD_TO_CART: 1, REMOVE_FROM_CART: 1 },
      });
      vi.mocked(EventTrackingService.detectSessionPatterns).mockResolvedValue({
        hasAbandonedCart: false,
        isBrowsingHeavily: false,
        showedExitIntent: false,
        isEngaged: false,
        likelyPriceShopping: true,
      });

      const analysis = await IntentDetectionEngine.analyzeSession("test-session");

      expect(analysis.scores.priceShopperRisk).toBeGreaterThan(0.6);
      expect(analysis.triggers).toContain("PRICE_SHOPPING_DETECTED");
      expect(analysis.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining("value proposition"),
        ])
      );
    });

    it("should detect browse intent for casual visitors", async () => {
      const mockEvents = [
        {
          id: "1",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "PAGE_VIEW",
          eventData: { url: "/collections/all" },
          timestamp: new Date(),
        },
        {
          id: "2",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "PAGE_VIEW",
          eventData: { url: "/products/item1" },
          timestamp: new Date(),
        },
        {
          id: "3",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "PAGE_VIEW",
          eventData: { url: "/products/item2" },
          timestamp: new Date(),
        },
      ];

      vi.mocked(EventTrackingService.getSessionEvents).mockResolvedValue(mockEvents as any);
      vi.mocked(EventTrackingService.getSessionStats).mockResolvedValue({
        totalEvents: 3,
        uniqueProductsViewed: 2,
        addToCartCount: 0,
        removeFromCartCount: 0,
        exitIntentCount: 0,
        maxScrollDepth: 35,
        estimatedCartValue: 0,
        eventCounts: { PAGE_VIEW: 3 },
      });
      vi.mocked(EventTrackingService.detectSessionPatterns).mockResolvedValue({
        hasAbandonedCart: false,
        isBrowsingHeavily: false,
        showedExitIntent: false,
        isEngaged: false,
        likelyPriceShopping: false,
      });

      const analysis = await IntentDetectionEngine.analyzeSession("test-session");

      expect(analysis.scores.browseIntent).toBeGreaterThan(0.5);
      expect(analysis.dominantIntent).toBe("BROWSE_INTENT");
    });
  });

  describe("getDominantIntent", () => {
    it("should identify strongest intent with confidence", () => {
      const scores = {
        purchaseIntent: 0.8,
        abandonmentRisk: 0.3,
        needsHelp: 0.2,
        priceShopperRisk: 0.1,
        browseIntent: 0.1,
      };

      const result = (IntentDetectionEngine as any).getDominantIntent(scores);

      expect(result.dominantIntent).toBe("PURCHASE_INTENT");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should have lower confidence when intents are similar", () => {
      const scores = {
        purchaseIntent: 0.5,
        abandonmentRisk: 0.48,
        needsHelp: 0.2,
        priceShopperRisk: 0.1,
        browseIntent: 0.1,
      };

      const result = (IntentDetectionEngine as any).getDominantIntent(scores);

      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe("recordIntentSignal", () => {
    it("should store intent signal in database", async () => {
      const mockSignal = {
        id: "signal-1",
        shopId: "shop1",
        sessionId: "session-1",
        signalType: "PURCHASE_INTENT",
        confidence: 0.85,
        triggerData: { test: "data" },
        actionTaken: null,
        outcome: null,
        createdAt: new Date(),
      };

      const prisma = (await import("../../app/db.server")).default;
      vi.mocked(prisma.intentSignal.create).mockResolvedValue(mockSignal as any);

      const result = await IntentDetectionEngine.recordIntentSignal({
        shopId: "shop1",
        sessionId: "session-1",
        signalType: "PURCHASE_INTENT",
        confidence: 0.85,
        triggerData: { test: "data" },
      });

      expect(result.signalType).toBe("PURCHASE_INTENT");
      expect(result.confidence).toBe(0.85);
      expect(prisma.intentSignal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shopId: "shop1",
          sessionId: "session-1",
          signalType: "PURCHASE_INTENT",
          confidence: 0.85,
        }),
      });
    });
  });

  describe("analyzeAndRecord", () => {
    it("should analyze and record signal when confidence is high", async () => {
      const mockEvents = [
        {
          id: "1",
          shopId: "shop1",
          sessionId: "test-session",
          eventType: "ADD_TO_CART",
          eventData: { productId: "prod1", price: 50 },
          timestamp: new Date(),
        },
      ];

      vi.mocked(EventTrackingService.getSessionEvents).mockResolvedValue(mockEvents as any);
      vi.mocked(EventTrackingService.getSessionStats).mockResolvedValue({
        totalEvents: 1,
        uniqueProductsViewed: 1,
        addToCartCount: 1,
        removeFromCartCount: 0,
        exitIntentCount: 0,
        maxScrollDepth: 50,
        estimatedCartValue: 50,
        eventCounts: { ADD_TO_CART: 1 },
      });
      vi.mocked(EventTrackingService.detectSessionPatterns).mockResolvedValue({
        hasAbandonedCart: false,
        isBrowsingHeavily: false,
        showedExitIntent: false,
        isEngaged: true,
        likelyPriceShopping: false,
      });

      const mockSignal = {
        id: "signal-1",
        shopId: "shop1",
        sessionId: "test-session",
        signalType: "PURCHASE_INTENT",
        confidence: 0.8,
        triggerData: {},
        actionTaken: null,
        outcome: null,
        createdAt: new Date(),
      };

      const prisma = (await import("../../app/db.server")).default;
      vi.mocked(prisma.intentSignal.create).mockResolvedValue(mockSignal as any);

      const result = await IntentDetectionEngine.analyzeAndRecord(
        "shop1",
        "test-session"
      );

      expect(result.analysis.scores.purchaseIntent).toBeGreaterThan(0);
      expect(result.signal).toBeDefined();
      expect(result.signal?.signalType).toBe("PURCHASE_INTENT");
    });

    it("should not record signal when confidence is low", async () => {
      vi.mocked(EventTrackingService.getSessionEvents).mockResolvedValue([]);
      vi.mocked(EventTrackingService.getSessionStats).mockResolvedValue({
        totalEvents: 0,
        uniqueProductsViewed: 0,
        addToCartCount: 0,
        removeFromCartCount: 0,
        exitIntentCount: 0,
        maxScrollDepth: 0,
        estimatedCartValue: 0,
        eventCounts: {},
      });
      vi.mocked(EventTrackingService.detectSessionPatterns).mockResolvedValue({
        hasAbandonedCart: false,
        isBrowsingHeavily: false,
        showedExitIntent: false,
        isEngaged: false,
        likelyPriceShopping: false,
      });

      const result = await IntentDetectionEngine.analyzeAndRecord(
        "shop1",
        "test-session"
      );

      expect(result.analysis.confidence).toBe(0);
      expect(result.signal).toBeNull();
    });
  });
});
