/**
 * RAG Builder Service - Phase 4
 *
 * Builds Retrieval-Augmented Generation (RAG) context by:
 * 1. Searching for relevant documents via vector similarity
 * 2. Formatting results into structured context
 * 3. Handling fallbacks when confidence is low
 * 4. Integrating conversation history
 * 5. Supporting multi-language context
 */

import prisma from '../db.server';
import { getEmbeddingsProvider } from './embeddings.server';
import {
  searchCatalog,
  searchProducts,
  searchPolicies,
  searchArticles,
  rerank,
  validateEmbedding,
  type SearchResult,
} from './vector-retrieval.server';

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
  includeHistory?: boolean;
  conversationHistory?: Array<{ role: string; content: string }>;
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
    shopId,
    locale = 'en',
    limit = 5,
    threshold = 0.4,
    includeHistory = false,
    conversationHistory,
  } = options;

  try {
    // Get embeddings provider
    const provider = getEmbeddingsProvider();
    if (!provider) {
      return getFallbackContext(
        'Embeddings provider not configured',
        options
      );
    }

    // Generate query embedding
    let queryEmbedding: number[];
    try {
      queryEmbedding = await provider.embed(query);
    } catch (error) {
      console.error('[RAGBuilder] Failed to embed query:', error);
      return getFallbackContext('Failed to process query', options);
    }

    // Validate embedding
    if (!validateEmbedding(queryEmbedding)) {
      return getFallbackContext('Invalid embedding generated', options);
    }

    // Search across document types
    const productResults = await searchProducts(queryEmbedding, {
      limit: Math.ceil(limit * 0.6), // 60% products
      threshold,
      filter: { shopId, locales: [locale] },
    });

    const policyResults = await searchPolicies(queryEmbedding, {
      limit: Math.ceil(limit * 0.25), // 25% policies
      threshold: Math.max(threshold, 0.3), // Lower threshold for policies
      filter: { shopId, locales: [locale] },
    });

    const articleResults = await searchArticles(queryEmbedding, {
      limit: Math.ceil(limit * 0.15), // 15% articles
      threshold: Math.max(threshold, 0.35),
      filter: { shopId, locales: [locale] },
    });

    // Check confidence in results (if top result relevance is high)
    const topRelevance = Math.max(
      productResults[0]?.relevance || 0,
      policyResults[0]?.relevance || 0,
      articleResults[0]?.relevance || 0
    );
    const hasGoodMatches = topRelevance > 0.6;
    const fallback = !hasGoodMatches;

    // Format results
    const products = formatProductResults(productResults);
    const policies = formatPolicyResults(policyResults);
    const articles = formatArticleResults(articleResults);

    // Build sources reference
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

    // Build context summary
    const summary = buildContextSummary(
      products,
      policies,
      articles,
      fallback
    );

    return {
      products,
      policies,
      articles,
      confidence: hasGoodMatches ? topRelevance : 0.3,
      sources,
      summary,
      fallback,
    };
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
  const { shopId, locale = 'en', threshold = 0.5 } = options;

  try {
    const provider = getEmbeddingsProvider();
    if (!provider) {
      return getFallbackContext('Embeddings provider not available', options);
    }

    const embedding = await provider.embed(`policy ${topic}`);

    if (!validateEmbedding(embedding)) {
      return getFallbackContext('Failed to process policy query', options);
    }

    const policyResults = await searchPolicies(embedding, {
      limit: 8,
      threshold,
      filter: { shopId, locales: [locale] },
    });

    const topRelevance = policyResults[0]?.relevance || 0;
    const hasGoodMatches = topRelevance > 0.5;

    return {
      products: [],
      policies: formatPolicyResults(policyResults),
      articles: [],
      confidence: hasGoodMatches ? topRelevance : 0.2,
      sources: policyResults.map((r) => ({
        title: r.title,
        type: 'policy' as const,
        relevance: r.relevance,
      })),
      summary: buildContextSummary([], formatPolicyResults(policyResults), [], !hasGoodMatches),
      fallback: !hasGoodMatches,
    };
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
  const { shopId, locale = 'en' } = options;

  try {
    if (cartItems.length === 0) {
      return getFallbackContext('No cart items to base recommendations on', options);
    }

    const provider = getEmbeddingsProvider();
    if (!provider) {
      return getFallbackContext('Embeddings provider not available', options);
    }

    // Build context query from cart items
    const cartContext = cartItems
      .map((item) => item.name)
      .join(', ');
    const query = `recommend products similar to ${cartContext}`;

    const embedding = await provider.embed(query);

    if (!validateEmbedding(embedding)) {
      return getFallbackContext('Failed to embed recommendation query', options);
    }

    const productResults = await searchProducts(embedding, {
      limit: 6,
      threshold: 0.4,
      filter: { shopId, locales: [locale] },
    });

    const topRelevance = productResults[0]?.relevance || 0;

    return {
      products: formatProductResults(productResults),
      policies: [],
      articles: [],
      confidence: Math.min(1, topRelevance + 0.2), // Boost confidence for recommendations
      sources: productResults.map((r) => ({
        title: r.title,
        type: 'product' as const,
        relevance: r.relevance,
      })),
      summary: `Recommended products based on your cart`,
      fallback: false,
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
