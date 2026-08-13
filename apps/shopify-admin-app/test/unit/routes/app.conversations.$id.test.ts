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
