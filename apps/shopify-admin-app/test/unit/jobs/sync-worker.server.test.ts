import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSyncJobFindFirst = vi.fn();
const mockSyncJobUpdateMany = vi.fn();
const mockSyncJobFindUnique = vi.fn();
const mockUpdateSyncJob = vi.fn();
const mockCompleteSyncJob = vi.fn();
const mockIngestChunks = vi.fn();
const mockProductTransformerToChunks = vi.fn();
const mockPolicyTransformerToChunks = vi.fn();
const mockPageTransformerToChunks = vi.fn();
const mockProductProjectionFindUnique = vi.fn();
const mockProductProjectionUpsert = vi.fn();
const mockPolicyProjectionUpsert = vi.fn();
const mockOrderProjectionUpsert = vi.fn();
const mockCatalogSync = vi.fn();
const mockSyncShopReference = vi.fn();
const mockMergeProductAdminMetadata = vi.fn();

vi.mock("../../../app/db.server", () => ({
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
      upsert: mockPolicyProjectionUpsert,
    },
    orderProjection: {
      upsert: mockOrderProjectionUpsert,
    },
  },
}));

vi.mock("../../../app/services/sync-service.server", () => ({
  ProductTransformer: { toChunks: mockProductTransformerToChunks },
  PolicyTransformer: { toChunks: mockPolicyTransformerToChunks },
  PageTransformer: { toChunks: mockPageTransformerToChunks },
  SyncService: {
    ingestChunks: mockIngestChunks,
    updateSyncJob: mockUpdateSyncJob,
    completeSyncJob: mockCompleteSyncJob,
  },
}));

vi.mock("../../../app/services/product-faqs.server", () => ({
  mergeProductAdminMetadata: mockMergeProductAdminMetadata,
}));

vi.mock("../../../app/services/ia-backend.server", () => ({
  iaClient: {
    catalog: {
      sync: mockCatalogSync,
    },
  },
}));

vi.mock("../../../app/services/shop-backend-sync.server", () => ({
  syncShopReferenceToIABackend: mockSyncShopReference,
}));

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    jobType: "delta:products",
    shop: {
      id: "shop-1",
      domain: "store.myshopify.com",
      accessToken: "shpat_test",
      status: "ACTIVE",
    },
    ...overrides,
  };
}

function responseFor(data: unknown) {
  return { ok: true, json: async () => ({ data }) };
}

function productsResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      products: {
        edges: [
          {
            node: {
              id: "gid://shopify/Product/123",
              legacyResourceId: "123",
              title: "Widget",
              description: "A widget",
              vendor: "FluxBot",
              productType: "Gadget",
              handle: "widget",
              status: "ACTIVE",
              published: true,
              tags: ["bestseller", "summer"],
              collections: { nodes: [{ title: "Featured" }] },
              variants: {
                nodes: [
                  {
                    id: "gid://shopify/ProductVariant/456",
                    legacyResourceId: "456",
                    title: "Red",
                    sku: "WID-RED",
                    price: "19.99",
                    availableForSale: true,
                    inventoryQuantity: 7,
                    inventoryPolicy: "DENY",
                  },
                ],
              },
              images: {
                nodes: [{ id: "img-1", url: "https://cdn.example/w.jpg", altText: "Widget photo" }],
              },
            },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

function ordersResponse() {
  return {
    data: {
      orders: {
        edges: [
          {
            node: {
              id: "gid://shopify/Order/9001",
              legacyResourceId: "9001",
              name: "#9001",
              email: "buyer@example.com",
              displayFinancialStatus: "PAID",
              displayFulfillmentStatus: "FULFILLED",
              customer: { id: "gid://shopify/Customer/77", legacyResourceId: "77" },
              totalPriceSet: { shopMoney: { amount: "42.00", currencyCode: "USD" } },
              lineItems: {
                nodes: [
                  {
                    title: "Widget",
                    quantity: 1,
                    variant: { id: "gid://shopify/ProductVariant/456", legacyResourceId: "456" },
                    product: { id: "gid://shopify/Product/123", legacyResourceId: "123" },
                  },
                ],
              },
            },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

describe("sync-worker.server — unit coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncJobUpdateMany.mockResolvedValue({ count: 1 });
    mockSyncJobFindUnique.mockResolvedValue(makeJob());
    mockSyncShopReference.mockResolvedValue(true);
    mockProductProjectionFindUnique.mockResolvedValue(null);
    mockProductProjectionUpsert.mockResolvedValue({});
    mockPolicyProjectionUpsert.mockResolvedValue({});
    mockOrderProjectionUpsert.mockResolvedValue({});
    mockIngestChunks.mockResolvedValue(1);
    mockProductTransformerToChunks.mockReturnValue([]);
    mockPolicyTransformerToChunks.mockReturnValue([]);
    mockPageTransformerToChunks.mockReturnValue([]);
    mockMergeProductAdminMetadata.mockImplementation((prev, next) => ({
      ...(prev && typeof prev === "object" ? prev : {}),
      ...next,
    }));
    mockUpdateSyncJob.mockResolvedValue({});
    mockCompleteSyncJob.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when there is no pending job", async () => {
    mockSyncJobFindFirst.mockResolvedValue(null);

    const { dispatchNextSyncQueueJob } = await import("../../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toBeNull();
    expect(mockSyncJobUpdateMany).not.toHaveBeenCalled();
  });

  it("marks the job FAILED when the shop is missing", async () => {
    mockSyncJobFindFirst.mockResolvedValue({ id: "job-1" });
    mockSyncJobFindUnique.mockResolvedValue(makeJob({ shop: null }));

    const { dispatchNextSyncQueueJob } = await import("../../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ id: "job-1", status: "FAILED" });
    expect(mockUpdateSyncJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ status: "FAILED", errorMessage: "Shop missing or inactive" }),
    );
  });

  it("marks the job FAILED when the shop is not ACTIVE", async () => {
    mockSyncJobFindFirst.mockResolvedValue({ id: "job-1" });
    mockSyncJobFindUnique.mockResolvedValue(
      makeJob({ shop: { id: "shop-1", domain: "store.myshopify.com", accessToken: "x", status: "SUSPENDED" } }),
    );

    const { dispatchNextSyncQueueJob } = await import("../../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ id: "job-1", status: "FAILED" });
  });

  it("marks the job FAILED when the shop has no access token", async () => {
    mockSyncJobFindFirst.mockResolvedValue({ id: "job-1" });
    mockSyncJobFindUnique.mockResolvedValue(
      makeJob({ shop: { id: "shop-1", domain: "store.myshopify.com", accessToken: null, status: "ACTIVE" } }),
    );

    const { dispatchNextSyncQueueJob } = await import("../../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ id: "job-1", status: "FAILED" });
    expect(mockUpdateSyncJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ errorMessage: "Shop is missing access token" }),
    );
  });

  it("completes a delta:products job and ingests product projections", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFor(productsResponse().data)));
    mockCatalogSync.mockResolvedValue({
      chunksIndexed: 4,
      productsProcessed: 1,
      durationMs: 50,
      errors: [],
    });

    const { dispatchNextSyncQueueJob } = await import("../../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ id: "job-1", status: "COMPLETED" });
    expect(mockCompleteSyncJob).toHaveBeenCalledWith("job-1", "COMPLETED");
    expect(mockSyncShopReference).toHaveBeenCalledWith(
      { id: "shop-1", domain: "store.myshopify.com", accessToken: "shpat_test" },
      { force: true },
    );
    expect(mockCatalogSync).toHaveBeenCalledWith({ shopId: "shop-1", fullSync: true }, "store.myshopify.com");
    const upsertArgs = mockProductProjectionUpsert.mock.calls[0][0];
    expect(upsertArgs.create).toEqual(
      expect.objectContaining({
        shopId: "shop-1",
        productId: "123",
        title: "Widget",
        handle: "widget",
        metadata: expect.objectContaining({
          collections: ["Featured"],
          tags: ["bestseller", "summer"],
          status: "ACTIVE",
        }),
        variants: expect.arrayContaining([
          expect.objectContaining({ id: "456", sku: "WID-RED", price: "19.99" }),
        ]),
        images: expect.arrayContaining([
          expect.objectContaining({ id: "img-1", altText: "Widget photo" }),
        ]),
      }),
    );
    // The restricted read_product_listings field is never requested, so the
    // projection must not carry a fresh publishedOnCurrentPublication value.
    expect(upsertArgs.create.metadata.publishedOnCurrentPublication).toBeUndefined();
  });

  it("pages through products and skips nodes without a resolvable id", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      const body = JSON.parse((fetchMock.mock.calls.at(-1)?.[1] as { body?: string })?.body || "{}");
      const query = body.query || "";
      if (query.includes("SyncProducts")) {
        const page = fetchMock.mock.calls.filter((c) => {
          const q = JSON.parse((c[1] as { body?: string })?.body || "{}").query || "";
          return q.includes("SyncProducts");
        }).length;
        if (page === 1) {
          return responseFor({
            products: {
              edges: [
                {
                  node: {
                    id: "gid://shopify/Product/111",
                    legacyResourceId: "111",
                    title: "First",
                    description: "",
                    vendor: "",
                    productType: "",
                    handle: "first",
                    status: "",
                    tags: [],
                    collections: { nodes: [] },
                    variants: { nodes: [] },
                    images: { nodes: [] },
                  },
                },
                {
                  node: {
                    title: "No id",
                    description: "",
                  },
                },
              ],
              pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
            },
          });
        }
        return responseFor({
          products: {
            edges: [
              {
                node: {
                  id: "gid://shopify/Product/222",
                  legacyResourceId: "222",
                  title: "Second",
                  description: "",
                  vendor: "",
                  productType: "",
                  handle: "second",
                  status: "",
                  tags: [],
                  collections: { nodes: [] },
                  variants: { nodes: [] },
                  images: { nodes: [] },
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        });
      }
      return responseFor({});
    });
    vi.stubGlobal("fetch", fetchMock);
    mockCatalogSync.mockResolvedValue({
      chunksIndexed: 0,
      productsProcessed: 2,
      durationMs: 40,
      errors: [],
    });

    const { dispatchNextSyncQueueJob } = await import("../../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ status: "COMPLETED" });
    const productIds = mockProductProjectionUpsert.mock.calls.map((c) => c[0].create.productId);
    expect(productIds).toEqual(["111", "222"]);
  });

  it("completes an initial:policies job and upserts policy projections", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseFor({
          shop: {
            privacyPolicy: { title: "Privacy", body: "We protect your data", url: "/privacy" },
            refundPolicy: { title: "", body: "", url: "" },
            shippingPolicy: { title: "Shipping", body: "Fast", url: "/shipping" },
            termsOfService: null,
          },
        }),
      ),
    );
    mockSyncJobFindUnique.mockResolvedValue(makeJob({ jobType: "initial:policies" }));

    const { dispatchNextSyncQueueJob } = await import("../../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ status: "COMPLETED" });
    expect(mockPolicyProjectionUpsert).toHaveBeenCalledTimes(2);
    expect(mockPolicyProjectionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ shopId: "shop-1", policyType: "privacy", title: "Privacy" }),
      }),
    );
    expect(mockUpdateSyncJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ progress: 0.9, totalItems: 2 }),
    );
  });

  it("skips policy sync when the API version lacks policy fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          errors: [{ message: "Field 'privacyPolicy' doesn't exist on type 'Shop'" }],
        }),
      }),
    );
    mockSyncJobFindUnique.mockResolvedValue(makeJob({ jobType: "delta:policies" }));

    const { dispatchNextSyncQueueJob } = await import("../../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ status: "COMPLETED" });
    expect(mockPolicyProjectionUpsert).not.toHaveBeenCalled();
    expect(mockUpdateSyncJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ progress: 0.9, totalItems: 0 }),
    );
  });

  it("completes a delta:pages job", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseFor({
          pages: {
            edges: [
              {
                node: {
                  id: "gid://shopify/OnlineStorePage/55",
                  title: "About",
                  handle: "about",
                  bodySummary: "Summary",
                  body: "Full body",
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        }),
      ),
    );
    mockSyncJobFindUnique.mockResolvedValue(makeJob({ jobType: "delta:pages" }));

    const { dispatchNextSyncQueueJob } = await import("../../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ status: "COMPLETED" });
    expect(mockUpdateSyncJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ progress: 0.9, totalItems: 1 }),
    );
  });

  it("runs an initial:catalog job end-to-end including order projections", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      const body = JSON.parse((fetchMock.mock.calls.at(-1)?.[1] as { body?: string })?.body || "{}");
      const query = body.query || "";
      if (query.includes("SyncProducts")) {
        return responseFor(productsResponse().data);
      }
      if (query.includes("SyncOrders")) {
        return responseFor(ordersResponse().data);
      }
      return responseFor({});
    });
    vi.stubGlobal("fetch", fetchMock);
    mockSyncJobFindUnique.mockResolvedValue(makeJob({ jobType: "initial:catalog" }));
    mockCatalogSync.mockResolvedValue({
      chunksIndexed: 5,
      productsProcessed: 1,
      durationMs: 30,
      errors: [],
    });

    const { dispatchNextSyncQueueJob } = await import("../../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ status: "COMPLETED" });
    expect(mockOrderProjectionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          shopId: "shop-1",
          orderId: "9001",
          customerId: "77",
          totalPrice: "42.00",
          lineItems: expect.arrayContaining([
            expect.objectContaining({ title: "Widget", quantity: 1, productId: "123" }),
          ]),
        }),
      }),
    );
    expect(mockUpdateSyncJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ progress: 0.98, totalItems: 2 }),
    );
  });

  it("marks the job FAILED for unsupported job types", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFor(productsResponse().data)));
    mockSyncJobFindUnique.mockResolvedValue(makeJob({ jobType: "custom:full" }));

    const { dispatchNextSyncQueueJob } = await import("../../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ status: "FAILED" });
    expect(mockUpdateSyncJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ status: "FAILED", errorMessage: "Unsupported sync job type: custom:full" }),
    );
  });

  it("fails when the shop reference cannot be synchronized to the IA backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFor(productsResponse().data)));
    mockSyncShopReference.mockResolvedValue(false);

    const { dispatchNextSyncQueueJob } = await import("../../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ status: "FAILED" });
    expect(mockUpdateSyncJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        status: "FAILED",
        errorMessage: expect.stringContaining("Could not synchronize shop"),
      }),
    );
  });

  it("fails the job when Shopify returns a non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      }),
    );

    const { dispatchNextSyncQueueJob } = await import("../../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ status: "FAILED" });
    expect(mockUpdateSyncJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ errorMessage: "Shopify GraphQL HTTP 401" }),
    );
  });

  it("fails the job when Shopify returns no data payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: null }),
      }),
    );

    const { dispatchNextSyncQueueJob } = await import("../../../app/jobs/sync-worker.server");
    const result = await dispatchNextSyncQueueJob();

    expect(result).toMatchObject({ status: "FAILED" });
    expect(mockUpdateSyncJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ errorMessage: "Shopify GraphQL returned no data" }),
    );
  });

  it("processPendingSyncJobs dispatches up to the limit and stops when the queue is empty", async () => {
    mockSyncJobFindFirst
      .mockResolvedValueOnce({ id: "job-1" })
      .mockResolvedValueOnce(null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFor(productsResponse().data)));
    mockCatalogSync.mockResolvedValue({
      chunksIndexed: 1,
      productsProcessed: 1,
      durationMs: 10,
      errors: [],
    });

    const { processPendingSyncJobs } = await import("../../../app/jobs/sync-worker.server");
    const result = await processPendingSyncJobs(5);

    expect(result).toEqual({
      processed: 1,
      failed: 0,
      jobs: [{ id: "job-1", status: "COMPLETED" }],
    });
  });

  it("processPendingSyncJobsForShop counts a failed dispatch as failed", async () => {
    mockSyncJobFindFirst
      .mockResolvedValueOnce({ id: "job-1" })
      .mockResolvedValueOnce(null);
    mockSyncJobFindUnique.mockResolvedValue(makeJob({ shop: null }));

    const { processPendingSyncJobsForShop } = await import("../../../app/jobs/sync-worker.server");
    const result = await processPendingSyncJobsForShop("shop-1", 5, "manual-reprocess");

    expect(result).toEqual({
      processed: 0,
      failed: 1,
      jobs: [{ id: "job-1", status: "FAILED", message: "Shop missing or inactive" }],
    });
    expect(mockSyncJobFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ shopId: "shop-1" }) }),
    );
  });
});
