import { beforeEach, describe, expect, it, vi } from "vitest";
import { TriggerEvaluationService } from "../../../app/services/trigger-evaluation.server";

vi.mock("../../../app/services/event-tracking.server");
vi.mock("../../../app/services/intent-detection.server");

const { mockFindUnique, mockCreate, mockUpdate, mockDelete, mockFindMany } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("../../../app/db.server", () => ({
  default: {
    proactiveTrigger: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
    },
  },
}));

function makeTrigger(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    shopId: "shop-1",
    name: "Exit Intent",
    description: null,
    triggerType: "EXIT_INTENT",
    enabled: true,
    priority: 10,
    cooldownMs: 300000,
    conditions: { field: "intent.abandonmentRisk", operator: ">", value: 0.6 },
    messageTemplate: "Don't go!",
    targetLocale: null,
    ...overrides,
  };
}

describe("TriggerEvaluationService CRUD", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    TriggerEvaluationService.resetCooldown("t1", "sess-1");
    TriggerEvaluationService.resetCooldown("t1", "sess-2");
    TriggerEvaluationService.resetCooldown("t2", "sess-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getTrigger", () => {
    it("returns a trigger by id", async () => {
      mockFindUnique.mockResolvedValue(makeTrigger());

      const trigger = await TriggerEvaluationService.getTrigger("t1");

      expect(trigger?.id).toBe("t1");
      expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: "t1" } });
    });

    it("returns null when the trigger does not exist", async () => {
      mockFindUnique.mockResolvedValue(null);

      expect(await TriggerEvaluationService.getTrigger("missing")).toBeNull();
    });
  });

  describe("createTrigger", () => {
    it("creates a trigger with defaults", async () => {
      mockCreate.mockResolvedValue(makeTrigger());

      const trigger = await TriggerEvaluationService.createTrigger("shop-1", {
        name: "Exit",
        triggerType: "EXIT_INTENT",
        conditions: {},
        messageTemplate: "Hey",
      });

      expect(trigger.id).toBe("t1");
      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shopId: "shop-1",
          name: "Exit",
          enabled: true,
          priority: 10,
          cooldownMs: 300000,
        }),
      });
    });

    it("preserves explicit priority and cooldownMs", async () => {
      mockCreate.mockResolvedValue(makeTrigger({ priority: 50, cooldownMs: 1000 }));

      await TriggerEvaluationService.createTrigger("shop-1", {
        name: "Exit",
        triggerType: "EXIT_INTENT",
        conditions: {},
        messageTemplate: "Hey",
        priority: 50,
        cooldownMs: 1000,
        targetLocale: "es",
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: 50,
          cooldownMs: 1000,
          targetLocale: "es",
        }),
      });
    });
  });

  describe("updateTrigger", () => {
    it("updates the given fields", async () => {
      mockUpdate.mockResolvedValue(makeTrigger({ enabled: false }));

      const trigger = await TriggerEvaluationService.updateTrigger("t1", {
        enabled: false,
        priority: 5,
      });

      expect(trigger.enabled).toBe(false);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { enabled: false, priority: 5 },
      });
    });
  });

  describe("deleteTrigger", () => {
    it("deletes the trigger and cleans up its cooldowns", async () => {
      mockDelete.mockResolvedValue({ id: "t1" });

      TriggerEvaluationService.recordTriggerFire("t1", "sess-1", "SENT");
      TriggerEvaluationService.recordTriggerFire("t1", "sess-2", "SENT");

      await TriggerEvaluationService.deleteTrigger("t1");

      expect(mockDelete).toHaveBeenCalledWith({ where: { id: "t1" } });
    });

    it("leaves other triggers' cooldowns intact", async () => {
      mockDelete.mockResolvedValue({ id: "t1" });

      TriggerEvaluationService.recordTriggerFire("t1", "sess-1", "SENT");
      TriggerEvaluationService.recordTriggerFire("t2", "sess-1", "SENT");

      await TriggerEvaluationService.deleteTrigger("t1");

      expect(mockDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("evaluateMultipleSessions", () => {
    it("evaluates each session and collects results keyed by session id", async () => {
      const trigger = makeTrigger();
      mockFindMany.mockResolvedValue([trigger]);

      const { EventTrackingService } = await import("../../../app/services/event-tracking.server");
      vi.mocked(EventTrackingService.getSessionStats).mockResolvedValue({
        totalEvents: 1,
        eventCounts: {},
        uniqueProductsViewed: 0,
        addToCartCount: 0,
        removeFromCartCount: 0,
        exitIntentCount: 1,
        maxScrollDepth: 0,
        estimatedCartValue: 0,
      } as never);
      vi.mocked(EventTrackingService.detectSessionPatterns).mockResolvedValue({
        hasAbandonedCart: false,
        isBrowsingHeavily: false,
        showedExitIntent: true,
        isEngaged: false,
        likelyPriceShopping: false,
      } as never);

      const { IntentDetectionEngine } = await import("../../../app/services/intent-detection.server");
      vi.mocked(IntentDetectionEngine.analyzeAndRecord).mockResolvedValue({
        analysis: {
          scores: {
            purchaseIntent: 0,
            abandonmentRisk: 0.9,
            needsHelp: 0,
            priceShopperRisk: 0,
            browseIntent: 0,
          },
          triggers: ["HIGH_ABANDONMENT_RISK"],
        },
        signal: null,
      } as never);

      const results = await TriggerEvaluationService.evaluateMultipleSessions("shop-1", [
        "sess-a",
        "sess-b",
      ]);

      expect(results.size).toBe(2);
      expect(results.get("sess-a")).toHaveLength(1);
      expect(results.get("sess-b")?.[0].decision).toBe("SEND");
    });

    it("records empty results for sessions that fail evaluation", async () => {
      mockFindMany.mockRejectedValue(new Error("db down"));

      const results = await TriggerEvaluationService.evaluateMultipleSessions("shop-1", [
        "sess-a",
      ]);

      expect(results.get("sess-a")).toEqual([]);
      expect(console.error).toHaveBeenCalled();
    });
  });
});
