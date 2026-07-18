import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuthenticateWebhook } = vi.hoisted(() => ({
  mockAuthenticateWebhook: vi.fn(),
}));

const mockShopFindUnique = vi.fn();
const mockShopUpdate = vi.fn();
const mockWebhookEventCreate = vi.fn();
const mockWebhookEventUpdateMany = vi.fn();
const mockOrderProjectionUpsert = vi.fn();
const mockInitiateDataExport = vi.fn();
const mockInitiateDataDeletion = vi.fn();
const mockExecuteDataDeletion = vi.fn();
const mockCompleteDeletionJob = vi.fn();

vi.mock("../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: mockShopFindUnique,
      update: mockShopUpdate,
    },
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
  });

  it("resets onboarding metadata when app is uninstalled", async () => {
    mockAuthenticateWebhook.mockResolvedValue({
      topic: "app/uninstalled",
      shop: "store.myshopify.com",
      payload: { id: "evt-1" },
    });
    mockShopFindUnique
      .mockResolvedValueOnce({
        id: "shop-1",
        domain: "store.myshopify.com",
      })
      .mockResolvedValueOnce({
        metadata: {
          adminSetup: {
            onboardingCompleted: true,
            onboardingStep: 7,
            botName: "Flux Advisor",
          },
          widgetPublishedAt: "2026-05-10T10:00:00.000Z",
        },
      });
    mockShopUpdate.mockResolvedValue({});

    const { action } = await import("../../app/routes/api.webhooks");
    const response = await action({
      request: makeWebhookRequest("app/uninstalled", { id: "evt-1" }),
      params: {},
      context: {},
    } as never);

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockShopUpdate).toHaveBeenCalledWith({
      where: { id: "shop-1" },
      data: expect.objectContaining({
        status: "CANCELLED",
        onboardingCompletedAt: null,
        metadata: expect.objectContaining({
          adminSetup: expect.objectContaining({
            onboardingCompleted: false,
            onboardingStep: 1,
            botName: "Flux Advisor",
          }),
          widgetPublishedAt: "2026-05-10T10:00:00.000Z",
        }),
      }),
    });
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
  });
});
