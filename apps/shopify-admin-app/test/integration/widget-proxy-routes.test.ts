import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../app/services/consent-management.server", () => ({
  recordConsentEvent: vi.fn(),
}));

vi.mock("../../app/services/proactive-messaging.server", () => ({
  ProactiveMessagingService: {
    getSessionMessages: vi.fn(),
    markAsDelivered: vi.fn(),
    recordInteraction: vi.fn(),
  },
}));

vi.mock("../../app/services/handoff.server", () => ({
  HandoffService: {
    isEnabled: vi.fn(),
    create: vi.fn(),
  },
}));

import prisma from "../../app/db.server";
import { recordConsentEvent } from "../../app/services/consent-management.server";
import { HandoffService } from "../../app/services/handoff.server";
import { ProactiveMessagingService } from "../../app/services/proactive-messaging.server";

const mockShopFindUnique = prisma.shop.findUnique as ReturnType<typeof vi.fn>;
const mockRecordConsentEvent = recordConsentEvent as ReturnType<typeof vi.fn>;
const mockGetSessionMessages = ProactiveMessagingService.getSessionMessages as ReturnType<typeof vi.fn>;
const mockMarkAsDelivered = ProactiveMessagingService.markAsDelivered as ReturnType<typeof vi.fn>;
const mockRecordInteraction = ProactiveMessagingService.recordInteraction as ReturnType<typeof vi.fn>;
const mockHandoffEnabled = HandoffService.isEnabled as ReturnType<typeof vi.fn>;
const mockCreateHandoff = HandoffService.create as ReturnType<typeof vi.fn>;

function signProxyUrl(path: string, query: Record<string, string> = {}) {
  const params = new URLSearchParams(query);
  const message = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const hmac = createHmac("sha256", process.env.SHOPIFY_API_SECRET || "")
    .update(message)
    .digest("hex");

  params.set("hmac", hmac);
  return `http://localhost${path}?${params.toString()}`;
}

function makeProxyRequest(options: {
  method?: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}) {
  const headers = new Headers(options.headers);
  const init: RequestInit = {
    method: options.method || "GET",
    headers,
  };

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  return new Request(signProxyUrl(options.path, options.query), init);
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    shopId: "shop-1",
    sessionId: "sess-1",
    triggerId: "trigger-1",
    recipientId: null,
    channel: "WEB_CHAT",
    messageTemplate: "Hello",
    renderedMessage: "Hello there",
    messageMetadata: {},
    status: "QUEUED",
    sentAt: null,
    deliveredAt: null,
    interactedAt: null,
    outcome: null,
    errorMessage: null,
    retryCount: 0,
    maxRetries: 3,
    expiresAt: null,
    createdAt: new Date("2026-03-14T10:00:00.000Z"),
    updatedAt: new Date("2026-03-14T10:00:00.000Z"),
    ...overrides,
  };
}

describe("widget proxy routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SHOPIFY_API_SECRET = "test-secret";
    mockHandoffEnabled.mockReturnValue(true);
  });

  it("filters proactive messages to pending WEB_CHAT entries", async () => {
    mockGetSessionMessages.mockResolvedValue([
      makeMessage({ id: "msg-web-chat-queued", channel: "WEB_CHAT", status: "QUEUED" }),
      makeMessage({ id: "msg-web-chat-delivered", channel: "WEB_CHAT", status: "DELIVERED" }),
      makeMessage({ id: "msg-email-queued", channel: "EMAIL", status: "QUEUED" }),
    ]);

    const { loader } = await import("../../app/routes/apps.fluxbot.messages.$sessionId");
    const response = await loader({
      request: makeProxyRequest({
        path: "/apps/fluxbot/messages/sess-1",
        query: { shop: "store.myshopify.com", timestamp: "1710400000" },
      }),
      params: { sessionId: "sess-1" },
      context: {},
    } as never);

    const data = await response.json();

    expect(mockGetSessionMessages).toHaveBeenCalledWith("sess-1");
    expect(data).toMatchObject({ success: true });
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].id).toBe("msg-web-chat-queued");
  });

  it("marks proactive messages as delivered when widget acknowledges delivery", async () => {
    const { action } = await import("../../app/routes/apps.fluxbot.messages.$sessionId");
    const response = await action({
      request: makeProxyRequest({
        method: "PATCH",
        path: "/apps/fluxbot/messages/sess-1",
        query: { shop: "store.myshopify.com", timestamp: "1710400001" },
        body: { messageId: "msg-1", interaction: "DELIVERED" },
      }),
      params: { sessionId: "sess-1" },
      context: {},
    } as never);

    const data = await response.json();

    expect(data).toMatchObject({ success: true });
    expect(mockMarkAsDelivered).toHaveBeenCalledWith("msg-1");
    expect(mockRecordInteraction).not.toHaveBeenCalled();
  });

  it("normalizes DISMISSED proactive interactions to REJECTED", async () => {
    const { action } = await import("../../app/routes/apps.fluxbot.messages.$sessionId");
    const response = await action({
      request: makeProxyRequest({
        method: "PATCH",
        path: "/apps/fluxbot/messages/sess-1",
        query: { shop: "store.myshopify.com", timestamp: "1710400002" },
        body: { messageId: "msg-2", interaction: "DISMISSED" },
      }),
      params: { sessionId: "sess-1" },
      context: {},
    } as never);

    const data = await response.json();

    expect(data).toMatchObject({ success: true });
    expect(mockRecordInteraction).toHaveBeenCalledWith("msg-2", "REJECTED");
    expect(mockMarkAsDelivered).not.toHaveBeenCalled();
  });

  it("records consent using shop from widget body payload", async () => {
    mockShopFindUnique.mockResolvedValue({ id: "shop-1" });

    const { action } = await import("../../app/routes/apps.fluxbot.consent");
    const response = await action({
      request: makeProxyRequest({
        method: "POST",
        path: "/apps/fluxbot/consent",
        query: { timestamp: "1710400003" },
        headers: {
          "X-Forwarded-For": "203.0.113.10, 10.0.0.1",
          "User-Agent": "Vitest Widget Client",
        },
        body: {
          granted: true,
          shop: "store.myshopify.com",
          visitorId: "visitor-1",
          customerId: "customer-1",
          locale: "es",
          consentVersion: "1.0",
        },
      }),
      params: {},
      context: {},
    } as never);

    const data = await response.json();

    expect(data).toMatchObject({ success: true, granted: true });
    expect(mockShopFindUnique).toHaveBeenCalledWith({
      where: { domain: "store.myshopify.com" },
      select: { id: true },
    });
    expect(mockRecordConsentEvent).toHaveBeenCalledWith(
      "shop-1",
      "CONSENT_GIVEN",
      expect.objectContaining({
        visitorId: "visitor-1",
        customerId: "customer-1",
        ipAddress: "203.0.113.10",
        userAgent: "Vitest Widget Client",
        metadata: expect.objectContaining({
          source: "widget",
          locale: "es",
          consentVersion: "1.0",
        }),
      }),
    );
  });

  it("creates handoff requests using widget session context from body payload", async () => {
    mockShopFindUnique.mockResolvedValue({ id: "shop-1" });
    mockCreateHandoff.mockResolvedValue({ id: "handoff-1" });

    const { action } = await import("../../app/routes/apps.fluxbot.handoff");
    const response = await action({
      request: makeProxyRequest({
        method: "POST",
        path: "/apps/fluxbot/handoff",
        query: { timestamp: "1710400004" },
        body: {
          shop: "store.myshopify.com",
          conversationId: "conv-1",
          sessionId: "sess-1",
          visitorId: "visitor-1",
          customerId: "customer-1",
          reason: "user_request",
        },
      }),
      params: {},
      context: {},
    } as never);

    const data = await response.json();

    expect(data).toMatchObject({ success: true, data: { id: "handoff-1" } });
    expect(mockCreateHandoff).toHaveBeenCalledWith({
      shopId: "shop-1",
      conversationId: "conv-1",
      reason: "user_request",
      context: expect.objectContaining({
        sessionId: "sess-1",
        visitorId: "visitor-1",
        customerId: "customer-1",
        source: "widget",
      }),
    });
  });
});
