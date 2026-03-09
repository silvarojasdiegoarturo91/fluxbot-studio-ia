/**
 * Sync Service
 * Ingests Shopify data into the knowledge base
 * Handles initial sync, incremental updates via webhooks, and chunking/embedding
 */

import prisma from '../db.server';
import type { KnowledgeSourceType, SyncStatus } from '@prisma/client';

export type SyncJobType = 'initial:catalog' | 'initial:policies' | 'initial:pages' | 'delta:products' | 'delta:policies' | 'delta:pages';

// ============================================================================
// DOCUMENT TYPES & TRANSFORMERS
// ============================================================================

export interface ChunkData {
  sourceId: string;
  sourceType: KnowledgeSourceType;
  documentId: string;
  sequence: number;
  content: string;
  metadata: Record<string, any>;
  language: string;
  shouldEmbed: boolean;
}

export interface ProductDocument {
  id: string;
  title: string;
  description: string;
  vendor: string;
  productType: string;
  variants: Array<{ id: string; title: string; sku: string; price: string }>;
  images: Array<{ id: string; url: string; altText: string }>;
  handle: string;
}

export interface PolicyDocument {
  policyType: 'privacy' | 'return' | 'shipping' | 'terms' | 'subscription';
  title: string;
  body: string;
  url: string;
}

export interface PageDocument {
  id: string;
  title: string;
  handle: string;
  bodySummary: string;
  body: string;
  seo?: { title: string; description: string };
}

// ============================================================================
// DOCUMENT TRANSFORMERS
// ============================================================================

export class ProductTransformer {
  /**
   * Transform Shopify product into structured chunks
   */
  static toChunks(product: ProductDocument, shopId: string): ChunkData[] {
    const chunks: ChunkData[] = [];

    // Main product info chunk
    chunks.push({
      sourceId: shopId,
      sourceType: 'CATALOG',
      documentId: product.id,
      sequence: 0,
      content: `
Product: ${product.title}
By: ${product.vendor || 'Unknown'}
Category: ${product.productType || 'General'}

Description:
${product.description || 'No description available'}

${product.variants.length > 0 ? `Available variants:\n${product.variants.map((v) => `- ${v.title} (SKU: ${v.sku}, $${v.price})`).join('\n')}` : ''}
      `.trim(),
      metadata: {
        productId: product.id,
        handle: product.handle,
        vendor: product.vendor,
        type: product.productType,
        variantCount: product.variants.length,
        imageCount: product.images.length,
      },
      language: 'en',
      shouldEmbed: true,
    });

    // Image descriptions as separate chunks for visual search
    product.images.forEach((img, idx) => {
      if (img.altText) {
        chunks.push({
          sourceId: shopId,
          sourceType: 'CATALOG',
          documentId: product.id,
          sequence: 1 + idx,
          content: `Image ${idx + 1}: ${img.altText}`,
          metadata: {
            productId: product.id,
            imageUrl: img.url,
            imageIndex: idx,
          },
          language: 'en',
          shouldEmbed: false, // Link to product via metadata
        });
      }
    });

    return chunks;
  }
}

export class PolicyTransformer {
  /**
   * Transform policy into knowledge chunks
   */
  static toChunks(policy: PolicyDocument, shopId: string): ChunkData[] {
    // Split policy into sections if very long
    const maxChunkSize = 1000; // characters
    const chunks: ChunkData[] = [];

    if (policy.body.length <= maxChunkSize) {
      chunks.push({
        sourceId: shopId,
        sourceType: 'POLICIES',
        documentId: `policy:${policy.policyType}`,
        sequence: 0,
        content: `
${policy.title}

${policy.body}
        `.trim(),
        metadata: {
          policyType: policy.policyType,
          url: policy.url,
        },
        language: 'en',
        shouldEmbed: true,
      });
    } else {
      // Split long policies into multiple chunks with overlap
      const sentences = policy.body.match(/[^.!?]+[.!?]+/g) || [policy.body];
      let currentChunk = '';
      let sequence = 0;

      for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxChunkSize) {
          if (currentChunk) {
            chunks.push({
              sourceId: shopId,
              sourceType: 'POLICIES',
              documentId: `policy:${policy.policyType}`,
              sequence: sequence++,
              content: `${policy.title}\n\n${currentChunk}`,
              metadata: { policyType: policy.policyType, url: policy.url },
              language: 'en',
              shouldEmbed: true,
            });
          }
          currentChunk = sentence;
        } else {
          currentChunk += sentence;
        }
      }

      if (currentChunk) {
        chunks.push({
          sourceId: shopId,
          sourceType: 'POLICIES',
          documentId: `policy:${policy.policyType}`,
          sequence: sequence,
          content: `${policy.title}\n\n${currentChunk}`,
          metadata: { policyType: policy.policyType, url: policy.url },
          language: 'en',
          shouldEmbed: true,
        });
      }
    }

    return chunks;
  }
}

export class PageTransformer {
  /**
   * Transform CMS page into knowledge chunks
   */
  static toChunks(page: PageDocument, shopId: string): ChunkData[] {
    const chunks: ChunkData[] = [];

    // Summary chunk first
    if (page.bodySummary) {
      chunks.push({
        sourceId: shopId,
        sourceType: 'PAGES',
        documentId: page.id,
        sequence: 0,
        content: `
Page: ${page.title}
Summary: ${page.bodySummary}
        `.trim(),
        metadata: {
          pageId: page.id,
          handle: page.handle,
          hasFullBody: !!page.body,
        },
        language: 'en',
        shouldEmbed: true,
      });
    }

    // Full body as second chunk
    if (page.body) {
      chunks.push({
        sourceId: shopId,
        sourceType: 'PAGES',
        documentId: page.id,
        sequence: 1,
        content: `
${page.title}

${page.body}
        `.trim(),
        metadata: {
          pageId: page.id,
          handle: page.handle,
          seoTitle: page.seo?.title,
          seoDescription: page.seo?.description,
        },
        language: 'en',
        shouldEmbed: true,
      });
    }

    return chunks;
  }
}

// ============================================================================
// SYNC SERVICE
// ============================================================================

export class SyncService {
  /**
   * Ingest and store chunks in the database
   */
  static async ingestChunks(
    shopId: string,
    chunks: ChunkData[]
  ): Promise<number> {
    let count = 0;

    for (const chunk of chunks) {
      // Create or update knowledge document
      const document = await prisma.knowledgeDocument.upsert({
        where: {
          shopId_sourceId_externalId: {
            shopId,
            sourceId: chunk.sourceId,
            externalId: chunk.documentId,
          },
        },
        create: {
          shopId,
          sourceId: chunk.sourceId,
          externalId: chunk.documentId,
          sourceType: chunk.sourceType,
          title: chunk.metadata.title || chunk.content.substring(0, 100),
          language: chunk.language,
          metadata: chunk.metadata,
          size: chunk.content.length,
          version: 1,
        },
        update: {
          updatedAt: new Date(),
          version: { increment: 1 },
        },
      });

      // Create knowledge chunk
      await prisma.knowledgeChunk.upsert({
        where: {
          shopId_documentId_sequence: {
            shopId,
            documentId: document.id,
            sequence: chunk.sequence,
          },
        },
        create: {
          shopId,
          documentId: document.id,
          sequence: chunk.sequence,
          content: chunk.content,
          metadata: chunk.metadata,
          language: chunk.language,
          tokenCount: Math.ceil(chunk.content.length / 4), // Rough estimate
          shouldIndex: chunk.shouldEmbed,
        },
        update: {
          content: chunk.content,
          metadata: chunk.metadata,
          shouldIndex: chunk.shouldEmbed,
        },
      });

      count++;
    }

    return count;
  }

  /**
   * Create a sync job to track progress
   */
  static async createSyncJob(
    shopId: string,
    type: SyncJobType,
    sourceCount: number
  ) {
    return prisma.syncJob.create({
      data: {
        shopId,
        type,
        status: 'IN_PROGRESS' as SyncStatus,
        recordsProcessed: 0,
        recordsTotal: sourceCount,
        errorCount: 0,
        startedAt: new Date(),
      },
    });
  }

  /**
   * Update sync job progress
   */
  static async updateSyncJob(jobId: string, update: Partial<any>) {
    return prisma.syncJob.update({
      where: { id: jobId },
      data: {
        ...update,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Mark sync job as completed
   */
  static async completeSyncJob(jobId: string, status: SyncStatus) {
    return prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get latest sync job by type
   */
  static async getLatestSyncJob(shopId: string, type: SyncJobType) {
    return prisma.syncJob.findFirst({
      where: { shopId, type },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get sync status summary for a shop
   */
  static async getSyncStatus(shopId: string) {
    const jobs = await prisma.syncJob.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const documentStats = await prisma.knowledgeDocument.groupBy({
      by: ['sourceType'],
      where: { shopId },
      _count: { id: true },
    });

    const chunkStats = await prisma.knowledgeChunk.groupBy({
      by: ['language'],
      where: { shopId },
      _count: { id: true },
    });

    return {
      jobs,
      documentsByType: Object.fromEntries(
        documentStats.map((s) => [s.sourceType, s._count.id])
      ),
      chunksByLanguage: Object.fromEntries(
        chunkStats.map((s) => [s.language, s._count.id])
      ),
    };
  }

  /**
   * Clear old/deleted documents to free space
   */
  static async purgeDeletedDocuments(shopId: string, minAgeHours = 24) {
    const threshold = new Date(Date.now() - minAgeHours * 60 * 60 * 1000);

    const deleted = await prisma.knowledgeChunk.deleteMany({
      where: {
        shopId,
        document: {
          deletedAt: {
            lt: threshold,
          },
        },
      },
    });

    await prisma.knowledgeDocument.deleteMany({
      where: {
        shopId,
        deletedAt: {
          lt: threshold,
        },
      },
    });

    return deleted;
  }
}

// ============================================================================
// WEBHOOK HANDLERS (for incremental sync)
// ============================================================================

export class WebhookHandlers {
  /**
   * Handle product create/update webhook
   */
  static async handleProductUpdate(
    shopId: string,
    product: ProductDocument
  ) {
    const chunks = ProductTransformer.toChunks(product, shopId);
    const count = await SyncService.ingestChunks(shopId, chunks);

    // Log webhook event
    await prisma.webhookEvent.create({
      data: {
        shopId,
        topic: 'PRODUCTS_UPDATE',
        payload: { productId: product.id },
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });

    return count;
  }

  /**
   * Handle product delete webhook
   */
  static async handleProductDelete(shopId: string, productId: string) {
    await prisma.knowledgeDocument.updateMany({
      where: {
        shopId,
        externalId: productId,
        sourceType: 'CATALOG',
      },
      data: {
        deletedAt: new Date(),
      },
    });

    await prisma.webhookEvent.create({
      data: {
        shopId,
        topic: 'PRODUCTS_DELETE',
        payload: { productId },
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });
  }

  /**
   * Handle collection update webhook
   */
  static async handleCollectionUpdate(shopId: string, collectionId: string) {
    // Collections are metadata; reindex related products
    await prisma.webhookEvent.create({
      data: {
        shopId,
        topic: 'COLLECTIONS_UPDATE',
        payload: { collectionId },
        status: 'PENDING',
      },
    });
  }

  /**
   * Handle page update webhook
   */
  static async handlePageUpdate(
    shopId: string,
    page: PageDocument
  ) {
    const transformer = new PageTransformer();
    const chunks = transformer.toChunks(page, shopId);
    const count = await SyncService.ingestChunks(shopId, chunks);

    await prisma.webhookEvent.create({
      data: {
        shopId,
        topic: 'PAGES_UPDATE',
        payload: { pageId: page.id },
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });

    return count;
  }
}
