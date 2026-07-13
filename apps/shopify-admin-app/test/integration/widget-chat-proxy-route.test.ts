import { beforeEach, describe, expect, it, vi } from "vitest";

const mockShopFindUnique = vi.fn();
const mockConversationFindUnique = vi.fn();
const mockConversationCreate = vi.fn();
const mockConversationUpdate = vi.fn();
const mockConversationMessageCreate = vi.fn();
const mockProductProjectionFindMany = vi.fn();
const mockGatewayChat = vi.fn();
const mockVerifyProxy = vi.fn();
const mockGetMerchantAdminConfig = vi.fn();

vi.mock("../../app/db.server", () => ({
  default: {
    shop: { findUnique: mockShopFindUnique },
    conversation: {
      findUnique: mockConversationFindUnique,
      create: mockConversationCreate,
      update: mockConversationUpdate,
    },
    conversationMessage: {
      create: mockConversationMessageCreate,
    },
    productProjection: {
      findMany: mockProductProjectionFindMany,
    },
  },
}));

vi.mock("../../app/services/ia-gateway.server", () => ({
  getIAGateway: () => ({
    chat: mockGatewayChat,
  }),
}));

vi.mock("../../app/services/shopify-proxy-auth.server", () => ({
  verifyShopifyProxyRequest: (...args: unknown[]) => mockVerifyProxy(...args),
}));

vi.mock("../../app/services/admin-config.server", () => ({
  getMerchantAdminConfig: (...args: unknown[]) => mockGetMerchantAdminConfig(...args),
}));

describe("apps.fluxbot.chat proxy route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyProxy.mockReturnValue(true);
    mockShopFindUnique.mockResolvedValue({ id: "shop-1" });
    mockConversationFindUnique.mockResolvedValue(null);
    mockConversationCreate.mockResolvedValue({ id: "conv-1", messages: [] });
    mockConversationUpdate.mockResolvedValue({ id: "conv-1", locale: "es", messages: [] });
    mockConversationMessageCreate.mockResolvedValue({ id: "msg-1" });
    mockProductProjectionFindMany.mockResolvedValue([]);
    mockGetMerchantAdminConfig.mockResolvedValue({
      primaryBotLanguage: "es",
      supportedLanguages: ["es"],
    });
    mockGatewayChat.mockResolvedValue({
      message: "Hola",
      confidence: 0.91,
      requiresEscalation: false,
      actions: [],
      toolsUsed: undefined,
      sourceReferences: undefined,
    });
  });

  it("does not fail when gateway returns undefined metadata arrays", async () => {
    const { action } = await import("../../app/routes/apps.fluxbot.chat");

    const request = new Request(
      "http://localhost/apps/fluxbot/chat?shop=quickstart-c8cc9986.myshopify.com",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "hola",
          visitorId: "visitor-1",
          context: { locale: "es" },
        }),
      },
    );

    const response = await action({
      request,
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({
      success: true,
      conversationId: "conv-1",
      message: "Hola",
    });

    expect(mockConversationMessageCreate).toHaveBeenCalledTimes(2);
    expect(mockConversationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: "SHOPIFY_PROXY",
          shopId: "shop-1",
          status: "ACTIVE",
          visitorId: "visitor-1",
          sessionId: undefined,
          customerId: undefined,
          locale: "es",
        }),
        include: expect.objectContaining({
          messages: true,
        }),
      }),
    );
    expect(mockConversationMessageCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conv-1",
          role: "USER",
          content: "hola",
        }),
      }),
    );
    expect(mockConversationMessageCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conv-1",
          role: "ASSISTANT",
          content: "Hola",
        }),
      }),
    );
    expect(mockGatewayChat).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "SHOPIFY_PROXY",
        locale: "es",
      }),
      "quickstart-c8cc9986.myshopify.com",
    );
    const assistantMessageCall = mockConversationMessageCreate.mock.calls[1][0]
      .data as Record<string, unknown>;
    expect(assistantMessageCall).toHaveProperty("metadata");
    expect((assistantMessageCall.metadata as Record<string, unknown>)).toHaveProperty("traceId");
  });

  it("reuses an existing conversation id and keeps writing messages to the same row", async () => {
    mockConversationFindUnique.mockResolvedValue({
      id: "conv-existing",
      shopId: "shop-1",
      locale: "es",
      messages: [
        {
          role: "USER",
          content: "¿Tienen cascos?",
          createdAt: new Date("2026-07-11T10:00:00.000Z"),
        },
      ],
    });

    const { action } = await import("../../app/routes/apps.fluxbot.chat");

    const request = new Request(
      "http://localhost/apps/fluxbot/chat?shop=quickstart-c8cc9986.myshopify.com",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "¿Y guantes?",
          conversationId: "conv-existing",
          visitorId: "visitor-1",
          context: { locale: "es" },
        }),
      },
    );

    const response = await action({
      request,
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversationId).toBe("conv-existing");
    expect(mockConversationCreate).not.toHaveBeenCalled();
    expect(mockConversationUpdate).not.toHaveBeenCalled();
    expect(mockConversationFindUnique).toHaveBeenCalledWith({
      where: { id: "conv-existing" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    expect(mockConversationMessageCreate).toHaveBeenCalledTimes(2);
    expect(mockConversationMessageCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conv-existing",
          role: "USER",
          content: "¿Y guantes?",
        }),
      }),
    );
  });

  it("maps product_recommend actions to metadata.products for the storefront widget", async () => {
    mockGatewayChat.mockResolvedValue({
      message: "Te recomiendo Snow Shield Casco.",
      confidence: 0.94,
      requiresEscalation: false,
      actions: [
        {
          type: "product_recommend",
          products: [
            {
              title: "Snow Shield Casco",
              price: "49.00 EUR",
              url: "/products/snow-shield-casco",
              image: "https://cdn.example.com/snow-shield.jpg",
              handle: "snow-shield-casco",
              productId: "gid://shopify/Product/1001",
              variantId: "gid://shopify/ProductVariant/2001",
            },
          ],
        },
      ],
      toolsUsed: ["searchProducts"],
      sourceReferences: [],
    });
    const { action } = await import("../../app/routes/apps.fluxbot.chat");

    const request = new Request(
      "http://localhost/apps/fluxbot/chat?shop=quickstart-c8cc9986.myshopify.com",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "algo como un snowboarding",
          visitorId: "visitor-1",
          context: { locale: "es" },
        }),
      },
    );

    const response = await action({
      request,
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.metadata.products).toEqual([
      expect.objectContaining({
        title: "Snow Shield Casco",
        productId: "gid://shopify/Product/1001",
      }),
    ]);
  });

  it("does not promote catalog products on unrelated follow-up messages", async () => {
    mockConversationFindUnique.mockResolvedValue({
      id: "conv-existing",
      shopId: "shop-1",
      locale: "es",
      messages: [
        {
          role: "USER",
          content: "¿Tienen productos de deporte?",
          createdAt: new Date("2026-07-11T10:00:00.000Z"),
        },
        {
          role: "ASSISTANT",
          content: "Sí, te puedo ayudar con eso.",
          createdAt: new Date("2026-07-11T10:01:00.000Z"),
        },
      ],
    });
    mockGatewayChat.mockResolvedValue({
      message: "Te ayudo con eso. ¿Quieres que revise envíos, devoluciones o pagos?",
      confidence: 0.72,
      requiresEscalation: false,
      actions: [],
      toolsUsed: [],
      sourceReferences: [],
    });

    const { action } = await import("../../app/routes/apps.fluxbot.chat");

    const request = new Request(
      "http://localhost/apps/fluxbot/chat?shop=quickstart-c8cc9986.myshopify.com",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "y tarjetas de regalo?",
          conversationId: "conv-existing",
          visitorId: "visitor-1",
          context: { locale: "es" },
        }),
      },
    );

    const response = await action({
      request,
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe("Te ayudo con eso. ¿Quieres que revise envíos, devoluciones o pagos?");
    expect(data.metadata.products).toEqual([]);
    expect(mockProductProjectionFindMany).not.toHaveBeenCalled();
  });

  it("deduplicates repeated product recommendations before exposing them to the widget", async () => {
    mockGatewayChat.mockResolvedValue({
      message: "Te comparto opciones.",
      confidence: 0.81,
      requiresEscalation: false,
      actions: [
        {
          type: "product_recommend",
          products: [
            {
              title: "The 3p Fulfilled Snowboard",
              price: "2629.95",
              url: "/products/the-3p-fulfilled-snowboard",
              image: "https://cdn.example.com/snowboard.jpg",
              handle: "the-3p-fulfilled-snowboard",
              productId: "gid://shopify/Product/3001",
              variantId: "gid://shopify/ProductVariant/4001",
            },
            {
              title: "The 3p Fulfilled Snowboard",
              price: "2629.95",
              url: "/products/the-3p-fulfilled-snowboard",
              image: "https://cdn.example.com/snowboard.jpg",
              handle: "the-3p-fulfilled-snowboard",
              productId: "gid://shopify/Product/3001",
              variantId: "gid://shopify/ProductVariant/4001",
            },
          ],
        },
      ],
      toolsUsed: ["searchProducts"],
      sourceReferences: [],
    });

    const { action } = await import("../../app/routes/apps.fluxbot.chat");
    const request = new Request(
      "http://localhost/apps/fluxbot/chat?shop=quickstart-c8cc9986.myshopify.com",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "algo como un snowboard",
          visitorId: "visitor-1",
          context: { locale: "es" },
        }),
      },
    );

    const response = await action({
      request,
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.metadata.products).toHaveLength(1);
    expect(data.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "product_recommend",
          products: expect.arrayContaining([
            expect.objectContaining({
              productId: "gid://shopify/Product/3001",
            }),
          ]),
        }),
      ]),
    );
  });

  it("falls back to real synced product projections when backend returns no product actions", async () => {
    mockGatewayChat.mockResolvedValue({
      message: "Puedo ayudarte con opciones para deporte extremo.",
      confidence: 0.66,
      requiresEscalation: false,
      actions: [],
      toolsUsed: ["searchProducts"],
      sourceReferences: [],
    });
    mockProductProjectionFindMany.mockResolvedValue([
      {
        productId: "gid://shopify/Product/3001",
        handle: "snow-shield-casco",
        title: "Snow Shield Casco",
        description: "Casco de protección para nieve y deportes extremos.",
        vendor: "FluxBot",
        productType: "Protección",
        variants: [{ id: "gid://shopify/ProductVariant/4001", price: "49.00 EUR" }],
        images: [{ url: "https://cdn.example.com/snow-shield.jpg" }],
        metadata: {
          tags: ["snowboard", "nieve", "protección"],
          collections: ["Deporte extremo"],
        },
      },
    ]);
    const { action } = await import("../../app/routes/apps.fluxbot.chat");

    const request = new Request(
      "http://localhost/apps/fluxbot/chat?shop=quickstart-c8cc9986.myshopify.com",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "algo como un snowboarding",
          visitorId: "visitor-1",
          context: { locale: "es" },
        }),
      },
    );

    const response = await action({
      request,
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.actions).toEqual([
      expect.objectContaining({
        type: "product_recommend",
        source: "shopify_proxy_catalog_fallback",
      }),
    ]);
    expect(data.message).toContain("Te comparto");
    expect(data.metadata.products).toEqual([
      expect.objectContaining({
        title: "Snow Shield Casco",
        url: "/products/snow-shield-casco",
        image: "https://cdn.example.com/snow-shield.jpg",
        productId: "gid://shopify/Product/3001",
        variantId: "gid://shopify/ProductVariant/4001",
      }),
    ]);
    expect(data.metadata.catalogSource).toBe("shopify_proxy_catalog_fallback");
    expect(mockProductProjectionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: "shop-1",
        }),
      }),
    );
  });

  it("replaces a negative backend catalog message when proxy fallback finds products", async () => {
    mockGatewayChat.mockResolvedValue({
      message:
        "Ahora mismo no tengo el catálogo de productos disponible para listar artículos reales.",
      confidence: 0.66,
      requiresEscalation: false,
      actions: [],
      toolsUsed: ["searchProducts"],
      sourceReferences: [],
    });
    mockProductProjectionFindMany.mockResolvedValue([
      {
        productId: "gid://shopify/Product/3001",
        handle: "the-3p-fulfilled-snowboard",
        title: "The 3p Fulfilled Snowboard",
        description: "Snowboard",
        vendor: "Shopify",
        productType: "Snowboard",
        variants: [{ id: "gid://shopify/ProductVariant/4001", price: "2629.95" }],
        images: [],
        metadata: {},
      },
    ]);

    const { action } = await import("../../app/routes/apps.fluxbot.chat");
    const request = new Request(
      "http://localhost/apps/fluxbot/chat?shop=quickstart-c8cc9986.myshopify.com",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "algo como un snowboarding",
          visitorId: "visitor-1",
          context: { locale: "es" },
        }),
      },
    );

    const response = await action({
      request,
      params: {},
      context: {},
    } as never);
    const data = await response.json();

    expect(data.metadata.products).toHaveLength(1);
    expect(data.message).toContain("Te comparto");
    expect(data.message).not.toContain("no tengo el catálogo");
    expect(data.metadata.catalogSource).toBe("shopify_proxy_catalog_fallback");

    expect(mockConversationMessageCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: expect.not.stringContaining("no tengo el catálogo"),
        }),
      }),
    );
  });

  it("accepts root locale for backward compatibility when context locale is missing", async () => {
    const { action } = await import("../../app/routes/apps.fluxbot.chat");

    const request = new Request(
      "http://localhost/apps/fluxbot/chat?shop=quickstart-c8cc9986.myshopify.com",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "hola desde locale raíz",
          visitorId: "visitor-1",
          locale: "es",
          context: {},
        }),
      },
    );

    const response = await action({
      request,
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    expect(mockGatewayChat).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "es",
      }),
      "quickstart-c8cc9986.myshopify.com",
    );
  });

  it("uses primary bot language when storefront locale is not supported", async () => {
    mockGetMerchantAdminConfig.mockResolvedValue({
      primaryBotLanguage: "en",
      supportedLanguages: ["en"],
    });
    mockGatewayChat.mockResolvedValue({
      message: "I can help with that.",
      confidence: 0.66,
      requiresEscalation: false,
      actions: [],
      toolsUsed: ["searchProducts"],
      sourceReferences: [],
    });
    mockProductProjectionFindMany.mockResolvedValue([
      {
        productId: "gid://shopify/Product/3001",
        handle: "the-3p-fulfilled-snowboard",
        title: "The 3p Fulfilled Snowboard",
        description: "Snowboard",
        vendor: "Shopify",
        productType: "Snowboard",
        variants: [{ id: "gid://shopify/ProductVariant/4001", price: "2629.95" }],
        images: [],
        metadata: {},
      },
    ]);

    const { action } = await import("../../app/routes/apps.fluxbot.chat");
    const request = new Request(
      "http://localhost/apps/fluxbot/chat?shop=quickstart-c8cc9986.myshopify.com",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "algo como un snowboarding",
          visitorId: "visitor-1",
          context: { locale: "es" },
        }),
      },
    );

    const response = await action({
      request,
      params: {},
      context: {},
    } as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBe("I can show you this related product:");
    expect(mockGatewayChat).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
      }),
      "quickstart-c8cc9986.myshopify.com",
    );
  });

  it("filters fallback recommendations to published products with purchasable variants", async () => {
    mockGatewayChat.mockResolvedValue({
      message: "Buscando opciones del catálogo.",
      confidence: 0.61,
      requiresEscalation: false,
      actions: [],
      toolsUsed: ["searchProducts"],
      sourceReferences: [],
    });
    mockProductProjectionFindMany.mockResolvedValue([
      {
        productId: "gid://shopify/Product/1",
        handle: "archived-board",
        title: "Archived Board",
        description: "Archived product",
        vendor: "FluxBot",
        productType: "Snowboard",
        variants: [{ id: "gid://shopify/ProductVariant/101", availableForSale: true, price: "100.00" }],
        images: [],
        metadata: { status: "ARCHIVED", publishedOnCurrentPublication: true },
      },
      {
        productId: "gid://shopify/Product/2",
        handle: "unpublished-board",
        title: "Unpublished Board",
        description: "Unpublished product",
        vendor: "FluxBot",
        productType: "Snowboard",
        variants: [{ id: "gid://shopify/ProductVariant/102", availableForSale: true, price: "100.00" }],
        images: [],
        metadata: { status: "ACTIVE", publishedOnCurrentPublication: false },
      },
      {
        productId: "gid://shopify/Product/3",
        handle: "sold-out-board",
        title: "Sold Out Board",
        description: "Sold out product",
        vendor: "FluxBot",
        productType: "Snowboard",
        variants: [{ id: "gid://shopify/ProductVariant/103", availableForSale: false, price: "100.00" }],
        images: [],
        metadata: { status: "ACTIVE", publishedOnCurrentPublication: true },
      },
      {
        productId: "gid://shopify/Product/4",
        handle: "available-board",
        title: "Available Board",
        description: "Available product",
        vendor: "FluxBot",
        productType: "Snowboard",
        variants: [{ id: "gid://shopify/ProductVariant/104", availableForSale: true, price: "120.00" }],
        images: [],
        metadata: { status: "ACTIVE", publishedOnCurrentPublication: true },
      },
    ]);

    const { action } = await import("../../app/routes/apps.fluxbot.chat");
    const request = new Request(
      "http://localhost/apps/fluxbot/chat?shop=quickstart-c8cc9986.myshopify.com",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "recomiéndame un snowboard",
          visitorId: "visitor-1",
          locale: "es",
          context: {},
        }),
      },
    );

    const response = await action({
      request,
      params: {},
      context: {},
    } as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.metadata.products).toHaveLength(1);
    expect(data.metadata.products[0]).toEqual(
      expect.objectContaining({
        title: "Available Board",
        productId: "gid://shopify/Product/4",
        variantId: "gid://shopify/ProductVariant/104",
      }),
    );
  });
});
