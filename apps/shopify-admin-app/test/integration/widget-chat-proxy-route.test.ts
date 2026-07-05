import { beforeEach, describe, expect, it, vi } from "vitest";

const mockShopFindUnique = vi.fn();
const mockConversationFindUnique = vi.fn();
const mockConversationCreate = vi.fn();
const mockConversationMessageCreate = vi.fn();
const mockGatewayChat = vi.fn();
const mockVerifyProxy = vi.fn();

vi.mock("../../app/db.server", () => ({
  default: {
    shop: { findUnique: mockShopFindUnique },
    conversation: {
      findUnique: mockConversationFindUnique,
      create: mockConversationCreate,
    },
    conversationMessage: {
      create: mockConversationMessageCreate,
    },
  },
}));

vi.mock("../../app/services/ia-gateway.server", () => ({
  getIAGateway: () => ({
    chat: mockGatewayChat,
  }),
}));

vi.mock("../../app/services/shopify-proxy-auth.server", () => ({
  verifyShopifyProxyRequest: (...args: unknown[]) => mockVerifyProxy(...args),
}));

describe("apps.fluxbot.chat proxy route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyProxy.mockReturnValue(true);
    mockShopFindUnique.mockResolvedValue({ id: "shop-1" });
    mockConversationFindUnique.mockResolvedValue(null);
    mockConversationCreate.mockResolvedValue({ id: "conv-1", messages: [] });
    mockConversationMessageCreate.mockResolvedValue({ id: "msg-1" });
    mockGatewayChat.mockResolvedValue({
      message: "Hola",
      confidence: 0.91,
      requiresEscalation: false,
      actions: [],
      toolsUsed: undefined,
      sourceReferences: undefined,
    });
  });

  it("does not fail when gateway returns undefined metadata arrays", async () => {
    const { action } = await import("../../app/routes/apps.fluxbot.chat");

    const request = new Request(
      "http://localhost/apps/fluxbot/chat?shop=quickstart-c8cc9986.myshopify.com",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "hola",
          visitorId: "visitor-1",
          locale: "es",
          context: {},
        }),
      },
    );

    const response = await action({
      request,
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({
      success: true,
      conversationId: "conv-1",
      message: "Hola",
    });

    expect(mockConversationMessageCreate).toHaveBeenCalledTimes(2);
    const assistantMessageCall = mockConversationMessageCreate.mock.calls[1][0]
      .data as Record<string, unknown>;
    expect(assistantMessageCall).not.toHaveProperty("metadata");
  });
});
