import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuthenticate, mockEnsureShop, mockGetMessageStats, mockGetChannelStats, mockGetTopTriggers } =
  vi.hoisted(() => ({
    mockAuthenticate: vi.fn(),
    mockEnsureShop: vi.fn(),
    mockGetMessageStats: vi.fn(),
    mockGetChannelStats: vi.fn(),
    mockGetTopTriggers: vi.fn(),
  }));

vi.mock("../../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: mockAuthenticate,
}));

vi.mock("../../../app/services/shop-context.server", () => ({
  ensureShopForSession: mockEnsureShop,
}));

vi.mock("../../../app/services/proactive-messaging.server", () => ({
  ProactiveMessagingService: {
    getMessageStats: mockGetMessageStats,
    getChannelStats: mockGetChannelStats,
    getTopTriggers: mockGetTopTriggers,
  },
}));

import { loader } from "../../../app/routes/api.stats.messages";

describe("api.stats.messages — loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ session: { shop: "shop.myshopify.com" } });
    mockEnsureShop.mockResolvedValue({ id: "shop-1" });
    mockGetMessageStats.mockResolvedValue({ total: 10, delivered: 8, failed: 2 });
    mockGetChannelStats.mockResolvedValue(new Map([["WEB_CHAT", { sent: 5 }]]));
    mockGetTopTriggers.mockResolvedValue([{ triggerId: "t1", count: 3 }]);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns aggregated message statistics", async () => {
    const request = new Request("http://localhost/api/stats/messages?timeWindowMinutes=30");
    const response = await loader({ request } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.overall).toEqual({ total: 10, delivered: 8, failed: 2 });
    expect(body.data.channels).toEqual([{ sent: 5 }]);
    expect(body.data.topTriggers).toEqual([{ triggerId: "t1", count: 3 }]);
    expect(body.data.timeWindowMinutes).toBe(30);
    expect(body.data.generatedAt).toBeTruthy();
    expect(mockGetMessageStats).toHaveBeenCalledWith("shop-1", 30 * 60 * 1000);
    expect(mockGetTopTriggers).toHaveBeenCalledWith("shop-1", 10, 30 * 60 * 1000);
  });

  it("defaults the time window to 60 minutes", async () => {
    const request = new Request("http://localhost/api/stats/messages");
    const response = await loader({ request } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.timeWindowMinutes).toBe(60);
    expect(mockGetMessageStats).toHaveBeenCalledWith("shop-1", 60 * 60 * 1000);
  });

  it("returns 404 when the shop is not found", async () => {
    mockEnsureShop.mockResolvedValue(null);
    const request = new Request("http://localhost/api/stats/messages");
    const response = await loader({ request } as never);

    expect(response.status).toBe(404);
  });

  it("returns 500 when stats retrieval fails", async () => {
    mockGetMessageStats.mockRejectedValue(new Error("db down"));
    const request = new Request("http://localhost/api/stats/messages");
    const response = await loader({ request } as never);

    expect(response.status).toBe(500);
  });

  it("re-throws Response errors from authentication", async () => {
    mockAuthenticate.mockRejectedValue(new Response(null, { status: 302 }));
    const request = new Request("http://localhost/api/stats/messages");

    await expect(loader({ request } as never)).rejects.toMatchObject({ status: 302 });
  });
});
