/**
 * Vector Retrieval Service - Phase 4
 *
 * Implements semantic search on embeddings using cosine similarity.
 * Supports:
 * - Direct vector similarity search
 * - Filtered search (by metadata)
 * - Reranking with cross-encoders
 * - Multi-language support
 */

import prisma from '../db.server';
import type { Prisma } from '@prisma/client';
import { getIAGateway } from './ia-gateway.server';

type EmbeddingRecordWithRelations = Prisma.EmbeddingRecordGetPayload<{
  include: {
    chunk: {
      include: {
        document: {
          include: {
            source: true,
          },
        },
      },
    },
  },
}>;

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseEmbeddingVector(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  }

  if (typeof value === 'string') {
    try {
      return parseEmbeddingVector(JSON.parse(value));
    } catch {
      return [];
    }
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((entry) => Number(entry))
      .filter((entry) => Number.isFinite(entry));
  }

  return [];
}

function mapSourceTypeToDocumentType(sourceType?: string): string {
  switch (sourceType) {
    case 'CATALOG':
      return 'product';
    case 'POLICIES':
      return 'policy';
    case 'PAGES':
    case 'BLOG':
    case 'FAQ':
    case 'CUSTOM':
      return 'article';
    default:
      return 'article';
  }
}

function resolveDocumentType(record: EmbeddingRecordWithRelations): string {
  const legacyChunk = record.chunk as unknown as { documentType?: string };
  if (typeof legacyChunk.documentType === 'string' && legacyChunk.documentType.length > 0) {
    return legacyChunk.documentType.toLowerCase();
  }

  const metadata = asMetadata(record.chunk.metadata);
  if (typeof metadata.policyType === 'string' || typeof metadata.category === 'string') {
    return 'policy';
  }

  if (typeof metadata.productId === 'string') {
    return 'product';
  }

  return mapSourceTypeToDocumentType(record.chunk.document?.source?.sourceType);
}

function resolveLocale(record: EmbeddingRecordWithRelations): string | undefined {
  const metadata = asMetadata(record.chunk.metadata);
  if (typeof metadata.locale === 'string' && metadata.locale.length > 0) {
    return metadata.locale;
  }

  const documentLanguage = record.chunk.document?.language;
  return typeof documentLanguage === 'string' && documentLanguage.length > 0
    ? documentLanguage
    : undefined;
}

function resolveTitle(record: EmbeddingRecordWithRelations): string {
  const metadata = asMetadata(record.chunk.metadata);
  if (typeof metadata.title === 'string' && metadata.title.length > 0) {
    return metadata.title;
  }

  if (typeof record.chunk.document?.title === 'string' && record.chunk.document.title.length > 0) {
    return record.chunk.document.title;
  }

  return 'Untitled';
}

// ============================================================================
// TYPES
// ============================================================================

export interface SearchResult {
  chunkId: string;
  documentType: string;
  title: string;
  content: string;
  relevance: number; // 0-1
  metadata: Record<string, unknown>;
}

export interface RetrievalOptions {
  limit?: number;
  threshold?: number; // minimum relevance score (0-1)
  filter?: {
    documentType?: string;
    locales?: string[];
    shopId?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface RerankerResult {
  chunkId: string;
  originalScore: number;
  rerankedScore: number;
  isRelevant: boolean;
}

// ============================================================================
// COSINE SIMILARITY
// ============================================================================

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Normalize vector to unit length
 */
function normalizeVector(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) {
    return vec;
  }
  return vec.map((val) => val / magnitude);
}

// ============================================================================
// VECTOR RETRIEVAL SERVICE
// ============================================================================

function getVectorExecutionMode(): 'local' | 'remote' {
  return process.env.IA_EXECUTION_MODE === 'local' ? 'local' : 'remote';
}

function clampRelevance(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function matchesDocumentType(result: SearchResult, filter?: RetrievalOptions['filter']): boolean {
  if (!filter?.documentType) return true;
  return result.documentType.toLowerCase() === filter.documentType.toLowerCase();
}

function matchesLocale(result: SearchResult, filter?: RetrievalOptions['filter']): boolean {
  if (!filter?.locales || filter.locales.length === 0) return true;

  const metadata = asMetadata(result.metadata);
  const locale = typeof metadata.locale === 'string' ? metadata.locale : undefined;
  return !!locale && filter.locales.includes(locale);
}

function applySearchFilters(
  results: SearchResult[],
  params: { limit: number; threshold: number; filter?: RetrievalOptions['filter'] },
): SearchResult[] {
  return results
    .map((result) => ({
      ...result,
      relevance: clampRelevance(result.relevance),
    }))
    .filter((result) => matchesDocumentType(result, params.filter))
    .filter((result) => matchesLocale(result, params.filter))
    .filter((result) => result.relevance >= params.threshold)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, params.limit);
}

async function resolveShopDomain(shopId: string): Promise<string | null> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { domain: true },
  });

  return shop?.domain ?? null;
}

async function searchCatalogLocal(
  queryEmbedding: number[],
  params: { limit: number; threshold: number; filter?: RetrievalOptions['filter'] },
): Promise<SearchResult[]> {
  const records = (await prisma.embeddingRecord.findMany({
    include: {
      chunk: {
        include: {
          document: {
            include: {
              source: true,
            },
          },
        },
      },
    },
    where: params.filter?.shopId
      ? {
          chunk: {
            document: {
              source: {
                shopId: params.filter.shopId,
              },
            },
          },
        }
      : undefined,
  })) as EmbeddingRecordWithRelations[];

  const localResults = records.map((record) => {
    const embedding = parseEmbeddingVector(record.embedding);
    const similarity = cosineSimilarity(queryEmbedding, embedding);

    return {
      chunkId: record.chunkId,
      documentType: resolveDocumentType(record),
      title: resolveTitle(record),
      content: record.chunk.content,
      relevance: similarity,
      metadata: asMetadata(record.chunk.metadata),
    } satisfies SearchResult;
  });

  return applySearchFilters(localResults, params);
}

async function searchCatalogRemote(
  queryEmbedding: number[],
  params: { limit: number; threshold: number; filter?: RetrievalOptions['filter'] },
): Promise<SearchResult[]> {
  if (!params.filter?.shopId) {
    // Remote retrieval requires tenant context for request routing.
    console.warn('[VectorRetrieval] remote mode requires filter.shopId; returning empty result set.');
    return [];
  }

  const shopDomain = await resolveShopDomain(params.filter.shopId);
  if (!shopDomain) {
    console.warn(`[VectorRetrieval] could not resolve shop domain for shopId=${params.filter.shopId}; returning empty result set.`);
    return [];
  }

  const gateway = getIAGateway();
  const remoteResults = await gateway.searchEmbeddings(
    {
      queryEmbedding,
      options: {
        limit: params.limit,
        threshold: params.threshold,
        filter: params.filter,
      },
    },
    shopDomain,
  );

  const normalizedResults: SearchResult[] = remoteResults.map((result) => ({
    chunkId: result.chunkId,
    documentType: result.documentType,
    title: result.title,
    content: result.content,
    relevance: result.relevance,
    metadata: asMetadata(result.metadata),
  }));

  return applySearchFilters(normalizedResults, params);
}

/**
 * Search for relevant knowledge chunks using semantic similarity
 */
export async function searchCatalog(
  queryEmbedding: number[],
  options: RetrievalOptions = {}
): Promise<SearchResult[]> {
  const { limit = 5, threshold = 0.5, filter } = options;

  try {
    if (getVectorExecutionMode() === 'local') {
      return searchCatalogLocal(queryEmbedding, { limit, threshold, filter });
    }

    return searchCatalogRemote(queryEmbedding, { limit, threshold, filter });
  } catch (error) {
    console.error('[VectorRetrieval] Search failed:', error);
    return [];
  }
}

/**
 * Search for products with optional structural filters
 * Combines vector similarity with metadata filtering
 */
export async function searchProducts(
  queryEmbedding: number[],
  options: RetrievalOptions = {}
): Promise<SearchResult[]> {
  return searchCatalog(queryEmbedding, {
    ...options,
    filter: {
      ...options.filter,
      documentType: 'product',
    },
  });
}

/**
 * Search for policies and FAQ documents
 */
export async function searchPolicies(
  queryEmbedding: number[],
  options: RetrievalOptions = {}
): Promise<SearchResult[]> {
  return searchCatalog(queryEmbedding, {
    ...options,
    filter: {
      ...options.filter,
      documentType: 'policy',
    },
  });
}

/**
 * Search for blog posts and articles
 */
export async function searchArticles(
  queryEmbedding: number[],
  options: RetrievalOptions = {}
): Promise<SearchResult[]> {
  return searchCatalog(queryEmbedding, {
    ...options,
    filter: {
      ...options.filter,
      documentType: 'article',
    },
  });
}

/**
 * Rerank search results using a simple heuristic-based scoring
 * In production, this could use a cross-encoder model
 *
 * Current heuristics:
 * - Prefer exact keyword matches
 * - Boost results with high original relevance
 * - Penalize very long documents
 */
export function rerank(
  results: SearchResult[],
  query: string,
  options: { boostKeywordMatch?: boolean } = {}
): SearchResult[] {
  const lowerQuery = query.toLowerCase();
  const queryTokens = lowerQuery.split(/\s+/);

  return results.map((result) => {
    let score = result.relevance;

    // Keyword matching boost
    if (options.boostKeywordMatch) {
      const contentLower = result.content.toLowerCase();
      const titleLower = result.title.toLowerCase();

      // Exact match in title gets highest boost
      if (titleLower === lowerQuery) {
        score = Math.min(1, score + 0.3);
      } else if (titleLower.includes(lowerQuery)) {
        score = Math.min(1, score + 0.2);
      }

      // Count token matches
      const matchingTokens = queryTokens.filter(
        (token) =>
          contentLower.includes(token) || titleLower.includes(token)
      ).length;
      const tokenMatchRatio = matchingTokens / queryTokens.length;
      score = Math.min(1, score + tokenMatchRatio * 0.1);
    }

    // Length penalty (very long documents less relevant for direct answer)
    const contentLength = result.content.length;
    if (contentLength > 2000) {
      score *= 0.9; // 10% penalty for very long documents
    }

    return {
      ...result,
      relevance: score,
    };
  });
}

/**
 * Get multiple search results across different document types
 */
export async function multiSearch(
  queryEmbedding: number[],
  options: RetrievalOptions = {}
): Promise<{
  products: SearchResult[];
  policies: SearchResult[];
  articles: SearchResult[];
}> {
  const [products, policies, articles] = await Promise.all([
    searchProducts(queryEmbedding, { ...options, limit: 3 }),
    searchPolicies(queryEmbedding, { ...options, limit: 2 }),
    searchArticles(queryEmbedding, { ...options, limit: 2 }),
  ]);

  return {
    products: rerank(products, '', { boostKeywordMatch: true }),
    policies: rerank(policies, '', { boostKeywordMatch: true }),
    articles: rerank(articles, '', { boostKeywordMatch: true }),
  };
}

/**
 * Get top N results across all types, sorted by relevance
 */
export async function searchAll(
  queryEmbedding: number[],
  options: RetrievalOptions = {}
): Promise<SearchResult[]> {
  const results = await searchCatalog(queryEmbedding, {
    ...options,
    limit: options.limit ? options.limit * 2 : 10, // Get more to account for filtering
  });

  return results.slice(0, options.limit || 5);
}

/**
 * Validate that an embedding vector has the expected dimension
 */
export function validateEmbedding(
  embedding: number[],
  expectedDimension: number = 1536
): boolean {
  return (
    Array.isArray(embedding) &&
    embedding.length === expectedDimension &&
    embedding.every((val) => typeof val === 'number' && !isNaN(val))
  );
}

/**
 * Get statistics about embeddings in the database
 */
export async function getEmbeddingStats(): Promise<{
  totalRecords: number;
  byDocumentType: Record<string, number>;
  byProvider: Record<string, number>;
  averageDimension: number;
}> {
  const records = (await prisma.embeddingRecord.findMany({
    include: {
      chunk: {
        include: {
          document: {
            include: {
              source: true,
            },
          },
        },
      },
    },
  })) as EmbeddingRecordWithRelations[];

  const byDocumentType: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  let totalDimensions = 0;

  for (const record of records) {
    // Count by document type
    const docType = resolveDocumentType(record);
    byDocumentType[docType] = (byDocumentType[docType] || 0) + 1;

    // Count by provider
    byProvider[record.provider] = (byProvider[record.provider] || 0) + 1;

    // Track dimensionality
    totalDimensions += record.dimension;
  }

  return {
    totalRecords: records.length,
    byDocumentType,
    byProvider,
    averageDimension:
      records.length > 0 ? totalDimensions / records.length : 0,
  };
}
