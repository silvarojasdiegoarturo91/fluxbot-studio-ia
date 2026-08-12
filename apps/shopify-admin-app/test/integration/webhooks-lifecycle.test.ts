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
const mockInitiateDataExport = vi.fn();
const mockInitiateDataDeletion = vi.fn();
const mockExecuteDataDeletion = vi.fn();
const mockCompleteDeletionJob = vi.fn();
const mockRegisterPrivacyRequest = vi.fn();
const mockBillingWebhook = vi.fn();

vi.mock("../../app/db.server", () => ({
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

vi.mock("../../app/services/sync-service.server", () => ({
  WebhookHandlers: {
    handleProductUpdate: vi.fn(),
    handleProductDelete: vi.fn(),
    handleCollectionUpdate: vi.fn(),
    handlePageUpdate: vi.fn(),
  },
}));

vi.mock("../../app/services/analytics.server", () => ({
  AnalyticsService: {
    attributeOrder: vi.fn(),
  },
}));

vi.mock("../../app/services/consent-management.server", () => ({
  initiateDataExport: mockInitiateDataExport,
  initiateDataDeletion: mockInitiateDataDeletion,
  executeDataDeletion: mockExecuteDataDeletion,
  completeDeletionJob: mockCompleteDeletionJob,
}));

vi.mock("../../app/services/ia-backend.server", () => ({
  iaClient: {
    privacy: {
      register: mockRegisterPrivacyRequest,
    },
    billing: {
      webhook: mockBillingWebhook,
    },
  },
}));

vi.mock("../../app/shopify.server", () => ({
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

describe("api.webhooks lifecycle behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateWebhook.mockReset();
    mockWebhookEventCreate.mockResolvedValue({});
    mockWebhookEventUpdateMany.mockResolvedValue({ count: 1 });
    mockOrderProjectionUpsert.mockResolvedValue({});
    mockInitiateDataExport.mockResolvedValue({ id: "export-job-1" });
    mockInitiateDataDeletion.mockResolvedValue({ id: "deletion-job-1" });
    mockExecuteDataDeletion.mockResolvedValue(3);
    mockCompleteDeletionJob.mockResolvedValue({});
    mockRegisterPrivacyRequest.mockResolvedValue({ status: "ACCEPTED" });
    mockShopUpdate.mockResolvedValue({ id: "shop-1" });
    mockBillingWebhook.mockResolvedValue({ status: "ok" });
  });

  it("redacts all tenant data when the app is uninstalled", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "app/uninstalled",
      shop: "store.myshopify.com",
      payload: { id: "evt-1" },
    });
    mockShopFindUnique.mockResolvedValue({ id: "shop-1", domain: "store.myshopify.com" });
    mockSessionDeleteMany.mockResolvedValue({ count: 1 });
    mockShopDelete.mockResolvedValue({ id: "shop-1" });
    mockTransaction.mockResolvedValue([{ count: 1 }, { id: "shop-1" }]);

    const { action } = await import("../../app/routes/api.webhooks");
    const response = await action({
      request: makeWebhookRequest("app/uninstalled", { id: "evt-1" }),
      params: {},
      context: {},
    } as never);

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockRegisterPrivacyRequest).toHaveBeenCalledWith(
      { operation: "SHOP_REDACT" },
      "store.myshopify.com",
    );
    expect(mockSessionDeleteMany).toHaveBeenCalledWith({ where: { shop: "store.myshopify.com" } });
    expect(mockShopDelete).toHaveBeenCalledWith({ where: { id: "shop-1" } });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("rejects unsigned webhook requests", async () => {
    mockAuthenticateWebhook.mockRejectedValue(new Response("Invalid signature", { status: 401 }));
    const { action } = await import("../../app/routes/api.webhooks");
    const response = await action({
      request: new Request("http://localhost/api/webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Topic": "app/uninstalled",
          "X-Shopify-Shop-Domain": "store.myshopify.com",
        },
        body: JSON.stringify({}),
      }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(401);
    expect(mockShopFindUnique).not.toHaveBeenCalled();
  });

  it("queues customer data export requests from Shopify's mandatory webhook", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "customers/data_request",
      shop: "store.myshopify.com",
      payload: { customer: { id: 123 } },
    });
    mockShopFindUnique.mockResolvedValue({ id: "shop-1", domain: "store.myshopify.com" });

    const { action } = await import("../../app/routes/api.webhooks");
    const response = await action({
      request: makeWebhookRequest("customers/data_request", { customer: { id: 123 } }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    expect(mockInitiateDataExport).toHaveBeenCalledWith("shop-1");
    expect(mockRegisterPrivacyRequest).toHaveBeenCalledWith(
      { operation: "CUSTOMER_DATA_REQUEST", customerId: "123" },
      "store.myshopify.com",
    );
  });

  it("acknowledges a verified privacy webhook when Shopify has no local shop record", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "customers/redact",
      shop: "review-shop.myshopify.com",
      payload: { customer: { id: 123 } },
    });
    mockShopFindUnique.mockResolvedValue(null);

    const { action } = await import("../../app/routes/api.webhooks");
    const response = await action({
      request: makeWebhookRequest("customers/redact", { customer: { id: 123 } }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mockInitiateDataDeletion).not.toHaveBeenCalled();
    expect(mockExecuteDataDeletion).not.toHaveBeenCalled();
    expect(mockRegisterPrivacyRequest).toHaveBeenCalledWith(
      { operation: "CUSTOMER_REDACT", customerId: "123" },
      "review-shop.myshopify.com",
    );
  });

  it("redacts the requested customer's data", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "customers/redact",
      shop: "store.myshopify.com",
      payload: { customer: { id: 123 } },
    });
    mockShopFindUnique.mockResolvedValue({ id: "shop-1", domain: "store.myshopify.com" });

    const { action } = await import("../../app/routes/api.webhooks");
    const response = await action({
      request: makeWebhookRequest("customers/redact", { customer: { id: 123 } }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    expect(mockInitiateDataDeletion).toHaveBeenCalledWith("shop-1", "123");
    expect(mockExecuteDataDeletion).toHaveBeenCalledWith("shop-1", "123");
    expect(mockCompleteDeletionJob).toHaveBeenCalledWith("deletion-job-1", 3);
    expect(mockRegisterPrivacyRequest).toHaveBeenCalledWith(
      { operation: "CUSTOMER_REDACT", customerId: "123" },
      "store.myshopify.com",
    );
  });

  it("redacts shop data after Shopify requests shop redaction", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "shop/redact",
      shop: "store.myshopify.com",
      payload: { shop_id: 456 },
    });
    mockShopFindUnique.mockResolvedValue({ id: "shop-1", domain: "store.myshopify.com" });

    const { action } = await import("../../app/routes/api.webhooks");
    const response = await action({
      request: makeWebhookRequest("shop/redact", { shop_id: 456 }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    expect(mockInitiateDataDeletion).toHaveBeenCalledWith("shop-1");
    expect(mockExecuteDataDeletion).toHaveBeenCalledWith("shop-1");
    expect(mockCompleteDeletionJob).toHaveBeenCalledWith("deletion-job-1", 3);
    expect(mockRegisterPrivacyRequest).toHaveBeenCalledWith(
      { operation: "SHOP_REDACT" },
      "store.myshopify.com",
    );
  });

  it("maps the nested app_subscription name to the normalized plan and notifies the backend", async () => {
    const subscriptionPayload = {
      app_subscription: {
        id: "gid://shopify/AppSubscription/123",
        name: "FluxBot Starter",
        status: "ACTIVE",
        test: true,
        currentPeriodEnd: "2026-09-12T00:00:00Z",
      },
    };
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "app_subscriptions/update",
      shop: "store.myshopify.com",
      payload: subscriptionPayload,
    });
    mockShopFindUnique
      .mockResolvedValueOnce({ id: "shop-1", domain: "store.myshopify.com" })
      .mockResolvedValueOnce({ metadata: { billing: { previous: true } }, plan: "growth" });

    const { action } = await import("../../app/routes/api.webhooks");
    const response = await action({
      request: makeWebhookRequest("app_subscriptions/update", subscriptionPayload),
      params: {},
      context: {},
    } as never);

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });

    const updateArgs = mockShopUpdate.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "shop-1" });
    expect(updateArgs.data.plan).toBe("starter");
    const nextMetadata = updateArgs.data.metadata;
    expect(nextMetadata.billing.subscription).toEqual(subscriptionPayload);
    expect(nextMetadata.billing.previous).toBe(true);
    expect(mockBillingWebhook).toHaveBeenCalledWith(
      subscriptionPayload,
      "store.myshopify.com",
    );
  });

  it("keeps the existing plan when the subscription name is not a known plan", async () => {
    const subscriptionPayload = {
      app_subscription: {
        id: "gid://shopify/AppSubscription/456",
        name: "Custom Enterprise Deal",
        status: "ACTIVE",
      },
    };
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      shop: "store.myshopify.com",
      payload: subscriptionPayload,
    });
    mockShopFindUnique
      .mockResolvedValueOnce({ id: "shop-1", domain: "store.myshopify.com" })
      .mockResolvedValueOnce({ metadata: {}, plan: "pro" });

    const { action } = await import("../../app/routes/api.webhooks");
    const response = await action({
      request: makeWebhookRequest("APP_SUBSCRIPTIONS_UPDATE", subscriptionPayload),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    expect(mockShopUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: "pro" }),
      }),
    );
  });

  it("handles a flat legacy app_subscriptions/update payload without the nested shape", async () => {
    const flatPayload = { id: "sub-flat", name: "FluxBot Growth", status: "ACTIVE" };
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "app_subscriptions/update",
      shop: "store.myshopify.com",
      payload: flatPayload,
    });
    mockShopFindUnique
      .mockResolvedValueOnce({ id: "shop-1", domain: "store.myshopify.com" })
      .mockResolvedValueOnce({ metadata: {}, plan: "starter" });

    const { action } = await import("../../app/routes/api.webhooks");
    const response = await action({
      request: makeWebhookRequest("app_subscriptions/update", flatPayload),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    expect(mockShopUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: "growth" }),
      }),
    );
    // Flat payloads are normalized into the nested envelope before forwarding.
    expect(mockBillingWebhook).toHaveBeenCalledWith(
      { app_subscription: flatPayload },
      "store.myshopify.com",
    );
  });

  it("stores capped-amount warnings and notifies the backend without throwing", async () => {
    const cappedPayload = {
      app_subscription: {
        id: "gid://shopify/AppSubscription/789",
        name: "FluxBot Starter",
        balance_used: 95,
        capped_amount: 100,
      },
    };
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "APP_SUBSCRIPTIONS_APPROACHING_CAPPED_AMOUNT",
      shop: "store.myshopify.com",
      payload: cappedPayload,
    });
    mockShopFindUnique
      .mockResolvedValueOnce({ id: "shop-1", domain: "store.myshopify.com" })
      .mockResolvedValueOnce({ metadata: {} });

    const { action } = await import("../../app/routes/api.webhooks");
    const response = await action({
      request: makeWebhookRequest("APP_SUBSCRIPTIONS_APPROACHING_CAPPED_AMOUNT", cappedPayload),
      params: {},
      context: {},
    } as never);

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockShopUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            billing: expect.objectContaining({ cappedWarning: cappedPayload }),
          }),
        }),
      }),
    );
    expect(mockBillingWebhook).toHaveBeenCalledWith(cappedPayload, "store.myshopify.com");
  });
});
