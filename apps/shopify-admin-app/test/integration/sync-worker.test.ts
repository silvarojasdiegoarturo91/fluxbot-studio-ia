import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSyncJobFindFirst = vi.fn();
const mockSyncJobUpdateMany = vi.fn();
const mockSyncJobFindUnique = vi.fn();
const mockUpdateSyncJob = vi.fn();
const mockCompleteSyncJob = vi.fn();
const mockCatalogSync = vi.fn();
const mockSyncShopReference = vi.fn();
const mockProductProjectionFindUnique = vi.fn();
const mockProductProjectionUpsert = vi.fn();

vi.mock("../../app/db.server", () => ({
  default: {
    syncJob: {
      findFirst: mockSyncJobFindFirst,
      updateMany: mockSyncJobUpdateMany,
      findUnique: mockSyncJobFindUnique,
    },
    productProjection: {
      findUnique: mockProductProjectionFindUnique,
      upsert: mockProductProjectionUpsert,
    },
    policyProjection: {
      upsert: vi.fn(),
    },
    orderProjection: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("../../app/services/sync-service.server", () => ({
  ProductTransformer: { toChunks: vi.fn(() => []) },
  PolicyTransformer: { toChunks: vi.fn(() => []) },
  PageTransformer: { toChunks: vi.fn(() => []) },
  SyncService: {
    ingestChunks: vi.fn(async () => 0),
    updateSyncJob: mockUpdateSyncJob,
    completeSyncJob: mockCompleteSyncJob,
  },
}));

vi.mock("../../app/services/product-faqs.server", () => ({
  mergeProductAdminMetadata: vi.fn((prev, next) => ({
    ...(prev && typeof prev === "object" ? prev : {}),
    ...next,
  })),
}));

vi.mock("../../app/services/ia-backend.server", () => ({
  iaClient: {
    catalog: {
      sync: mockCatalogSync,
    },
  },
}));

vi.mock("../../app/services/shop-backend-sync.server", () => ({
  syncShopReferenceToIABackend: mockSyncShopReference,
}));

describe("sync-worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncJobFindFirst.mockResolvedValue({ id: "job-1" });
    mockSyncJobUpdateMany.mockResolvedValue({ count: 1 });
    mockSyncJobFindUnique.mockResolvedValue({
      id: "job-1",
      jobType: "delta:products",
      shop: {
        id: "shop-1",
        domain: "store.myshopify.com",
        accessToken: "shpat_test",
        status: "ACTIVE",
      },
    });
    mockSyncShopReference.mockResolvedValue(true);
    mockProductProjectionFindUnique.mockResolvedValue(null);
    mockProductProjectionUpsert.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks sync job as FAILED when IA catalog synchronization fails completely", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            products: {
              edges: [],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    mockCatalogSync.mockResolvedValue({
      chunksIndexed: 0,
      productsProcessed: 0,
      durationMs: 100,
      errors: ["Shop has no accessToken"],
    });

    const { dispatchNextSyncQueueJob } = await import("../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ id: "job-1", status: "FAILED" });
    expect(mockCompleteSyncJob).not.toHaveBeenCalled();
    expect(mockUpdateSyncJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        status: "FAILED",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.not.stringContaining("publishedOnCurrentPublication"),
      }),
    );
  });

  it("completes a product delta without requesting restricted publication data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          products: {
            edges: [
              {
                node: {
                  id: "gid://shopify/Product/123",
                  legacyResourceId: "123",
                  title: "Producto de prueba",
                  description: "Descripción",
                  vendor: "FluxBot",
                  productType: "Demo",
                  handle: "producto-prueba",
                  status: "ACTIVE",
                  tags: ["demo"],
                  collections: { nodes: [] },
                  variants: { nodes: [] },
                  images: { nodes: [] },
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    mockProductProjectionFindUnique.mockResolvedValue({
      metadata: { publishedOnCurrentPublication: true },
    });
    mockCatalogSync.mockResolvedValue({
      chunksIndexed: 1,
      productsProcessed: 1,
      durationMs: 100,
      errors: [],
    });

    const { dispatchNextSyncQueueJob } = await import("../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ id: "job-1", status: "COMPLETED" });
    expect(mockCompleteSyncJob).toHaveBeenCalledWith("job-1", "COMPLETED");
    expect(mockProductProjectionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          metadata: expect.objectContaining({
            publishedOnCurrentPublication: true,
            status: "ACTIVE",
          }),
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.not.stringContaining("publishedOnCurrentPublication"),
      }),
    );
  });

  it("marks the job as failed with the Shopify GraphQL permission error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          errors: [
            {
              message:
                "Access denied for a product field. Required access: read_product_listings access scope.",
            },
          ],
        }),
      }),
    );

    const { dispatchNextSyncQueueJob } = await import("../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ id: "job-1", status: "FAILED" });
    expect(mockCatalogSync).not.toHaveBeenCalled();
    expect(mockUpdateSyncJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        status: "FAILED",
        errorMessage: expect.stringContaining("read_product_listings"),
      }),
    );
  });
});
