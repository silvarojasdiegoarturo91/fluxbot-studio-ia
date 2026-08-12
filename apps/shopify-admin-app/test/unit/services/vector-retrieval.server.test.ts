/**
 * Unit Tests — vector-retrieval.server.ts
 *
 * Covers semantic search in both execution modes (local + remote), embedding
 * parsing variants, document-type/locale resolution, reranking heuristics,
 * multiSearch/searchAll composition and embedding statistics.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEmbeddingFindMany = vi.fn();
const mockShopFindUnique = vi.fn();
const mockSearchEmbeddings = vi.fn();
const mockGetIAExecutionMode = vi.fn();

vi.mock("../../../app/db.server", () => ({
  default: {
    embeddingRecord: { findMany: mockEmbeddingFindMany },
    shop: { findUnique: mockShopFindUnique },
  },
}));

vi.mock("../../../app/services/ia-gateway.server", () => ({
  getIAGateway: () => ({ searchEmbeddings: mockSearchEmbeddings }),
}));

vi.mock("../../../app/services/ia-execution-mode.server", () => ({
  getIAExecutionMode: () => mockGetIAExecutionMode(),
}));

const QUERY = [1, 0, 0];

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "emb-1",
    chunkId: "chunk-1",
    provider: "openai",
    dimension: 1536,
    embedding: [1, 0, 0],
    chunk: {
      id: "chunk-1",
      content: "A blue winter coat made of wool",
      metadata: { title: "Winter Coat", locale: "en" },
      document: { title: "Doc Title", language: "en", source: { sourceType: "CATALOG" } },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetIAExecutionMode.mockReturnValue("local");
  mockEmbeddingFindMany.mockResolvedValue([]);
  mockShopFindUnique.mockResolvedValue({ domain: "store.myshopify.com" });
  mockSearchEmbeddings.mockResolvedValue([]);
});

// ============================================================================
// searchCatalog — local mode
// ============================================================================

describe("searchCatalog (local mode)", () => {
  it("scores records by cosine similarity and applies the threshold", async () => {
    mockEmbeddingFindMany.mockResolvedValue([
      makeRecord({ chunkId: "c1" }), // similarity 1
      makeRecord({ chunkId: "c2", embedding: [0, 0, 1] }), // similarity 0 -> filtered
    ]);
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchCatalog(QUERY, { threshold: 0.5 });

    expect(mockEmbeddingFindMany).toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ chunkId: "c1", title: "Winter Coat", documentType: "product" });
    expect(results[0].relevance).toBeCloseTo(1, 5);
  });

  it("parses string-serialized and object embeddings", async () => {
    mockEmbeddingFindMany.mockResolvedValue([
      makeRecord({ chunkId: "s", embedding: JSON.stringify([1, 0, 0]) }),
      makeRecord({ chunkId: "o", embedding: { 0: 1, 1: 0, 2: 0 } }),
      makeRecord({ chunkId: "bad", embedding: "not-json" }),
    ]);
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchCatalog(QUERY, { threshold: 0.5 });

    expect(results.map((r) => r.chunkId)).toEqual(["s", "o"]);
  });

  it("filters by shopId via the nested document source relation", async () => {
    mockEmbeddingFindMany.mockResolvedValue([makeRecord()]);
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    await searchCatalog(QUERY, { filter: { shopId: "shop-1" } });

    expect(mockEmbeddingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          chunk: {
            document: {
              source: { shopId: "shop-1" },
            },
          },
        },
      }),
    );
  });

  it("resolves document type from legacy chunk.documentType", async () => {
    mockEmbeddingFindMany.mockResolvedValue([
      makeRecord({ chunk: { ...makeRecord().chunk, documentType: "POLICY" } }),
    ]);
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchCatalog(QUERY);

    expect(results[0].documentType).toBe("policy");
  });

  it("resolves document type to policy from metadata.category", async () => {
    mockEmbeddingFindMany.mockResolvedValue([
      makeRecord({ chunk: { ...makeRecord().chunk, metadata: { category: "returns" } } }),
    ]);
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchCatalog(QUERY);

    expect(results[0].documentType).toBe("policy");
  });

  it("resolves document type to product from metadata.productId", async () => {
    mockEmbeddingFindMany.mockResolvedValue([
      makeRecord({ chunk: { ...makeRecord().chunk, metadata: { productId: "prod-1" } } }),
    ]);
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchCatalog(QUERY);

    expect(results[0].documentType).toBe("product");
  });

  it("maps POLICIES and PAGES source types to the right document types", async () => {
    mockEmbeddingFindMany.mockResolvedValue([
      makeRecord({ chunkId: "pol", chunk: { ...makeRecord().chunk, document: { source: { sourceType: "POLICIES" } } } }),
      makeRecord({ chunkId: "pg", chunk: { ...makeRecord().chunk, document: { source: { sourceType: "PAGES" } } } }),
    ]);
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchCatalog(QUERY);

    expect(results[0].chunkId).toBe("pol");
    expect(results[0].documentType).toBe("policy");
    expect(results[1].documentType).toBe("article");
  });

  it("falls back to Untitled for records without a title", async () => {
    mockEmbeddingFindMany.mockResolvedValue([
      makeRecord({ chunk: { ...makeRecord().chunk, metadata: {}, document: { title: "" } } }),
    ]);
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchCatalog(QUERY);

    expect(results[0].title).toBe("Untitled");
  });

  it("resolves locale from metadata and keeps only requested locales", async () => {
    mockEmbeddingFindMany.mockResolvedValue([
      makeRecord({ chunkId: "en", chunk: { ...makeRecord().chunk, metadata: { title: "X", locale: "en" } } }),
      makeRecord({ chunkId: "es", chunk: { ...makeRecord().chunk, metadata: { title: "Y", locale: "es" } } }),
    ]);
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchCatalog(QUERY, { filter: { locales: ["es"] } });

    expect(results.map((r) => r.chunkId)).toEqual(["es"]);
  });

  it("excludes records whose locale is not requested", async () => {
    mockEmbeddingFindMany.mockResolvedValue([
      makeRecord({ chunkId: "en", chunk: { ...makeRecord().chunk, metadata: { title: "X", locale: "en" } } }),
      makeRecord({ chunkId: "es", chunk: { ...makeRecord().chunk, metadata: { title: "Y", locale: "es" } } }),
    ]);
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchCatalog(QUERY, { filter: { locales: ["en"] } });

    expect(results.map((r) => r.chunkId)).toEqual(["en"]);
  });

  it("returns an empty array when execution mode resolution throws", async () => {
    mockGetIAExecutionMode.mockImplementation(() => {
      throw new Error("boom");
    });
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchCatalog(QUERY);

    expect(results).toEqual([]);
  });
});

// ============================================================================
// searchCatalog — remote mode
// ============================================================================

describe("searchCatalog (remote mode)", () => {
  beforeEach(() => {
    mockGetIAExecutionMode.mockReturnValue("remote");
  });

  it("requires filter.shopId in remote mode", async () => {
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchCatalog(QUERY);

    expect(results).toEqual([]);
    expect(mockSearchEmbeddings).not.toHaveBeenCalled();
  });

  it("returns empty when the shop domain cannot be resolved", async () => {
    mockShopFindUnique.mockResolvedValue(null);
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchCatalog(QUERY, { filter: { shopId: "shop-1" } });

    expect(results).toEqual([]);
    expect(mockSearchEmbeddings).not.toHaveBeenCalled();
  });

  it("delegates to the gateway and normalizes remote results", async () => {
    mockSearchEmbeddings.mockResolvedValue([
      {
        chunkId: "remote-1",
        documentType: "product",
        title: "Remote Helmet",
        content: "Protective helmet",
        relevance: 0.83,
        metadata: { locale: "es" },
      },
      {
        chunkId: "remote-2",
        documentType: "policy",
        title: "",
        content: "Returns",
        relevance: 0.91,
        metadata: { locale: "es" },
      },
    ]);
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchCatalog(QUERY, {
      filter: { shopId: "shop-1", locales: ["es"] },
    });

    expect(mockShopFindUnique).toHaveBeenCalledWith({
      where: { id: "shop-1" },
      select: { domain: true },
    });
    expect(mockSearchEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({
        queryEmbedding: QUERY,
        options: expect.objectContaining({ filter: expect.objectContaining({ shopId: "shop-1" }) }),
      }),
      "store.myshopify.com",
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ chunkId: "remote-2", relevance: 0.91 });
    expect(results[1]).toMatchObject({ chunkId: "remote-1", title: "Remote Helmet", relevance: 0.83 });
    // Sorted by relevance descending
    expect(results[0].chunkId).toBe("remote-2");
  });

  it("rejects results below the threshold in remote mode", async () => {
    mockSearchEmbeddings.mockResolvedValue([
      { chunkId: "low", documentType: "product", title: "Low", content: "x", relevance: 0.1, metadata: {} },
    ]);
    const { searchCatalog } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchCatalog(QUERY, {
      filter: { shopId: "shop-1" },
      threshold: 0.5,
    });

    expect(results).toEqual([]);
  });
});

// ============================================================================
// Search wrappers
// ============================================================================

describe("search wrappers", () => {
  it("searchProducts forces the product document type", async () => {
    mockEmbeddingFindMany.mockResolvedValue([
      makeRecord({ chunkId: "p", chunk: { ...makeRecord().chunk, documentType: "product" } }),
      makeRecord({ chunkId: "pol", chunk: { ...makeRecord().chunk, documentType: "policy" } }),
    ]);
    const { searchProducts } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchProducts(QUERY);

    expect(results.map((r) => r.chunkId)).toEqual(["p"]);
  });

  it("searchPolicies forces the policy document type", async () => {
    mockEmbeddingFindMany.mockResolvedValue([
      makeRecord({ chunkId: "pol", chunk: { ...makeRecord().chunk, documentType: "policy" } }),
    ]);
    const { searchPolicies } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchPolicies(QUERY);

    expect(results.map((r) => r.chunkId)).toEqual(["pol"]);
  });

  it("searchArticles forces the article document type", async () => {
    mockEmbeddingFindMany.mockResolvedValue([
      makeRecord({ chunkId: "art", chunk: { ...makeRecord().chunk, documentType: "article" } }),
    ]);
    const { searchArticles } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchArticles(QUERY);

    expect(results.map((r) => r.chunkId)).toEqual(["art"]);
  });

  it("multiSearch returns buckets for each document type", async () => {
    mockEmbeddingFindMany.mockResolvedValue([
      makeRecord({ chunkId: "p1", chunk: { ...makeRecord().chunk, documentType: "product" } }),
      makeRecord({ chunkId: "p2", chunk: { ...makeRecord().chunk, documentType: "product" } }),
      makeRecord({ chunkId: "pol", chunk: { ...makeRecord().chunk, documentType: "policy" } }),
      makeRecord({ chunkId: "art", chunk: { ...makeRecord().chunk, documentType: "article" } }),
    ]);
    const { multiSearch } = await import("../../../app/services/vector-retrieval.server");

    const result = await multiSearch(QUERY);

    expect(result.products.map((r) => r.chunkId)).toEqual(["p1", "p2"]);
    expect(result.policies.map((r) => r.chunkId)).toEqual(["pol"]);
    expect(result.articles.map((r) => r.chunkId)).toEqual(["art"]);
  });

  it("searchAll caps the results at the requested limit", async () => {
    const records = Array.from({ length: 6 }, (_, i) =>
      makeRecord({ chunkId: `c${i}`, embedding: [1 - i * 0.05, 0, 0] }),
    );
    mockEmbeddingFindMany.mockResolvedValue(records);
    const { searchAll } = await import("../../../app/services/vector-retrieval.server");

    const results = await searchAll(QUERY, { limit: 3 });

    expect(results).toHaveLength(3);
  });
});

// ============================================================================
// getEmbeddingStats
// ============================================================================

describe("getEmbeddingStats", () => {
  it("aggregates counts by document type, provider and dimension", async () => {
    mockEmbeddingFindMany.mockResolvedValue([
      makeRecord({ chunkId: "a", provider: "openai", dimension: 1536, chunk: { ...makeRecord().chunk, documentType: "product" } }),
      makeRecord({ chunkId: "b", provider: "openai", dimension: 1536, chunk: { ...makeRecord().chunk, documentType: "product" } }),
      makeRecord({ chunkId: "c", provider: "gemini", dimension: 768, chunk: { ...makeRecord().chunk, documentType: "policy" } }),
    ]);
    const { getEmbeddingStats } = await import("../../../app/services/vector-retrieval.server");

    const stats = await getEmbeddingStats();

    expect(stats.totalRecords).toBe(3);
    expect(stats.byDocumentType).toEqual({ product: 2, policy: 1 });
    expect(stats.byProvider).toEqual({ openai: 2, gemini: 1 });
    expect(stats.averageDimension).toBe((1536 + 1536 + 768) / 3);
  });

  it("returns zeros when there are no records", async () => {
    const { getEmbeddingStats } = await import("../../../app/services/vector-retrieval.server");

    const stats = await getEmbeddingStats();

    expect(stats).toEqual({
      totalRecords: 0,
      byDocumentType: {},
      byProvider: {},
      averageDimension: 0,
    });
  });
});

// ============================================================================
// rerank
// ============================================================================

describe("rerank", () => {
  async function loadRerank() {
    const mod = await import("../../../app/services/vector-retrieval.server");
    return mod.rerank;
  }

  function result(relevance: number, title: string, content = "content here") {
    return { chunkId: "1", documentType: "product", title, content, relevance, metadata: {} };
  }

  it("boosts exact title matches the most (capped at 1)", async () => {
    const rerank = await loadRerank();
    const [r] = rerank([result(0.6, "Winter Coat")], "winter coat", { boostKeywordMatch: true });
    expect(r.relevance).toBeCloseTo(1, 5);
  });

  it("boosts partial title matches", async () => {
    const rerank = await loadRerank();
    const [r] = rerank([result(0.6, "Winter Coat Pro")], "winter coat", { boostKeywordMatch: true });
    expect(r.relevance).toBeCloseTo(0.9, 5);
  });

  it("does not boost when boostKeywordMatch is disabled", async () => {
    const rerank = await loadRerank();
    const [r] = rerank([result(0.6, "Winter Coat")], "winter coat");
    expect(r.relevance).toBe(0.6);
  });

  it("penalizes very long documents", async () => {
    const rerank = await loadRerank();
    const [r] = rerank([result(0.8, "Long Doc", "x".repeat(2500))], "long doc");
    expect(r.relevance).toBeCloseTo(0.72, 5);
  });

  it("caps the score at 1", async () => {
    const rerank = await loadRerank();
    const [r] = rerank([result(0.95, "Winter Coat")], "winter coat", { boostKeywordMatch: true });
    expect(r.relevance).toBeLessThanOrEqual(1);
  });
});
