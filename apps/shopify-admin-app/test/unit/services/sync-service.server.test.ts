import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockKnowledgeSourceFindFirst,
  mockKnowledgeSourceCreate,
  mockKnowledgeSourceFindMany,
  mockKnowledgeDocumentUpsert,
  mockKnowledgeDocumentFindMany,
  mockKnowledgeDocumentUpdateMany,
  mockKnowledgeDocumentDeleteMany,
  mockKnowledgeChunkUpsert,
  mockKnowledgeChunkDeleteMany,
  mockSyncJobFindMany,
  mockSyncJobUpdateMany,
  mockSyncJobUpdate,
  mockSyncJobFindFirst,
} = vi.hoisted(() => ({
  mockKnowledgeSourceFindFirst: vi.fn(),
  mockKnowledgeSourceCreate: vi.fn(),
  mockKnowledgeSourceFindMany: vi.fn(),
  mockKnowledgeDocumentUpsert: vi.fn(),
  mockKnowledgeDocumentFindMany: vi.fn(),
  mockKnowledgeDocumentUpdateMany: vi.fn(),
  mockKnowledgeDocumentDeleteMany: vi.fn(),
  mockKnowledgeChunkUpsert: vi.fn(),
  mockKnowledgeChunkDeleteMany: vi.fn(),
  mockSyncJobFindMany: vi.fn(),
  mockSyncJobUpdateMany: vi.fn(),
  mockSyncJobUpdate: vi.fn(),
  mockSyncJobFindFirst: vi.fn(),
}));

vi.mock("../../../app/db.server", () => ({
  default: {
    knowledgeSource: {
      findFirst: mockKnowledgeSourceFindFirst,
      create: mockKnowledgeSourceCreate,
      findMany: mockKnowledgeSourceFindMany,
    },
    knowledgeDocument: {
      upsert: mockKnowledgeDocumentUpsert,
      findMany: mockKnowledgeDocumentFindMany,
      updateMany: mockKnowledgeDocumentUpdateMany,
      deleteMany: mockKnowledgeDocumentDeleteMany,
    },
    knowledgeChunk: {
      upsert: mockKnowledgeChunkUpsert,
      deleteMany: mockKnowledgeChunkDeleteMany,
    },
    syncJob: {
      findMany: mockSyncJobFindMany,
      updateMany: mockSyncJobUpdateMany,
      update: mockSyncJobUpdate,
      findFirst: mockSyncJobFindFirst,
    },
  },
}));

import {
  PageTransformer,
  PolicyTransformer,
  ProductTransformer,
  SyncService,
  WebhookHandlers,
} from "../../../app/services/sync-service.server";

describe("sync-service.server — unit coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKnowledgeSourceFindFirst.mockResolvedValue({ id: "src-1" });
    mockKnowledgeSourceCreate.mockResolvedValue({ id: "src-1" });
    mockKnowledgeDocumentUpsert.mockResolvedValue({ id: "doc-1" });
    mockKnowledgeChunkUpsert.mockResolvedValue({});
    mockKnowledgeDocumentUpdateMany.mockResolvedValue({ count: 1 });
  });

  describe("ProductTransformer.toChunks", () => {
    it("emits a main chunk plus image chunks with alt text", () => {
      const chunks = ProductTransformer.toChunks(
        {
          id: "p1",
          title: "Coffee Maker",
          description: "Brews great coffee",
          vendor: "Acme",
          productType: "Appliances",
          handle: "coffee-maker",
          collections: ["Kitchen"],
          tags: ["coffee"],
          variants: [
            {
              id: "v1",
              title: "Black",
              sku: "CM-BLK",
              price: "89.00",
              availableForSale: true,
              inventoryQuantity: 3,
              inventoryPolicy: "DENY",
            },
          ],
          images: [
            { id: "i1", url: "https://cdn.example/1.jpg", altText: "Front view" },
            { id: "i2", url: "https://cdn.example/2.jpg", altText: "" },
          ],
        },
        "shop-1",
      );

      expect(chunks).toHaveLength(2);
      expect(chunks[0].documentId).toBe("p1");
      expect(chunks[0].content).toContain("Coffee Maker");
      expect(chunks[0].content).toContain("Black (SKU: CM-BLK, $89.00)");
      expect(chunks[0].metadata).toMatchObject({
        title: "Coffee Maker",
        variantCount: 1,
        imageCount: 2,
      });
      expect(chunks[1]).toMatchObject({
        sequence: 1,
        content: "Image 1: Front view",
        metadata: { imageUrl: "https://cdn.example/1.jpg", imageIndex: 0 },
        shouldEmbed: false,
      });
    });
  });

  describe("PolicyTransformer.toChunks", () => {
    it("keeps short policies in a single chunk", () => {
      const chunks = PolicyTransformer.toChunks(
        { policyType: "return", title: "Returns", body: "Short policy.", url: "/returns" },
        "shop-1",
      );
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({
        documentId: "policy:return",
        sourceType: "POLICIES",
        content: expect.stringContaining("Returns"),
      });
    });

    it("splits long policies across multiple chunks", () => {
      const sentence = "We allow returns within thirty days for unused items. ";
      const body = sentence.repeat(40);
      const chunks = PolicyTransformer.toChunks(
        { policyType: "shipping", title: "Shipping", body, url: "/shipping" },
        "shop-1",
      );

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].sequence).toBe(0);
      expect(chunks[chunks.length - 1].sequence).toBe(chunks.length - 1);
    });
  });

  describe("PageTransformer.toChunks", () => {
    it("emits summary and body chunks", () => {
      const chunks = PageTransformer.toChunks(
        {
          id: "page-1",
          title: "About us",
          handle: "about",
          bodySummary: "Summary text",
          body: "Full body text",
          seo: { title: "About", description: "desc" },
        },
        "shop-1",
      );

      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toContain("Summary text");
      expect(chunks[0].metadata.hasFullBody).toBe(true);
      expect(chunks[1].sequence).toBe(1);
    });
  });

  describe("WebhookHandlers", () => {
    it("ingests normalized product payloads from product/update webhooks", async () => {
      const count = await WebhookHandlers.handleProductUpdate("shop-1", {
        id: 88,
        title: "Widget",
        body_html: "<p>Description</p>",
        vendor: "FluxBot",
        product_type: "Gadget",
        status: "active",
        publishedOnCurrentPublication: true,
        handle: "widget",
        tags: "featured, summer",
        variants: [
          {
            id: 1,
            title: "Red",
            sku: "R-1",
            price: "10.00",
            availableForSale: true,
            inventory_quantity: 5,
            inventory_policy: "DENY",
          },
        ],
        images: [{ id: 2, src: "https://cdn.example/w.png", alt: "Widget image" }],
      });

      expect(count).toBeGreaterThan(0);
      expect(mockKnowledgeSourceFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { shopId: "shop-1", sourceType: "CATALOG" } }),
      );
      const docUpsert = mockKnowledgeDocumentUpsert.mock.calls[0][0];
      expect(docUpsert.create.externalId).toBe("88");
      expect(docUpsert.create.title).toBe("Widget");
      expect(mockKnowledgeChunkUpsert).toHaveBeenCalled();
    });

    it("creates a knowledge source when none exists", async () => {
      mockKnowledgeSourceFindFirst.mockResolvedValue(null);

      await WebhookHandlers.handleProductUpdate("shop-1", { id: 1, title: "T" });

      expect(mockKnowledgeSourceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ shopId: "shop-1", sourceType: "CATALOG", isActive: true }),
        }),
      );
    });

    it("soft-deletes documents for product/delete webhooks", async () => {
      mockKnowledgeSourceFindMany.mockResolvedValue([{ id: "src-1" }, { id: "src-2" }]);

      await WebhookHandlers.handleProductDelete("shop-1", "123");

      expect(mockKnowledgeDocumentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: { in: ["src-1", "src-2"] },
            externalId: "123",
          }),
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it("handles object payloads and missing sources for product/delete", async () => {
      mockKnowledgeSourceFindMany.mockResolvedValue([]);

      await WebhookHandlers.handleProductDelete("shop-1", { productId: "999" });

      expect(mockKnowledgeDocumentUpdateMany).not.toHaveBeenCalled();
    });

    it("is a no-op for collection update webhooks", async () => {
      await expect(
        WebhookHandlers.handleCollectionUpdate("shop-1", { collectionId: "c1" }),
      ).resolves.toBeUndefined();
      await expect(
        WebhookHandlers.handleCollectionUpdate("shop-1", "c2"),
      ).resolves.toBeUndefined();
    });

    it("ingests normalized page payloads from page/update webhooks", async () => {
      const count = await WebhookHandlers.handlePageUpdate("shop-1", {
        id: "p1",
        title: "Policies",
        handle: "policies",
        body_html: "Long body",
        body_summary: "Short summary",
        seo_title: "SEO Title",
      });

      expect(count).toBeGreaterThan(0);
      const docUpsert = mockKnowledgeDocumentUpsert.mock.calls[0][0];
      expect(docUpsert.create.externalId).toBe("p1");
    });
  });

  describe("requeue helpers", () => {
    it("requeues stale RUNNING jobs", async () => {
      mockSyncJobFindMany.mockResolvedValue([{ id: "job-1" }, { id: "job-2" }]);
      mockSyncJobUpdateMany.mockResolvedValue({ count: 1 });

      const requeued = await SyncService.requeueStaleRunningJobs({ maxAgeMs: 1000, limit: 5 });

      expect(requeued).toBe(2);
      expect(mockSyncJobFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "RUNNING", OR: expect.any(Array) }),
          orderBy: { createdAt: "asc" },
          take: 5,
        }),
      );
      expect(mockSyncJobUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "PENDING", progress: 0 }),
        }),
      );
    });

    it("requeues stale jobs scoped to a shop and returns 0 when none match", async () => {
      mockSyncJobFindMany.mockResolvedValue([]);

      const requeued = await SyncService.requeueStaleRunningJobs({ shopId: "shop-1", limit: 200 });

      expect(requeued).toBe(0);
      expect(mockSyncJobFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ shopId: "shop-1" }) }),
      );
    });

    it("requeues recent terminal jobs for a shop", async () => {
      mockSyncJobFindMany.mockResolvedValue([
        { id: "job-1", status: "FAILED", jobType: "delta:products" },
        { id: "job-2", status: "CANCELLED", jobType: "delta:pages" },
      ]);
      mockSyncJobUpdateMany.mockResolvedValue({ count: 1 });

      const requeued = await SyncService.requeueRecentTerminalJobs("shop-1", { maxAgeMs: 60000 });

      expect(requeued).toBe(2);
      expect(mockSyncJobFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shopId: "shop-1",
            status: { in: ["FAILED", "CANCELLED"] },
          }),
        }),
      );
    });
  });

  describe("job lifecycle helpers", () => {
    it("maps a legacy type field into jobType on update", async () => {
      mockSyncJobUpdate.mockResolvedValue({});

      await SyncService.updateSyncJob("job-1", { type: "delta:pages", progress: 0.5 });

      expect(mockSyncJobUpdate).toHaveBeenCalledWith({
        where: { id: "job-1" },
        data: { jobType: "delta:pages", progress: 0.5 },
      });
    });

    it("returns the latest job of a type", async () => {
      mockSyncJobFindFirst.mockResolvedValue({ id: "job-9", jobType: "initial:catalog" });

      const job = await SyncService.getLatestSyncJob("shop-1", "initial:catalog");

      expect(job?.id).toBe("job-9");
      expect(mockSyncJobFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { shopId: "shop-1", jobType: "initial:catalog" },
          orderBy: { createdAt: "desc" },
        }),
      );
    });
  });

  describe("getSyncStatus and purge", () => {
    it("aggregates documents by type and chunks by language", async () => {
      mockSyncJobFindMany.mockResolvedValue([{ id: "job-1" }]);
      mockKnowledgeSourceFindMany.mockResolvedValue([
        { sourceType: "CATALOG", _count: { documents: 3 } },
        { sourceType: "POLICIES", _count: { documents: 2 } },
      ]);
      mockKnowledgeDocumentFindMany.mockResolvedValue([
        { language: "en", _count: { chunks: 4 } },
        { language: "en", _count: { chunks: 1 } },
        { language: "es", _count: { chunks: 2 } },
      ]);

      const status = await SyncService.getSyncStatus("shop-1");

      expect(status.jobs).toEqual([{ id: "job-1" }]);
      expect(status.documentsByType).toEqual({ CATALOG: 3, POLICIES: 2 });
      expect(status.chunksByLanguage).toEqual({ en: 5, es: 2 });
    });

    it("purges deleted documents older than the retention window", async () => {
      mockKnowledgeChunkDeleteMany.mockResolvedValue({ count: 3 });
      mockKnowledgeDocumentDeleteMany.mockResolvedValue({ count: 2 });

      const deleted = await SyncService.purgeDeletedDocuments("shop-1", 48);

      expect(deleted).toEqual({ count: 3 });
      expect(mockKnowledgeChunkDeleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ document: expect.anything() }),
        }),
      );
      expect(mockKnowledgeDocumentDeleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ source: { shopId: "shop-1" } }),
        }),
      );
    });
  });
});
