import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate, mockCreateMany, mockFindMany, mockDeleteMany } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockCreateMany: vi.fn(),
  mockFindMany: vi.fn(),
  mockDeleteMany: vi.fn(),
}));

vi.mock("../../../app/db.server", () => ({
  default: {
    behaviorEvent: {
      create: mockCreate,
      createMany: mockCreateMany,
      findMany: mockFindMany,
      deleteMany: mockDeleteMany,
    },
  },
}));

import { EventTrackingService } from "../../../app/services/event-tracking.server";

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    shopId: "shop-1",
    sessionId: "sess-1",
    visitorId: null,
    customerId: null,
    eventType: "PAGE_VIEW",
    eventData: {},
    timestamp: new Date(),
    ...overrides,
  };
}

describe("event-tracking.server", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("trackEvent", () => {
    it("creates a single event record", async () => {
      const record = makeEvent();
      mockCreate.mockResolvedValue(record);

      const result = await EventTrackingService.trackEvent({
        shopId: "shop-1",
        sessionId: "sess-1",
        eventType: "PRODUCT_VIEW",
        eventData: { productId: "p1" },
        visitorId: "v1",
        customerId: "c1",
      });

      expect(result).toEqual(record);
      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shopId: "shop-1",
          sessionId: "sess-1",
          visitorId: "v1",
          customerId: "c1",
          eventType: "PRODUCT_VIEW",
          eventData: { productId: "p1" },
          timestamp: expect.any(Date),
        }),
      });
    });

    it("throws when required fields are missing", async () => {
      await expect(
        EventTrackingService.trackEvent({
          shopId: "",
          sessionId: "sess-1",
          eventType: "PAGE_VIEW",
          eventData: {},
        }),
      ).rejects.toThrow("Missing required fields");

      await expect(
        EventTrackingService.trackEvent({
          shopId: "shop-1",
          sessionId: "",
          eventType: "PAGE_VIEW",
          eventData: {},
        }),
      ).rejects.toThrow("Missing required fields");

      await expect(
        EventTrackingService.trackEvent({
          shopId: "shop-1",
          sessionId: "sess-1",
          eventType: "",
          eventData: {},
        }),
      ).rejects.toThrow("Missing required fields");

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("trackEventsBatch", () => {
    it("returns 0 for an empty batch", async () => {
      const count = await EventTrackingService.trackEventsBatch([]);
      expect(count).toBe(0);
      expect(mockCreateMany).not.toHaveBeenCalled();
    });

    it("creates all events and returns the count", async () => {
      mockCreateMany.mockResolvedValue({ count: 2 });

      const count = await EventTrackingService.trackEventsBatch([
        { shopId: "shop-1", sessionId: "sess-1", eventType: "PAGE_VIEW", eventData: {} },
        { shopId: "shop-1", sessionId: "sess-2", eventType: "SEARCH", eventData: { q: "zapatos" } },
      ]);

      expect(count).toBe(2);
      expect(mockCreateMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ shopId: "shop-1", sessionId: "sess-1", eventType: "PAGE_VIEW" }),
          expect.objectContaining({ shopId: "shop-1", sessionId: "sess-2", eventType: "SEARCH" }),
        ],
      });
    });

    it("throws when any event is invalid", async () => {
      await expect(
        EventTrackingService.trackEventsBatch([
          { shopId: "shop-1", sessionId: "sess-1", eventType: "PAGE_VIEW", eventData: {} },
          { shopId: "shop-1", sessionId: "", eventType: "PAGE_VIEW", eventData: {} },
        ]),
      ).rejects.toThrow("Invalid event in batch");
      expect(mockCreateMany).not.toHaveBeenCalled();
    });
  });

  describe("getSessionEvents / getSessionEventsByType", () => {
    it("returns events ordered by timestamp desc with a limit", async () => {
      mockFindMany.mockResolvedValue([makeEvent()]);

      const events = await EventTrackingService.getSessionEvents("shop-1", "sess-1", 10);

      expect(events).toHaveLength(1);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { shopId: "shop-1", sessionId: "sess-1" },
        orderBy: { timestamp: "desc" },
        take: 10,
      });
    });

    it("filters by event type", async () => {
      mockFindMany.mockResolvedValue([makeEvent()]);

      await EventTrackingService.getSessionEventsByType("shop-1", "sess-1", "PRODUCT_VIEW");

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { shopId: "shop-1", sessionId: "sess-1", eventType: "PRODUCT_VIEW" },
        orderBy: { timestamp: "desc" },
      });
    });
  });

  describe("getSessionTimeline", () => {
    it("returns an empty timeline when there are no events", async () => {
      mockFindMany.mockResolvedValue([]);

      const timeline = await EventTrackingService.getSessionTimeline("shop-1", "sess-1");

      expect(timeline).toEqual({
        events: [],
        totalEvents: 0,
        firstEvent: null,
        lastEvent: null,
        sessionDurationMs: null,
      });
    });

    it("computes duration from first and last event", async () => {
      const t1 = new Date("2026-01-01T10:00:00Z");
      const t2 = new Date("2026-01-01T10:05:00Z");
      mockFindMany.mockResolvedValue([makeEvent({ timestamp: t1 }), makeEvent({ timestamp: t2 })]);

      const timeline = await EventTrackingService.getSessionTimeline("shop-1", "sess-1");

      expect(timeline.totalEvents).toBe(2);
      expect(timeline.firstEvent).toBe(t1);
      expect(timeline.lastEvent).toBe(t2);
      expect(timeline.sessionDurationMs).toBe(5 * 60 * 1000);
    });
  });

  describe("getSessionStats", () => {
    const events = [
      makeEvent({ eventType: "PAGE_VIEW" }),
      makeEvent({ eventType: "PRODUCT_VIEW", eventData: { productId: "p1" } }),
      makeEvent({ eventType: "PRODUCT_VIEW", eventData: { productId: "p1" } }),
      makeEvent({ eventType: "PRODUCT_VIEW", eventData: { productId: "p2" } }),
      makeEvent({ eventType: "ADD_TO_CART", eventData: { price: "100" } }),
      makeEvent({ eventType: "REMOVE_FROM_CART", eventData: { price: 40 } }),
      makeEvent({ eventType: "EXIT_INTENT" }),
      makeEvent({ eventType: "SCROLL_DEPTH", eventData: { depth: 50 } }),
      makeEvent({ eventType: "SCROLL_DEPTH", eventData: { depth: 90 } }),
    ];

    beforeEach(() => {
      mockFindMany.mockResolvedValue(events);
    });

    it("computes aggregate stats", async () => {
      const stats = await EventTrackingService.getSessionStats("shop-1", "sess-1");

      expect(stats.totalEvents).toBe(9);
      expect(stats.eventCounts.PAGE_VIEW).toBe(1);
      expect(stats.eventCounts.PRODUCT_VIEW).toBe(3);
      expect(stats.uniqueProductsViewed).toBe(2);
      expect(stats.addToCartCount).toBe(1);
      expect(stats.removeFromCartCount).toBe(1);
      expect(stats.exitIntentCount).toBe(1);
      expect(stats.maxScrollDepth).toBe(90);
      expect(stats.estimatedCartValue).toBe(60);
    });

    it("never returns a negative estimated cart value", async () => {
      mockFindMany.mockResolvedValue([
        makeEvent({ eventType: "REMOVE_FROM_CART", eventData: { price: 999 } }),
      ]);

      const stats = await EventTrackingService.getSessionStats("shop-1", "sess-1");

      expect(stats.estimatedCartValue).toBe(0);
    });
  });

  describe("cleanupOldEvents", () => {
    it("deletes events older than the retention window", async () => {
      mockDeleteMany.mockResolvedValue({ count: 7 });

      const count = await EventTrackingService.cleanupOldEvents(30);

      expect(count).toBe(7);
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { timestamp: { lt: expect.any(Date) } },
      });
    });
  });

  describe("getActiveSessions", () => {
    it("returns distinct recent session ids", async () => {
      mockFindMany.mockResolvedValue([{ sessionId: "a" }, { sessionId: "b" }]);

      const sessions = await EventTrackingService.getActiveSessions("shop-1", 60000);

      expect(sessions).toEqual(["a", "b"]);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          shopId: "shop-1",
          timestamp: { gte: expect.any(Date) },
        },
        distinct: ["sessionId"],
        select: { sessionId: true },
      });
    });
  });

  describe("detectSessionPatterns", () => {
    it("flags abandoned cart, heavy browsing, exit intent, engagement and price shopping", async () => {
      const events = [
        makeEvent({ eventType: "PAGE_VIEW" }),
        makeEvent({ eventType: "PAGE_VIEW" }),
        makeEvent({ eventType: "PAGE_VIEW" }),
        makeEvent({ eventType: "PRODUCT_VIEW", eventData: { productId: "p1" } }),
        makeEvent({ eventType: "PRODUCT_VIEW", eventData: { productId: "p2" } }),
        makeEvent({ eventType: "PRODUCT_VIEW", eventData: { productId: "p3" } }),
        makeEvent({ eventType: "ADD_TO_CART", eventData: { price: 50 } }),
        makeEvent({ eventType: "REMOVE_FROM_CART", eventData: { price: 50 } }),
        makeEvent({ eventType: "EXIT_INTENT" }),
        makeEvent({ eventType: "SCROLL_DEPTH", eventData: { depth: 100 } }),
      ];
      mockFindMany.mockResolvedValue(events);

      const patterns = await EventTrackingService.detectSessionPatterns("shop-1", "sess-1");

      expect(patterns.hasAbandonedCart).toBe(false);
      expect(patterns.isBrowsingHeavily).toBe(true);
      expect(patterns.showedExitIntent).toBe(true);
      expect(patterns.isEngaged).toBe(true);
      expect(patterns.likelyPriceShopping).toBe(true);
    });

    it("detects abandoned cart when cart added but never removed", async () => {
      mockFindMany.mockResolvedValue([
        makeEvent({ eventType: "ADD_TO_CART", eventData: { price: 50 } }),
      ]);

      const patterns = await EventTrackingService.detectSessionPatterns("shop-1", "sess-1");

      expect(patterns.hasAbandonedCart).toBe(true);
      expect(patterns.isEngaged).toBe(false);
      expect(patterns.likelyPriceShopping).toBe(false);
    });
  });
});
