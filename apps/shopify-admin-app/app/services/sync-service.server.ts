/**
 * Sync Service
 * Ingests Shopify data into the knowledge base
 * Handles initial sync, incremental updates via webhooks, and chunking/embedding
 */

import prisma from "../db.server";

// Type definitions matching Prisma schema enums
export type KnowledgeSourceType = "CATALOG" | "POLICIES" | "PAGES" | "BLOG" | "FAQ" | "CUSTOM";
export type SyncStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type SyncJobType =
  | "initial:catalog"
  | "initial:policies"
  | "initial:pages"
  | "delta:products"
  | "delta:policies"
  | "delta:pages";

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
  policyType: "privacy" | "return" | "shipping" | "terms" | "subscription";
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

    chunks.push({
      sourceId: shopId,
      sourceType: "CATALOG",
      documentId: product.id,
      sequence: 0,
      content: `
Product: ${product.title}
By: ${product.vendor || "Unknown"}
Category: ${product.productType || "General"}

Description:
${product.description || "No description available"}

${
  product.variants.length > 0
    ? `Available variants:\n${product.variants
        .map((v) => `- ${v.title} (SKU: ${v.sku}, $${v.price})`)
        .join("\n")}`
    : ""
}
      `.trim(),
      metadata: {
        title: product.title,
        productId: product.id,
        handle: product.handle,
        vendor: product.vendor,
        type: product.productType,
        variantCount: product.variants.length,
        imageCount: product.images.length,
      },
      language: "en",
      shouldEmbed: true,
    });

    product.images.forEach((img, idx) => {
      if (img.altText) {
        chunks.push({
          sourceId: shopId,
          sourceType: "CATALOG",
          documentId: product.id,
          sequence: 1 + idx,
          content: `Image ${idx + 1}: ${img.altText}`,
          metadata: {
            title: product.title,
            productId: product.id,
            imageUrl: img.url,
            imageIndex: idx,
          },
          language: "en",
          shouldEmbed: false,
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
    const maxChunkSize = 1000;
    const chunks: ChunkData[] = [];

    if (policy.body.length <= maxChunkSize) {
      chunks.push({
        sourceId: shopId,
        sourceType: "POLICIES",
        documentId: `policy:${policy.policyType}`,
        sequence: 0,
        content: `
${policy.title}

${policy.body}
        `.trim(),
        metadata: {
          title: policy.title,
          policyType: policy.policyType,
          url: policy.url,
        },
        language: "en",
        shouldEmbed: true,
      });
    } else {
      const sentences = policy.body.match(/[^.!?]+[.!?]+/g) || [policy.body];
      let currentChunk = "";
      let sequence = 0;

      for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxChunkSize) {
          if (currentChunk) {
            chunks.push({
              sourceId: shopId,
              sourceType: "POLICIES",
              documentId: `policy:${policy.policyType}`,
              sequence: sequence++,
              content: `${policy.title}\n\n${currentChunk}`,
              metadata: {
                title: policy.title,
                policyType: policy.policyType,
                url: policy.url,
              },
              language: "en",
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
          sourceType: "POLICIES",
          documentId: `policy:${policy.policyType}`,
          sequence,
          content: `${policy.title}\n\n${currentChunk}`,
          metadata: {
            title: policy.title,
            policyType: policy.policyType,
            url: policy.url,
          },
          language: "en",
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

    if (page.bodySummary) {
      chunks.push({
        sourceId: shopId,
        sourceType: "PAGES",
        documentId: page.id,
        sequence: 0,
        content: `
Page: ${page.title}
Summary: ${page.bodySummary}
        `.trim(),
        metadata: {
          title: page.title,
          pageId: page.id,
          handle: page.handle,
          hasFullBody: !!page.body,
        },
        language: "en",
        shouldEmbed: true,
      });
    }

    if (page.body) {
      chunks.push({
        sourceId: shopId,
        sourceType: "PAGES",
        documentId: page.id,
        sequence: 1,
        content: `
${page.title}

${page.body}
        `.trim(),
        metadata: {
          title: page.title,
          pageId: page.id,
          handle: page.handle,
          seoTitle: page.seo?.title,
          seoDescription: page.seo?.description,
        },
        language: "en",
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
  private static async getOrCreateSource(shopId: string, sourceType: KnowledgeSourceType) {
    const existing = await prisma.knowledgeSource.findFirst({
      where: { shopId, sourceType },
    });

    if (existing) return existing;

    return prisma.knowledgeSource.create({
      data: {
        shopId,
        sourceType,
        name: `${sourceType.toLowerCase()} source`,
        isActive: true,
      },
    });
  }

  /**
   * Ingest and store chunks in the database
   */
  static async ingestChunks(shopId: string, chunks: ChunkData[]): Promise<number> {
    let count = 0;

    for (const chunk of chunks) {
      const source = await this.getOrCreateSource(shopId, chunk.sourceType);

      const document = await prisma.knowledgeDocument.upsert({
        where: {
          sourceId_externalId: {
            sourceId: source.id,
            externalId: chunk.documentId,
          },
        },
        create: {
          sourceId: source.id,
          externalId: chunk.documentId,
          title: String(chunk.metadata.title || chunk.content.substring(0, 100)),
          language: chunk.language || "en",
          metadata: chunk.metadata,
          version: 1,
        },
        update: {
          title: String(chunk.metadata.title || chunk.content.substring(0, 100)),
          metadata: chunk.metadata,
          deletedAt: null,
          version: { increment: 1 },
        },
      });

      await prisma.knowledgeChunk.upsert({
        where: {
          documentId_sequence: {
            documentId: document.id,
            sequence: chunk.sequence,
          },
        },
        create: {
          documentId: document.id,
          sequence: chunk.sequence,
          content: chunk.content,
          metadata: chunk.metadata,
          tokenCount: Math.ceil(chunk.content.length / 4),
        },
        update: {
          content: chunk.content,
          metadata: chunk.metadata,
          tokenCount: Math.ceil(chunk.content.length / 4),
        },
      });

      count++;
    }

    return count;
  }

  /**
   * Create a sync job to track progress
   */
  static async createSyncJob(shopId: string, type: SyncJobType, sourceCount: number) {
    return prisma.syncJob.create({
      data: {
        shopId,
        jobType: type,
        status: "RUNNING",
        progress: 0,
        processedItems: 0,
        totalItems: sourceCount,
        startedAt: new Date(),
      },
    });
  }

  /**
   * Update sync job progress
   */
  static async updateSyncJob(jobId: string, update: Partial<any>) {
    const data: Record<string, any> = { ...update };

    if (typeof update.type === "string") {
      data.jobType = update.type;
      delete data.type;
    }

    return prisma.syncJob.update({
      where: { id: jobId },
      data,
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
        progress: 1,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Get latest sync job by type
   */
  static async getLatestSyncJob(shopId: string, type: SyncJobType) {
    return prisma.syncJob.findFirst({
      where: { shopId, jobType: type },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get sync status summary for a shop
   */
  static async getSyncStatus(shopId: string) {
    const jobs = await prisma.syncJob.findMany({
      where: { shopId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const sourceStats = await prisma.knowledgeSource.findMany({
      where: { shopId },
      select: {
        sourceType: true,
        _count: {
          select: { documents: true },
        },
      },
    });

    const languageStats = await prisma.knowledgeDocument.findMany({
      where: {
        source: {
          shopId,
        },
      },
      select: {
        language: true,
        _count: {
          select: { chunks: true },
        },
      },
    });

    const chunksByLanguage = languageStats.reduce<Record<string, number>>((acc: Record<string, number>, row: any) => {
      acc[row.language] = (acc[row.language] || 0) + row._count.chunks;
      return acc;
    }, {});

    return {
      jobs,
      documentsByType: Object.fromEntries(
        sourceStats.map((s: any) => [s.sourceType, s._count.documents])
      ),
      chunksByLanguage,
    };
  }

  /**
   * Clear old/deleted documents to free space
   */
  static async purgeDeletedDocuments(shopId: string, minAgeHours = 24) {
    const threshold = new Date(Date.now() - minAgeHours * 60 * 60 * 1000);

    const deleted = await prisma.knowledgeChunk.deleteMany({
      where: {
        document: {
          source: { shopId },
          deletedAt: { lt: threshold },
        },
      },
    });

    await prisma.knowledgeDocument.deleteMany({
      where: {
        source: { shopId },
        deletedAt: { lt: threshold },
      },
    });

    return deleted;
  }
}

// ============================================================================
// WEBHOOK HANDLERS (for incremental sync)
// ============================================================================

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeProduct(payload: Record<string, any>): ProductDocument {
  return {
    id: String(payload.id || payload.productId || ""),
    title: normalizeText(payload.title),
    description: normalizeText(payload.body_html || payload.description),
    vendor: normalizeText(payload.vendor),
    productType: normalizeText(payload.product_type || payload.productType),
    handle: normalizeText(payload.handle),
    variants: Array.isArray(payload.variants)
      ? payload.variants.map((v: any) => ({
          id: String(v.id || ""),
          title: normalizeText(v.title),
          sku: normalizeText(v.sku),
          price: String(v.price || ""),
        }))
      : [],
    images: Array.isArray(payload.images)
      ? payload.images.map((img: any) => ({
          id: String(img.id || ""),
          url: normalizeText(img.src || img.url),
          altText: normalizeText(img.alt || img.altText),
        }))
      : [],
  };
}

function normalizePage(payload: Record<string, any>): PageDocument {
  const body = normalizeText(payload.body_html || payload.body);
  return {
    id: String(payload.id || payload.pageId || ""),
    title: normalizeText(payload.title),
    handle: normalizeText(payload.handle),
    bodySummary: normalizeText(payload.body_summary || body.slice(0, 240)),
    body,
    seo: {
      title: normalizeText(payload.seo_title || payload.title),
      description: normalizeText(payload.seo_description),
    },
  };
}

export class WebhookHandlers {
  /**
   * Handle product create/update webhook
   */
  static async handleProductUpdate(shopId: string, payload: Record<string, any>) {
    const product = normalizeProduct(payload);
    const chunks = ProductTransformer.toChunks(product, shopId);
    const count = await SyncService.ingestChunks(shopId, chunks);

    await prisma.webhookEvent.create({
      data: {
        shopId,
        topic: "products/update",
        payload: { productId: product.id },
        processed: true,
        processedAt: new Date(),
      },
    });

    return count;
  }

  /**
   * Handle product delete webhook
   */
  static async handleProductDelete(shopId: string, payload: Record<string, any> | string) {
    const productId =
      typeof payload === "string"
        ? payload
        : String(payload.id || payload.productId || "");

    const sourceIds = (
      await prisma.knowledgeSource.findMany({
        where: { shopId, sourceType: "CATALOG" },
        select: { id: true },
      })
    ).map((s: any) => s.id);

    if (sourceIds.length > 0 && productId) {
      await prisma.knowledgeDocument.updateMany({
        where: {
          sourceId: { in: sourceIds },
          externalId: productId,
        },
        data: { deletedAt: new Date() },
      });
    }

    await prisma.webhookEvent.create({
      data: {
        shopId,
        topic: "products/delete",
        payload: { productId },
        processed: true,
        processedAt: new Date(),
      },
    });
  }

  /**
   * Handle collection update webhook
   */
  static async handleCollectionUpdate(shopId: string, payload: Record<string, any> | string) {
    const collectionId =
      typeof payload === "string"
        ? payload
        : String(payload.id || payload.collectionId || "");

    await prisma.webhookEvent.create({
      data: {
        shopId,
        topic: "collections/update",
        payload: { collectionId },
        processed: false,
      },
    });
  }

  /**
   * Handle page update webhook
   */
  static async handlePageUpdate(shopId: string, payload: Record<string, any>) {
    const page = normalizePage(payload);
    const chunks = PageTransformer.toChunks(page, shopId);
    const count = await SyncService.ingestChunks(shopId, chunks);

    await prisma.webhookEvent.create({
      data: {
        shopId,
        topic: "pages/update",
        payload: { pageId: page.id },
        processed: true,
        processedAt: new Date(),
      },
    });

    return count;
  }
}
