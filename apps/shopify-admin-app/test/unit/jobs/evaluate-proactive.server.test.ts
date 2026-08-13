import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockShopFindUnique, mockShopFindMany, mockEvaluateAndQueueMessages, mockCleanup } =
  vi.hoisted(() => ({
    mockShopFindUnique: vi.fn(),
    mockShopFindMany: vi.fn(),
    mockEvaluateAndQueueMessages: vi.fn(),
    mockCleanup: vi.fn(),
  }));

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: mockShopFindUnique,
      findMany: mockShopFindMany,
    },
  },
}));

vi.mock("../../../app/services/proactive-messaging.server", () => ({
  ProactiveMessagingService: {
    evaluateAndQueueMessages: mockEvaluateAndQueueMessages,
    cleanupExpiredMessages: mockCleanup,
  },
}));

import {
  evaluateShopSessions,
  evaluateAllShops,
  cleanupExpiredMessages,
  getJobStats,
} from "../../../app/jobs/evaluate-proactive.server";

describe("evaluate-proactive.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  describe("evaluateShopSessions", () => {
    it("returns FAILED when the shop is not active", async () => {
      mockShopFindUnique.mockResolvedValue(null);

      const result = await evaluateShopSessions("shop-1");

      expect(result.status).toBe("FAILED");
      expect(result.errors[0]).toContain("not active or not found");
      expect(result.evaluated).toBe(0);
      expect(mockEvaluateAndQueueMessages).not.toHaveBeenCalled();
    });

    it("returns SUCCESS when all sessions were evaluated", async () => {
      mockShopFindUnique.mockResolvedValue({ id: "shop-1", status: "ACTIVE" });
      mockEvaluateAndQueueMessages.mockResolvedValue({ evaluated: 3, queued: 2, skipped: 0 });

      const result = await evaluateShopSessions("shop-1");

      expect(result.status).toBe("SUCCESS");
      expect(result.evaluated).toBe(3);
      expect(result.queued).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.jobId).toContain("job-");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("returns PARTIAL when some sessions were skipped", async () => {
      mockShopFindUnique.mockResolvedValue({ id: "shop-1", status: "ACTIVE" });
      mockEvaluateAndQueueMessages.mockResolvedValue({ evaluated: 3, queued: 2, skipped: 1 });

      const result = await evaluateShopSessions("shop-1");

      expect(result.status).toBe("PARTIAL");
      expect(result.skipped).toBe(1);
    });

    it("returns FAILED when evaluation throws", async () => {
      mockShopFindUnique.mockResolvedValue({ id: "shop-1", status: "ACTIVE" });
      mockEvaluateAndQueueMessages.mockRejectedValue(new Error("boom"));

      const result = await evaluateShopSessions("shop-1");

      expect(result.status).toBe("FAILED");
      expect(result.errors).toEqual(["boom"]);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("evaluateAllShops", () => {
    it("evaluates all active shops and aggregates totals", async () => {
      mockShopFindMany.mockResolvedValue([{ id: "shop-1" }, { id: "shop-2" }]);
      mockShopFindUnique.mockImplementation(({ where }) =>
        Promise.resolve({ id: where.id, status: "ACTIVE" }),
      );
      mockEvaluateAndQueueMessages.mockResolvedValue({ evaluated: 2, queued: 1, skipped: 0 });

      const result = await evaluateAllShops();

      expect(result.totalShops).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.totalQueued).toBe(2);
      expect(result.averageDurationMs).toBeGreaterThanOrEqual(0);
      expect(mockEvaluateAndQueueMessages).toHaveBeenCalledTimes(2);
    });

    it("returns empty aggregation when there are no active shops", async () => {
      mockShopFindMany.mockResolvedValue([]);

      const result = await evaluateAllShops();

      expect(result.totalShops).toBe(0);
      expect(result.results).toEqual([]);
      expect(result.totalQueued).toBe(0);
      expect(result.averageDurationMs).toBe(0);
    });

    it("records a FAILED result for a shop whose evaluation throws", async () => {
      mockShopFindMany.mockResolvedValue([{ id: "shop-1" }]);
      mockShopFindUnique.mockRejectedValue(new Error("db down"));

      const result = await evaluateAllShops();

      expect(result.results[0].status).toBe("FAILED");
      expect(result.results[0].errors).toEqual(["db down"]);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("cleanupExpiredMessages", () => {
    it("cleans up and returns the count", async () => {
      mockCleanup.mockResolvedValue(5);

      const result = await cleanupExpiredMessages();

      expect(result.cleanedUp).toBe(5);
      expect(result.startedAt).toBeInstanceOf(Date);
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(console.log).toHaveBeenCalled();
    });

    it("re-throws cleanup errors", async () => {
      mockCleanup.mockRejectedValue(new Error("db down"));

      await expect(cleanupExpiredMessages()).rejects.toThrow("db down");
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("getJobStats", () => {
    it("returns the stats envelope for the window", async () => {
      const stats = await getJobStats(60000);

      expect(stats.period).toBe("Last 60s");
      expect(stats.shopsEvaluated).toBe(0);
      expect(stats.messagesQueued).toBe(0);
      expect(stats.averageQueuedPerShop).toBe(0);
      expect(stats.averageJobDuration).toBe(0);
    });

    it("defaults to a one hour window", async () => {
      const stats = await getJobStats();

      expect(stats.period).toBe("Last 3600s");
    });
  });
});
