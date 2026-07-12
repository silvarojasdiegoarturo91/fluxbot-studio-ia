import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSyncJobFindFirst = vi.fn();
const mockSyncJobUpdateMany = vi.fn();
const mockSyncJobFindUnique = vi.fn();
const mockUpdateSyncJob = vi.fn();
const mockCompleteSyncJob = vi.fn();
const mockCatalogSync = vi.fn();
const mockSyncShopReference = vi.fn();

vi.mock("../../app/db.server", () => ({
  default: {
    syncJob: {
      findFirst: mockSyncJobFindFirst,
      updateMany: mockSyncJobUpdateMany,
      findUnique: mockSyncJobFindUnique,
    },
    productProjection: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
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
  mergeProductAdminMetadata: vi.fn((_prev, next) => next),
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks sync job as FAILED when IA catalog synchronization fails completely", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            products: {
              edges: [],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }),
      }),
    );
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
  });
});
