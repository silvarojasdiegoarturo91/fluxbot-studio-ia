/**
 * Unit Tests — ai-orchestration.server.ts
 *
 * Covers the AI orchestration service: LLM providers (adapter pattern),
 * tool registry (products/support/orders/policies), intent detection,
 * guardrails, add-to-cart action building, human handoff, conversation
 * persistence, and conversation management helpers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockConversationFindUniqueOrThrow = vi.fn();
const mockConversationFindUnique = vi.fn();
const mockConversationCreate = vi.fn();
const mockChatbotConfigFindUniqueOrThrow = vi.fn();
const mockConversationMessageCreate = vi.fn();
const mockConversationMessageFindMany = vi.fn();
const mockToolInvocationCreate = vi.fn();
const mockOrderProjectionFindFirst = vi.fn();
const mockPolicyProjectionFindUnique = vi.fn();
const mockHandoffRequestCreate = vi.fn();

vi.mock("../../../app/db.server", () => ({
  default: {
    conversation: {
      findUniqueOrThrow: mockConversationFindUniqueOrThrow,
      findUnique: mockConversationFindUnique,
      create: mockConversationCreate,
    },
    chatbotConfig: { findUniqueOrThrow: mockChatbotConfigFindUniqueOrThrow },
    conversationMessage: {
      create: mockConversationMessageCreate,
      findMany: mockConversationMessageFindMany,
    },
    toolInvocation: { create: mockToolInvocationCreate },
    orderProjection: { findFirst: mockOrderProjectionFindFirst },
    policyProjection: { findUnique: mockPolicyProjectionFindUnique },
    handoffRequest: { create: mockHandoffRequestCreate },
  },
}));

// ─── Dependency mocks ────────────────────────────────────────────────────────

const mockGetConfig = vi.fn();
const mockSearchSimilar = vi.fn();
const mockPrepareAddToCart = vi.fn();
const mockHandoffCreate = vi.fn();

vi.mock("../../../app/config.server", () => ({
  getConfig: () => mockGetConfig(),
}));

vi.mock("../../../app/services/embeddings.server", () => ({
  EmbeddingsService: {
    searchSimilar: (...args: unknown[]) => mockSearchSimilar(...args),
  },
}));

vi.mock("../../../app/services/commerce-actions.server", () => ({
  CommerceActionsService: {
    prepareAddToCartByShopId: (...args: unknown[]) => mockPrepareAddToCart(...args),
  },
}));

vi.mock("../../../app/services/handoff.server", () => ({
  HandoffService: {
    create: (...args: unknown[]) => mockHandoffCreate(...args),
  },
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeConfig(overrides: Record<string, unknown> = {}) {
  const base = {
    ai: {
      provider: "openai",
      openai: { apiKey: "sk-test", model: "gpt-4o-mini" },
      anthropic: { apiKey: "ant-test", model: "claude-3-5-sonnet-20241022" },
      gemini: { apiKey: "gem-test", model: "gemini-1.5-flash" },
    },
    features: { humanHandoff: false },
  } as any;

  return {
    ...base,
    ...overrides,
    ai: {
      ...base.ai,
      ...((overrides.ai as Record<string, unknown>) ?? {}),
    },
    features: {
      ...base.features,
      ...((overrides.features as Record<string, unknown>) ?? {}),
    },
  };
}

function makeProductResult(overrides: Record<string, unknown> = {}) {
  return {
    chunk: {
      documentId: "doc-1",
      document: { title: "Snowboard Pro", source: { sourceType: "CATALOG" } },
      content: "A high quality snowboard",
      metadata: { handle: "snowboard-pro" },
    },
    chunkId: "chunk-1",
    similarity: 0.9,
    ...overrides,
  };
}

function makePolicyResult(overrides: Record<string, unknown> = {}) {
  return {
    chunk: {
      documentId: "doc-2",
      document: { title: "Returns Policy", source: { sourceType: "POLICIES" } },
      content: "Returns accepted within 30 days",
      metadata: { url: "/policies/returns" },
    },
    chunkId: "chunk-2",
    similarity: 0.95,
    ...overrides,
  };
}

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    shopId: "shop-1",
    sessionId: "sess-1",
    messages: [
      { role: "USER", content: "Hola", createdAt: new Date("2026-01-01T10:00:00Z") },
    ],
    ...overrides,
  };
}

const ASSISTANT_MESSAGE = "Te recomiendo el producto que buscas.";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockGetConfig.mockReturnValue(makeConfig());
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: ASSISTANT_MESSAGE } }] }),
  });
  mockConversationFindUniqueOrThrow.mockResolvedValue(makeConversation());
  mockChatbotConfigFindUniqueOrThrow.mockResolvedValue({ systemPrompt: "You are a helpful assistant" });
  mockConversationMessageCreate.mockResolvedValue({ id: "msg-1" });
  mockConversationMessageFindMany.mockResolvedValue([]);
  mockToolInvocationCreate.mockResolvedValue({ id: "inv-1" });
  mockSearchSimilar.mockResolvedValue([]);
  mockPrepareAddToCart.mockResolvedValue({
    variantId: "var-1",
    quantity: 1,
    productRef: "prod-1",
    cartUrl: "/cart",
    checkoutUrl: "/checkout",
  });
  mockHandoffCreate.mockResolvedValue({ id: "handoff-1", status: "pending" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// LLM PROVIDERS
// ============================================================================

describe("OpenAIProvider", () => {
  it("throws when constructed without an API key", async () => {
    const { OpenAIProvider } = await import("../../../app/services/ai-orchestration.server");
    expect(() => new OpenAIProvider("")).toThrow("OpenAI API key required");
  });

  it("sends messages to the chat completions endpoint and returns content", async () => {
    const { OpenAIProvider } = await import("../../../app/services/ai-orchestration.server");
    const provider = new OpenAIProvider("sk-test");

    const result = await provider.generateResponse(
      "system prompt",
      "user message",
      [{ role: "ASSISTANT", content: "previous" }],
    );

    expect(result).toBe(ASSISTANT_MESSAGE);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([
      { role: "system", content: "system prompt" },
      { role: "assistant", content: "previous" },
      { role: "user", content: "user message" },
    ]);
  });

  it("throws a descriptive error when the API responds with an error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      statusText: "Bad Request",
      json: async () => ({ error: { message: "invalid api key" } }),
    });
    const { OpenAIProvider } = await import("../../../app/services/ai-orchestration.server");
    const provider = new OpenAIProvider("sk-test");

    await expect(provider.generateResponse("s", "u")).rejects.toThrow("OpenAI error: invalid api key");
  });

  it("counts tokens with a rough 4-char heuristic", async () => {
    const { OpenAIProvider } = await import("../../../app/services/ai-orchestration.server");
    const provider = new OpenAIProvider("sk-test");
    expect(provider.countTokens("abcdefgh")).toBe(2);
  });
});

describe("AnthropicProvider", () => {
  it("throws when constructed without an API key", async () => {
    const { AnthropicProvider } = await import("../../../app/services/ai-orchestration.server");
    expect(() => new AnthropicProvider("")).toThrow("Anthropic API key required");
  });

  it("sends a messages request and returns content text", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: "hello there" }] }),
    });
    const { AnthropicProvider } = await import("../../../app/services/ai-orchestration.server");
    const provider = new AnthropicProvider("ant-test");

    const result = await provider.generateResponse("s", "u", [{ role: "USER", content: "hi" }]);

    expect(result).toBe("hello there");
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("ant-test");
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe("s");
    expect(body.messages[0]).toEqual({ role: "user", content: "hi" });
  });

  it("throws a descriptive error when the API responds with an error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      statusText: "Unauthorized",
      json: async () => ({ error: { message: "auth failed" } }),
    });
    const { AnthropicProvider } = await import("../../../app/services/ai-orchestration.server");
    const provider = new AnthropicProvider("ant-test");

    await expect(provider.generateResponse("s", "u")).rejects.toThrow("Anthropic error: auth failed");
  });

  it("counts tokens with a rough 3-char heuristic", async () => {
    const { AnthropicProvider } = await import("../../../app/services/ai-orchestration.server");
    const provider = new AnthropicProvider("ant-test");
    expect(provider.countTokens("abcdef")).toBe(2);
  });
});

describe("GeminiProvider", () => {
  it("throws when constructed without an API key", async () => {
    const { GeminiProvider } = await import("../../../app/services/ai-orchestration.server");
    expect(() => new GeminiProvider("")).toThrow("Gemini API key required");
  });

  it("sends a generateContent request and returns text", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "gemini reply" }] } }] }),
    });
    const { GeminiProvider } = await import("../../../app/services/ai-orchestration.server");
    const provider = new GeminiProvider("gem-test");

    const result = await provider.generateResponse("s", "u", [{ role: "ASSISTANT", content: "prev" }]);

    expect(result).toBe("gemini reply");
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).toContain("key=gem-test");
  });

  it("throws a descriptive error when the API responds with an error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      statusText: "Bad Request",
      json: async () => ({ error: { message: "quota exceeded" } }),
    });
    const { GeminiProvider } = await import("../../../app/services/ai-orchestration.server");
    const provider = new GeminiProvider("gem-test");

    await expect(provider.generateResponse("s", "u")).rejects.toThrow("Gemini error: quota exceeded");
  });

  it("counts tokens", async () => {
    const { GeminiProvider } = await import("../../../app/services/ai-orchestration.server");
    const provider = new GeminiProvider("gem-test");
    expect(provider.countTokens("abcdefgh")).toBe(2);
  });
});

// ============================================================================
// getLLMProvider
// ============================================================================

describe("getLLMProvider()", () => {
  it("builds an OpenAI provider", async () => {
    const { AIOrchestrationService, OpenAIProvider } = await import("../../../app/services/ai-orchestration.server");
    expect(AIOrchestrationService.getLLMProvider()).toBeInstanceOf(OpenAIProvider);
  });

  it("throws when openai config is missing", async () => {
    mockGetConfig.mockReturnValue(
      makeConfig({ ai: { provider: "openai", openai: undefined } }),
    );
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");
    expect(() => AIOrchestrationService.getLLMProvider()).toThrow("OpenAI config missing");
  });

  it("builds an Anthropic provider", async () => {
    mockGetConfig.mockReturnValue(
      makeConfig({ ai: { provider: "anthropic" } }),
    );
    const { AIOrchestrationService, AnthropicProvider } = await import("../../../app/services/ai-orchestration.server");
    expect(AIOrchestrationService.getLLMProvider()).toBeInstanceOf(AnthropicProvider);
  });

  it("throws when anthropic config is missing", async () => {
    mockGetConfig.mockReturnValue(
      makeConfig({ ai: { provider: "anthropic", anthropic: undefined } }),
    );
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");
    expect(() => AIOrchestrationService.getLLMProvider()).toThrow("Anthropic config missing");
  });

  it("builds a Gemini provider", async () => {
    mockGetConfig.mockReturnValue(makeConfig({ ai: { provider: "gemini" } }));
    const { AIOrchestrationService, GeminiProvider } = await import("../../../app/services/ai-orchestration.server");
    expect(AIOrchestrationService.getLLMProvider()).toBeInstanceOf(GeminiProvider);
  });

  it("throws when gemini config is missing", async () => {
    mockGetConfig.mockReturnValue(makeConfig({ ai: { provider: "gemini", gemini: undefined } }));
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");
    expect(() => AIOrchestrationService.getLLMProvider()).toThrow("Gemini config missing");
  });

  it("throws for an unknown provider", async () => {
    mockGetConfig.mockReturnValue(makeConfig({ ai: { provider: "mistral" } }));
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");
    expect(() => AIOrchestrationService.getLLMProvider()).toThrow("Unknown LLM provider: mistral");
  });
});

// ============================================================================
// ToolRegistry
// ============================================================================

describe("ToolRegistry", () => {
  it("searchProducts maps embedding results to source references and context", async () => {
    mockSearchSimilar.mockResolvedValue([makeProductResult()]);
    const { ToolRegistry } = await import("../../../app/services/ai-orchestration.server");

    const result = await ToolRegistry.searchProducts("shop-1", "snowboard");

    expect(mockSearchSimilar).toHaveBeenCalledWith("shop-1", "snowboard", 5);
    expect(result.sourceReferences).toEqual([
      expect.objectContaining({
        documentId: "doc-1",
        chunkId: "chunk-1",
        title: "Snowboard Pro",
        relevance: 0.9,
        url: "/products/snowboard-pro",
      }),
    ]);
    expect(result.context).toContain("high quality snowboard");
  });

  it("searchProducts falls back to Product for untitled documents", async () => {
    mockSearchSimilar.mockResolvedValue([
      makeProductResult({
        chunk: {
          documentId: "doc-3",
          document: { title: "" },
          content: "x",
          metadata: {},
        },
      }),
    ]);
    const { ToolRegistry } = await import("../../../app/services/ai-orchestration.server");

    const result = await ToolRegistry.searchProducts("shop-1", "x");

    expect(result.sourceReferences[0].title).toBe("Product");
    expect(result.sourceReferences[0].url).toBeUndefined();
  });

  it("searchSupport filters to POLICIES documents only", async () => {
    mockSearchSimilar.mockResolvedValue([
      makePolicyResult(),
      makeProductResult(), // should be filtered out
    ]);
    const { ToolRegistry } = await import("../../../app/services/ai-orchestration.server");

    const result = await ToolRegistry.searchSupport("shop-1", "return policy");

    expect(result.sourceReferences).toHaveLength(1);
    expect(result.sourceReferences[0]).toEqual(
      expect.objectContaining({ documentId: "doc-2", title: "Returns Policy", url: "/policies/returns" }),
    );
  });

  it("getOrderStatus returns null when the order is not found", async () => {
    mockOrderProjectionFindFirst.mockResolvedValue(null);
    const { ToolRegistry } = await import("../../../app/services/ai-orchestration.server");

    const result = await ToolRegistry.getOrderStatus("shop-1", "ORD-1");

    expect(result).toBeNull();
    expect(mockOrderProjectionFindFirst).toHaveBeenCalledWith({
      where: { shopId: "shop-1", OR: [{ orderId: "ORD-1" }, { orderNumber: "ORD-1" }] },
    });
  });

  it("getOrderStatus maps an order projection", async () => {
    mockOrderProjectionFindFirst.mockResolvedValue({
      orderId: "gid://shopify/Order/1",
      orderNumber: "1001",
      customerId: "c-1",
      email: "a@b.com",
      financialStatus: "PAID",
      fulfillmentStatus: "FULFILLED",
      totalPrice: "99.00",
      lineItems: [],
      syncedAt: new Date(),
    });
    const { ToolRegistry } = await import("../../../app/services/ai-orchestration.server");

    const result = await ToolRegistry.getOrderStatus("shop-1", "1001");

    expect(result).toMatchObject({ orderNumber: "1001", financialStatus: "PAID", totalPrice: "99.00" });
  });

  it("getPolicies returns the policy body when found", async () => {
    mockPolicyProjectionFindUnique.mockResolvedValue({ title: "Returns", body: "30 days window" });
    const { ToolRegistry } = await import("../../../app/services/ai-orchestration.server");

    const result = await ToolRegistry.getPolicies("shop-1", "Returns");

    expect(mockPolicyProjectionFindUnique).toHaveBeenCalledWith({
      where: { shopId_policyType: { shopId: "shop-1", policyType: "returns" } },
    });
    expect(result).toBe("Returns\n\n30 days window");
  });

  it("getPolicies returns a message when the policy is not found", async () => {
    mockPolicyProjectionFindUnique.mockResolvedValue(null);
    const { ToolRegistry } = await import("../../../app/services/ai-orchestration.server");

    const result = await ToolRegistry.getPolicies("shop-1", "shipping");

    expect(result).toBe("Policy not found.");
  });
});

// ============================================================================
// AIOrchestrationService.chat()
// ============================================================================

describe("AIOrchestrationService.chat()", () => {
  it("handles a GENERAL intent without retrieval or escalation", async () => {
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    const result = await AIOrchestrationService.chat("shop-1", "conv-1", "hola");

    expect(result.message).toBe(ASSISTANT_MESSAGE);
    expect(result.requiresEscalation).toBe(false);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.actions).toEqual([]);
    expect(mockSearchSimilar).not.toHaveBeenCalled();
    expect(mockConversationMessageCreate).toHaveBeenCalledTimes(2);
  });

  it("retrieves products for SALES intent and logs a tool invocation", async () => {
    mockSearchSimilar.mockResolvedValue([makeProductResult()]);
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    const result = await AIOrchestrationService.chat("shop-1", "conv-1", "recommend me a product");

    expect(result.toolsUsed).toEqual(["rag"]);
    expect(result.sourceReferences).toHaveLength(1);
    expect(mockSearchSimilar).toHaveBeenCalledWith("shop-1", "recommend me a product", 5);
    expect(mockToolInvocationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ toolName: "searchProducts", success: true }) }),
    );
  });

  it("builds an ADD_TO_CART action when the message requests a purchase", async () => {
    mockSearchSimilar.mockResolvedValue([makeProductResult()]);
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    const result = await AIOrchestrationService.chat("shop-1", "conv-1", "I want to purchase this product");

    expect(mockPrepareAddToCart).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop-1", productRef: "snowboard-pro", quantity: 1 }),
    );
    expect(result.actions).toEqual([
      expect.objectContaining({ type: "ADD_TO_CART", label: "Add to cart" }),
    ]);
  });

  it("parses an explicit quantity from the message", async () => {
    mockSearchSimilar.mockResolvedValue([makeProductResult()]);
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    await AIOrchestrationService.chat("shop-1", "conv-1", "quiero comprar 3 unidades de producto");

    expect(mockPrepareAddToCart).toHaveBeenCalledWith(expect.objectContaining({ quantity: 3 }));
  });

  it("swallows add-to-cart preparation errors and continues without an action", async () => {
    mockSearchSimilar.mockResolvedValue([makeProductResult()]);
    mockPrepareAddToCart.mockRejectedValue(new Error("variant unavailable"));
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    const result = await AIOrchestrationService.chat("shop-1", "conv-1", "I want to purchase this product");

    expect(result.actions).toEqual([]);
    expect(result.message).toBe(ASSISTANT_MESSAGE);
  });

  it("escalates a low-confidence SUPPORT intent and creates a handoff when enabled", async () => {
    mockGetConfig.mockReturnValue(makeConfig({ features: { humanHandoff: true } }));
    mockSearchSimilar.mockResolvedValue([makePolicyResult()]);
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    const result = await AIOrchestrationService.chat("shop-1", "conv-1", "I want to return an item");

    expect(result.requiresEscalation).toBe(true);
    expect(result.escalationReason).toContain("Support request requires human follow-up");
    expect(mockHandoffCreate).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop-1", conversationId: "conv-1" }),
    );
    expect(result.actions).toEqual([
      expect.objectContaining({ type: "HUMAN_HANDOFF", handoffId: "handoff-1", status: "pending" }),
    ]);
    expect(result.message).toContain("Un agente de soporte puede continuar esta conversación contigo.");
  });

  it("does not create a handoff when human handoff is disabled but still escalates", async () => {
    mockSearchSimilar.mockResolvedValue([makePolicyResult()]);
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    const result = await AIOrchestrationService.chat("shop-1", "conv-1", "I want to return an item");

    expect(result.requiresEscalation).toBe(true);
    expect(result.escalationReason).toBeDefined();
    expect(mockHandoffCreate).not.toHaveBeenCalled();
    expect(result.actions).toEqual([]);
  });

  it("swallows handoff creation errors", async () => {
    mockGetConfig.mockReturnValue(makeConfig({ features: { humanHandoff: true } }));
    mockSearchSimilar.mockResolvedValue([makePolicyResult()]);
    mockHandoffCreate.mockRejectedValue(new Error("handoff backend down"));
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    const result = await AIOrchestrationService.chat("shop-1", "conv-1", "I want to return an item");

    expect(result.actions).toEqual([]);
    expect(result.requiresEscalation).toBe(true);
  });

  it("falls back to a safe message when the LLM call fails for a known intent", async () => {
    mockFetch.mockRejectedValue(new Error("LLM timeout"));
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");
    const { safeFallbackMessage } = await import("../../../app/services/chat-safety.server");

    const result = await AIOrchestrationService.chat("shop-1", "conv-1", "hola");

    expect(result.message).toBe(safeFallbackMessage("greeting"));
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("uses the generic apology when the LLM call fails for an unknown intent", async () => {
    mockFetch.mockRejectedValue(new Error("LLM timeout"));
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    const result = await AIOrchestrationService.chat("shop-1", "conv-1", "zzz qqq wqq");

    expect(result.message).toBe(
      "I apologize, but I couldn't process that request right now. Please try again.",
    );
  });

  it("persists the user and assistant messages with metadata", async () => {
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    await AIOrchestrationService.chat("shop-1", "conv-1", "hola");

    const firstCall = mockConversationMessageCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    const secondCall = mockConversationMessageCreate.mock.calls[1][0] as { data: Record<string, unknown> };
    expect(firstCall.data).toMatchObject({ conversationId: "conv-1", role: "user", content: "hola", confidence: 0.95 });
    expect(secondCall.data).toMatchObject({
      conversationId: "conv-1",
      role: "assistant",
      content: ASSISTANT_MESSAGE,
    });
    expect(secondCall.data.metadata).toMatchObject({ intent: "GENERAL" });
  });

  it("appends an English escalation hint for English conversations", async () => {
    mockSearchSimilar.mockResolvedValue([makePolicyResult()]);
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    const result = await AIOrchestrationService.chat("shop-1", "conv-1", "I want to return an item", "en");

    expect(result.message).toContain("A support agent can continue this conversation with you.");
  });
});

// ============================================================================
// Conversation management helpers
// ============================================================================

describe("AIOrchestrationService helpers", () => {
  it("createConversation delegates to prisma", async () => {
    mockConversationCreate.mockResolvedValue({ id: "conv-new" });
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    const result = await AIOrchestrationService.createConversation("shop-1", "visitor-1", "WEB_CHAT");

    expect(mockConversationCreate).toHaveBeenCalledWith({
      data: { shopId: "shop-1", channel: "WEB_CHAT", visitorId: "visitor-1", status: "ACTIVE" },
    });
    expect(result).toEqual({ id: "conv-new" });
  });

  it("getConversationHistory returns ordered messages", async () => {
    mockConversationMessageFindMany.mockResolvedValue([{ id: "m1" }]);
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    const result = await AIOrchestrationService.getConversationHistory("conv-1");

    expect(mockConversationMessageFindMany).toHaveBeenCalledWith({
      where: { conversationId: "conv-1" },
      orderBy: { createdAt: "asc" },
    });
    expect(result).toEqual([{ id: "m1" }]);
  });

  it("escalateToHuman creates a handoff request", async () => {
    mockConversationFindUnique.mockResolvedValue({ shopId: "shop-1" });
    mockHandoffRequestCreate.mockResolvedValue({ id: "hr-1" });
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    const result = await AIOrchestrationService.escalateToHuman("conv-1", "user_request");

    expect(mockHandoffRequestCreate).toHaveBeenCalledWith({
      data: { shopId: "shop-1", conversationId: "conv-1", reason: "user_request", status: "pending" },
    });
    expect(result).toEqual({ id: "hr-1" });
  });

  it("escalateToHuman throws when the conversation is not found", async () => {
    mockConversationFindUnique.mockResolvedValue(null);
    const { AIOrchestrationService } = await import("../../../app/services/ai-orchestration.server");

    await expect(AIOrchestrationService.escalateToHuman("conv-missing", "reason")).rejects.toThrow(
      "Conversation conv-missing not found",
    );
  });
});
