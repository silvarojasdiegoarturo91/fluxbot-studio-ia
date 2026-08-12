import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuthenticateWebhook } = vi.hoisted(() => ({
  mockAuthenticateWebhook: vi.fn(),
}));

const mockShopFindUnique = vi.fn();
const mockShopUpdate = vi.fn();
const mockShopDelete = vi.fn();
const mockSessionDeleteMany = vi.fn();
const mockTransaction = vi.fn();
const mockWebhookEventCreate = vi.fn();
const mockWebhookEventUpdateMany = vi.fn();
const mockOrderProjectionUpsert = vi.fn();
const mockAttributeOrder = vi.fn();
const mockInitiateDataExport = vi.fn();
const mockInitiateDataDeletion = vi.fn();
const mockExecuteDataDeletion = vi.fn();
const mockCompleteDeletionJob = vi.fn();
const mockRegisterPrivacyRequest = vi.fn();
const mockBillingWebhook = vi.fn();
const mockHandleProductUpdate = vi.fn();

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: mockShopFindUnique,
      update: mockShopUpdate,
      delete: mockShopDelete,
    },
    session: { deleteMany: mockSessionDeleteMany },
    $transaction: mockTransaction,
    webhookEvent: {
      create: mockWebhookEventCreate,
      updateMany: mockWebhookEventUpdateMany,
    },
    orderProjection: {
      upsert: mockOrderProjectionUpsert,
    },
  },
}));

vi.mock("../../../app/services/sync-service.server", () => ({
  WebhookHandlers: {
    handleProductUpdate: mockHandleProductUpdate,
    handleProductDelete: vi.fn(),
    handleCollectionUpdate: vi.fn(),
    handlePageUpdate: vi.fn(),
  },
}));

vi.mock("../../../app/services/analytics.server", () => ({
  AnalyticsService: {
    attributeOrder: mockAttributeOrder,
  },
}));

vi.mock("../../../app/services/consent-management.server", () => ({
  initiateDataExport: mockInitiateDataExport,
  initiateDataDeletion: mockInitiateDataDeletion,
  executeDataDeletion: mockExecuteDataDeletion,
  completeDeletionJob: mockCompleteDeletionJob,
}));

vi.mock("../../../app/services/ia-backend.server", () => ({
  iaClient: {
    privacy: {
      register: mockRegisterPrivacyRequest,
    },
    billing: {
      webhook: mockBillingWebhook,
    },
  },
}));

vi.mock("../../../app/shopify.server", () => ({
  authenticate: {
    webhook: mockAuthenticateWebhook,
  },
}));

function makeWebhookRequest(topic: string, payload: unknown) {
  return new Request("http://localhost/api/webhooks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": "valid",
      "X-Shopify-Topic": topic,
      "X-Shopify-Shop-Domain": "store.myshopify.com",
    },
    body: JSON.stringify(payload),
  });
}

describe("api.webhooks route — additional unit coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateWebhook.mockReset();
    mockWebhookEventCreate.mockResolvedValue({});
    mockWebhookEventUpdateMany.mockResolvedValue({ count: 1 });
    mockOrderProjectionUpsert.mockResolvedValue({});
    mockAttributeOrder.mockResolvedValue(undefined);
    mockShopFindUnique.mockResolvedValue({ id: "shop-1", domain: "store.myshopify.com" });
  });

  async function invokeAction(topic: string, payload: unknown) {
    const { action } = await import("../../../app/routes/api.webhooks");
    return action({
      request: makeWebhookRequest(topic, payload),
      params: {},
      context: {},
    } as never);
  }

  it("records a paid order and upserts the order projection", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "orders/paid",
      shop: "store.myshopify.com",
      payload: {
        id: 987654,
        order_number: 1042,
        name: "#1042",
        total_price: "59.90",
        financial_status: "paid",
        fulfillment_status: "fulfilled",
        email: "buyer@example.com",
        customer: { id: 424242 },
        line_items: [
          { id: 1, title: "Widget", quantity: 2, price: "29.95", variant_id: 5, product_id: 7 },
        ],
      },
    });

    const response = await invokeAction("orders/paid", { id: 987654 });

    expect(response.status).toBe(200);
    expect(mockAttributeOrder).toHaveBeenCalledWith("shop-1", "424242", "987654", 59.9);
    expect(mockOrderProjectionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId_orderId: { shopId: "shop-1", orderId: "987654" } },
        create: expect.objectContaining({
          orderNumber: "1042",
          customerId: "424242",
          email: "buyer@example.com",
          lineItems: expect.arrayContaining([
            expect.objectContaining({
              id: "1",
              title: "Widget",
              quantity: 2,
              productId: "7",
            }),
          ]),
        }),
      }),
    );
    expect(mockWebhookEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ topic: "orders/paid", processed: false }),
      }),
    );
  });

  it("skips order handling for zero-value or id-less orders", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "orders/fulfilled",
      shop: "store.myshopify.com",
      payload: { id: "abc", total_price: "0.00" },
    });

    const response = await invokeAction("orders/fulfilled", { id: "abc", total_price: "0.00" });

    expect(response.status).toBe(200);
    expect(mockAttributeOrder).not.toHaveBeenCalled();
    expect(mockOrderProjectionUpsert).not.toHaveBeenCalled();
  });

  it("updates shop metadata from shop/update while preserving adminSetup", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "shop/update",
      shop: "store.myshopify.com",
      payload: { id: 11, name: "Renamed Store", email: "owner@example.com" },
    });
    mockShopFindUnique
      .mockResolvedValueOnce({ id: "shop-1", domain: "store.myshopify.com" })
      .mockResolvedValueOnce({
        metadata: {
          adminSetup: { completedAt: "2026-01-01T00:00:00Z" },
          widgetPublishedAt: "2026-01-02T00:00:00Z",
          ignored: true,
        },
      });

    const response = await invokeAction("shop/update", { id: 11, name: "Renamed Store" });

    expect(response.status).toBe(200);
    const updateArgs = mockShopUpdate.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "shop-1" });
    expect(updateArgs.data.metadata).toEqual({
      id: 11,
      name: "Renamed Store",
      email: "owner@example.com",
      adminSetup: { completedAt: "2026-01-01T00:00:00Z" },
      widgetPublishedAt: "2026-01-02T00:00:00Z",
    });
  });

  it("ignores shop/update payloads without a name", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "SHOP_UPDATE",
      shop: "store.myshopify.com",
      payload: { id: 11 },
    });

    const response = await invokeAction("SHOP_UPDATE", { id: 11 });

    expect(response.status).toBe(200);
    expect(mockShopUpdate).not.toHaveBeenCalled();
  });

  it("acknowledges unhandled topics without invoking a handler", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "orders/refunded",
      shop: "store.myshopify.com",
      payload: { id: 1 },
    });

    const response = await invokeAction("orders/refunded", { id: 1 });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockHandleProductUpdate).not.toHaveBeenCalled();
    expect(mockWebhookEventUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ topic: "orders/refunded" }),
      }),
    );
  });

  it("returns 400 when webhook context is missing", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: null,
      shop: "store.myshopify.com",
      payload: {},
    });

    const response = await invokeAction("anything", {});

    expect(response.status).toBe(400);
    expect(mockShopFindUnique).not.toHaveBeenCalled();
  });

  it("swallows backend billing webhook failures and still records the plan", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "app_subscriptions/update",
      shop: "store.myshopify.com",
      payload: {
        app_subscription: {
          id: "gid://shopify/AppSubscription/321",
          name: "FluxBot Growth",
          status: "ACTIVE",
        },
      },
    });
    mockShopFindUnique
      .mockResolvedValueOnce({ id: "shop-1", domain: "store.myshopify.com" })
      .mockResolvedValueOnce({ metadata: {}, plan: "starter" });
    mockBillingWebhook.mockRejectedValue(new Error("backend exploded"));

    const response = await invokeAction("app_subscriptions/update", {
      app_subscription: { name: "FluxBot Growth" },
    });

    expect(response.status).toBe(200);
    expect(mockShopUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: "growth" }),
      }),
    );
    expect(mockBillingWebhook).toHaveBeenCalled();
  });

  it("keeps the existing plan when the subscription has no recognizable name", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "app_subscriptions/update",
      shop: "store.myshopify.com",
      payload: { app_subscription: { id: "gid://shopify/AppSubscription/999", status: "ACTIVE" } },
    });
    mockShopFindUnique
      .mockResolvedValueOnce({ id: "shop-1", domain: "store.myshopify.com" })
      .mockResolvedValueOnce({ metadata: {}, plan: "pro" });

    const response = await invokeAction("app_subscriptions/update", {
      app_subscription: { id: "gid://shopify/AppSubscription/999" },
    });

    expect(response.status).toBe(200);
    expect(mockShopUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: "pro" }),
      }),
    );
  });

  it("fails customers/data_request webhooks that carry no customer id", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "customers/data_request",
      shop: "store.myshopify.com",
      payload: { customer: {} },
    });

    const response = await invokeAction("customers/data_request", { customer: {} });

    expect(response.status).toBe(500);
    expect(mockInitiateDataExport).not.toHaveBeenCalled();
    expect(mockRegisterPrivacyRequest).not.toHaveBeenCalled();
  });

  it("fails customers/redact webhooks that carry no customer id", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "customers/redact",
      shop: "store.myshopify.com",
      payload: { customer: {} },
    });
    mockShopFindUnique.mockResolvedValueOnce({ id: "shop-1", domain: "store.myshopify.com" });

    const response = await invokeAction("customers/redact", {
      customer: {},
    });

    expect(response.status).toBe(500);
    expect(mockInitiateDataDeletion).not.toHaveBeenCalled();
  });

  it("records a customer data request with a numeric customer id", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "customers/data_request",
      shop: "store.myshopify.com",
      payload: { customer: { id: 777 } },
    });
    mockInitiateDataExport.mockResolvedValue({ id: "export-2" });

    const response = await invokeAction("customers/data_request", { customer: { id: 777 } });

    expect(response.status).toBe(200);
    expect(mockRegisterPrivacyRequest).toHaveBeenCalledWith(
      { operation: "CUSTOMER_DATA_REQUEST", customerId: "777" },
      "store.myshopify.com",
    );
    expect(mockInitiateDataExport).toHaveBeenCalledWith("shop-1");
  });
});
