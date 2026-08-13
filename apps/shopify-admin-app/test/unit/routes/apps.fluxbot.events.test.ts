import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerify, mockShopFindUnique, mockBehaviorCreate, mockConversationFindUnique, mockConversationEventCreate } =
  vi.hoisted(() => ({
    mockVerify: vi.fn(),
    mockShopFindUnique: vi.fn(),
    mockBehaviorCreate: vi.fn(),
    mockConversationFindUnique: vi.fn(),
    mockConversationEventCreate: vi.fn(),
  }));

vi.mock("../../../app/services/shopify-proxy-auth.server", () => ({
  verifyShopifyProxyRequest: mockVerify,
}));

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: { findUnique: mockShopFindUnique },
    behaviorEvent: { create: mockBehaviorCreate },
    conversation: { findUnique: mockConversationFindUnique },
    conversationEvent: { create: mockConversationEventCreate },
  },
}));

import { action, loader } from "../../../app/routes/apps.fluxbot.events";

function makeRequest(
  body: unknown,
  method = "POST",
  headers: Record<string, string> = {},
  query = "",
) {
  const init: RequestInit = { method };
  if (body !== null && method !== "GET" && method !== "HEAD") {
    init.headers = { "content-type": "application/json", ...headers };
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request(`http://localhost/apps/fluxbot/events${query}`, init);
}

describe("apps.fluxbot.events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReturnValue(true);
    mockShopFindUnique.mockResolvedValue({ id: "shop-1", domain: "shop.myshopify.com" });
    mockBehaviorCreate.mockResolvedValue({});
    mockConversationFindUnique.mockResolvedValue({ id: "c1", shopId: "shop-1" });
    mockConversationEventCreate.mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loader", () => {
    it("returns 401 when the proxy request is not verified", async () => {
      mockVerify.mockReturnValue(false);
      const response = await loader({ request: makeRequest(null, "GET") } as never);
      expect(response.status).toBe(401);
    });

    it("returns ok when verified", async () => {
      const response = await loader({ request: makeRequest(null, "GET") } as never);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    });
  });

  describe("action", () => {
    it("returns 204 preflight for OPTIONS", async () => {
      const response = await action({ request: makeRequest(null, "OPTIONS") } as never);
      expect(response.status).toBe(204);
    });

    it("returns 405 for non-POST methods", async () => {
      const response = await action({ request: makeRequest(null, "PATCH") } as never);
      expect(response.status).toBe(405);
    });

    it("returns 401 when not verified", async () => {
      mockVerify.mockReturnValue(false);
      const response = await action({ request: makeRequest({ event: "PAGE_VIEW" }) } as never);
      expect(response.status).toBe(401);
    });

    it("returns 400 when the shop identifier is missing", async () => {
      const response = await action({ request: makeRequest({ event: "PAGE_VIEW" }) } as never);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("Missing shop identifier");
    });

    it("returns 400 when the event type is missing", async () => {
      const response = await action({
        request: makeRequest({}, "POST", { "X-Shopify-Shop-Domain": "shop.myshopify.com" }),
      } as never);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("Event type is required");
    });

    it("returns 404 when the shop is unknown", async () => {
      mockShopFindUnique.mockResolvedValue(null);
      const response = await action({
        request: makeRequest(
          { event: "PAGE_VIEW", sessionId: "s1" },
          "POST",
          { "X-Shopify-Shop-Domain": "nope.myshopify.com" },
        ),
      } as never);
      expect(response.status).toBe(404);
    });

    it("records a behavior event for a session and a conversation event", async () => {
      const response = await action({
        request: makeRequest(
          {
            event: "page_view",
            sessionId: "s1",
            visitorId: "v1",
            customerId: "c1",
            conversationId: "c1",
            data: { page: "/" },
            timestamp: "2026-01-01T00:00:00Z",
          },
          "POST",
          { "X-Shopify-Shop-Domain": "shop.myshopify.com" },
        ),
      } as never);

      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);
      expect(mockBehaviorCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shopId: "shop-1",
          sessionId: "s1",
          eventType: "PAGE_VIEW",
          eventData: expect.objectContaining({ page: "/", rawEvent: "page_view" }),
        }),
      });
      expect(mockConversationEventCreate).toHaveBeenCalled();
    });

    it("uses the shop query param as fallback for the shop identifier", async () => {
      const response = await action({
        request: makeRequest(
          { event: "SEARCH", sessionId: "s1" },
          "POST",
          {},
          "?shop=shop.myshopify.com",
        ),
      } as never);

      expect(response.status).toBe(200);
      expect(mockShopFindUnique).toHaveBeenCalledWith({
        where: { domain: "shop.myshopify.com" },
      });
    });

    it("does not create a conversation event for a foreign shop conversation", async () => {
      mockConversationFindUnique.mockResolvedValue({ id: "c1", shopId: "other-shop" });

      const response = await action({
        request: makeRequest(
          { event: "PAGE_VIEW", sessionId: "s1", conversationId: "c1" },
          "POST",
          { "X-Shopify-Shop-Domain": "shop.myshopify.com" },
        ),
      } as never);

      expect(response.status).toBe(200);
      expect(mockBehaviorCreate).toHaveBeenCalled();
      expect(mockConversationEventCreate).not.toHaveBeenCalled();
    });

    it("returns 500 when an unexpected error is thrown", async () => {
      mockShopFindUnique.mockRejectedValue(new Error("db down"));

      const response = await action({
        request: makeRequest(
          { event: "PAGE_VIEW", sessionId: "s1" },
          "POST",
          { "X-Shopify-Shop-Domain": "shop.myshopify.com" },
        ),
      } as never);

      expect(response.status).toBe(500);
      expect((await response.json()).error).toBe("Internal error");
    });
  });
});
