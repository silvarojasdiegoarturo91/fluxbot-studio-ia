import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockCreateSyncJob = vi.fn();

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
    },
    syncJob: {
      create: mockCreateSyncJob,
    },
  },
}));

vi.mock("../../../app/services/shop-backend-sync.server", () => ({
  syncShopReferenceToIABackend: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeShop(overrides: Partial<{ id: string; domain: string }> = {}) {
  return { id: "shop-1", domain: "example.myshopify.com", ...overrides };
}

function makeSyncJob(shopId = "shop-1", jobType = "initial:catalog") {
  return {
    id: `job-${jobType}`,
    shopId,
    jobType,
    status: "PENDING",
    progress: 0,
    processedItems: 0,
    totalItems: 0,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("shop-context.server — ensureShopRecord", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFindUnique.mockReset();
    mockUpsert.mockReset();
    mockCreateSyncJob.mockReset();
    mockCreateSyncJob.mockImplementation(({ data }: { data: { jobType: string } }) =>
      Promise.resolve(makeSyncJob("shop-1", data.jobType)),
    );
    mockUpsert.mockResolvedValue(makeShop());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("extractShopContextFromSession", () => {
    it("returns null for non-object session", async () => {
      const { extractShopContextFromSession } = await import(
        "../../../app/services/shop-context.server"
      );
      expect(extractShopContextFromSession(null)).toBeNull();
      expect(extractShopContextFromSession("string")).toBeNull();
      expect(extractShopContextFromSession(42)).toBeNull();
    });

    it("returns null when shop domain is missing", async () => {
      const { extractShopContextFromSession } = await import(
        "../../../app/services/shop-context.server"
      );
      expect(extractShopContextFromSession({ accessToken: "tok" })).toBeNull();
    });

    it("returns context with trimmed lower-case domain", async () => {
      const { extractShopContextFromSession } = await import(
        "../../../app/services/shop-context.server"
      );
      const ctx = extractShopContextFromSession({ shop: "  Example.myshopify.com  ", accessToken: "tok" });
      expect(ctx?.domain).toBe("example.myshopify.com");
      expect(ctx?.accessToken).toBe("tok");
    });

    it("ignores non-string accessToken", async () => {
      const { extractShopContextFromSession } = await import(
        "../../../app/services/shop-context.server"
      );
      const ctx = extractShopContextFromSession({ shop: "test.myshopify.com", accessToken: 123 });
      expect(ctx?.accessToken).toBeUndefined();
    });
  });

  describe("ensureShopRecord — new shop install", () => {
    it("queues the three initial sync jobs when shop does not exist", async () => {
      mockFindUnique.mockResolvedValue(null); // shop does not exist yet
      const { ensureShopRecord } = await import("../../../app/services/shop-context.server");

      await ensureShopRecord({ domain: "new.myshopify.com", accessToken: "tok" });

      const jobTypes = mockCreateSyncJob.mock.calls.map(
        (call: [{ data: { jobType: string } }]) => call[0].data.jobType,
      );
      expect(jobTypes).toContain("initial:catalog");
      expect(jobTypes).toContain("initial:policies");
      expect(jobTypes).toContain("initial:pages");
      expect(jobTypes).toHaveLength(3);
    });

    it("creates sync jobs in PENDING status with progress 0", async () => {
      mockFindUnique.mockResolvedValue(null);
      const { ensureShopRecord } = await import("../../../app/services/shop-context.server");

      await ensureShopRecord({ domain: "new.myshopify.com", accessToken: "tok" });

      for (const call of mockCreateSyncJob.mock.calls as [{ data: Record<string, unknown> }][]) {
        expect(call[0].data.status).toBe("RUNNING");
      }
    });
  });

  describe("ensureShopRecord — existing shop re-login", () => {
    it("does NOT queue sync jobs when shop already exists", async () => {
      mockFindUnique.mockResolvedValue(makeShop()); // shop already exists
      const { ensureShopRecord } = await import("../../../app/services/shop-context.server");

      await ensureShopRecord({ domain: "existing.myshopify.com", accessToken: "tok" });

      expect(mockCreateSyncJob).not.toHaveBeenCalled();
    });
  });

  describe("ensureShopRecord — sync job failure is non-fatal", () => {
    it("returns the shop even when sync job creation fails", async () => {
      mockFindUnique.mockResolvedValue(null);
      mockCreateSyncJob.mockRejectedValue(new Error("DB error"));
      const { ensureShopRecord } = await import("../../../app/services/shop-context.server");

      const result = await ensureShopRecord({ domain: "fail.myshopify.com", accessToken: "tok" });

      expect(result).toMatchObject({ id: "shop-1", domain: "example.myshopify.com" });
    });
  });

  describe("ensureShopForSession", () => {
    it("returns null for invalid session", async () => {
      const { ensureShopForSession } = await import("../../../app/services/shop-context.server");
      const result = await ensureShopForSession({});
      expect(result).toBeNull();
    });

    it("returns shop for valid session", async () => {
      mockFindUnique.mockResolvedValue(makeShop()); // existing shop
      const { ensureShopForSession } = await import("../../../app/services/shop-context.server");

      const result = await ensureShopForSession({
        shop: "example.myshopify.com",
        accessToken: "tok",
      });

      expect(result).toMatchObject({ id: "shop-1", domain: "example.myshopify.com" });
    });
  });
});
