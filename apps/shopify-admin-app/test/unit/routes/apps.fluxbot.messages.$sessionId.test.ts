import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerify, mockShopFindUnique, mockGetSessionMessages, mockRecordInteraction, mockMarkAsDelivered } =
  vi.hoisted(() => ({
    mockVerify: vi.fn(),
    mockShopFindUnique: vi.fn(),
    mockGetSessionMessages: vi.fn(),
    mockRecordInteraction: vi.fn(),
    mockMarkAsDelivered: vi.fn(),
  }));

vi.mock("../../../app/services/shopify-proxy-auth.server", () => ({
  verifyShopifyProxyRequest: mockVerify,
}));

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: { findUnique: mockShopFindUnique },
  },
}));

vi.mock("../../../app/services/proactive-messaging.server", () => ({
  ProactiveMessagingService: {
    getSessionMessages: mockGetSessionMessages,
    recordInteraction: mockRecordInteraction,
    markAsDelivered: mockMarkAsDelivered,
  },
}));

import { action, loader } from "../../../app/routes/apps.fluxbot.messages.$sessionId";

function makeRequest(
  url: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json", ...headers };
    init.body = JSON.stringify(body);
  } else {
    init.headers = headers;
  }
  return new Request(url, init);
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return { id: "m1", channel: "WEB_CHAT", status: "QUEUED", ...overrides };
}

describe("apps.fluxbot.messages.$sessionId — loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReturnValue(true);
    mockShopFindUnique.mockResolvedValue({ id: "shop-1" });
    mockGetSessionMessages.mockResolvedValue([makeMessage()]);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns 401 when the proxy request is not verified", async () => {
    mockVerify.mockReturnValue(false);
    const response = await loader({
      request: makeRequest("http://localhost/apps/fluxbot/messages/s1"),
      params: { sessionId: "s1" },
    } as never);
    expect(response.status).toBe(401);
  });

  it("returns 400 when sessionId is missing", async () => {
    const response = await loader({
      request: makeRequest("http://localhost/apps/fluxbot/messages/"),
      params: {},
    } as never);
    expect(response.status).toBe(400);
  });

  it("returns 400 when shopDomain is missing", async () => {
    const response = await loader({
      request: makeRequest("http://localhost/apps/fluxbot/messages/s1"),
      params: { sessionId: "s1" },
    } as never);
    expect(response.status).toBe(400);
  });

  it("returns 404 when the shop is unknown", async () => {
    mockShopFindUnique.mockResolvedValue(null);
    const response = await loader({
      request: makeRequest(
        "http://localhost/apps/fluxbot/messages/s1?shop=shop.myshopify.com",
      ),
      params: { sessionId: "s1" },
    } as never);
    expect(response.status).toBe(404);
  });

  it("returns only queued WEB_CHAT messages", async () => {
    mockGetSessionMessages.mockResolvedValue([
      makeMessage({ id: "m1", channel: "WEB_CHAT", status: "QUEUED" }),
      makeMessage({ id: "m2", channel: "WEB_CHAT", status: "SENT" }),
      makeMessage({ id: "m3", channel: "EMAIL", status: "QUEUED" }),
    ]);

    const response = await loader({
      request: makeRequest(
        "http://localhost/apps/fluxbot/messages/s1?shop=shop.myshopify.com",
      ),
      params: { sessionId: "s1" },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.messages).toEqual([expect.objectContaining({ id: "m1" })]);
  });

  it("returns 500 when retrieval fails", async () => {
    mockGetSessionMessages.mockRejectedValue(new Error("db down"));
    const response = await loader({
      request: makeRequest(
        "http://localhost/apps/fluxbot/messages/s1?shop=shop.myshopify.com",
      ),
      params: { sessionId: "s1" },
    } as never);
    expect(response.status).toBe(500);
  });
});

describe("apps.fluxbot.messages.$sessionId — action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReturnValue(true);
    mockShopFindUnique.mockResolvedValue({ id: "shop-1" });
    mockRecordInteraction.mockResolvedValue({});
    mockMarkAsDelivered.mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns 204 for OPTIONS preflight", async () => {
    const response = await action({
      request: makeRequest("http://localhost/apps/fluxbot/messages/s1", "OPTIONS"),
      params: { sessionId: "s1" },
    } as never);
    expect(response.status).toBe(204);
  });

  it("returns 401 when not verified", async () => {
    mockVerify.mockReturnValue(false);
    const response = await action({
      request: makeRequest("http://localhost/apps/fluxbot/messages/s1", "PATCH", {}),
      params: { sessionId: "s1" },
    } as never);
    expect(response.status).toBe(401);
  });

  it("returns 405 for non-PATCH methods", async () => {
    const response = await action({
      request: makeRequest("http://localhost/apps/fluxbot/messages/s1", "POST", {}),
      params: { sessionId: "s1" },
    } as never);
    expect(response.status).toBe(405);
  });

  it("returns 400 when messageId is missing", async () => {
    const response = await action({
      request: makeRequest(
        "http://localhost/apps/fluxbot/messages/s1?shop=shop.myshopify.com",
        "PATCH",
        {},
      ),
      params: { sessionId: "s1" },
    } as never);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("messageId is required");
  });

  it("returns 400 for an invalid interaction", async () => {
    const response = await action({
      request: makeRequest(
        "http://localhost/apps/fluxbot/messages/s1?shop=shop.myshopify.com",
        "PATCH",
        { messageId: "m1", interaction: "BOGUS" },
      ),
      params: { sessionId: "s1" },
    } as never);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid interaction");
  });

  it("records a DISMISSED interaction as REJECTED", async () => {
    const response = await action({
      request: makeRequest(
        "http://localhost/apps/fluxbot/messages/s1?shop=shop.myshopify.com",
        "PATCH",
        { messageId: "m1", interaction: "DISMISSED" },
      ),
      params: { sessionId: "s1" },
    } as never);

    expect(response.status).toBe(200);
    expect(mockRecordInteraction).toHaveBeenCalledWith("shop-1", "m1", "REJECTED");
    expect(mockMarkAsDelivered).not.toHaveBeenCalled();
  });

  it("records ACCEPTED interactions", async () => {
    const response = await action({
      request: makeRequest(
        "http://localhost/apps/fluxbot/messages/s1?shop=shop.myshopify.com",
        "PATCH",
        { messageId: "m1", interaction: "ACCEPTED" },
      ),
      params: { sessionId: "s1" },
    } as never);

    expect(response.status).toBe(200);
    expect(mockRecordInteraction).toHaveBeenCalledWith("shop-1", "m1", "ACCEPTED");
  });

  it("marks the message as delivered when no interaction or DELIVERED", async () => {
    const response = await action({
      request: makeRequest(
        "http://localhost/apps/fluxbot/messages/s1?shop=shop.myshopify.com",
        "PATCH",
        { messageId: "m1" },
      ),
      params: { sessionId: "s1" },
    } as never);

    expect(response.status).toBe(200);
    expect(mockMarkAsDelivered).toHaveBeenCalledWith("shop-1", "m1");
    expect(mockRecordInteraction).not.toHaveBeenCalled();
  });

  it("returns 500 when the interaction recording fails", async () => {
    mockRecordInteraction.mockRejectedValue(new Error("db down"));
    const response = await action({
      request: makeRequest(
        "http://localhost/apps/fluxbot/messages/s1?shop=shop.myshopify.com",
        "PATCH",
        { messageId: "m1", interaction: "CLICKED" },
      ),
      params: { sessionId: "s1" },
    } as never);
    expect(response.status).toBe(500);
  });
});
