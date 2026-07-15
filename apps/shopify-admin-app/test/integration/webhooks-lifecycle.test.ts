import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuthenticateWebhook } = vi.hoisted(() => ({
  mockAuthenticateWebhook: vi.fn(),
}));

const mockShopFindUnique = vi.fn();
const mockShopUpdate = vi.fn();
const mockWebhookEventCreate = vi.fn();
const mockWebhookEventUpdateMany = vi.fn();
const mockOrderProjectionUpsert = vi.fn();

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
});
