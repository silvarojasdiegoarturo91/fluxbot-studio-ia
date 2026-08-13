import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerify, mockPrepareAddToCart } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockPrepareAddToCart: vi.fn(),
}));

vi.mock("../../../app/services/shopify-proxy-auth.server", () => ({
  verifyShopifyProxyRequest: mockVerify,
}));

vi.mock("../../../app/services/commerce-actions.server", () => ({
  CommerceActionsService: {
    prepareAddToCart: mockPrepareAddToCart,
  },
}));

import { action } from "../../../app/routes/api.cart.add";

function makeRequest(body: unknown, method = "POST") {
  const init: RequestInit = { method };
  if (body !== null && method !== "GET" && method !== "HEAD") {
    init.headers = { "content-type": "application/json" };
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request("http://localhost/api/cart/add", init);
}

async function bodyJson(response: Response) {
  return response.json();
}

describe("api.cart.add", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReturnValue(true);
    mockPrepareAddToCart.mockResolvedValue({ url: "https://checkout.example/cart/123" });
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const response = await action({ request: makeRequest(null, "OPTIONS") } as never);
    expect(response.status).toBe(204);
  });

  it("returns 405 for non-POST methods", async () => {
    const response = await action({ request: makeRequest(null, "GET") } as never);
    expect(response.status).toBe(405);
  });

  it("returns 401 when the proxy request is not verified", async () => {
    mockVerify.mockReturnValue(false);
    const response = await action({ request: makeRequest({ shopDomain: "shop" }) } as never);
    expect(response.status).toBe(401);
  });

  it("returns 400 when shopDomain is missing", async () => {
    const response = await action({ request: makeRequest({ productRef: "p1" }) } as never);
    expect(response.status).toBe(400);
    const body = await bodyJson(response);
    expect(body.error).toBe("shopDomain is required");
  });

  it("returns 400 when neither productRef nor variantId is provided", async () => {
    const response = await action({ request: makeRequest({ shopDomain: "shop" }) } as never);
    expect(response.status).toBe(400);
    const body = await bodyJson(response);
    expect(body.error).toContain("productRef or variantId");
  });

  it("rejects server-side commit", async () => {
    const response = await action({
      request: makeRequest({ shopDomain: "shop", productRef: "p1", commit: true }),
    } as never);
    expect(response.status).toBe(400);
    const body = await bodyJson(response);
    expect(body.error).toContain("not supported");
  });

  it("prepares an add-to-cart link and returns it", async () => {
    const response = await action({
      request: makeRequest({
        shopDomain: "shop.myshopify.com",
        variantId: "vid-1",
        quantity: 2,
        conversationId: "c1",
        sessionId: "s1",
      }),
    } as never);

    expect(response.status).toBe(200);
    const body = await bodyJson(response);
    expect(body.success).toBe(true);
    expect(body.committed).toBe(false);
    expect(body.data).toEqual({ url: "https://checkout.example/cart/123" });
    expect(mockPrepareAddToCart).toHaveBeenCalledWith(
      expect.objectContaining({
        shopDomain: "shop.myshopify.com",
        variantId: "vid-1",
        quantity: 2,
        conversationId: "c1",
        sessionId: "s1",
        source: "api",
      }),
    );
  });

  it("returns 500 when preparation fails", async () => {
    mockPrepareAddToCart.mockRejectedValue(new Error("variant not found"));
    const response = await action({
      request: makeRequest({ shopDomain: "shop", productRef: "p1" }),
    } as never);
    expect(response.status).toBe(500);
    const body = await bodyJson(response);
    expect(body.error).toBe("variant not found");
  });
});
