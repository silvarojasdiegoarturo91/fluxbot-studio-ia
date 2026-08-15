/**
 * Unit Tests — apps.fluxbot.chat.ts (storefront chat proxy route)
 *
 * Covers the request-guard branches and error paths that complement the
 * happy-path scenarios already tested in test/integration/widget-chat-proxy-route.test.ts:
 *  - loader (200/401)
 *  - OPTIONS preflight, method-not-allowed
 *  - HMAC/signature verification failure
 *  - missing shop / missing message / shop not found / conversation not found
 *  - conversation locale reconciliation (prisma.conversation.update)
 *  - gateway failure -> safe fallback
 *  - traceId propagation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockShopFindUnique = vi.fn();
const mockShopUpsert = vi.fn();
const mockConversationFindUnique = vi.fn();
const mockConversationFindMany = vi.fn();
const mockConversationCreate = vi.fn();
const mockConversationUpdate = vi.fn();
const mockConversationMessageCreate = vi.fn();
const mockProductProjectionFindMany = vi.fn();
const mockGatewayChat = vi.fn();
const mockVerifyProxy = vi.fn();
const mockGetMerchantAdminConfig = vi.fn();

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: { findUnique: mockShopFindUnique, upsert: mockShopUpsert },
    conversation: {
      findUnique: mockConversationFindUnique,
      findMany: mockConversationFindMany,
      create: mockConversationCreate,
      update: mockConversationUpdate,
    },
    conversationMessage: {
      create: mockConversationMessageCreate,
    },
    productProjection: {
      findMany: mockProductProjectionFindMany,
    },
  },
}));

vi.mock("../../../app/services/ia-gateway.server", () => ({
  getIAGateway: () => ({ chat: mockGatewayChat }),
}));

vi.mock("../../../app/services/shopify-proxy-auth.server", () => ({
  verifyShopifyProxyRequest: (...args: unknown[]) => mockVerifyProxy(...args),
}));

vi.mock("../../../app/services/admin-config.server", () => ({
  getMerchantAdminConfig: (...args: unknown[]) => mockGetMerchantAdminConfig(...args),
}));

const ADMIN_CONFIG = {
  botName: "Asistente IA",
  botGoal: "SALES_SUPPORT",
  welcomeMessage: "Hola, estoy aquí para ayudarte.",
  primaryBotLanguage: "es",
  supportedLanguages: ["es", "en"],
  widgetBranding: {
    launcherLabel: "Asistente",
    launcherPosition: "bottom-right",
    primaryColor: "#008060",
  },
};

function makeRequest(overrides: { body?: unknown; headers?: Record<string, string>; url?: string } = {}) {
  const { body = {}, headers = {}, url = "http://localhost/apps/fluxbot/chat?shop=store.myshopify.com" } = overrides;
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("apps.fluxbot.chat — route guards and error paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyProxy.mockReturnValue(true);
    mockShopFindUnique.mockResolvedValue({ id: "shop-1" });
    mockShopUpsert.mockResolvedValue({ id: "shop-1" });
    mockConversationFindUnique.mockResolvedValue(null);
    mockConversationFindMany.mockResolvedValue([]);
    mockConversationCreate.mockResolvedValue({ id: "conv-1", shopId: "shop-1", locale: "es", messages: [], visitorId: "v1", customerId: null, sessionId: null });
    mockConversationUpdate.mockResolvedValue({ id: "conv-1", shopId: "shop-1", locale: "en", messages: [] });
    mockConversationMessageCreate.mockResolvedValue({ id: "msg-1" });
    mockProductProjectionFindMany.mockResolvedValue([]);
    mockGetMerchantAdminConfig.mockResolvedValue(ADMIN_CONFIG);
    mockGatewayChat.mockResolvedValue({
      message: "Hola",
      confidence: 0.9,
      requiresEscalation: false,
      toolsUsed: [],
      sourceReferences: [],
      actions: [],
    });
  });

  describe("loader", () => {
    it("returns ok when the proxy signature is valid", async () => {
      const { loader } = await import("../../../app/routes/apps.fluxbot.chat");
      const request = new Request("http://localhost/apps/fluxbot/chat?shop=store.myshopify.com&hmac=abc");

      const response = await loader({ request, params: {}, context: {} } as never);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ ok: true });
      expect(mockVerifyProxy).toHaveBeenCalledWith(request, { allowUnsignedInDevelopment: true });
    });

    it("rejects unsigned loader requests when verification fails", async () => {
      mockVerifyProxy.mockReturnValue(false);
      const { loader } = await import("../../../app/routes/apps.fluxbot.chat");
      const request = new Request("http://localhost/apps/fluxbot/chat?shop=store.myshopify.com");

      const response = await loader({ request, params: {}, context: {} } as never);

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });
  });

  describe("action guards", () => {
    it("answers OPTIONS with a 204 preflight", async () => {
      const { action } = await import("../../../app/routes/apps.fluxbot.chat");
      const request = new Request("http://localhost/apps/fluxbot/chat?shop=store.myshopify.com", { method: "OPTIONS" });

      const response = await action({ request, params: {}, context: {} } as never);

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(mockVerifyProxy).not.toHaveBeenCalled();
    });

    it("returns 405 for non-POST methods", async () => {
      const { action } = await import("../../../app/routes/apps.fluxbot.chat");
      const request = new Request("http://localhost/apps/fluxbot/chat?shop=store.myshopify.com", { method: "GET" });

      const response = await action({ request, params: {}, context: {} } as never);

      expect(response.status).toBe(405);
      expect(await response.json()).toEqual({ error: "Method not allowed" });
    });

    it("returns 401 when proxy verification fails", async () => {
      mockVerifyProxy.mockReturnValue(false);
      const { action } = await import("../../../app/routes/apps.fluxbot.chat");

      const response = await action({ request: makeRequest({ body: { message: "hola" } }), params: {}, context: {} } as never);

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });

    it("returns 400 when no shop identifier is present", async () => {
      const { action } = await import("../../../app/routes/apps.fluxbot.chat");

      const response = await action({
        request: makeRequest({ body: { message: "hola" }, url: "http://localhost/apps/fluxbot/chat" }),
        params: {},
        context: {},
      } as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe("Missing shop identifier");
    });

    it("returns 400 when the message is empty", async () => {
      const { action } = await import("../../../app/routes/apps.fluxbot.chat");

      const response = await action({ request: makeRequest({ body: { message: "   " } }), params: {}, context: {} } as never);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Message is required");
    });

    it("returns a safe fallback response when the shop upsert fails (DB error)", async () => {
      mockShopUpsert.mockRejectedValue(new Error("DB connection lost"));
      const { action } = await import("../../../app/routes/apps.fluxbot.chat");

      const response = await action({ request: makeRequest({ body: { message: "hola" } }), params: {}, context: {} } as never);

      // The outer catch returns a 200 safe fallback (success: true) — never leaks DB errors
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.requiresEscalation).toBe(false);
    });

    it("returns 404 when the requested conversation does not exist", async () => {
      mockConversationFindUnique.mockResolvedValue(null);
      const { action } = await import("../../../app/routes/apps.fluxbot.chat");

      const response = await action({
        request: makeRequest({ body: { message: "hola", conversationId: "conv-missing" } }),
        params: {},
        context: {},
      } as never);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("Conversation not found");
    });

    it("returns 404 when the conversation belongs to another shop", async () => {
      mockConversationFindUnique.mockResolvedValue({
        id: "conv-other",
        shopId: "shop-OTHER",
        locale: "es",
        messages: [],
      });
      const { action } = await import("../../../app/routes/apps.fluxbot.chat");

      const response = await action({
        request: makeRequest({ body: { message: "hola", conversationId: "conv-other" } }),
        params: {},
        context: {},
      } as never);

      expect(response.status).toBe(404);
    });
  });

  describe("action happy path details", () => {
    it("updates the conversation locale when it diverges from the effective locale", async () => {
      // conversationLocale takes precedence, but "fr" is not supported, so the
      // effective locale falls back to the supported request locale "en".
      mockConversationFindUnique.mockResolvedValue({
        id: "conv-1",
        shopId: "shop-1",
        locale: "fr",
        messages: [],
        visitorId: null,
        customerId: null,
        sessionId: null,
      });
      const { action } = await import("../../../app/routes/apps.fluxbot.chat");

      const response = await action({
        request: makeRequest({
          body: { message: "hola", conversationId: "conv-1", locale: "en", visitorId: "v1", context: {} },
        }),
        params: {},
        context: {},
      } as never);

      expect(response.status).toBe(200);
      expect(mockConversationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "conv-1" },
          data: { locale: "en" },
        }),
      );
      expect(mockGatewayChat).toHaveBeenCalledWith(
        expect.objectContaining({ locale: "en" }),
        "store.myshopify.com",
      );
    });

    it("propagates a widget-supplied traceId to the gateway and the response", async () => {
      const { action } = await import("../../../app/routes/apps.fluxbot.chat");

      const response = await action({
        request: makeRequest({
          headers: { "X-FluxBot-Trace-Id": "trace-widget-123" },
          body: { message: "hola", visitorId: "v1", context: {} },
        }),
        params: {},
        context: {},
      } as never);

      expect(response.status).toBe(200);
      expect(response.headers.get("X-FluxBot-Trace-Id")).toBe("trace-widget-123");
      expect(mockGatewayChat).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: "trace-widget-123" }),
        "store.myshopify.com",
      );
    });
  });

  describe("action error fallback", () => {
    it("returns a safe fallback response when the gateway throws", async () => {
      mockGatewayChat.mockRejectedValue(new Error("backend exploded"));
      const { action } = await import("../../../app/routes/apps.fluxbot.chat");

      const response = await action({ request: makeRequest({ body: { message: "hola" } }), params: {}, context: {} } as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.confidence).toBe(0.35);
      expect(data.requiresEscalation).toBe(false);
      expect(data.actions).toEqual([]);
      expect(data.metadata.products).toEqual([]);
      expect(typeof data.message).toBe("string");
      expect(data.message.length).toBeGreaterThan(0);
    });

    it("returns a safe fallback response when the product projection query throws", async () => {
      mockProductProjectionFindMany.mockRejectedValue(new Error("db down"));
      const { action } = await import("../../../app/routes/apps.fluxbot.chat");

      const response = await action({
        request: makeRequest({ body: { message: "recomiéndame un snowboard" } }),
        params: {},
        context: {},
      } as never);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.confidence).toBe(0.35);
      expect(data.metadata.products).toEqual([]);
    });
  });
});
