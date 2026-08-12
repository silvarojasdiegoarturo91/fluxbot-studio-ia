/**
 * Unit Tests — app.conversations.tsx (conversations page)
 *
 * Covers loader + action directly with mocked auth / shop context /
 * admin config / prisma:
 *  - loader status filter + limit parsing, summary counts, handoffs
 *  - loader throws 404 when shop is unresolved
 *  - action resolve_handoff happy path + validation + error paths
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthenticateAdminRequest = vi.fn();
const mockEnsureShopForSession = vi.fn();
const mockGetMerchantAdminConfig = vi.fn();
const mockConversationFindMany = vi.fn();
const mockConversationCount = vi.fn();
const mockHandoffFindMany = vi.fn();
const mockHandoffUpdateMany = vi.fn();

vi.mock("../../../app/db.server", () => ({
  default: {
    conversation: {
      findMany: mockConversationFindMany,
      count: mockConversationCount,
    },
    handoffRequest: {
      findMany: mockHandoffFindMany,
      updateMany: mockHandoffUpdateMany,
    },
  },
}));

vi.mock("../../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: mockAuthenticateAdminRequest,
}));

vi.mock("../../../app/services/shop-context.server", () => ({
  ensureShopForSession: mockEnsureShopForSession,
}));

vi.mock("../../../app/services/admin-config.server", () => ({
  getMerchantAdminConfig: mockGetMerchantAdminConfig,
}));

const SESSION = { shop: "shop.example.myshopify.com", accessToken: "mock-access-token" };
const SHOP = { id: "shop-1", domain: "shop.example.myshopify.com" };

const CONVERSATIONS = [
  {
    id: "conv-1",
    channel: "WEB_CHAT",
    status: "ACTIVE",
    locale: "es",
    sessionId: "s1",
    startedAt: new Date("2026-07-01T10:00:00Z"),
    lastMessageAt: new Date("2026-07-01T10:05:00Z"),
    messages: [{ content: "Hola", createdAt: new Date("2026-07-01T10:05:00Z") }],
    _count: { messages: 3, handoffRequests: 0 },
  },
  {
    id: "conv-2",
    channel: "WHATSAPP",
    status: "ESCALATED",
    locale: "en",
    sessionId: "s2",
    startedAt: new Date("2026-07-01T09:00:00Z"),
    lastMessageAt: null,
    messages: [],
    _count: { messages: 0, handoffRequests: 1 },
  },
];

const PENDING_HANDOFFS = [
  {
    id: "h-1",
    reason: "Customer asked for a human",
    status: "PENDING",
    createdAt: new Date("2026-07-01T10:00:00Z"),
    assignedTo: null,
    conversationId: "conv-2",
  },
];

function makePostRequest(fields: Record<string, string>) {
  return new Request("http://localhost/app/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("app.conversations loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateAdminRequest.mockResolvedValue({ session: SESSION } as any);
    mockEnsureShopForSession.mockResolvedValue(SHOP);
    mockConversationFindMany.mockResolvedValue(CONVERSATIONS);
    mockConversationCount
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);
    mockHandoffFindMany.mockResolvedValue(PENDING_HANDOFFS);
  });

  it("loads conversations with summary counts and pending handoffs", async () => {
    const { loader } = await import("../../../app/routes/app.conversations");

    const data = await loader({
      request: new Request("http://localhost/app/conversations?status=ACTIVE&limit=10"),
    } as any);

    expect(data.shop).toEqual(SHOP);
    expect(data.statusFilter).toBe("ACTIVE");
    expect(data.limit).toBe(10);
    expect(data.conversations).toHaveLength(2);
    expect(data.summary).toEqual({
      activeNow: 1,
      escalated7d: 2,
      resolved7d: 3,
      total7d: 4,
      openHandoffs: 1,
    });
    expect(data.pendingHandoffs).toHaveLength(1);
    expect(mockConversationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: "shop-1", status: "ACTIVE" },
        take: 10,
      }),
    );
  });

  it("defaults to ALL status and clamps the limit to 25", async () => {
    const { loader } = await import("../../../app/routes/app.conversations");

    const data = await loader({ request: new Request("http://localhost/app/conversations") } as any);

    expect(data.statusFilter).toBe("ALL");
    expect(data.limit).toBe(25);
    expect(mockConversationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId: "shop-1" } }),
    );
  });

  it("falls back when the status filter is not recognized", async () => {
    const { loader } = await import("../../../app/routes/app.conversations");

    const data = await loader({
      request: new Request("http://localhost/app/conversations?status=WHATEVER"),
    } as any);

    expect(data.statusFilter).toBe("ALL");
  });

  it("clamps an oversized or invalid limit", async () => {
    const { loader } = await import("../../../app/routes/app.conversations");

    const big = await loader({
      request: new Request("http://localhost/app/conversations?limit=9999"),
    } as any);
    expect(big.limit).toBe(100);

    const invalid = await loader({
      request: new Request("http://localhost/app/conversations?limit=abc"),
    } as any);
    expect(invalid.limit).toBe(25);
  });

  it("throws a 404 when the shop cannot be resolved", async () => {
    mockEnsureShopForSession.mockResolvedValue(null);

    const { loader } = await import("../../../app/routes/app.conversations");

    await expect(
      loader({ request: new Request("http://localhost/app/conversations") } as any),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("app.conversations action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateAdminRequest.mockResolvedValue({ session: SESSION } as any);
    mockEnsureShopForSession.mockResolvedValue(SHOP);
    mockGetMerchantAdminConfig.mockResolvedValue({ adminLanguage: "en", onboardingCompleted: true });
    mockHandoffUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("resolves a pending handoff", async () => {
    const { action } = await import("../../../app/routes/app.conversations");

    const result = await action({
      request: makePostRequest({ intent: "resolve_handoff", handoffId: "h-1" }),
    } as any);

    expect(result).toEqual({ ok: true, message: "Handoff marked as resolved." });
    expect(mockHandoffUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "h-1", shopId: "shop-1" }),
        data: expect.objectContaining({ status: "resolved" }),
      }),
    );
  });

  it("uses Spanish copy when the admin language is es", async () => {
    mockGetMerchantAdminConfig.mockResolvedValue({ adminLanguage: "es", onboardingCompleted: true });

    const { action } = await import("../../../app/routes/app.conversations");

    const result = await action({
      request: makePostRequest({ intent: "resolve_handoff", handoffId: "h-1" }),
    } as any);

    expect(result).toEqual({ ok: true, message: "Handoff marcado como resuelto." });
  });

  it("requires a handoffId", async () => {
    const { action } = await import("../../../app/routes/app.conversations");

    const result = await action({
      request: makePostRequest({ intent: "resolve_handoff" }),
    } as any);

    expect(result).toEqual({ ok: false, error: "handoffId is required" });
    expect(mockHandoffUpdateMany).not.toHaveBeenCalled();
  });

  it("reports when the handoff is not found or already resolved", async () => {
    mockHandoffUpdateMany.mockResolvedValue({ count: 0 });

    const { action } = await import("../../../app/routes/app.conversations");

    const result = await action({
      request: makePostRequest({ intent: "resolve_handoff", handoffId: "h-missing" }),
    } as any);

    expect(result).toEqual({ ok: false, error: "Handoff not found or already resolved" });
  });

  it("rejects unsupported intents", async () => {
    const { action } = await import("../../../app/routes/app.conversations");

    const result = await action({
      request: makePostRequest({ intent: "close" }),
    } as any);

    expect(result).toEqual({ ok: false, error: "Unsupported action" });
  });

  it("returns an error when the shop cannot be resolved", async () => {
    mockEnsureShopForSession.mockResolvedValue(null);

    const { action } = await import("../../../app/routes/app.conversations");

    const result = await action({
      request: makePostRequest({ intent: "resolve_handoff", handoffId: "h-1" }),
    } as any);

    expect(result).toEqual({ ok: false, error: "Shop not found" });
  });

  it("rejects non-POST methods", async () => {
    const { action } = await import("../../../app/routes/app.conversations");

    const result = await action({
      request: new Request("http://localhost/app/conversations", { method: "GET" }),
    } as any);

    expect(result).toEqual({ ok: false, error: "Method not allowed" });
  });
});
