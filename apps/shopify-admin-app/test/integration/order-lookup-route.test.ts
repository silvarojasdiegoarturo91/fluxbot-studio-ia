import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/db.server", () => ({
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

vi.mock("../../app/config.server", () => ({
  getConfig: vi.fn(() => ({
    features: {
      orderLookup: true,
    },
  })),
}));

vi.mock("remix-utils/cors", () => ({
  cors: vi.fn((request, response) => response),
}));

import prisma from "../../app/db.server";
import { getConfig } from "../../app/config.server";
import { action as orderLookupAction } from "../../app/routes/api.orders.lookup";

describe("Order Lookup Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getConfig).mockReturnValue({
      features: {
        orderLookup: true,
      },
    } as any);
  });

  it("returns 403 when order lookup is disabled", async () => {
    vi.mocked(getConfig).mockReturnValue({
      features: {
        orderLookup: false,
      },
    } as any);

    const request = new Request("http://localhost/api/orders/lookup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shopDomain: "test-shop.myshopify.com",
        orderRef: "1001",
        verification: { email: "customer@example.com" },
      }),
    });

    const response = await orderLookupAction({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe("FEATURE_DISABLED");
  });

  it("returns 400 when orderRef is missing", async () => {
    const request = new Request("http://localhost/api/orders/lookup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shop-Domain": "test-shop.myshopify.com",
      },
      body: JSON.stringify({
        verification: { email: "customer@example.com" },
      }),
    });

    const response = await orderLookupAction({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("orderRef is required");
  });

  it("returns order summary when email verification matches", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({ id: "shop-1" } as any);
    vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
      id: "order-proj-1",
      orderId: "gid://shopify/Order/123",
      orderNumber: "1001",
      email: "customer@example.com",
      customerId: "gid://shopify/Customer/123",
      financialStatus: "PAID",
      fulfillmentStatus: "FULFILLED",
      totalPrice: "59.99",
      lineItems: [{ title: "Premium Cotton T-Shirt", quantity: 2 }],
      syncedAt: new Date("2026-03-10T10:00:00Z"),
    } as any);

    const request = new Request("http://localhost/api/orders/lookup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shopDomain: "test-shop.myshopify.com",
        orderRef: "#1001",
        verification: { email: "customer@example.com" },
      }),
    });

    const response = await orderLookupAction({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.orderNumber).toBe("1001");
    expect(data.data.verifiedBy).toBe("email");
    expect(data.data.email).toBeUndefined();
  });

  it("reuses verified conversation identity when present", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({ id: "shop-1" } as any);
    vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
      id: "order-proj-1",
      orderId: "gid://shopify/Order/123",
      orderNumber: "1001",
      email: "customer@example.com",
      customerId: "gid://shopify/Customer/123",
      financialStatus: "PAID",
      fulfillmentStatus: "FULFILLED",
      totalPrice: "59.99",
      lineItems: [],
      syncedAt: new Date("2026-03-10T10:00:00Z"),
    } as any);
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue({
      id: "conv-1",
      shopId: "shop-1",
      customerIdentity: {
        email: "customer@example.com",
        customerId: "gid://shopify/Customer/123",
        verified: true,
      },
    } as any);

    const request = new Request("http://localhost/api/orders/lookup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shopDomain: "test-shop.myshopify.com",
        orderRef: "1001",
        conversationId: "conv-1",
      }),
    });

    const response = await orderLookupAction({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.verifiedBy).toBe("verifiedConversationIdentity");
    expect(prisma.customerIdentity.upsert).not.toHaveBeenCalled();
  });

  it("persists verified conversation identity when direct verification succeeds", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({ id: "shop-1" } as any);
    vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
      id: "order-proj-1",
      orderId: "gid://shopify/Order/123",
      orderNumber: "1001",
      email: "customer@example.com",
      customerId: null,
      financialStatus: "PAID",
      fulfillmentStatus: "FULFILLED",
      totalPrice: "59.99",
      lineItems: [],
      syncedAt: new Date("2026-03-10T10:00:00Z"),
    } as any);
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue({
      id: "conv-1",
      shopId: "shop-1",
      customerIdentity: null,
    } as any);

    const request = new Request("http://localhost/api/orders/lookup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shopDomain: "test-shop.myshopify.com",
        orderRef: "1001",
        conversationId: "conv-1",
        verification: { email: "customer@example.com" },
      }),
    });

    const response = await orderLookupAction({ request, params: {}, context: {} } as any);
    expect(response.status).toBe(200);
    expect(prisma.customerIdentity.upsert).toHaveBeenCalledWith({
      where: { conversationId: "conv-1" },
      update: {
        email: "customer@example.com",
        customerId: undefined,
        verified: true,
        verificationMethod: "email",
      },
      create: {
        conversationId: "conv-1",
        email: "customer@example.com",
        customerId: undefined,
        verified: true,
        verificationMethod: "email",
      },
    });
  });

  it("returns 403 when verification does not match the order", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({ id: "shop-1" } as any);
    vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
      id: "order-proj-1",
      orderId: "gid://shopify/Order/123",
      orderNumber: "1001",
      email: "customer@example.com",
      customerId: null,
      financialStatus: "PAID",
      fulfillmentStatus: "FULFILLED",
      totalPrice: "59.99",
      lineItems: [],
      syncedAt: new Date("2026-03-10T10:00:00Z"),
    } as any);

    const request = new Request("http://localhost/api/orders/lookup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shopDomain: "test-shop.myshopify.com",
        orderRef: "1001",
        verification: { email: "other@example.com" },
      }),
    });

    const response = await orderLookupAction({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe("VERIFICATION_FAILED");
  });
});