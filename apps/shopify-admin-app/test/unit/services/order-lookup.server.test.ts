import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma and config before importing the service
// ---------------------------------------------------------------------------
vi.mock("../../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn(),
    },
    orderProjection: {
      findFirst: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
    },
    customerIdentity: {
      upsert: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../../../app/config.server", () => ({
  getConfig: vi.fn(() => ({
    features: { orderLookup: true },
  })),
}));

import prisma from "../../../app/db.server";
import { getConfig } from "../../../app/config.server";
import { OrderLookupService, OrderLookupError } from "../../../app/services/order-lookup.server";

// ---------------------------------------------------------------------------
// OrderLookupError
// ---------------------------------------------------------------------------
describe("OrderLookupError", () => {
  it("has name, code and statusCode properties", () => {
    const error = new OrderLookupError("ORDER_NOT_FOUND", "Order 1234 not found", 404);
    expect(error.name).toBe("OrderLookupError");
    expect(error.message).toBe("Order 1234 not found");
    expect(error.code).toBe("ORDER_NOT_FOUND");
    expect(error.statusCode).toBe(404);
    expect(error instanceof Error).toBe(true);
  });

  it("works with all defined error codes", () => {
    const codes = [
      "FEATURE_DISABLED",
      "SHOP_NOT_FOUND",
      "ORDER_NOT_FOUND",
      "CONVERSATION_NOT_FOUND",
      "VERIFICATION_REQUIRED",
      "VERIFICATION_FAILED",
    ] as const;

    for (const code of codes) {
      const err = new OrderLookupError(code, "test", 400);
      expect(err.code).toBe(code);
    }
  });
});

// ---------------------------------------------------------------------------
// OrderLookupService.isEnabled
// ---------------------------------------------------------------------------
describe("OrderLookupService.isEnabled", () => {
  it("returns true when the feature flag is on", () => {
    vi.mocked(getConfig).mockReturnValue({ features: { orderLookup: true } } as any);
    expect(OrderLookupService.isEnabled()).toBe(true);
  });

  it("returns false when the feature flag is off", () => {
    vi.mocked(getConfig).mockReturnValue({ features: { orderLookup: false } } as any);
    expect(OrderLookupService.isEnabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OrderLookupService.lookupByShopDomain
// ---------------------------------------------------------------------------
describe("OrderLookupService.lookupByShopDomain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockReturnValue({ features: { orderLookup: true } } as any);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
  });

  it("throws FEATURE_DISABLED when feature is off", async () => {
    vi.mocked(getConfig).mockReturnValue({ features: { orderLookup: false } } as any);

    await expect(
      OrderLookupService.lookupByShopDomain({
        shopDomain: "myshop.myshopify.com",
        orderRef: "#1001",
        verification: { email: "buyer@example.com" },
      }),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED", statusCode: 403 });
  });

  it("throws SHOP_NOT_FOUND when the shop does not exist", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue(null);

    await expect(
      OrderLookupService.lookupByShopDomain({
        shopDomain: "nonexistent.myshopify.com",
        orderRef: "1001",
        verification: { email: "buyer@example.com" },
      }),
    ).rejects.toMatchObject({ code: "SHOP_NOT_FOUND", statusCode: 404 });
  });

  it("normalises the shop domain to lowercase before lookup", async () => {
    vi.mocked(prisma.shop.findUnique).mockImplementation(async ({ where }: any) => {
      if (where.domain === "myshop.myshopify.com") {
        return { id: "shop-id" } as any;
      }
      return null;
    });

    vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
      id: "proj-id",
      orderId: "1001",
      orderNumber: "1001",
      email: "buyer@example.com",
      customerId: null,
      financialStatus: "paid",
      fulfillmentStatus: "fulfilled",
      totalPrice: "99.00",
      lineItems: [],
      syncedAt: new Date(),
    } as any);

    vi.mocked(prisma.customerIdentity.upsert).mockResolvedValue({} as any);

    const result = await OrderLookupService.lookupByShopDomain({
      shopDomain: "  MyShop.MyShopify.COM  ",
      orderRef: "1001",
      verification: { email: "buyer@example.com" },
    });

    expect(result.orderNumber).toBe("1001");
  });
});

// ---------------------------------------------------------------------------
// OrderLookupService.lookupByShopId
// ---------------------------------------------------------------------------
describe("OrderLookupService.lookupByShopId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockReturnValue({ features: { orderLookup: true } } as any);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
    vi.mocked(prisma.customerIdentity.upsert).mockResolvedValue({} as any);
  });

  it("throws FEATURE_DISABLED when feature is off", async () => {
    vi.mocked(getConfig).mockReturnValue({ features: { orderLookup: false } } as any);

    await expect(
      OrderLookupService.lookupByShopId({
        shopId: "shop-id",
        orderRef: "#1001",
        verification: { email: "buyer@example.com" },
      }),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });

  it("throws ORDER_NOT_FOUND when the order ref is empty", async () => {
    await expect(
      OrderLookupService.lookupByShopId({
        shopId: "shop-id",
        orderRef: "   ",
        verification: { email: "buyer@example.com" },
      }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND", statusCode: 400 });
  });

  it("throws ORDER_NOT_FOUND when no matching order exists", async () => {
    vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue(null);

    await expect(
      OrderLookupService.lookupByShopId({
        shopId: "shop-id",
        orderRef: "9999",
        verification: { email: "buyer@example.com" },
      }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND", statusCode: 404 });
  });

  it("throws VERIFICATION_REQUIRED when no verification is provided and no conversation identity", async () => {
    vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
      id: "proj-id",
      orderId: "1001",
      orderNumber: "1001",
      email: "buyer@example.com",
      customerId: null,
      financialStatus: "paid",
      fulfillmentStatus: null,
      totalPrice: "50.00",
      lineItems: [],
      syncedAt: new Date(),
    } as any);

    await expect(
      OrderLookupService.lookupByShopId({
        shopId: "shop-id",
        orderRef: "1001",
        // no verification and no conversationId
      }),
    ).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED", statusCode: 400 });
  });

  it("throws VERIFICATION_FAILED when email does not match", async () => {
    vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
      id: "proj-id",
      orderId: "1001",
      orderNumber: "1001",
      email: "correct@example.com",
      customerId: null,
      financialStatus: "paid",
      fulfillmentStatus: null,
      totalPrice: "50.00",
      lineItems: [],
      syncedAt: new Date(),
    } as any);

    await expect(
      OrderLookupService.lookupByShopId({
        shopId: "shop-id",
        orderRef: "1001",
        verification: { email: "wrong@example.com" },
      }),
    ).rejects.toMatchObject({ code: "VERIFICATION_FAILED", statusCode: 403 });
  });

  it("returns order data when email matches (case-insensitive)", async () => {
    const syncedAt = new Date();
    vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
      id: "proj-id",
      orderId: "ORD-1001",
      orderNumber: "1001",
      email: "Buyer@Example.COM",
      customerId: null,
      financialStatus: "paid",
      fulfillmentStatus: "fulfilled",
      totalPrice: "99.00",
      lineItems: [{ id: "li-1" }],
      syncedAt,
    } as any);

    const result = await OrderLookupService.lookupByShopId({
      shopId: "shop-id",
      orderRef: "1001",
      verification: { email: "buyer@example.com" },
    });

    expect(result.orderId).toBe("ORD-1001");
    expect(result.orderNumber).toBe("1001");
    expect(result.financialStatus).toBe("paid");
    expect(result.fulfillmentStatus).toBe("fulfilled");
    expect(result.totalPrice).toBe("99.00");
    expect(result.syncedAt).toBe(syncedAt);
    expect(result.verifiedBy).toBe("email");
  });

  it("returns order data when customerId matches", async () => {
    const syncedAt = new Date();
    vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
      id: "proj-id",
      orderId: "ORD-2002",
      orderNumber: "2002",
      email: null,
      customerId: "cust-abc",
      financialStatus: "pending",
      fulfillmentStatus: null,
      totalPrice: "20.00",
      lineItems: [],
      syncedAt,
    } as any);

    const result = await OrderLookupService.lookupByShopId({
      shopId: "shop-id",
      orderRef: "2002",
      verification: { customerId: "cust-abc" },
    });

    expect(result.verifiedBy).toBe("customerId");
    expect(result.orderId).toBe("ORD-2002");
  });

  it("strips the # prefix from the orderRef when searching", async () => {
    vi.mocked(prisma.orderProjection.findFirst).mockImplementation(async ({ where }: any) => {
      const ors = where.OR as Array<{ orderId?: string; orderNumber?: string }>;
      const found = ors.some(
        (clause) => clause.orderId === "1001" || clause.orderNumber === "1001",
      );
      if (!found) return null;
      return {
        id: "proj-id",
        orderId: "ORD-1001",
        orderNumber: "1001",
        email: "buyer@example.com",
        customerId: null,
        financialStatus: "paid",
        fulfillmentStatus: null,
        totalPrice: "10.00",
        lineItems: [],
        syncedAt: new Date(),
      } as any;
    });

    const result = await OrderLookupService.lookupByShopId({
      shopId: "shop-id",
      orderRef: "#1001",
      verification: { email: "buyer@example.com" },
    });

    expect(result.orderNumber).toBe("1001");
  });

  it("uses verified conversation identity when conversationId has a verified customer", async () => {
    const syncedAt = new Date();
    vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
      id: "proj-id",
      orderId: "ORD-3003",
      orderNumber: "3003",
      email: "verified@example.com",
      customerId: null,
      financialStatus: "paid",
      fulfillmentStatus: null,
      totalPrice: "30.00",
      lineItems: [],
      syncedAt,
    } as any);

    vi.mocked(prisma.conversation.findFirst).mockResolvedValue({
      id: "conv-id",
      shopId: "shop-id",
      customerIdentity: {
        verified: true,
        email: "verified@example.com",
        customerId: null,
      },
    } as any);

    const result = await OrderLookupService.lookupByShopId({
      shopId: "shop-id",
      orderRef: "3003",
      conversationId: "conv-id",
    });

    expect(result.verifiedBy).toBe("verifiedConversationIdentity");
    expect(result.orderId).toBe("ORD-3003");
  });

  it("throws CONVERSATION_NOT_FOUND when conversationId does not exist", async () => {
    vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
      id: "proj-id",
      orderId: "1001",
      orderNumber: "1001",
      email: "buyer@example.com",
      customerId: null,
      financialStatus: "paid",
      fulfillmentStatus: null,
      totalPrice: "10.00",
      lineItems: [],
      syncedAt: new Date(),
    } as any);

    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null);

    await expect(
      OrderLookupService.lookupByShopId({
        shopId: "shop-id",
        orderRef: "1001",
        conversationId: "nonexistent-conv",
      }),
    ).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND", statusCode: 404 });
  });

  it("writes an audit log on successful lookup", async () => {
    const syncedAt = new Date();
    vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
      id: "proj-id",
      orderId: "ORD-5005",
      orderNumber: "5005",
      email: "buyer@example.com",
      customerId: null,
      financialStatus: "paid",
      fulfillmentStatus: null,
      totalPrice: "55.00",
      lineItems: [],
      syncedAt,
    } as any);

    await OrderLookupService.lookupByShopId({
      shopId: "shop-id",
      orderRef: "5005",
      verification: { email: "buyer@example.com" },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ORDER_LOOKUP_SUCCEEDED",
          shopId: "shop-id",
        }),
      }),
    );
  });

  it("writes an audit log when verification fails", async () => {
    vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
      id: "proj-id",
      orderId: "ORD-6006",
      orderNumber: "6006",
      email: "real@example.com",
      customerId: null,
      financialStatus: "paid",
      fulfillmentStatus: null,
      totalPrice: "60.00",
      lineItems: [],
      syncedAt: new Date(),
    } as any);

    await expect(
      OrderLookupService.lookupByShopId({
        shopId: "shop-id",
        orderRef: "6006",
        verification: { email: "wrong@example.com" },
      }),
    ).rejects.toMatchObject({ code: "VERIFICATION_FAILED" });

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ORDER_LOOKUP_DENIED",
        }),
      }),
    );
  });
});
