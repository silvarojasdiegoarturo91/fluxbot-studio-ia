/**
 * Unit Tests — rag-builder.server.ts
 *
 * Covers the remote quality-pipeline paths (IA_EXECUTION_MODE=remote):
 * catalog/policy/recommendation context builders, fallback handling,
 * result formatting and prompt formatting.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockShopFindUnique = vi.fn();
const mockRagSearch = vi.fn();
const mockIsRemoteEnabled = vi.fn();

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: { findUnique: mockShopFindUnique },
  },
}));

vi.mock("../../../app/services/ia-backend.server", () => ({
  iaClient: {
    rag: {
      search: (...args: unknown[]) => mockRagSearch(...args),
    },
  },
}));

vi.mock("../../../app/services/ia-execution-mode.server", () => ({
  isRemoteIAExecutionEnabled: () => mockIsRemoteEnabled(),
}));

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    chunkId: "chunk-1",
    content: "The Snow Shield helmet protects against impacts.",
    score: 0.87,
    metadata: {
      title: "Snow Shield Casco",
      documentType: "product",
      productId: "prod-1",
      price: 49.99,
      image: "https://cdn.example.com/snow-shield.jpg",
      url: "/products/snow-shield-casco",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsRemoteEnabled.mockReturnValue(true);
  mockShopFindUnique.mockResolvedValue({ domain: "store.myshopify.com" });
  mockRagSearch.mockResolvedValue({
    results: [makeResult()],
    qualityMetadata: {
      wasReranked: true,
      rerankStrategy: "cross_encoder",
      appliedMinScore: 0.4,
      candidatesBeforeRerank: 12,
    },
  });
});

// ============================================================================
// buildCatalogContext
// ============================================================================

describe("buildCatalogContext", () => {
  const OPTIONS = { shopId: "shop-1" };

  it("builds a rich context from remote product results", async () => {
    const { buildCatalogContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildCatalogContext("casco de snowboard", OPTIONS);

    expect(context.fallback).toBe(false);
    expect(context.products).toHaveLength(1);
    expect(context.products[0]).toMatchObject({
      id: "prod-1",
      title: "Snow Shield Casco",
      price: 49.99,
      image: "https://cdn.example.com/snow-shield.jpg",
      url: "/products/snow-shield-casco",
    });
    expect(context.products[0].description).toContain("The Snow Shield helmet");
    expect(context.confidence).toBe(0.87);
    expect(context.sources).toEqual([
      { title: "Snow Shield Casco", type: "product", relevance: 0.87 },
    ]);
    expect(context.summary).toContain("Found 1 relevant product(s): Snow Shield Casco");
    expect(context.qualityMetadata).toMatchObject({ wasReranked: true, rerankStrategy: "cross_encoder" });
  });

  it("splits results into product/policy/article buckets", async () => {
    mockRagSearch.mockResolvedValue({
      results: [
        makeResult({ chunkId: "p", metadata: { title: "P", documentType: "product" } }),
        makeResult({ chunkId: "po", metadata: { title: "Pol", documentType: "policy", category: "returns" } }),
        makeResult({ chunkId: "a", metadata: { title: "Art", documentType: "article" } }),
      ],
    });
    const { buildCatalogContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildCatalogContext("consulta mixta", OPTIONS);

    expect(context.products.map((p) => p.title)).toEqual(["P"]);
    expect(context.policies.map((p) => p.title)).toEqual(["Pol"]);
    expect(context.articles.map((p) => p.title)).toEqual(["Art"]);
    expect(context.sources).toHaveLength(3);
  });

  it("falls back when no document type bucket has capacity", async () => {
    // With limit 0 every type bucket is empty, so the context builder must fall back.
    const { buildCatalogContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildCatalogContext("consulta", { ...OPTIONS, limit: 0 });

    expect(context.fallback).toBe(true);
    expect(context.summary).toContain("Remote retrieval did not return supported document types.");
    expect(context.confidence).toBe(0);
  });

  it("falls back when no results come back", async () => {
    mockRagSearch.mockResolvedValue({ results: [] });
    const { buildCatalogContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildCatalogContext("nada", OPTIONS);

    expect(context.fallback).toBe(true);
    expect(context.summary).toContain("No relevant remote context found.");
  });

  it("falls back when the low-confidence results are below the threshold", async () => {
    mockRagSearch.mockResolvedValue({
      results: [makeResult({ score: 0.3, metadata: { title: "Weak", documentType: "product" } })],
    });
    const { buildCatalogContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildCatalogContext("débil", OPTIONS);

    expect(context.fallback).toBe(true);
    expect(context.summary).toBe("Limited context available. Will provide general guidance.");
    expect(context.confidence).toBe(0.3);
  });

  it("falls back when remote mode is disabled", async () => {
    mockIsRemoteEnabled.mockReturnValue(false);
    const { buildCatalogContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildCatalogContext("consulta", OPTIONS);

    expect(context.fallback).toBe(true);
    expect(context.summary).toContain("Remote quality pipeline requires IA_EXECUTION_MODE=remote.");
    expect(mockRagSearch).not.toHaveBeenCalled();
  });

  it("falls back when the shop domain cannot be resolved", async () => {
    mockShopFindUnique.mockResolvedValue(null);
    const { buildCatalogContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildCatalogContext("consulta", OPTIONS);

    expect(context.fallback).toBe(true);
    expect(context.summary).toContain("Shop domain unavailable for remote retrieval.");
  });

  it("falls back gracefully when the remote request throws", async () => {
    mockRagSearch.mockRejectedValue(new Error("backend 500"));
    const { buildCatalogContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildCatalogContext("consulta", OPTIONS);

    expect(context.fallback).toBe(true);
    expect(context.summary).toContain("Remote retrieval request failed.");
  });

  it("respects a locale-aware title fallback to metadata.name", async () => {
    mockRagSearch.mockResolvedValue({
      results: [
        makeResult({
          metadata: { name: "Producto Sin Título", documentType: "product" },
        }),
      ],
    });
    const { buildCatalogContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildCatalogContext("sin titulo", OPTIONS);

    expect(context.products[0].title).toBe("Producto Sin Título");
  });

  it("uses Knowledge Result when no title metadata exists", async () => {
    mockRagSearch.mockResolvedValue({
      results: [makeResult({ metadata: { documentType: "product" } })],
    });
    const { buildCatalogContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildCatalogContext("sin metadatos", OPTIONS);

    expect(context.products[0].title).toBe("Knowledge Result");
  });

  it("forwards filters, limit and rerank strategy to the backend", async () => {
    const { buildCatalogContext } = await import("../../../app/services/rag-builder.server");

    await buildCatalogContext("consulta", {
      shopId: "shop-1",
      locale: "es",
      limit: 4,
      threshold: 0.55,
      rerankStrategy: "bm25",
    });

    expect(mockRagSearch).toHaveBeenCalledWith(
      {
        query: "consulta",
        filters: {
          language: "es",
          limit: expect.any(Number),
          minScore: 0.55,
          rerankStrategy: "bm25",
          topK: 4,
        },
      },
      "store.myshopify.com",
    );
  });
});

// ============================================================================
// buildPoliciesContext
// ============================================================================

describe("buildPoliciesContext", () => {
  const OPTIONS = { shopId: "shop-1" };

  it("builds a policy-focused context", async () => {
    mockRagSearch.mockResolvedValue({
      results: [
        makeResult({
          metadata: { title: "Returns Policy", documentType: "policy", category: "returns" },
        }),
      ],
    });
    const { buildPoliciesContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildPoliciesContext("returns", OPTIONS);

    expect(context.fallback).toBe(false);
    expect(context.policies).toHaveLength(1);
    expect(context.policies[0]).toMatchObject({ title: "Returns Policy", category: "returns" });
  });

  it("falls back when no policy results exist", async () => {
    mockRagSearch.mockResolvedValue({ results: [] });
    const { buildPoliciesContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildPoliciesContext("returns", OPTIONS);

    expect(context.fallback).toBe(true);
    expect(context.summary).toContain("No relevant remote policy context found.");
  });

  it("falls back when remote mode is disabled", async () => {
    mockIsRemoteEnabled.mockReturnValue(false);
    const { buildPoliciesContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildPoliciesContext("returns", OPTIONS);

    expect(context.fallback).toBe(true);
    expect(context.summary).toContain("Remote quality pipeline requires IA_EXECUTION_MODE=remote.");
  });

  it("falls back gracefully when the request throws", async () => {
    mockRagSearch.mockRejectedValue(new Error("boom"));
    const { buildPoliciesContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildPoliciesContext("returns", OPTIONS);

    expect(context.fallback).toBe(true);
    expect(context.summary).toContain("Remote retrieval request failed.");
  });
});

// ============================================================================
// buildRecommendationContext
// ============================================================================

describe("buildRecommendationContext", () => {
  const OPTIONS = { shopId: "shop-1" };

  it("returns a fallback for an empty cart", async () => {
    const { buildRecommendationContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildRecommendationContext([], OPTIONS);

    expect(context.fallback).toBe(true);
    expect(context.summary).toContain("No cart items to base recommendations on");
    expect(mockRagSearch).not.toHaveBeenCalled();
  });

  it("recommends products based on cart items", async () => {
    const { buildRecommendationContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildRecommendationContext(
      [{ productId: "prod-1", name: "Snowboard" }],
      OPTIONS,
    );

    expect(mockRagSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: "recommend products similar to Snowboard" }),
      "store.myshopify.com",
    );
    expect(context.fallback).toBe(false);
    expect(context.products).toHaveLength(1);
    expect(context.summary).toBe("Recommended products based on your cart");
  });

  it("falls back when no recommendations are returned", async () => {
    mockRagSearch.mockResolvedValue({ results: [] });
    const { buildRecommendationContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildRecommendationContext(
      [{ productId: "prod-1", name: "Snowboard" }],
      OPTIONS,
    );

    expect(context.fallback).toBe(true);
    expect(context.summary).toContain("No remote recommendations available for current cart context.");
  });

  it("falls back gracefully when the request throws", async () => {
    mockRagSearch.mockRejectedValue(new Error("boom"));
    const { buildRecommendationContext } = await import("../../../app/services/rag-builder.server");

    const context = await buildRecommendationContext(
      [{ productId: "prod-1", name: "Snowboard" }],
      OPTIONS,
    );

    expect(context.fallback).toBe(true);
    expect(context.summary).toContain("Remote retrieval request failed.");
  });
});

// ============================================================================
// formatContextForPrompt
// ============================================================================

describe("formatContextForPrompt", () => {
  it("renders products, policies and articles sections together", async () => {
    const { formatContextForPrompt } = await import("../../../app/services/rag-builder.server");

    const formatted = formatContextForPrompt({
      products: [
        { id: "1", title: "Casco", description: "Protege la cabeza", price: 49.99, relevance: 0.9 },
        { id: "2", title: "Rodilleras", description: "Sin precio", relevance: 0.7 },
      ],
      policies: [{ title: "Returns", content: "30 días", category: "returns", relevance: 0.8 }],
      articles: [{ title: "Cómo elegir", excerpt: "Guía breve", url: "/blog/1", relevance: 0.6 }],
      confidence: 0.9,
      sources: [{ title: "Casco", type: "product", relevance: 0.9 }],
      summary: "x",
      fallback: false,
    });

    expect(formatted).toContain("### Products");
    expect(formatted).toContain("Price: $49.99");
    expect(formatted).toContain("Rodilleras");
    expect(formatted).toContain("### Policies");
    expect(formatted).toContain("### Helpful Articles");
    expect(formatted).toContain("- **Cómo elegir**: Guía breve");
    expect(formatted).toContain("*Context confidence: 90%*");
  });
});
