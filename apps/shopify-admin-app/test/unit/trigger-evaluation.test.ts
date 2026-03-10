/**
 * Unit Tests: Trigger Evaluation Service
 * 
 * Tests for:
 * - Simple condition evaluation
 * - Complex conditions (AND, OR, NOT)
 * - Value comparison operators
 * - Cooldown enforcement
 * - Template variable substitution
 * - Trigger scoring
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TriggerEvaluationService } from "../../app/services/trigger-evaluation.server";
import { EventTrackingService } from "../../app/services/event-tracking.server";
import { IntentDetectionEngine } from "../../app/services/intent-detection.server";

// Mock dependencies
vi.mock("../../app/services/event-tracking.server");
vi.mock("../../app/services/intent-detection.server");
vi.mock("../../app/db.server", () => ({
  default: {
    proactiveTrigger: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe("TriggerEvaluationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("evaluateConditions", () => {
    it("should evaluate simple greater than condition", () => {
      const conditions = { field: "intent.purchaseIntent", operator: ">", value: 0.5 };
      const intents = { purchaseIntent: 0.7 };

      const result = (TriggerEvaluationService as any).evaluateConditions(
        conditions,
        intents,
        {},
        {}
      );

      expect(result).toBe(true);
    });

    it("should evaluate simple less than condition", () => {
      const conditions = { field: "intent.purchaseIntent", operator: "<", value: 0.5 };
      const intents = { purchaseIntent: 0.3 };

      const result = (TriggerEvaluationService as any).evaluateConditions(
        conditions,
        intents,
        {},
        {}
      );

      expect(result).toBe(true);
    });

    it("should evaluate equality condition", () => {
      const conditions = { field: "pattern.hasAbandonedCart", operator: "is_true", value: true };
      const patterns = { hasAbandonedCart: true };

      const result = (TriggerEvaluationService as any).evaluateConditions(
        conditions,
        {},
        {},
        patterns
      );

      expect(result).toBe(true);
    });

    it("should evaluate IN operator", () => {
      const conditions = { field: "intent.purchaseIntent", operator: "in", value: [0.7, 0.8, 0.9] };
      const intents = { purchaseIntent: 0.7 };

      const result = (TriggerEvaluationService as any).evaluateConditions(
        conditions,
        intents,
        {},
        {}
      );

      expect(result).toBe(true);
    });

    it("should evaluate AND conditions", () => {
      const conditions = {
        type: "AND",
        conditions: [
          { field: "intent.purchaseIntent", operator: ">", value: 0.5 },
          { field: "pattern.hasAbandonedCart", operator: "is_false", value: true },
        ],
      };
      const intents = { purchaseIntent: 0.7 };
      const patterns = { hasAbandonedCart: false };

      const result = (TriggerEvaluationService as any).evaluateConditions(
        conditions,
        intents,
        {},
        patterns
      );

      expect(result).toBe(true);
    });

    it("should evaluate OR conditions", () => {
      const conditions = {
        type: "OR",
        conditions: [
          { field: "intent.purchaseIntent", operator: ">", value: 0.8 },
          { field: "intent.abandonmentRisk", operator: ">", value: 0.6 },
        ],
      };
      const intents = { purchaseIntent: 0.5, abandonmentRisk: 0.7 };

      const result = (TriggerEvaluationService as any).evaluateConditions(
        conditions,
        intents,
        {},
        {}
      );

      expect(result).toBe(true);
    });

    it("should evaluate NOT conditions", () => {
      const conditions = {
        type: "NOT",
        condition: { field: "pattern.hasAbandonedCart", operator: "is_true", value: true },
      };
      const patterns = { hasAbandonedCart: false };

      const result = (TriggerEvaluationService as any).evaluateConditions(
        conditions,
        {},
        {},
        patterns
      );

      expect(result).toBe(true);
    });

    it("should return true for empty/null conditions", () => {
      const result = (TriggerEvaluationService as any).evaluateConditions(null, {}, {}, {});

      expect(result).toBe(true);
    });
  });

  describe("compareValues", () => {
    it("should compare with greater than operator", () => {
      const result = (TriggerEvaluationService as any).compareValues(10, ">", 5);
      expect(result).toBe(true);
    });

    it("should compare with less than operator", () => {
      const result = (TriggerEvaluationService as any).compareValues(3, "<", 5);
      expect(result).toBe(true);
    });

    it("should compare with equals operator", () => {
      const result = (TriggerEvaluationService as any).compareValues("test", "=", "test");
      expect(result).toBe(true);
    });

    it("should compare with not equals operator", () => {
      const result = (TriggerEvaluationService as any).compareValues("a", "!=", "b");
      expect(result).toBe(true);
    });

    it("should compare with contains operator", () => {
      const result = (TriggerEvaluationService as any).compareValues(
        "hello world",
        "contains",
        "world"
      );
      expect(result).toBe(true);
    });

    it("should compare with starts_with operator", () => {
      const result = (TriggerEvaluationService as any).compareValues(
        "hello world",
        "starts_with",
        "hello"
      );
      expect(result).toBe(true);
    });

    it("should compare with ends_with operator", () => {
      const result = (TriggerEvaluationService as any).compareValues(
        "hello world",
        "ends_with",
        "world"
      );
      expect(result).toBe(true);
    });

    it("should compare with is_true operator", () => {
      const result = (TriggerEvaluationService as any).compareValues(true, "is_true", true);
      expect(result).toBe(true);
    });

    it("should compare with is_false operator", () => {
      const result = (TriggerEvaluationService as any).compareValues(false, "is_false", true);
      expect(result).toBe(true);
    });
  });

  describe("calculateTriggerScore", () => {
    it("should score EXIT_INTENT trigger by abandonment risk", () => {
      const trigger = {
        id: "t1",
        triggerType: "EXIT_INTENT",
      } as any;
      const context = {
        shopId: "shop1",
        sessionId: "sess1",
        intents: { abandonmentRisk: 0.8 },
      } as any;

      const score = (TriggerEvaluationService as any).calculateTriggerScore(trigger, context);

      expect(score).toBe(0.8);
    });

    it("should score CART_ABANDONMENT trigger by cart value", () => {
      const trigger = {
        id: "t1",
        triggerType: "CART_ABANDONMENT",
      } as any;
      const context = {
        shopId: "shop1",
        sessionId: "sess1",
        intents: { abandonmentRisk: 0.9 },
        patterns: { hasAbandonedCart: true },
        stats: { estimatedCartValue: 100 },
      } as any;

      const score = (TriggerEvaluationService as any).calculateTriggerScore(trigger, context);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("should score HIGH_INTENT trigger by purchase intent", () => {
      const trigger = {
        id: "t1",
        triggerType: "HIGH_INTENT",
      } as any;
      const context = {
        shopId: "shop1",
        sessionId: "sess1",
        intents: { purchaseIntent: 0.85 },
      } as any;

      const score = (TriggerEvaluationService as any).calculateTriggerScore(trigger, context);

      expect(score).toBe(0.85);
    });

    it("should score PRICE_SENSITIVITY trigger by price shopper risk", () => {
      const trigger = {
        id: "t1",
        triggerType: "PRICE_SENSITIVITY",
      } as any;
      const context = {
        shopId: "shop1",
        sessionId: "sess1",
        intents: { priceShopperRisk: 0.75 },
      } as any;

      const score = (TriggerEvaluationService as any).calculateTriggerScore(trigger, context);

      expect(score).toBe(0.75);
    });

    it("should clamp score between 0 and 1", () => {
      const trigger = {
        id: "t1",
        triggerType: "HIGH_INTENT",
      } as any;
      const context = {
        shopId: "shop1",
        sessionId: "sess1",
        intents: { purchaseIntent: 1.5 },
      } as any;

      const score = (TriggerEvaluationService as any).calculateTriggerScore(trigger, context);

      expect(score).toBeLessThanOrEqual(1);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("renderMessage", () => {
    it("should replace intent variables", async () => {
      const template = "Your purchase intent is {{intent.purchaseIntent}}";
      const context = {
        shopId: "shop1",
        sessionId: "sess1",
        intents: { purchaseIntent: 0.8 },
      } as any;

      const result = await (TriggerEvaluationService as any).renderMessage(template, context);

      expect(result).toContain("80%");
    });

    it("should replace stat variables with formatted values", async () => {
      const template = "Your cart value is {{stat.estimatedCartValue}}";
      const context = {
        shopId: "shop1",
        sessionId: "sess1",
        stats: { estimatedCartValue: 99.99 },
      } as any;

      const result = await (TriggerEvaluationService as any).renderMessage(template, context);

      expect(result).toContain("$99.99");
    });

    it("should replace pattern variables", async () => {
      const template = "Cart abandoned: {{pattern.hasAbandonedCart}}";
      const context = {
        shopId: "shop1",
        sessionId: "sess1",
        patterns: { hasAbandonedCart: true },
      } as any;

      const result = await (TriggerEvaluationService as any).renderMessage(template, context);

      expect(result).toContain("true");
    });

    it("should replace session ID variable", async () => {
      const template = "Session {{sessionId}} needs attention";
      const context = {
        shopId: "shop1",
        sessionId: "sess-123",
        stats: {},
        intents: {},
      } as any;

      const result = await (TriggerEvaluationService as any).renderMessage(template, context);

      expect(result).toContain("sess-123");
    });

    it("should remove unreplaced variables", async () => {
      const template = "Hello {{firstName}}, your score is {{score}}";
      const context = {
        shopId: "shop1",
        sessionId: "sess1",
        stats: {},
        intents: {},
      } as any;

      const result = await (TriggerEvaluationService as any).renderMessage(template, context);

      expect(result).not.toContain("{{");
      expect(result).not.toContain("}}");
    });
  });

  describe("checkCooldown", () => {
    it("should allow trigger on first fire", () => {
      const result = (TriggerEvaluationService as any).checkCooldown("t1", "sess1", 60000);

      expect(result.allowed).toBe(true);
      expect(result.retryInMs).toBe(0);
    });

    it("should block trigger during cooldown period", () => {
      // Record first fire
      TriggerEvaluationService.recordTriggerFire("t1", "sess1");

      // Immediately check cooldown
      const result = (TriggerEvaluationService as any).checkCooldown("t1", "sess1", 60000);

      expect(result.allowed).toBe(false);
      expect(result.retryInMs).toBeGreaterThan(0);
      expect(result.retryInMs).toBeLessThanOrEqual(60000);
    });

    it("should expire cooldown after period", async () => {
      // Use very short cooldown for testing
      TriggerEvaluationService.recordTriggerFire("t2", "sess2");

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check with short cooldown
      const result = (TriggerEvaluationService as any).checkCooldown("t2", "sess2", 30);

      expect(result.allowed).toBe(true);
    });

    it("should track cooldowns by trigger and session", () => {
      TriggerEvaluationService.recordTriggerFire("t1", "sess1");
      TriggerEvaluationService.recordTriggerFire("t1", "sess2");

      const r1 = (TriggerEvaluationService as any).checkCooldown("t1", "sess1", 60000);
      const r2 = (TriggerEvaluationService as any).checkCooldown("t1", "sess2", 60000);

      expect(r1.allowed).toBe(false);
      expect(r2.allowed).toBe(false);

      // Different trigger, same session
      const r3 = (TriggerEvaluationService as any).checkCooldown("t2", "sess1", 60000);
      expect(r3.allowed).toBe(true);

      // Cleanup
      TriggerEvaluationService.resetCooldown("t1", "sess1");
      TriggerEvaluationService.resetCooldown("t1", "sess2");
    });
  });

  describe("recordTriggerFire", () => {
    it("should record trigger fire with timestamp", () => {
      const before = Date.now();
      TriggerEvaluationService.recordTriggerFire("t1", "sess1", "msg-1");
      const after = Date.now();

      // Verify by checking cooldown
      const cooldown = (TriggerEvaluationService as any).checkCooldown("t1", "sess1", 60000);

      expect(cooldown.allowed).toBe(false);
      expect(cooldown.retryInMs).toBeGreaterThan(50000);
      expect(cooldown.retryInMs).toBeLessThanOrEqual(60000);

      // Cleanup
      TriggerEvaluationService.resetCooldown("t1", "sess1");
    });
  });

  describe("testConditions", () => {
    it("should test conditions with mock data", () => {
      const conditions = {
        type: "AND",
        conditions: [
          { field: "intent.purchaseIntent", operator: ">", value: 0.5 },
          { field: "stat.addToCartCount", operator: ">", value: 0 },
        ],
      };

      const result = TriggerEvaluationService.testConditions(
        conditions,
        { purchaseIntent: 0.8 },
        { addToCartCount: 2 },
        {}
      );

      expect(result).toBe(true);
    });

    it("should return false when conditions not met", () => {
      const conditions = { field: "intent.purchaseIntent", operator: ">", value: 0.8 };

      const result = TriggerEvaluationService.testConditions(
        conditions,
        { purchaseIntent: 0.5 },
        {},
        {}
      );

      expect(result).toBe(false);
    });
  });

  describe("testMessageRendering", () => {
    it("should test message rendering with mock context", async () => {
      const template = "Your cart is worth {{stat.estimatedCartValue}}";

      const result = await TriggerEvaluationService.testMessageRendering(template, {
        stats: { estimatedCartValue: 150 },
      });

      expect(result).toContain("$150.00");
    });
  });

  describe("evaluateSessionTriggers", () => {
    it("should evaluate triggers for a session", async () => {
      const mockTriggers = [
        {
          id: "t1",
          shopId: "shop1",
          name: "Exit Intent",
          triggerType: "EXIT_INTENT",
          enabled: true,
          priority: 10,
          cooldownMs: 300000,
          conditions: { field: "intent.abandonmentRisk", operator: ">", value: 0.6 },
          messageTemplate: "Don't go! Here's a 10% discount.",
        },
      ];

      const prisma = (await import("../../app/db.server")).default;
      vi.mocked(prisma.proactiveTrigger.findMany).mockResolvedValue(mockTriggers as any);
      vi.mocked(EventTrackingService.getSessionStats).mockResolvedValue({
        totalEvents: 5,
        addToCartCount: 1,
        estimatedCartValue: 0,
      } as any);
      vi.mocked(EventTrackingService.detectSessionPatterns).mockResolvedValue({
        hasAbandonedCart: true,
        showedExitIntent: true,
      } as any);
      vi.mocked(IntentDetectionEngine.analyzeAndRecord).mockResolvedValue({
        analysis: {
          scores: {
            purchaseIntent: 0,
            abandonmentRisk: 0.8,
            needsHelp: 0,
            priceShopperRisk: 0,
            browseIntent: 0,
          },
          triggers: ["HIGH_ABANDONMENT_RISK"],
        },
        signal: null,
      } as any);

      const results = await TriggerEvaluationService.evaluateSessionTriggers(
        "shop1",
        "sess1"
      );

      expect(results).toHaveLength(1);
      expect(results[0].decision).toBe("SEND");
      expect(results[0].triggerId).toBe("t1");
    });
  });
});
