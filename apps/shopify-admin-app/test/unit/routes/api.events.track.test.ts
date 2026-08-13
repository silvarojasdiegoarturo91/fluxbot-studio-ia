import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockShopFindUnique,
  mockVerifyProxy,
  mockTrackEvent,
  mockGetSessionEvents,
  mockGetSessionStats,
  mockDetectSessionPatterns,
} = vi.hoisted(() => ({
  mockShopFindUnique: vi.fn(),
  mockVerifyProxy: vi.fn(),
  mockTrackEvent: vi.fn(),
  mockGetSessionEvents: vi.fn(),
  mockGetSessionStats: vi.fn(),
  mockDetectSessionPatterns: vi.fn(),
}));

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: { findUnique: mockShopFindUnique },
  },
}));

vi.mock("../../../app/services/event-tracking.server", () => ({
  EventTrackingService: {
    trackEvent: mockTrackEvent,
    getSessionEvents: mockGetSessionEvents,
    getSessionStats: mockGetSessionStats,
    detectSessionPatterns: mockDetectSessionPatterns,
  },
}));

vi.mock("../../../app/services/shopify-proxy-auth.server", () => ({
  verifyShopifyProxyRequest: mockVerifyProxy,
}));

import { action, loader } from "../../../app/routes/api.events.track";

function makeRequest(body: unknown, headers: Record<string, string> = {}, url = "http://localhost/api/events/track") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("api.events.track route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShopFindUnique.mockResolvedValue({ id: "shop-1" });
    mockVerifyProxy.mockReturnValue(true);
    mockTrackEvent.mockResolvedValue({ id: "evt-1", timestamp: new Date() });
  });

  it("answers CORS preflight with 204", async () => {
    const request = new Request("http://localhost/api/events/track", { method: "OPTIONS" });
    const response = await action({ request, params: {}, context: {} } as never);
    expect(response.status).toBe(204);
  });

  it("rejects unauthorized proxy requests with 401", async () => {
    mockVerifyProxy.mockReturnValue(false);

    const response = await action({
      request: makeRequest({ sessionId: "s1", eventType: "VIEW" }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(401);
  });

  it("rejects payloads missing required fields with 400", async () => {
    const response = await action({
      request: makeRequest({ eventType: "VIEW" }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Missing required fields");
  });

  it("returns 404 when the shop domain is unknown", async () => {
    mockShopFindUnique.mockResolvedValue(null);

    const response = await action({
      request: makeRequest({ shopDomain: "nope.myshopify.com", sessionId: "s1", eventType: "VIEW" }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(404);
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("resolves the shop from the query string and tracks the event", async () => {
    const response = await action({
      request: makeRequest(
        { sessionId: "s1", visitorId: "v1", eventType: "PRODUCT_VIEW", eventData: { id: 5 } },
        {},
        "http://localhost/api/events/track?shop=store.myshopify.com",
      ),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.eventId).toBe("evt-1");
    expect(mockTrackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "shop-1",
        sessionId: "s1",
        eventType: "PRODUCT_VIEW",
        eventData: { id: 5 },
      }),
    );
  });

  it("resolves the shop from the X-Shop-Domain header", async () => {
    const response = await action({
      request: makeRequest(
        { sessionId: "s1", eventType: "CLICK" },
        { "X-Shop-Domain": "header-store.myshopify.com" },
      ),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    expect(mockShopFindUnique).toHaveBeenCalledWith({
      where: { domain: "header-store.myshopify.com" },
      select: { id: true },
    });
  });

  it("defaults eventData to an empty object", async () => {
    await action({
      request: makeRequest({ shopDomain: "store.myshopify.com", sessionId: "s1", eventType: "VIEW" }),
      params: {},
      context: {},
    } as never);

    expect(mockTrackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventData: {} }),
    );
  });

  it("returns 500 when event tracking throws", async () => {
    mockTrackEvent.mockRejectedValue(new Error("tracking failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await action({
      request: makeRequest({ shopDomain: "store.myshopify.com", sessionId: "s1", eventType: "VIEW" }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("tracking failed");
    errorSpy.mockRestore();
  });

  describe("loader — session events", () => {
    it("requires a session id", async () => {
      const response = await loader({ request: makeRequest({}), params: {}, context: {} } as never);
      expect(response.status).toBe(400);
    });

    it("rejects unauthorized requests", async () => {
      mockVerifyProxy.mockReturnValue(false);
      const response = await loader({
        request: makeRequest({}, {}, "http://localhost/api/events/session/s1"),
        params: { sessionId: "s1" },
        context: {},
      } as never);
      expect(response.status).toBe(401);
    });

    it("requires a shop domain header", async () => {
      const response = await loader({
        request: makeRequest({}, {}, "http://localhost/api/events/session/s1"),
        params: { sessionId: "s1" },
        context: {},
      } as never);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toContain("Shop domain header missing");
    });

    it("returns 404 for unknown shops", async () => {
      mockShopFindUnique.mockResolvedValue(null);
      const response = await loader({
        request: makeRequest(
          {},
          { "X-Shop-Domain": "unknown.myshopify.com" },
          "http://localhost/api/events/session/s1",
        ),
        params: { sessionId: "s1" },
        context: {},
      } as never);
      expect(response.status).toBe(404);
    });

    it("returns events, stats and patterns for a session", async () => {
      mockGetSessionEvents.mockResolvedValue([{ id: "e1" }]);
      mockGetSessionStats.mockResolvedValue({ total: 1 });
      mockDetectSessionPatterns.mockResolvedValue({ abandonment: false });

      const response = await loader({
        request: makeRequest(
          {},
          { "X-Shop-Domain": "store.myshopify.com" },
          "http://localhost/api/events/session/s1",
        ),
        params: { sessionId: "s1" },
        context: {},
      } as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.session.events).toEqual([{ id: "e1" }]);
      expect(data.session.stats.total).toBe(1);
      expect(data.session.patterns.abandonment).toBe(false);
    });

    it("returns 500 when session retrieval throws", async () => {
      mockGetSessionEvents.mockRejectedValue(new Error("db down"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await loader({
        request: makeRequest(
          {},
          { "X-Shop-Domain": "store.myshopify.com" },
          "http://localhost/api/events/session/s1",
        ),
        params: { sessionId: "s1" },
        context: {},
      } as never);

      expect(response.status).toBe(500);
      errorSpy.mockRestore();
    });
  });
});
