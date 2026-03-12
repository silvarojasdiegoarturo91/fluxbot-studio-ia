/**
 * RAG Builder Service - Phase 4
 *
 * Builds Retrieval-Augmented Generation (RAG) context by:
 * 1. Searching for relevant documents via remote IA quality pipeline
 * 2. Formatting results into structured context
 * 3. Handling fallback contexts when remote retrieval is unavailable
 * 4. Integrating conversation history
 * 5. Supporting multi-language context
 */

import prisma from '../db.server';
import { iaClient, type RerankStrategy } from './ia-backend.server';

interface SearchResult {
  chunkId: string;
  documentType: 'product' | 'policy' | 'article';
  title: string;
  content: string;
  relevance: number;
  metadata: Record<string, unknown>;
}

// ============================================================================
// TYPES
// ============================================================================

export interface RAGContext {
  products: FormattedProduct[];
  policies: FormattedPolicy[];
  articles: FormattedArticle[];
  confidence: number; // 0-1, overall confidence in context relevance
  sources: SourceReference[];
  summary: string;
  fallback: boolean; // true if couldn't find good matches
  qualityMetadata?: {
    wasReranked: boolean;
    rerankStrategy: string;
    appliedMinScore: number;
    candidatesBeforeRerank: number;
  };
}

export interface FormattedProduct {
  id: string;
  title: string;
  description: string;
  price?: number;
  image?: string;
  url?: string;
  relevance: number;
}

export interface FormattedPolicy {
  title: string;
  content: string;
  category: string;
  relevance: number;
}

export interface FormattedArticle {
  title: string;
  excerpt: string;
  url?: string;
  relevance: number;
}

export interface SourceReference {
  title: string;
  type: 'product' | 'policy' | 'article';
  relevance: number;
}

export interface RAGBuilderOptions {
  shopId: string;
  locale?: string;
  limit?: number;
  threshold?: number;
  /** Reranking strategy forwarded to the backend quality pipeline. Defaults to 'cross_encoder'. */
  rerankStrategy?: RerankStrategy;
  includeHistory?: boolean;
  conversationHistory?: Array<{ role: string; content: string }>;
}

const REMOTE_RAG_DEFAULT_LIMIT = 24;

function isRemoteRagEnabled(): boolean {
  return process.env.IA_EXECUTION_MODE !== 'local';
}

interface RemoteSearchSuccess {
  status: 'ok';
  results: SearchResult[];
  qualityMetadata?: RAGContext['qualityMetadata'];
}

interface RemoteSearchUnavailable {
  status: 'unavailable';
  reason: string;
}

type RemoteSearchOutcome = RemoteSearchSuccess | RemoteSearchUnavailable;

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clampRelevance(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function mapRemoteSourceTypeToDocumentType(sourceType?: string): 'product' | 'policy' | 'article' {
  switch (sourceType) {
    case 'CATALOG':
      return 'product';
    case 'POLICIES':
      return 'policy';
    default:
      return 'article';
  }
}

function inferRemoteDocumentType(metadata: Record<string, unknown>): 'product' | 'policy' | 'article' {
  if (typeof metadata.documentType === 'string') {
    const value = metadata.documentType.toLowerCase();
    if (value === 'product' || value === 'policy' || value === 'article') {
      return value;
    }
  }

  if (typeof metadata.productId === 'string') return 'product';
  if (typeof metadata.policyType === 'string' || typeof metadata.category === 'string') return 'policy';

  if (typeof metadata.sourceType === 'string') {
    return mapRemoteSourceTypeToDocumentType(metadata.sourceType);
  }

  return 'article';
}

async function searchRemoteWithQualityPipeline(
  query: string,
  options: RAGBuilderOptions,
  allowedTypes?: Array<'product' | 'policy' | 'article'>,
): Promise<RemoteSearchOutcome> {
  if (!isRemoteRagEnabled()) {
    return {
      status: 'unavailable',
      reason: 'Remote quality pipeline requires IA_EXECUTION_MODE=remote.',
    };
  }

  const shop = await prisma.shop.findUnique({
    where: { id: options.shopId },
    select: { domain: true },
  });

  if (!shop?.domain) {
    return {
      status: 'unavailable',
      reason: 'Shop domain unavailable for remote retrieval.',
    };
  }

  try {
    const candidateLimit = Math.max((options.limit || 5) * 3, REMOTE_RAG_DEFAULT_LIMIT);
    const response = await iaClient.rag.search(
      {
        query,
        filters: {
          language: options.locale,
          limit: candidateLimit,
          minScore: options.threshold,
          rerankStrategy: options.rerankStrategy ?? 'cross_encoder',
          topK: options.limit,
        },
      },
      shop.domain,
    );

    const mapped = response.results.map((result) => {
      const metadata = asMetadata(result.metadata);
      const documentType = inferRemoteDocumentType(metadata);
      const title =
        (typeof metadata.title === 'string' && metadata.title.length > 0
          ? metadata.title
          : typeof metadata.name === 'string' && metadata.name.length > 0
            ? metadata.name
            : 'Knowledge Result');

      return {
        chunkId: result.chunkId,
        documentType,
        title,
        content: result.content,
        relevance: clampRelevance(result.score),
        metadata,
      } as SearchResult;
    });

    const typeFiltered = allowedTypes && allowedTypes.length > 0
      ? mapped.filter((result) => allowedTypes.includes(result.documentType as any))
      : mapped;

    // Client-side belt-and-suspenders: drop any result that falls below threshold
    // even if the backend returned it (e.g. backend doesn't yet implement minScore)
    const minScore = options.threshold ?? 0;
    const scoreFiltered = minScore > 0
      ? typeFiltered.filter((r) => r.relevance >= minScore)
      : typeFiltered;

    return {
      status: 'ok',
      results: scoreFiltered.sort((a, b) => b.relevance - a.relevance),
      qualityMetadata: response.qualityMetadata,
    };
  } catch (error) {
    console.warn('[RAGBuilder] Remote retrieval unavailable:', error);
    return {
      status: 'unavailable',
      reason: 'Remote retrieval request failed.',
    };
  }
}

function buildContextFromResultSets(
  productResults: SearchResult[],
  policyResults: SearchResult[],
  articleResults: SearchResult[],
  confidenceThreshold: number,
  qualityMetadata?: RAGContext['qualityMetadata'],
): RAGContext {
  const topRelevance = Math.max(
    productResults[0]?.relevance || 0,
    policyResults[0]?.relevance || 0,
    articleResults[0]?.relevance || 0,
  );
  const hasGoodMatches = topRelevance > confidenceThreshold;
  const fallback = !hasGoodMatches;

  const products = formatProductResults(productResults);
  const policies = formatPolicyResults(policyResults);
  const articles = formatArticleResults(articleResults);

  const sources: SourceReference[] = [
    ...productResults.map((r) => ({
      title: r.title,
      type: 'product' as const,
      relevance: r.relevance,
    })),
    ...policyResults.map((r) => ({
      title: r.title,
      type: 'policy' as const,
      relevance: r.relevance,
    })),
    ...articleResults.map((r) => ({
      title: r.title,
      type: 'article' as const,
      relevance: r.relevance,
    })),
  ].sort((a, b) => b.relevance - a.relevance);

  return {
    products,
    policies,
    articles,
    confidence: hasGoodMatches ? topRelevance : 0.3,
    sources,
    summary: buildContextSummary(products, policies, articles, fallback),
    fallback,
    qualityMetadata,
  };
}

// ============================================================================
// RAG CONTEXT BUILDERS
// ============================================================================

/**
 * Build catalog context from search results
 */
function formatProductResults(results: SearchResult[]): FormattedProduct[] {
  return results.map((result) => ({
    id: (result.metadata.productId as string) || result.chunkId,
    title: result.title,
    description: result.content.substring(0, 300) + '...', // Truncate for context
    price: (result.metadata.price as number) || undefined,
    image: (result.metadata.image as string) || undefined,
    url: (result.metadata.url as string) || undefined,
    relevance: result.relevance,
  }));
}

/**
 * Format policy search results
 */
function formatPolicyResults(results: SearchResult[]): FormattedPolicy[] {
  return results.map((result) => ({
    title: result.title,
    content: result.content.substring(0, 500),
    category: ((result.metadata.category as string) || 'General').toLowerCase(),
    relevance: result.relevance,
  }));
}

/**
 * Format article search results
 */
function formatArticleResults(results: SearchResult[]): FormattedArticle[] {
  return results.map((result) => ({
    title: result.title,
    excerpt: result.content.substring(0, 200),
    url: (result.metadata.url as string) || undefined,
    relevance: result.relevance,
  }));
}

/**
 * Build complete RAG context for a query
 */
export async function buildCatalogContext(
  query: string,
  options: RAGBuilderOptions
): Promise<RAGContext> {
  const {
    limit = 5,
    threshold = 0.4,
  } = options;

  try {
    const productLimit = Math.ceil(limit * 0.6);
    const policyLimit = Math.ceil(limit * 0.25);
    const articleLimit = Math.ceil(limit * 0.15);
    const confidenceThreshold = Math.max(threshold, 0.6);

    const remoteSearch = await searchRemoteWithQualityPipeline(query, options);
    if (remoteSearch.status === 'unavailable') {
      return getFallbackContext(remoteSearch.reason, options);
    }

    if (remoteSearch.results.length === 0) {
      return getFallbackContext('No relevant remote context found.', options);
    }

    const productResults = remoteSearch.results
      .filter((result) => result.documentType === 'product')
      .slice(0, productLimit);
    const policyResults = remoteSearch.results
      .filter((result) => result.documentType === 'policy')
      .slice(0, policyLimit);
    const articleResults = remoteSearch.results
      .filter((result) => result.documentType === 'article')
      .slice(0, articleLimit);

    if (productResults.length + policyResults.length + articleResults.length === 0) {
      return getFallbackContext('Remote retrieval did not return supported document types.', options);
    }

    return buildContextFromResultSets(productResults, policyResults, articleResults, confidenceThreshold, remoteSearch.qualityMetadata);
  } catch (error) {
    console.error('[RAGBuilder] Context build failed:', error);
    return getFallbackContext('Context generation failed', options);
  }
}

/**
 * Build policy-specific context
 */
export async function buildPoliciesContext(
  topic: string,
  options: RAGBuilderOptions
): Promise<RAGContext> {
  const { threshold = 0.5 } = options;
  const confidenceThreshold = Math.max(threshold, 0.5);

  try {
    const remotePolicySearch = await searchRemoteWithQualityPipeline(
      `policy ${topic}`,
      options,
      ['policy'],
    );

    if (remotePolicySearch.status === 'unavailable') {
      return getFallbackContext(remotePolicySearch.reason, options);
    }

    if (remotePolicySearch.results.length === 0) {
      return getFallbackContext('No relevant remote policy context found.', options);
    }

    const limited = remotePolicySearch.results.slice(0, 8);
    return buildContextFromResultSets([], limited, [], confidenceThreshold, remotePolicySearch.qualityMetadata);
  } catch (error) {
    console.error('[RAGBuilder] Policy context failed:', error);
    return getFallbackContext('Policy context failed', options);
  }
}

/**
 * Build product recommendation context
 */
export async function buildRecommendationContext(
  cartItems: Array<{ productId: string; name: string }>,
  options: RAGBuilderOptions
): Promise<RAGContext> {
  try {
    if (cartItems.length === 0) {
      return getFallbackContext('No cart items to base recommendations on', options);
    }

    // Build context query from cart items
    const cartContext = cartItems
      .map((item) => item.name)
      .join(', ');
    const query = `recommend products similar to ${cartContext}`;

    const remoteProductSearch = await searchRemoteWithQualityPipeline(
      query,
      options,
      ['product'],
    );

    if (remoteProductSearch.status === 'unavailable') {
      return getFallbackContext(remoteProductSearch.reason, options);
    }

    if (remoteProductSearch.results.length === 0) {
      return getFallbackContext('No remote recommendations available for current cart context.', options);
    }

    const productResults = remoteProductSearch.results.slice(0, 6);

    return {
      products: formatProductResults(productResults),
      policies: [],
      articles: [],
      confidence: Math.min(1, productResults[0]?.relevance || 0),
      sources: productResults.map((r) => ({
        title: r.title,
        type: 'product' as const,
        relevance: r.relevance,
      })),
      summary: `Recommended products based on your cart`,
      fallback: false,
      qualityMetadata: remoteProductSearch.qualityMetadata,
    };
  } catch (error) {
    console.error('[RAGBuilder] Recommendation context failed:', error);
    return getFallbackContext('Failed to generate recommendations', options);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build a natural language summary of the context
 */
function buildContextSummary(
  products: FormattedProduct[],
  policies: FormattedPolicy[],
  articles: FormattedArticle[],
  fallback: boolean
): string {
  if (fallback) {
    return 'Limited context available. Will provide general guidance.';
  }

  const parts: string[] = [];

  if (products.length > 0) {
    parts.push(
      `Found ${products.length} relevant product(s): ${products.map((p) => p.title).join(', ')}`
    );
  }

  if (policies.length > 0) {
    parts.push(
      `${policies.length} policy document(s) available on: ${policies.map((p) => p.category).join(', ')}`
    );
  }

  if (articles.length > 0) {
    parts.push(`${articles.length} article(s) found`);
  }

  return parts.join('. ') || 'Context compiled.';
}

/**
 * Get fallback context when RAG fails
 */
function getFallbackContext(
  reason: string,
  options: RAGBuilderOptions
): RAGContext {
  return {
    products: [],
    policies: [],
    articles: [],
    confidence: 0,
    sources: [],
    summary: `Unable to load context: ${reason}. Will respond based on training knowledge.`,
    fallback: true,
  };
}

/**
 * Format RAG context for injection into system prompt
 */
export function formatContextForPrompt(context: RAGContext): string {
  if (context.fallback || context.sources.length === 0) {
    return '';
  }

  const sections: string[] = ['## Context from Knowledge Base\n'];

  if (context.products.length > 0) {
    sections.push('### Products');
    context.products.forEach((p) => {
      sections.push(`- **${p.title}** (Relevance: ${(p.relevance * 100).toFixed(0)}%)`);
      if (p.price) {
        sections.push(`  Price: $${p.price.toFixed(2)}`);
      }
      sections.push(`  ${p.description}`);
    });
    sections.push('');
  }

  if (context.policies.length > 0) {
    sections.push('### Policies');
    context.policies.forEach((p) => {
      sections.push(`- **${p.title}** (${p.category})`);
      sections.push(`  ${p.content}`);
    });
    sections.push('');
  }

  if (context.articles.length > 0) {
    sections.push('### Helpful Articles');
    context.articles.forEach((a) => {
      sections.push(`- **${a.title}**: ${a.excerpt}`);
    });
    sections.push('');
  }

  sections.push(`\n*Context confidence: ${(context.confidence * 100).toFixed(0)}%*\n`);

  return sections.join('\n');
}

/**
 * Check if context is reliable enough to use
 */
export function isContextReliable(context: RAGContext, minConfidence: number = 0.5): boolean {
  return (
    !context.fallback &&
    context.confidence >= minConfidence &&
    context.sources.length > 0
  );
}
