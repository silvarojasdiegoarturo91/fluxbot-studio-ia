/**
 * Embeddings Service
 * Provider-agnostic vector embeddings with adapter pattern
 * Supports: OpenAI, Anthropic (Claude Embeddings), Gemini
 */

import prisma from '../db.server';
import { getConfig } from '../config.server';

// ============================================================================
// PROVIDER INTERFACES
// ============================================================================

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getModel(): string;
  getDimensions(): number;
}

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
  inputTokens: number;
  dimension: number;
}

// ============================================================================
// OPENAI ADAPTER
// ============================================================================

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string = 'text-embedding-3-small';
  private dimensions: number = 1536;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('OpenAI API key is required');
    this.apiKey = apiKey;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        encoding_format: 'float',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        encoding_format: 'float',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.data
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) => item.embedding);
  }

  getModel(): string {
    return this.model;
  }

  getDimensions(): number {
    return this.dimensions;
  }
}

// ============================================================================
// ANTHROPIC ADAPTER (via Embeddings API)
// ============================================================================

export class AnthropicEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string = 'claude-3-5-sonnet-20241022'; // Anthropic model supports embeddings
  private dimensions: number = 1024;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Anthropic API key is required');
    this.apiKey = apiKey;
  }

  async embed(text: string): Promise<number[]> {
    // Anthropic doesn't have a dedicated embeddings API yet
    // Fallback to using OpenAI until they release it
    // This is a placeholder for future Anthropic embeddings API
    throw new Error('Anthropic embeddings API not yet available. Use OpenAI or Gemini as fallback.');
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    throw new Error('Anthropic embeddings API not yet available. Use OpenAI or Gemini as fallback.');
  }

  getModel(): string {
    return this.model;
  }

  getDimensions(): number {
    return this.dimensions;
  }
}

// ============================================================================
// GOOGLE GEMINI ADAPTER
// ============================================================================

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string = 'models/embedding-001';
  private dimensions: number = 768;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Gemini API key is required');
    this.apiKey = apiKey;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'models/embedding-001',
          content: {
            parts: [{ text }],
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.embedding.values;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Gemini batch API with limited concurrency
    const batchSize = 5;
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map((text) => this.embed(text))
      );
      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  getModel(): string {
    return this.model;
  }

  getDimensions(): number {
    return this.dimensions;
  }
}

// ============================================================================
// EMBEDDINGS SERVICE (FACTORY & CACHING)
// ============================================================================

let cachedProvider: EmbeddingProvider | null = null;

export class EmbeddingsService {
  /**
   * Get or create embedding provider based on config
   */
  static getProvider(): EmbeddingProvider {
    if (cachedProvider) return cachedProvider;

    const config = getConfig();

    switch (config.ai.provider) {
      case 'openai':
        if (!config.ai.openai) throw new Error('OpenAI config missing');
        cachedProvider = new OpenAIEmbeddingProvider(config.ai.openai.apiKey);
        break;
      case 'gemini':
        if (!config.ai.gemini) throw new Error('Gemini config missing');
        cachedProvider = new GeminiEmbeddingProvider(config.ai.gemini.apiKey);
        break;
      case 'anthropic':
        // Fallback to OpenAI if Anthropic embeddings API not available
        if (config.ai.openai) {
          cachedProvider = new OpenAIEmbeddingProvider(config.ai.openai.apiKey);
        } else {
          throw new Error('No embedding provider available for Anthropic fallback');
        }
        break;
      default:
        throw new Error(`Unknown AI provider: ${config.ai.provider}`);
    }

    return cachedProvider;
  }

  /**
   * Embed a single text string
   */
  static async embed(text: string): Promise<EmbeddingResult> {
    const provider = this.getProvider();
    const embedding = await provider.embed(text);

    return {
      text,
      embedding,
      model: provider.getModel(),
      inputTokens: Math.ceil(text.length / 4), // Rough estimate
      dimension: provider.getDimensions(),
    };
  }

  /**
   * Embed multiple texts in parallel
   */
  static async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const provider = this.getProvider();
    const embeddings = await provider.embedBatch(texts);

    return texts.map((text, idx) => ({
      text,
      embedding: embeddings[idx],
      model: provider.getModel(),
      inputTokens: Math.ceil(text.length / 4),
      dimension: provider.getDimensions(),
    }));
  }

  /**
   * Embed and store knowledge chunks
   */
  static async embedAndStoreChunks(
    shopId: string,
    chunkIds: string[]
  ): Promise<number> {
    // Fetch chunks to embed
    const chunks = await prisma.knowledgeChunk.findMany({
      where: {
        id: { in: chunkIds },
        document: {
          source: {
            shopId,
          },
        },
      },
    });

    if (chunks.length === 0) return 0;

    // Embed all chunks
    const embeddings = await this.embedBatch(chunks.map((c) => c.content));

    // Store embeddings in database
    const provider = this.getProvider();
    await Promise.all(
      chunks.map((chunk, idx) =>
        prisma.embeddingRecord.upsert({
          where: { chunkId: chunk.id },
          create: {
            chunkId: chunk.id,
            embedding: embeddings[idx].embedding as any,
            provider: this.getProvider().constructor.name,
            model: provider.getModel(),
            dimension: provider.getDimensions(),
          },
          update: {
            embedding: embeddings[idx].embedding as any,
            provider: this.getProvider().constructor.name,
            model: provider.getModel(),
            dimension: provider.getDimensions(),
          },
        })
      )
    );

    return chunks.length;
  }

  /**
   * Retrieve semantically similar chunks
   */
  static async searchSimilar(
    shopId: string,
    query: string,
    limit: number = 5,
    minSimilarity: number = 0.5
  ) {
    // 1. Embed the query
    const queryEmbedding = await this.embed(query);

    // 2. Fetch all embeddings for this shop
    // In production, this should use pgvector or a vector database
    const allRecords = await prisma.embeddingRecord.findMany({
      where: {
        chunk: {
          document: {
            source: {
              shopId,
            },
          },
        },
      },
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
    });

    // 3. Calculate cosine similarity in-memory
    const results = allRecords
      .map((record) => {
        const vector = record.embedding as number[];
        const similarity = this.cosineSimilarity(queryEmbedding.embedding, vector);
        return { ...record, similarity };
      })
      .filter((r) => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return results;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private static cosineSimilarity(v1: number[], v2: number[]): number {
    if (v1.length !== v2.length) return 0;
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < v1.length; i++) {
      dotProduct += v1[i] * v2[i];
      norm1 += v1[i] * v1[i];
      norm2 += v2[i] * v2[i];
    }
    
    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    return isNaN(similarity) ? 0 : similarity;
  }

  /**
   * Get embedding statistics for a shop
   */
  static async getStats(shopId: string) {
    const stats = {
      totalChunks: await prisma.knowledgeChunk.count({
        where: {
          document: {
            source: {
              shopId,
            },
          },
        },
      }),
      embeddedChunks: await prisma.embeddingRecord.count({
        where: {
          chunk: {
            document: {
              source: {
                shopId,
              },
            },
          },
        },
      }),
      models: await prisma.embeddingRecord.groupBy({
        by: ['model'],
        where: {
          chunk: {
            document: {
              source: {
                shopId,
              },
            },
          },
        },
        _count: { id: true },
      }),
    };

    return {
      ...stats,
      embeddingPercentage: (stats.embeddedChunks / (stats.totalChunks || 1)) * 100,
    };
  }
}
