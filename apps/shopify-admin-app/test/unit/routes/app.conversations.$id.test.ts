/**
 * Unit Tests — app.conversations.$id.tsx (conversation detail loader)
 *
 * Covers the loader directly with mocked auth / shop context / prisma:
 *  - returns the full conversation with ascending messages + descending handoffs
 *  - throws 404 when the conversation does not exist for this shop
 *  - throws 404 when the shop cannot be resolved
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthenticateAdminRequest = vi.fn();
const mockEnsureShopForSession = vi.fn();
const mockConversationFindFirst = vi.fn();
const mockConversationDetail = vi.fn();

vi.mock("../../../app/db.server", () => ({
  default: {
    conversation: {
      findFirst: mockConversationFindFirst,
    },
  },
}));

vi.mock("../../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: mockAuthenticateAdminRequest,
}));

vi.mock("../../../app/services/shop-context.server", () => ({
  ensureShopForSession: mockEnsureShopForSession,
}));

vi.mock("../../../app/services/ia-backend.server", () => ({
  iaClient: {
    widgetAdmin: {
      conversationDetail: mockConversationDetail,
    },
  },
}));

const SESSION = { shop: "shop.example.myshopify.com", accessToken: "mock-access-token" };
const SHOP = { id: "shop-1", domain: "shop.example.myshopify.com" };

const CONVERSATION = {
  id: "conv-1",
  shopId: "shop-1",
  channel: "WEB_CHAT",
  status: "ACTIVE",
  locale: "es",
  visitorId: "v1",
  customerId: null,
  sessionId: "s1",
  startedAt: new Date("2026-07-01T10:00:00Z"),
  lastMessageAt: new Date("2026-07-01T10:05:00Z"),
  messages: [
    { id: "m1", role: "USER", content: "Hola", confidence: null, tokensUsed: null, metadata: null, createdAt: new Date("2026-07-01T10:00:00Z"), toolInvocations: [] },
    { id: "m2", role: "ASSISTANT", content: "¿En qué puedo ayudarte?", confidence: 0.9, tokensUsed: 120, metadata: { toolsUsed: [{ name: "searchCatalog", success: true }] }, createdAt: new Date("2026-07-01T10:00:05Z"), toolInvocations: [] },
  ],
  handoffRequests: [
    {
      id: "h-1",
      reason: "Customer asked for a human",
      status: "pending",
      assignedTo: "agent@shop.com",
      agentNotes: "Revisar envío",
      createdAt: new Date("2026-07-01T10:02:00Z"),
      resolvedAt: null,
    },
  ],
};

describe("app.conversations.$id loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateAdminRequest.mockResolvedValue({ session: SESSION } as any);
    mockEnsureShopForSession.mockResolvedValue(SHOP);
    mockConversationFindFirst.mockResolvedValue(CONVERSATION);
  });

  it("loads the conversation scoped to the shop with messages and handoffs", async () => {
    const { loader } = await import("../../../app/routes/app.conversations.$id");

    const data = await loader({
      request: new Request("http://localhost/app/conversations/conv-1"),
      params: { id: "conv-1" },
    } as any);

    expect(data.conversation).toEqual(CONVERSATION);
    expect(data.messages).toHaveLength(2);
    expect(data.handoffs).toHaveLength(1);
    expect(mockConversationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conv-1", shopId: "shop-1" },
        include: {
          messages: expect.objectContaining({ orderBy: { createdAt: "asc" } }),
          handoffRequests: expect.objectContaining({ orderBy: { createdAt: "desc" } }),
        },
      }),
    );
  });

  it("throws a 404 when the conversation does not exist for this shop", async () => {
    mockConversationFindFirst.mockResolvedValue(null);

    const { loader } = await import("../../../app/routes/app.conversations.$id");

    await expect(
      loader({
        request: new Request("http://localhost/app/conversations/conv-missing"),
        params: { id: "conv-missing" },
      } as any),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws a 404 when the shop cannot be resolved", async () => {
    mockEnsureShopForSession.mockResolvedValue(null);

    const { loader } = await import("../../../app/routes/app.conversations.$id");

    await expect(
      loader({
        request: new Request("http://localhost/app/conversations/conv-1"),
        params: { id: "conv-1" },
      } as any),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("app.conversations.$id loader external source", () => {
  const EXTERNAL_DETAIL = {
    id: "ext-1",
    sessionId: "visitor-9",
    visitorId: "visitor-9",
    createdAt: "2026-07-02T08:00:00Z",
    messages: [
      { role: "user", content: "Hola", createdAt: "2026-07-02T08:00:01Z", provider: null, model: null },
      { role: "assistant", content: "¿En qué puedo ayudarte?", createdAt: "2026-07-02T08:00:02Z", provider: "openai", model: "gpt-4o" },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateAdminRequest.mockResolvedValue({ session: SESSION } as any);
    mockEnsureShopForSession.mockResolvedValue(SHOP);
    mockConversationDetail.mockResolvedValue({ conversation: EXTERNAL_DETAIL });
  });

  it("loads an external-widget conversation transcript from the backend", async () => {
    const { loader } = await import("../../../app/routes/app.conversations.$id");

    const data = await loader({
      request: new Request("http://localhost/app/conversations/ext-1?source=external"),
      params: { id: "ext-1" },
    } as any);

    expect(data.source).toBe("external");
    expect(mockConversationDetail).toHaveBeenCalledWith("ext-1", "shop.example.myshopify.com");
    expect(mockConversationFindFirst).not.toHaveBeenCalled();
    expect(data.conversation).toMatchObject({
      id: "ext-1",
      channel: "EXTERNAL_WIDGET",
      status: "EXTERNAL",
      sessionId: "visitor-9",
    });
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0]).toMatchObject({ role: "USER", content: "Hola" });
    expect(data.messages[1]).toMatchObject({ role: "ASSISTANT", content: "¿En qué puedo ayudarte?" });
    expect(data.handoffs).toEqual([]);
  });

  it("throws a 404 when the external conversation does not exist", async () => {
    mockConversationDetail.mockResolvedValue(null);

    const { loader } = await import("../../../app/routes/app.conversations.$id");

    await expect(
      loader({
        request: new Request("http://localhost/app/conversations/ext-missing?source=external"),
        params: { id: "ext-missing" },
      } as any),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws a 404 when the backend detail request fails", async () => {
    mockConversationDetail.mockRejectedValue(new Error("backend down"));

    const { loader } = await import("../../../app/routes/app.conversations.$id");

    await expect(
      loader({
        request: new Request("http://localhost/app/conversations/ext-1?source=external"),
        params: { id: "ext-1" },
      } as any),
    ).rejects.toMatchObject({ status: 404 });
  });
});
