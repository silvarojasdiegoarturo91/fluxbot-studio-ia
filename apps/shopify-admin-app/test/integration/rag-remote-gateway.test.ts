import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../app/services/ia-backend.server", () => ({
  iaClient: {
    rag: {
      search: vi.fn(),
    },
  },
}));

import prisma from "../../app/db.server";
import { iaClient } from "../../app/services/ia-backend.server";
import {
  buildCatalogContext,
  buildPoliciesContext,
  buildRecommendationContext,
} from "../../app/services/rag-builder.server";

describe("RAG Builder remote gateway migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.IA_EXECUTION_MODE = "remote";

    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      domain: "test-shop.myshopify.com",
    } as any);
  });

  it("uses remote RAG search for catalog context and applies quality mapping", async () => {
    vi.mocked(iaClient.rag.search).mockResolvedValue({
      results: [
        {
          chunkId: "prod-1",
          content: "Blue coat with waterproof shell",
          score: 0.91,
          metadata: {
            title: "Blue Coat",
            documentType: "product",
            productId: "p-1",
            price: 89.99,
            locale: "en",
          },
        },
        {
          chunkId: "policy-1",
          content: "Returns accepted within 30 days",
          score: 0.83,
          metadata: {
            title: "Return Policy",
            documentType: "policy",
            category: "Returns",
            locale: "en",
          },
        },
      ],
    } as any);

    const context = await buildCatalogContext("blue coat", {
      shopId: "shop-1",
      locale: "en",
      limit: 5,
    });

    expect(iaClient.rag.search).toHaveBeenCalledWith(
      {
        query: "blue coat",
        filters: {
          language: "en",
          limit: 24,
          minScore: undefined,
          rerankStrategy: "cross_encoder",
          topK: 5,
        },
      },
      "test-shop.myshopify.com",
    );
    expect(context.fallback).toBe(false);
    expect(context.products.length).toBeGreaterThan(0);
    expect(context.policies.length).toBeGreaterThan(0);
  });

  it("uses remote RAG search for policy-specific context", async () => {
    vi.mocked(iaClient.rag.search).mockResolvedValue({
      results: [
        {
          chunkId: "policy-1",
          content: "Refunds are processed within 5 business days",
          score: 0.88,
          metadata: {
            title: "Refund Policy",
            sourceType: "POLICIES",
            category: "Refunds",
          },
        },
      ],
    } as any);

    const context = await buildPoliciesContext("refund", {
      shopId: "shop-1",
      locale: "en",
      limit: 5,
    });

    expect(context.fallback).toBe(false);
    expect(context.policies).toHaveLength(1);
    expect(context.policies[0].title).toBe("Refund Policy");
  });

  it("uses remote RAG search for recommendation context", async () => {
    vi.mocked(iaClient.rag.search).mockResolvedValue({
      results: [
        {
          chunkId: "prod-2",
          content: "Thermal gloves for cold weather",
          score: 0.9,
          metadata: {
            title: "Thermal Gloves",
            documentType: "product",
            productId: "p-2",
          },
        },
      ],
    } as any);

    const context = await buildRecommendationContext(
      [{ productId: "p-1", name: "Blue Coat" }],
      {
        shopId: "shop-1",
        locale: "en",
      },
    );

    expect(context.fallback).toBe(false);
    expect(context.products).toHaveLength(1);
    expect(context.products[0].title).toBe("Thermal Gloves");
  });

  it("returns fallback context when remote retrieval fails", async () => {
    vi.mocked(iaClient.rag.search).mockRejectedValue(new Error("backend unavailable"));

    const context = await buildCatalogContext("blue coat", {
      shopId: "shop-1",
      locale: "en",
      limit: 5,
    });

    expect(context.fallback).toBe(true);
    expect(context.sources).toEqual([]);
    expect(context.summary).toContain("Remote retrieval request failed");
  });

  it("returns fallback context when remote retrieval has no matches", async () => {
    vi.mocked(iaClient.rag.search).mockResolvedValue({ results: [] } as any);

    const context = await buildPoliciesContext("refund", {
      shopId: "shop-1",
      locale: "en",
      limit: 5,
    });

    expect(context.fallback).toBe(true);
    expect(context.policies).toEqual([]);
    expect(context.summary).toContain("No relevant remote policy context found");
  });

  it("returns fallback context when shop domain cannot be resolved", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue(null as any);

    const context = await buildRecommendationContext(
      [{ productId: "p-1", name: "Blue Coat" }],
      {
        shopId: "shop-1",
        locale: "en",
      },
    );

    expect(context.fallback).toBe(true);
    expect(context.products).toEqual([]);
    expect(context.summary).toContain("Shop domain unavailable for remote retrieval");
  });

  it("forwards threshold as minScore and rerankStrategy to the backend request", async () => {
    vi.mocked(iaClient.rag.search).mockResolvedValue({ results: [] } as any);

    await buildCatalogContext("running shoes", {
      shopId: "shop-1",
      locale: "es",
      limit: 3,
      threshold: 0.75,
      rerankStrategy: "reciprocal_rank_fusion",
    });

    expect(iaClient.rag.search).toHaveBeenCalledWith(
      {
        query: "running shoes",
        filters: {
          language: "es",
          limit: 24,
          minScore: 0.75,
          rerankStrategy: "reciprocal_rank_fusion",
          topK: 3,
        },
      },
      "test-shop.myshopify.com",
    );
  });

  it("client-side filters results below threshold even if backend returns them", async () => {
    vi.mocked(iaClient.rag.search).mockResolvedValue({
      results: [
        {
          chunkId: "low-1",
          content: "Low relevance product",
          score: 0.3,
          metadata: { title: "Low Product", documentType: "product", productId: "p-low" },
        },
        {
          chunkId: "high-1",
          content: "High relevance product",
          score: 0.9,
          metadata: { title: "High Product", documentType: "product", productId: "p-high" },
        },
      ],
    } as any);

    const context = await buildCatalogContext("shoes", {
      shopId: "shop-1",
      locale: "en",
      limit: 5,
      threshold: 0.5,
    });

    // Only the high-relevance product should pass the client-side threshold
    expect(context.products.length).toBe(1);
    expect(context.products[0].title).toBe("High Product");
  });

  it("surfaces qualityMetadata from backend when provided", async () => {
    const mockQuality = {
      wasReranked: true,
      rerankStrategy: "cross_encoder",
      appliedMinScore: 0.4,
      candidatesBeforeRerank: 20,
    };

    vi.mocked(iaClient.rag.search).mockResolvedValue({
      results: [
        {
          chunkId: "prod-1",
          content: "Waterproof jacket",
          score: 0.88,
          metadata: { title: "Jacket", documentType: "product", productId: "p-1" },
        },
      ],
      qualityMetadata: mockQuality,
    } as any);

    const context = await buildCatalogContext("jacket", {
      shopId: "shop-1",
      locale: "en",
    });

    expect(context.fallback).toBe(false);
    expect(context.qualityMetadata).toEqual(mockQuality);
  });
});
