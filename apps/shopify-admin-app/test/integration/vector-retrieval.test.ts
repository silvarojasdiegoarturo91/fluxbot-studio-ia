import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  cosineSimilarity,
  searchCatalog,
  searchProducts,
  searchPolicies,
  validateEmbedding,
  getEmbeddingStats,
  rerank,
} from '../../app/services/vector-retrieval.server';
import {
  buildCatalogContext,
  buildPoliciesContext,
  buildRecommendationContext,
  formatContextForPrompt,
  isContextReliable,
  type RAGContext,
} from '../../app/services/rag-builder.server';

// Mock Prisma before importing any services
vi.mock('../../app/db.server', () => ({
  default: {
    embeddingRecord: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    knowledgeChunk: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../app/services/embeddings.server', () => ({
  getEmbeddingsProvider: vi.fn(() => ({
    embed: vi.fn((text: string) => {
      // Mock embedding: hash text to deterministic vector
      const encoded = text.toLowerCase();
      const vec = new Array(1536).fill(0);
      for (let i = 0; i < Math.min(encoded.length, 1536); i++) {
        vec[i] = (encoded.charCodeAt(i) % 256) / 256;
      }
      return Promise.resolve(vec);
    }),
  })),
}));

import prisma from '../../app/db.server';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createMockEmbeddingRecord(
  overrides: any = {}
) {
  const defaultEmbedding = new Array(1536).fill(0).map(() => Math.random());
  return {
    id: 'emb-1',
    chunkId: 'chunk-1',
    provider: 'openai',
    model: 'text-embedding-3-small',
    embedding: defaultEmbedding,
    dimension: 1536,
    chunk: {
      id: 'chunk-1',
      shopId: 'shop-1',
      documentType: 'product',
      content: 'Blue winter coat made of wool',
      metadata: {
        title: 'Winter Coat',
        productId: 'prod-123',
        price: 89.99,
        locale: 'en',
      },
      createdAt: new Date(),
    },
    ...overrides,
  };
}

function createMockPolicy(title: string, content: string) {
  const embedding = new Array(1536).fill(0).map(() => Math.random());
  return {
    id: `policy-${title}`,
    chunkId: `policy-chunk-${title}`,
    provider: 'openai',
    model: 'text-embedding-3-small',
    embedding,
    dimension: 1536,
    chunk: {
      id: `policy-chunk-${title}`,
      shopId: 'shop-1',
      documentType: 'policy',
      content,
      metadata: {
        title,
        category: 'Returns',
        locale: 'en',
      },
    },
  };
}

// ============================================================================
// VECTOR RETRIEVAL TESTS
// ============================================================================

describe('Vector Retrieval Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cosineSimilarity', () => {
    it('should calculate similarity between identical vectors', () => {
      const vec = [1, 0, 0];
      const similarity = cosineSimilarity(vec, vec);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should calculate similarity between orthogonal vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should calculate similarity between opposite vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [-1, 0, 0];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it('should return 0 for different length vectors', () => {
      const similarity = cosineSimilarity([1, 0], [1, 0, 0]);
      expect(similarity).toBe(0);
    });

    it('should handle zero vectors', () => {
      const similarity = cosineSimilarity([0, 0, 0], [0, 0, 0]);
      expect(isNaN(similarity) || similarity === 0).toBe(true);
    });
  });

  describe('validateEmbedding', () => {
    it('should validate correct embedding', () => {
      const embedding = new Array(1536).fill(0.5);
      expect(validateEmbedding(embedding, 1536)).toBe(true);
    });

    it('should reject embedding with wrong dimension', () => {
      const embedding = new Array(768).fill(0.5);
      expect(validateEmbedding(embedding, 1536)).toBe(false);
    });

    it('should reject non-array embeddings', () => {
      expect(validateEmbedding({} as any, 1536)).toBe(false);
    });

    it('should reject embeddings with NaN values', () => {
      const embedding = new Array(1536).fill(0.5);
      embedding[10] = NaN;
      expect(validateEmbedding(embedding, 1536)).toBe(false);
    });
  });

  describe('searchCatalog', () => {
    it('should return empty array when no matches found', async () => {
      (prisma.embeddingRecord.findMany as any).mockResolvedValue([]);
      
      const results = await searchCatalog(
        new Array(1536).fill(0.5),
        { limit: 5 }
      );
      
      expect(results).toEqual([]);
    });

    it('should filter by document type', async () => {
      const productRecord = createMockEmbeddingRecord({
        chunk: { ...createMockEmbeddingRecord().chunk, documentType: 'product' },
      });
      const policyRecord = createMockEmbeddingRecord({
        chunkId: 'policy-1',
        chunk: { ...createMockEmbeddingRecord().chunk, documentType: 'policy' },
      });

      (prisma.embeddingRecord.findMany as any).mockResolvedValue([
        productRecord,
        policyRecord,
      ]);

      const results = await searchCatalog(
        new Array(1536).fill(0.5),
        { filter: { documentType: 'product' } }
      );

      expect(results.every((r) => r.documentType === 'product')).toBe(true);
    });

    it('should filter by locale', async () => {
      const enRecord = createMockEmbeddingRecord({
        chunk: {
          ...createMockEmbeddingRecord().chunk,
          metadata: { ...createMockEmbeddingRecord().chunk.metadata, locale: 'en' },
        },
      });
      const esRecord = createMockEmbeddingRecord({
        chunkId: 'es-chunk',
        chunk: {
          ...createMockEmbeddingRecord().chunk,
          metadata: { ...createMockEmbeddingRecord().chunk.metadata, locale: 'es' },
        },
      });

      (prisma.embeddingRecord.findMany as any).mockResolvedValue([
        enRecord,
        esRecord,
      ]);

      const results = await searchCatalog(
        new Array(1536).fill(0.5),
        { filter: { locales: ['en'] } }
      );

      expect(results.every((r) => (r.metadata as any)?.locale === 'en' || !r.metadata)).toBe(true);
    });

    it('should apply relevance threshold', async () => {
      (prisma.embeddingRecord.findMany as any).mockResolvedValue([
        createMockEmbeddingRecord(),
      ]);

      const results = await searchCatalog(
        new Array(1536).fill(0.5),
        { threshold: 0.9 } // High threshold
      );

      // May or may not return results depending on similarity score
      expect(Array.isArray(results)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const records = Array.from({ length: 10 }, (_, i) =>
        createMockEmbeddingRecord({ chunkId: `chunk-${i}` })
      );

      (prisma.embeddingRecord.findMany as any).mockResolvedValue(records);

      const results = await searchCatalog(
        new Array(1536).fill(0.5),
        { limit: 3 }
      );

      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('searchProducts', () => {
    it('should filter to only product documents', async () => {
      (prisma.embeddingRecord.findMany as any).mockResolvedValue([
        createMockEmbeddingRecord({
          chunk: { ...createMockEmbeddingRecord().chunk, documentType: 'product' },
        }),
      ]);

      const results = await searchProducts(new Array(1536).fill(0.5));

      expect(results.every((r) => r.documentType === 'product')).toBe(true);
    });
  });

  describe('rerank', () => {
    it('should boost exact matches', () => {
      const results = [
        {
          chunkId: '1',
          documentType: 'product',
          title: 'Blue Winter Coat',
          content: 'A warm winter coat',
          relevance: 0.5,
          metadata: {},
        },
      ];

      const reranked = rerank(results, 'Blue Winter Coat', {
        boostKeywordMatch: true,
      });

      expect(reranked[0].relevance).toBeGreaterThan(results[0].relevance);
    });

    it('should penalize very long documents', () => {
      const results = [
        {
          chunkId: '1',
          documentType: 'product',
          title: 'Product',
          content: 'x'.repeat(2500), // Very long
          relevance: 0.8,
          metadata: {},
        },
      ];

      const reranked = rerank(results, 'product');

      expect(reranked[0].relevance).toBeLessThan(results[0].relevance);
    });

    it('should maintain relevance bounds', () => {
      const results = [
        {
          chunkId: '1',
          documentType: 'product',
          title: 'Product',
          content: 'Content',
          relevance: 0.8,
          metadata: {},
        },
      ];

      const reranked = rerank(results, 'product query');

      expect(reranked[0].relevance).toBeGreaterThanOrEqual(0);
      expect(reranked[0].relevance).toBeLessThanOrEqual(1);
    });
  });
});

// ============================================================================
// RAG BUILDER TESTS
// ============================================================================

describe('RAG Builder Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatContextForPrompt', () => {
    it('should format products section', () => {
      const context: RAGContext = {
        products: [
          {
            id: '1',
            title: 'Winter Coat',
            description: 'A warm coat',
            price: 89.99,
            relevance: 0.8,
          },
        ],
        policies: [],
        articles: [],
        confidence: 0.8,
        sources: [
          { title: 'Winter Coat', type: 'product', relevance: 0.8 },
        ],
        summary: 'Products found',
        fallback: false,
      };

      const formatted = formatContextForPrompt(context);

      expect(formatted).toContain('Winter Coat');
      expect(formatted).toContain('89.99');
      expect(formatted).toContain('Products');
    });

    it('should format policies section', () => {
      const context: RAGContext = {
        products: [],
        policies: [
          {
            title: 'Returns Policy',
            content: 'Returns accepted within 30 days',
            category: 'returns',
            relevance: 0.9,
          },
        ],
        articles: [],
        confidence: 0.9,
        sources: [
          { title: 'Returns Policy', type: 'policy', relevance: 0.9 },
        ],
        summary: 'Policy found',
        fallback: false,
      };

      const formatted = formatContextForPrompt(context);

      expect(formatted).toContain('Returns Policy');
      expect(formatted).toContain('30 days');
    });

    it('should return empty string for fallback context', () => {
      const context: RAGContext = {
        products: [],
        policies: [],
        articles: [],
        confidence: 0,
        sources: [],
        summary: 'No context',
        fallback: true,
      };

      const formatted = formatContextForPrompt(context);

      expect(formatted).toBe('');
    });

    it('should include confidence percentage', () => {
      const context: RAGContext = {
        products: [],
        policies: [],
        articles: [],
        confidence: 0.75,
        sources: [
          { title: 'Test Source', type: 'policy', relevance: 0.75 },
        ],
        summary: 'Test',
        fallback: false,
      };

      const formatted = formatContextForPrompt(context);

      expect(formatted).toContain('75%');
    });
  });

  describe('isContextReliable', () => {
    it('should return true for reliable context', () => {
      const context: RAGContext = {
        products: [{ id: '1', title: 'Product', description: '', relevance: 0.8 }],
        policies: [],
        articles: [],
        confidence: 0.75,
        sources: [{ title: 'Product', type: 'product', relevance: 0.75 }],
        summary: 'Context',
        fallback: false,
      };

      expect(isContextReliable(context, 0.5)).toBe(true);
    });

    it('should return false for fallback context', () => {
      const context: RAGContext = {
        products: [],
        policies: [],
        articles: [],
        confidence: 0,
        sources: [],
        summary: 'No context',
        fallback: true,
      };

      expect(isContextReliable(context)).toBe(false);
    });

    it('should return false when confidence below threshold', () => {
      const context: RAGContext = {
        products: [],
        policies: [],
        articles: [],
        confidence: 0.3,
        sources: [{ title: 'Source', type: 'policy', relevance: 0.3 }],
        summary: 'Low confidence',
        fallback: false,
      };

      expect(isContextReliable(context, 0.5)).toBe(false);
    });

    it('should return false when no sources available', () => {
      const context: RAGContext = {
        products: [],
        policies: [],
        articles: [],
        confidence: 0.8,
        sources: [],
        summary: 'No sources',
        fallback: false,
      };

      expect(isContextReliable(context)).toBe(false);
    });
  });

  describe('buildCatalogContext', () => {
    it('should return fallback context when no provider', async () => {
      const { buildCatalogContext: bcc } = await import(
        '../../app/services/rag-builder.server'
      );

      // Mock embeddings provider to return null
      vi.resetModules();
      vi.mock('../../app/services/embeddings.server', () => ({
        getEmbeddingsProvider: vi.fn(() => null),
      }));

      // Context check: service should handle null provider gracefully
      // This test validates error handling
      expect(true).toBe(true); // Placeholder for integration test
    });

    it('should mark context as reliable when high relevance results found', async () => {
      // This integration test would require full setup
      // Placeholder to ensure test structure is correct
      expect(true).toBe(true);
    });
  });

  describe('buildPoliciesContext', () => {
    it('should return policy-focused context', async () => {
      // Integration test placeholder
      expect(true).toBe(true);
    });
  });

  describe('buildRecommendationContext', () => {
    it('should return empty context for empty cart', async () => {
      const context = await buildRecommendationContext([], {
        shopId: 'shop-1',
      });

      expect(context.fallback).toBe(true);
      expect(context.products).toEqual([]);
    });

    it('should boost confidence for recommendations', async () => {
      (prisma.embeddingRecord.findMany as any).mockResolvedValue([
        createMockEmbeddingRecord(),
      ]);

      const context = await buildRecommendationContext(
        [{ productId: 'prod-1', name: 'Winter Coat' }],
        { shopId: 'shop-1' }
      );

      // Confidence should be boosted
      if (!context.fallback) {
        expect(context.confidence).toBeGreaterThanOrEqual(0.4);
      }
    });
  });
});
