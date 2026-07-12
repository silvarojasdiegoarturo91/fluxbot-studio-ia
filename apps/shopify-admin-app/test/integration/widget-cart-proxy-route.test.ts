import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrepareAddToCart = vi.fn();
const mockCommitAddToCart = vi.fn();
const mockVerifyProxy = vi.fn();

vi.mock("../../app/services/commerce-actions.server", () => ({
  CommerceActionsService: {
    prepareAddToCart: (...args: unknown[]) => mockPrepareAddToCart(...args),
    commitAddToCart: (...args: unknown[]) => mockCommitAddToCart(...args),
  },
}));

vi.mock("../../app/services/shopify-proxy-auth.server", () => ({
  verifyShopifyProxyRequest: (...args: unknown[]) => mockVerifyProxy(...args),
}));

describe("apps.fluxbot.cart.add proxy route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyProxy.mockReturnValue(true);
    mockPrepareAddToCart.mockResolvedValue({
      variantId: "2001",
      productRef: "snow-shield-casco",
      productHandle: "snow-shield-casco",
      quantity: 1,
      cartUrl: "https://shop.myshopify.com/cart/2001:1",
    });
  });

  it("resolves variant data without committing cart server-side", async () => {
    const { action } = await import("../../app/routes/apps.fluxbot.cart.add");
    const request = new Request(
      "http://localhost/apps/fluxbot/cart/add?shop=quickstart-c8cc9986.myshopify.com",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productRef: "snow-shield-casco",
          quantity: 1,
          commit: true,
          conversationId: "conv-1",
          sessionId: "sess-1",
        }),
      },
    );

    const response = await action({ request, params: {}, context: {} } as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      data: {
        variantId: "2001",
        productRef: "snow-shield-casco",
        productHandle: "snow-shield-casco",
        quantity: 1,
        cartUrl: "https://shop.myshopify.com/cart/2001:1",
      },
    });
    expect(mockPrepareAddToCart).toHaveBeenCalledTimes(1);
    expect(mockCommitAddToCart).not.toHaveBeenCalled();
  });

  it("returns a controlled 422 when no available variant can be resolved", async () => {
    mockPrepareAddToCart.mockRejectedValue(
      new Error("Could not resolve product variant for add-to-cart"),
    );

    const { action } = await import("../../app/routes/apps.fluxbot.cart.add");
    const request = new Request(
      "http://localhost/apps/fluxbot/cart/add?shop=quickstart-c8cc9986.myshopify.com",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productRef: "missing-product" }),
      },
    );

    const response = await action({ request, params: {}, context: {} } as never);
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data).toEqual({
      success: false,
      error: "Unable to resolve an available variant for this product",
    });
    expect(mockCommitAddToCart).not.toHaveBeenCalled();
  });
});
