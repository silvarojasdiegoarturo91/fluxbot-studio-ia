import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockShopFindUnique, mockVerifyProxy, mockTrackEventsBatch } = vi.hoisted(() => ({
  mockShopFindUnique: vi.fn(),
  mockVerifyProxy: vi.fn(),
  mockTrackEventsBatch: vi.fn(),
}));

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: { findUnique: mockShopFindUnique },
  },
}));

vi.mock("../../../app/services/event-tracking.server", () => ({
  EventTrackingService: {
    trackEventsBatch: mockTrackEventsBatch,
  },
}));

vi.mock("../../../app/services/shopify-proxy-auth.server", () => ({
  verifyShopifyProxyRequest: mockVerifyProxy,
}));

import { action } from "../../../app/routes/api.events.track-batch";

function makeRequest(body: unknown, method = "POST") {
  return new Request("http://localhost/api/events/track-batch", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBatch(overrides: Record<string, unknown> = {}) {
  return {
    shopDomain: "store.myshopify.com",
    events: [
      { sessionId: "s1", eventType: "VIEW", eventData: { page: "/" } },
      { sessionId: "s1", eventType: "CLICK", eventData: { target: "cta" } },
    ],
    ...overrides,
  };
}

describe("api.events.track-batch route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShopFindUnique.mockResolvedValue({ id: "shop-1" });
    mockVerifyProxy.mockReturnValue(true);
    mockTrackEventsBatch.mockResolvedValue(2);
  });

  it("answers CORS preflight with 204", async () => {
    const response = await action({ request: makeRequest({}, "OPTIONS"), params: {}, context: {} } as never);
    expect(response.status).toBe(204);
  });

  it("rejects unauthorized proxy requests with 401", async () => {
    mockVerifyProxy.mockReturnValue(false);

    const response = await action({ request: makeRequest(validBatch()), params: {}, context: {} } as never);
    expect(response.status).toBe(401);
  });

  it("rejects missing or empty event arrays with 400", async () => {
    const response = await action({ request: makeRequest(validBatch({ events: [] })), params: {}, context: {} } as never);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid request");
  });

  it("rejects batches larger than 100 events with 400", async () => {
    const events = Array.from({ length: 101 }, (_, i) => ({ sessionId: `s${i}`, eventType: "VIEW" }));
    const response = await action({ request: makeRequest(validBatch({ events })), params: {}, context: {} } as never);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Too many events");
    expect(mockTrackEventsBatch).not.toHaveBeenCalled();
  });

  it("returns 404 when the shop domain is unknown", async () => {
    mockShopFindUnique.mockResolvedValue(null);

    const response = await action({ request: makeRequest(validBatch()), params: {}, context: {} } as never);
    expect(response.status).toBe(404);
  });

  it("tracks a batch and reports the count", async () => {
    const response = await action({ request: makeRequest(validBatch()), params: {}, context: {} } as never);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.eventsTracked).toBe(2);
    expect(mockTrackEventsBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ shopId: "shop-1", sessionId: "s1", eventType: "VIEW" }),
      ]),
    );
  });

  it("resolves the shop from the query string", async () => {
    const request = new Request("http://localhost/api/events/track-batch?shop=qs.myshopify.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBatch({ shopDomain: undefined })),
    });

    const response = await action({ request, params: {}, context: {} } as never);

    expect(response.status).toBe(200);
    expect(mockShopFindUnique).toHaveBeenCalledWith({
      where: { domain: "qs.myshopify.com" },
      select: { id: true },
    });
  });

  it("defaults missing eventData to an empty object", async () => {
    await action({
      request: makeRequest(validBatch({ events: [{ sessionId: "s1", eventType: "VIEW" }] })),
      params: {},
      context: {},
    } as never);

    expect(mockTrackEventsBatch).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ eventData: {} })]),
    );
  });

  it("returns 500 when batch tracking throws", async () => {
    mockTrackEventsBatch.mockRejectedValue(new Error("batch failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await action({ request: makeRequest(validBatch()), params: {}, context: {} } as never);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("batch failed");
    errorSpy.mockRestore();
  });
});
