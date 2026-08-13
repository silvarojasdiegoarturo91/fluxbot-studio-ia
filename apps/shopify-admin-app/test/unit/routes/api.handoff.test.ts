import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerify, mockFindUnique, mockListByShop, mockIsEnabled, mockCreate, mockUpdate } =
  vi.hoisted(() => ({
    mockVerify: vi.fn(),
    mockFindUnique: vi.fn(),
    mockListByShop: vi.fn(),
    mockIsEnabled: vi.fn(),
    mockCreate: vi.fn(),
    mockUpdate: vi.fn(),
  }));

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: { findUnique: mockFindUnique },
  },
}));

vi.mock("../../../app/services/shopify-proxy-auth.server", () => ({
  verifyShopifyProxyRequest: mockVerify,
}));

vi.mock("../../../app/services/handoff.server", () => ({
  HandoffService: {
    listByShop: mockListByShop,
    isEnabled: mockIsEnabled,
    create: mockCreate,
    update: mockUpdate,
  },
}));

import { action, loader } from "../../../app/routes/api.handoff";

function makeRequest(body: unknown, method = "POST", headers: Record<string, string> = {}) {
  const init: RequestInit = {
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  };
  if (body !== null && method !== "GET" && method !== "HEAD") {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request("http://localhost/api/handoff", init);
}

async function responseJson(response: Response) {
  return response.json();
}

describe("api.handoff — loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReturnValue(true);
  });

  it("returns 400 when shopDomain is missing", async () => {
    const request = new Request("http://localhost/api/handoff");
    const response = await loader({ request } as never);

    expect(response.status).toBe(400);
    const body = await responseJson(response);
    expect(body.error).toBe("shopDomain is required");
  });

  it("returns 401 when the proxy request is not verified", async () => {
    mockVerify.mockReturnValue(false);
    const request = makeRequest(null, "GET", { "X-Shop-Domain": "shop.myshopify.com" });

    const response = await loader({ request } as never);

    expect(response.status).toBe(401);
    const body = await responseJson(response);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when the shop is unknown", async () => {
    mockFindUnique.mockResolvedValue(null);
    const request = makeRequest(null, "GET", { "X-Shop-Domain": "nope.myshopify.com" });

    const response = await loader({ request } as never);

    expect(response.status).toBe(404);
  });

  it("lists handoffs for the resolved shop", async () => {
    mockFindUnique.mockResolvedValue({ id: "shop-1" });
    mockListByShop.mockResolvedValue([{ id: "h1" }]);
    const request = makeRequest(null, "GET", { "X-Shop-Domain": "shop.myshopify.com" });

    const response = await loader({ request } as never);

    expect(response.status).toBe(200);
    const body = await responseJson(response);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ id: "h1" }]);
    expect(body.count).toBe(1);
    expect(mockListByShop).toHaveBeenCalledWith("shop-1", 50);
  });
});

describe("api.handoff — action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReturnValue(true);
    mockIsEnabled.mockReturnValue(true);
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const response = await action({ request: makeRequest(null, "OPTIONS") } as never);
    expect(response.status).toBe(204);
  });

  it("returns 401 when the proxy request is not verified", async () => {
    mockVerify.mockReturnValue(false);
    const response = await action({
      request: makeRequest({ shopDomain: "shop.myshopify.com" }),
    } as never);

    expect(response.status).toBe(401);
  });

  it("returns 403 when the handoff feature is disabled", async () => {
    mockIsEnabled.mockReturnValue(false);
    const response = await action({
      request: makeRequest({ shopDomain: "shop.myshopify.com" }),
    } as never);

    expect(response.status).toBe(403);
    const body = await responseJson(response);
    expect(body.error).toContain("disabled");
  });

  it("returns 400 when shopDomain is missing from body", async () => {
    const response = await action({ request: makeRequest({ conversationId: "c1" }) } as never);
    expect(response.status).toBe(400);
  });

  it("returns 404 when the shop is unknown", async () => {
    mockFindUnique.mockResolvedValue(null);
    const response = await action({
      request: makeRequest({ shopDomain: "nope.myshopify.com" }),
    } as never);

    expect(response.status).toBe(404);
  });

  it("returns 400 when conversationId is missing on POST", async () => {
    mockFindUnique.mockResolvedValue({ id: "shop-1" });
    const response = await action({
      request: makeRequest({ shopDomain: "shop.myshopify.com" }),
    } as never);

    expect(response.status).toBe(400);
  });

  it("returns 400 when reason is missing on POST", async () => {
    mockFindUnique.mockResolvedValue({ id: "shop-1" });
    const response = await action({
      request: makeRequest({ shopDomain: "shop.myshopify.com", conversationId: "c1" }),
    } as never);

    expect(response.status).toBe(400);
  });

  it("creates a handoff on POST", async () => {
    mockFindUnique.mockResolvedValue({ id: "shop-1" });
    const created = { id: "handoff-1" };
    mockCreate.mockResolvedValue(created);

    const response = await action({
      request: makeRequest({
        shopDomain: "shop.myshopify.com",
        conversationId: "c1",
        reason: "low confidence",
        context: { page: "/x" },
        assignedTo: "agent@fluxbot.com",
      }),
    } as never);

    expect(response.status).toBe(200);
    const body = await responseJson(response);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(created);
    expect(mockCreate).toHaveBeenCalledWith({
      shopId: "shop-1",
      conversationId: "c1",
      reason: "low confidence",
      context: { page: "/x" },
      assignedTo: "agent@fluxbot.com",
      agentNotes: undefined,
    });
  });

  it("returns 400 when handoffId is missing on PATCH", async () => {
    mockFindUnique.mockResolvedValue({ id: "shop-1" });
    const response = await action({
      request: makeRequest({ shopDomain: "shop.myshopify.com", status: "completed" }, "PATCH"),
    } as never);

    expect(response.status).toBe(400);
  });

  it("updates a handoff on PATCH", async () => {
    mockFindUnique.mockResolvedValue({ id: "shop-1" });
    const updated = { id: "handoff-1", status: "completed" };
    mockUpdate.mockResolvedValue(updated);

    const response = await action({
      request: makeRequest(
        {
          shopDomain: "shop.myshopify.com",
          handoffId: "handoff-1",
          status: "completed",
          agentNotes: "done",
        },
        "PATCH",
      ),
    } as never);

    expect(response.status).toBe(200);
    const body = await responseJson(response);
    expect(body.data).toEqual(updated);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        handoffId: "handoff-1",
        shopId: "shop-1",
        status: "completed",
        agentNotes: "done",
      }),
    );
  });

  it("returns 405 for unsupported methods", async () => {
    mockFindUnique.mockResolvedValue({ id: "shop-1" });
    const response = await action({
      request: makeRequest({ shopDomain: "shop.myshopify.com" }, "DELETE"),
    } as never);

    expect(response.status).toBe(405);
  });

  it("returns 500 when an unexpected error is thrown", async () => {
    mockFindUnique.mockRejectedValue(new Error("db down"));
    const response = await action({
      request: makeRequest({ shopDomain: "shop.myshopify.com", conversationId: "c1", reason: "r" }),
    } as never);

    expect(response.status).toBe(500);
    const body = await responseJson(response);
    expect(body.error).toBe("db down");
  });
});
