import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerify, mockShopFindUnique, mockGetSessionMessages, mockRecordInteraction } =
  vi.hoisted(() => ({
    mockVerify: vi.fn(),
    mockShopFindUnique: vi.fn(),
    mockGetSessionMessages: vi.fn(),
    mockRecordInteraction: vi.fn(),
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
  },
}));

import { action, loader } from "../../../app/routes/api.messages";

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

describe("api.messages — loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReturnValue(true);
    mockShopFindUnique.mockResolvedValue({ id: "shop-1" });
    mockGetSessionMessages.mockResolvedValue([{ id: "m1" }]);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns 400 when sessionId is missing", async () => {
    const response = await loader({
      request: makeRequest("http://localhost/api/messages"),
    } as never);
    expect(response.status).toBe(400);
  });

  it("returns 401 when the proxy request is not verified", async () => {
    mockVerify.mockReturnValue(false);
    const response = await loader({
      request: makeRequest("http://localhost/api/messages?sessionId=s1"),
    } as never);
    expect(response.status).toBe(401);
  });

  it("returns 400 when shopDomain is missing", async () => {
    const response = await loader({
      request: makeRequest("http://localhost/api/messages?sessionId=s1"),
    } as never);
    expect(response.status).toBe(400);
  });

  it("returns 404 when the shop is unknown", async () => {
    mockShopFindUnique.mockResolvedValue(null);
    const response = await loader({
      request: makeRequest(
        "http://localhost/api/messages?sessionId=s1&shopDomain=shop.myshopify.com",
      ),
    } as never);
    expect(response.status).toBe(404);
  });

  it("returns the session messages", async () => {
    const response = await loader({
      request: makeRequest(
        "http://localhost/api/messages?sessionId=s1&shopDomain=shop.myshopify.com",
      ),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.count).toBe(1);
    expect(mockGetSessionMessages).toHaveBeenCalledWith("shop-1", "s1");
  });

  it("falls back to the X-Shop-Domain header", async () => {
    const response = await loader({
      request: makeRequest(
        "http://localhost/api/messages?sessionId=s1",
        "GET",
        undefined,
        { "X-Shop-Domain": "shop.myshopify.com" },
      ),
    } as never);

    expect(response.status).toBe(200);
    expect(mockShopFindUnique).toHaveBeenCalledWith({
      where: { domain: "shop.myshopify.com" },
      select: { id: true },
    });
  });

  it("returns 500 when retrieval fails", async () => {
    mockGetSessionMessages.mockRejectedValue(new Error("db down"));
    const response = await loader({
      request: makeRequest(
        "http://localhost/api/messages?sessionId=s1&shop=shop.myshopify.com",
      ),
    } as never);
    expect(response.status).toBe(500);
  });
});

describe("api.messages — action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReturnValue(true);
    mockShopFindUnique.mockResolvedValue({ id: "shop-1" });
    mockRecordInteraction.mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns 405 for unsupported methods", async () => {
    const response = await action({
      request: makeRequest("http://localhost/api/messages", "DELETE", {}),
    } as never);
    expect(response.status).toBe(405);
  });

  it("returns 401 when not verified", async () => {
    mockVerify.mockReturnValue(false);
    const response = await action({
      request: makeRequest("http://localhost/api/messages", "PATCH", {}),
    } as never);
    expect(response.status).toBe(401);
  });

  it("returns 400 when shopDomain is missing", async () => {
    const response = await action({
      request: makeRequest("http://localhost/api/messages", "PATCH", {
        messageId: "m1",
        interaction: "CLICKED",
      }),
    } as never);
    expect(response.status).toBe(400);
  });

  it("returns 400 when messageId is missing", async () => {
    const response = await action({
      request: makeRequest("http://localhost/api/messages", "PATCH", {
        shopDomain: "shop.myshopify.com",
        interaction: "CLICKED",
      }),
    } as never);
    expect(response.status).toBe(400);
  });

  it("returns 400 when interaction is missing", async () => {
    const response = await action({
      request: makeRequest("http://localhost/api/messages", "PATCH", {
        shopDomain: "shop.myshopify.com",
        messageId: "m1",
      }),
    } as never);
    expect(response.status).toBe(400);
  });

  it("returns 404 when the shop is unknown", async () => {
    mockShopFindUnique.mockResolvedValue(null);
    const response = await action({
      request: makeRequest("http://localhost/api/messages", "PATCH", {
        shopDomain: "shop.myshopify.com",
        messageId: "m1",
        interaction: "CLICKED",
      }),
    } as never);
    expect(response.status).toBe(404);
  });

  it("rejects an invalid interaction type", async () => {
    const response = await action({
      request: makeRequest("http://localhost/api/messages", "PATCH", {
        shopDomain: "shop.myshopify.com",
        messageId: "m1",
        interaction: "INVALID",
      }),
    } as never);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid interaction type");
  });

  it("records a valid interaction", async () => {
    const response = await action({
      request: makeRequest("http://localhost/api/messages", "PATCH", {
        shopDomain: "shop.myshopify.com",
        messageId: "m1",
        interaction: "ACCEPTED",
      }),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.messageId).toBe("m1");
    expect(mockRecordInteraction).toHaveBeenCalledWith("shop-1", "m1", "ACCEPTED");
  });

  it("reads messageId from the query string when absent from body", async () => {
    const response = await action({
      request: makeRequest(
        "http://localhost/api/messages?messageId=m2&shop=shop.myshopify.com",
        "POST",
        { interaction: "DISMISSED" },
      ),
    } as never);

    expect(response.status).toBe(200);
    expect(mockRecordInteraction).toHaveBeenCalledWith("shop-1", "m2", "DISMISSED");
  });

  it("returns 500 when recording fails", async () => {
    mockRecordInteraction.mockRejectedValue(new Error("db down"));
    const response = await action({
      request: makeRequest("http://localhost/api/messages", "PATCH", {
        shopDomain: "shop.myshopify.com",
        messageId: "m1",
        interaction: "CLICKED",
      }),
    } as never);
    expect(response.status).toBe(500);
  });
});
