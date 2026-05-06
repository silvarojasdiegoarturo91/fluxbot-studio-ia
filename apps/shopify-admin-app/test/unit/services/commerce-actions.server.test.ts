import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma before importing the service
// ---------------------------------------------------------------------------
vi.mock("../../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn(),
    },
    productProjection: {
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import prisma from "../../../app/db.server";
import { CommerceActionsService } from "../../../app/services/commerce-actions.server";

// ---------------------------------------------------------------------------
// prepareAddToCart
// ---------------------------------------------------------------------------
describe("CommerceActionsService.prepareAddToCart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    // audit log never throws
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
  });

  it("throws when the shop is not found", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue(null);

    await expect(
      CommerceActionsService.prepareAddToCart({
        shopDomain: "unknown.myshopify.com",
        productRef: "123",
      }),
    ).rejects.toThrow("Shop not found");
  });

  it("resolves the variant from an explicit variantId", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      id: "shop-id",
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid",
    } as any);

    const result = await CommerceActionsService.prepareAddToCart({
      shopDomain: "myshop.myshopify.com",
      variantId: "42",
      quantity: 2,
    });

    expect(result.variantId).toBe("42");
    expect(result.quantity).toBe(2);
    expect(result.cartUrl).toBe("https://myshop.myshopify.com/cart/42:2");
    expect(result.checkoutUrl).toBe("https://myshop.myshopify.com/cart/42:2?checkout");
    expect(result.addEndpoint).toBe("https://myshop.myshopify.com/cart/add.js");
    expect(result.shopId).toBe("shop-id");
    expect(result.shopDomain).toBe("myshop.myshopify.com");
  });

  it("resolves variant from a GID variantId", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      id: "shop-id",
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid",
    } as any);

    const result = await CommerceActionsService.prepareAddToCart({
      shopDomain: "myshop.myshopify.com",
      variantId: "gid://shopify/ProductVariant/99",
    });

    expect(result.variantId).toBe("99");
  });

  it("clamps quantity to 1 when zero is provided", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      id: "shop-id",
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid",
    } as any);

    const result = await CommerceActionsService.prepareAddToCart({
      shopDomain: "myshop.myshopify.com",
      variantId: "10",
      quantity: 0,
    });

    expect(result.quantity).toBe(1);
  });

  it("clamps quantity to 20 when a value above MAX is provided", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      id: "shop-id",
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid",
    } as any);

    const result = await CommerceActionsService.prepareAddToCart({
      shopDomain: "myshop.myshopify.com",
      variantId: "10",
      quantity: 999,
    });

    expect(result.quantity).toBe(20);
  });

  it("resolves variant from product projection when no explicit variantId", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      id: "shop-id",
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid",
    } as any);

    vi.mocked(prisma.productProjection.findFirst).mockResolvedValue({
      productId: "100",
      handle: "cool-shirt",
      variants: [{ id: "gid://shopify/ProductVariant/55" }],
    } as any);

    const result = await CommerceActionsService.prepareAddToCart({
      shopDomain: "myshop.myshopify.com",
      productRef: "cool-shirt",
    });

    expect(result.variantId).toBe("55");
    expect(result.productHandle).toBe("cool-shirt");
    expect(result.cartUrl).toContain("/cart/55:1");
  });

  it("falls back to Shopify Admin API when the projection doesn't exist", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      id: "shop-id",
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid",
    } as any);

    vi.mocked(prisma.productProjection.findFirst).mockResolvedValue(null);

    // Simulate Shopify returning a product with variants
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          product: {
            handle: "awesome-product",
            variants: {
              nodes: [{ id: "gid://shopify/ProductVariant/77", legacyResourceId: "77" }],
            },
          },
        },
      }),
    });

    const result = await CommerceActionsService.prepareAddToCart({
      shopDomain: "myshop.myshopify.com",
      productRef: "gid://shopify/Product/1",
    });

    expect(result.variantId).toBe("77");
    expect(result.productHandle).toBe("awesome-product");
  });

  it("throws when the variant cannot be resolved", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      id: "shop-id",
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid",
    } as any);

    vi.mocked(prisma.productProjection.findFirst).mockResolvedValue(null);

    // Shopify Admin API returns no product
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { product: null } }),
    });

    await expect(
      CommerceActionsService.prepareAddToCart({
        shopDomain: "myshop.myshopify.com",
        productRef: "nonexistent-product",
      }),
    ).rejects.toThrow("Could not resolve product variant for add-to-cart");
  });

  it("throws when neither productRef nor variantId is provided", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      id: "shop-id",
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid",
    } as any);

    vi.mocked(prisma.productProjection.findFirst).mockResolvedValue(null);

    await expect(
      CommerceActionsService.prepareAddToCart({
        shopDomain: "myshop.myshopify.com",
      }),
    ).rejects.toThrow("Could not resolve product variant for add-to-cart");
  });

  it("normalises the shop domain to lowercase", async () => {
    vi.mocked(prisma.shop.findUnique).mockImplementation(async ({ where }: any) => {
      if (where.domain === "myshop.myshopify.com") {
        return { id: "shop-id", domain: "myshop.myshopify.com", accessToken: "shpat_valid" } as any;
      }
      return null;
    });

    const result = await CommerceActionsService.prepareAddToCart({
      shopDomain: "  MyShop.MyShopify.COM  ",
      variantId: "5",
    });

    expect(result.shopDomain).toBe("myshop.myshopify.com");
  });
});

// ---------------------------------------------------------------------------
// prepareAddToCartByShopId
// ---------------------------------------------------------------------------
describe("CommerceActionsService.prepareAddToCartByShopId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
  });

  it("throws when shop domain is not found by shopId", async () => {
    // First call returns the shop by id (domain lookup), second returns null (domain lookup in prepareAddToCart)
    vi.mocked(prisma.shop.findUnique)
      .mockResolvedValueOnce(null); // shop by id not found

    await expect(
      CommerceActionsService.prepareAddToCartByShopId({
        shopId: "nonexistent-id",
        variantId: "5",
      }),
    ).rejects.toThrow("Shop domain not found");
  });

  it("delegates to prepareAddToCart with resolved domain", async () => {
    vi.mocked(prisma.shop.findUnique)
      .mockResolvedValueOnce({ domain: "myshop.myshopify.com" } as any) // by id
      .mockResolvedValueOnce({
        id: "shop-id",
        domain: "myshop.myshopify.com",
        accessToken: "shpat_valid",
      } as any); // by domain

    const result = await CommerceActionsService.prepareAddToCartByShopId({
      shopId: "shop-id",
      variantId: "99",
      quantity: 3,
    });

    expect(result.variantId).toBe("99");
    expect(result.quantity).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// commitAddToCart
// ---------------------------------------------------------------------------
describe("CommerceActionsService.commitAddToCart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
  });

  it("commits the cart and returns committed: true with lineItem", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      id: "shop-id",
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid",
    } as any);

    // First fetch is from Shopify Admin API (falling through from the projection path)
    // We skip projection by providing an explicit variantId → no extra fetch
    const lineItemResponse = { id: 42, title: "Cool Shirt", quantity: 1 };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => lineItemResponse,
    });

    const result = await CommerceActionsService.commitAddToCart({
      shopDomain: "myshop.myshopify.com",
      variantId: "42",
      quantity: 1,
    });

    expect(result.committed).toBe(true);
    expect(result.lineItem).toEqual(lineItemResponse);
    expect(result.variantId).toBe("42");
  });

  it("throws when the cart API returns a non-ok response", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      id: "shop-id",
      domain: "myshop.myshopify.com",
      accessToken: "shpat_valid",
    } as any);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 422,
    });

    await expect(
      CommerceActionsService.commitAddToCart({
        shopDomain: "myshop.myshopify.com",
        variantId: "42",
      }),
    ).rejects.toThrow("Cart API request failed with status 422");
  });
});
