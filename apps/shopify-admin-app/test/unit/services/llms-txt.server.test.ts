import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGenerate, mockFindUnique, mockUpsert, mockDeleteMany } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
  mockFindUnique: vi.fn(),
  mockUpsert: vi.fn(),
  mockDeleteMany: vi.fn(),
}));

vi.mock("../../../app/services/ia-backend.server", () => ({
  iaClient: {
    llms: {
      generate: mockGenerate,
    },
  },
}));

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: mockFindUnique,
    },
    llmsTxtCache: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
      deleteMany: mockDeleteMany,
    },
  },
}));

import { LlmsTxtService } from "../../../app/services/llms-txt.server";

describe("llms-txt.server", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.LLMS_TXT_CACHE_TTL_MINUTES;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("generate", () => {
    it("generates content via the IA client when the shop is unknown (no cache)", async () => {
      mockFindUnique.mockResolvedValue(null);
      mockGenerate.mockResolvedValue("# Mi Tienda");

      const content = await LlmsTxtService.generate({ shopDomain: "  EXAMPLE.Myshopify.com  " });

      expect(content).toBe("# Mi Tienda");
      expect(mockFindUnique).toHaveBeenCalled();
      expect(mockGenerate).toHaveBeenCalledWith(
        {
          shopDomain: "example.myshopify.com",
          includePolicies: true,
          includeProducts: true,
          maxProducts: 12,
        },
        "example.myshopify.com",
      );
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("returns cached content when a fresh cache entry exists", async () => {
      mockFindUnique.mockImplementation(({ where }) => {
        if (where && where.domain) {
          return Promise.resolve({ id: "shop-1" });
        }
        return Promise.resolve({
          content: "cached-content",
          expiresAt: new Date(Date.now() + 60_000),
        });
      });
      mockGenerate.mockResolvedValue("fresh-content");

      const content = await LlmsTxtService.generate({ shopDomain: "example.com" });

      expect(content).toBe("cached-content");
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("ignores cache when forceRefresh is true", async () => {
      mockFindUnique.mockImplementation(({ where }) => {
        if (where && where.domain) {
          return Promise.resolve({ id: "shop-1" });
        }
        return Promise.resolve({
          content: "cached-content",
          expiresAt: new Date(Date.now() + 60_000),
        });
      });
      mockGenerate.mockResolvedValue("fresh-content");

      const content = await LlmsTxtService.generate({
        shopDomain: "example.com",
        forceRefresh: true,
      });

      expect(content).toBe("fresh-content");
    });

    it("upserts the cache after generating for a known shop with canonical params", async () => {
      mockFindUnique.mockImplementation(({ where }) => {
        if (where && where.domain) {
          return Promise.resolve({ id: "shop-1" });
        }
        return Promise.resolve(null);
      });
      mockGenerate.mockResolvedValue("# Tienda");
      mockUpsert.mockResolvedValue({});

      await LlmsTxtService.generate({ shopDomain: "example.com", maxProducts: 12 });

      expect(mockUpsert).toHaveBeenCalledWith({
        where: { shopId: "shop-1" },
        create: expect.objectContaining({ shopId: "shop-1", content: "# Tienda" }),
        update: expect.objectContaining({ content: "# Tienda" }),
      });
    });

    it("does not cache when params are non-canonical (maxProducts != 12)", async () => {
      mockFindUnique.mockImplementation(({ where }) => {
        if (where && where.domain) {
          return Promise.resolve({ id: "shop-1" });
        }
        return Promise.resolve(null);
      });
      mockGenerate.mockResolvedValue("# Tienda");

      await LlmsTxtService.generate({ shopDomain: "example.com", maxProducts: 5 });

      expect(mockUpsert).not.toHaveBeenCalled();
      expect(mockGenerate).toHaveBeenCalledWith(
        {
          shopDomain: "example.com",
          includePolicies: true,
          includeProducts: true,
          maxProducts: 5,
        },
        "example.com",
      );
    });

    it("clamps maxProducts to the allowed range", async () => {
      mockFindUnique.mockResolvedValue(null);
      mockGenerate.mockResolvedValue("");

      await LlmsTxtService.generate({ shopDomain: "example.com", maxProducts: 999 });

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ maxProducts: 50 }),
        "example.com",
      );
    });

    it("respects includePolicies/includeProducts=false (non-canonical, no cache read)", async () => {
      mockFindUnique.mockImplementation(({ where }) => {
        if (where && where.domain) {
          return Promise.resolve({ id: "shop-1" });
        }
        return Promise.resolve(null);
      });
      mockGenerate.mockResolvedValue("no policies");

      await LlmsTxtService.generate({
        shopDomain: "example.com",
        includePolicies: false,
        includeProducts: false,
      });

      expect(mockGenerate).toHaveBeenCalledWith(
        {
          shopDomain: "example.com",
          includePolicies: false,
          includeProducts: false,
          maxProducts: 12,
        },
        "example.com",
      );
    });

    it("uses LLMS_TXT_CACHE_TTL_MINUTES when set", async () => {
      process.env.LLMS_TXT_CACHE_TTL_MINUTES = "5";
      mockFindUnique.mockImplementation(({ where }) => {
        if (where && where.domain) {
          return Promise.resolve({ id: "shop-1" });
        }
        return Promise.resolve(null);
      });
      mockGenerate.mockResolvedValue("# Tienda");
      mockUpsert.mockResolvedValue({});

      await LlmsTxtService.generate({ shopDomain: "example.com" });

      const [args] = mockUpsert.mock.calls[0];
      const ttlMs = args.create.expiresAt.getTime() - args.create.generatedAt.getTime();
      expect(ttlMs).toBe(5 * 60 * 1000);
    });
  });

  describe("getCacheStatus", () => {
    it("returns no-cache status when the shop is unknown", async () => {
      mockFindUnique.mockResolvedValue(null);

      const status = await LlmsTxtService.getCacheStatus("EXAMPLE.com");

      expect(status).toEqual({
        shopDomain: "example.com",
        hasCache: false,
        generatedAt: null,
        expiresAt: null,
        isExpired: false,
      });
    });

    it("reports hasCache and isExpired based on the cache entry", async () => {
      const expiredAt = new Date(Date.now() - 1000);
      const generatedAt = new Date(Date.now() - 5000);
      mockFindUnique.mockImplementation(({ where }) => {
        if (where && where.domain) {
          return Promise.resolve({ id: "shop-1" });
        }
        return Promise.resolve({ generatedAt, expiresAt: expiredAt });
      });

      const status = await LlmsTxtService.getCacheStatus("example.com");

      expect(status.hasCache).toBe(true);
      expect(status.isExpired).toBe(true);
      expect(status.generatedAt).toBe(generatedAt);
      expect(status.expiresAt).toBe(expiredAt);
    });

    it("reports a non-expired cache when expiresAt is in the future", async () => {
      mockFindUnique.mockImplementation(({ where }) => {
        if (where && where.domain) {
          return Promise.resolve({ id: "shop-1" });
        }
        return Promise.resolve({ generatedAt: new Date(), expiresAt: new Date(Date.now() + 1000) });
      });

      const status = await LlmsTxtService.getCacheStatus("example.com");

      expect(status.hasCache).toBe(true);
      expect(status.isExpired).toBe(false);
    });
  });

  describe("invalidate", () => {
    it("deletes the cache when the shop exists", async () => {
      mockFindUnique.mockImplementation(({ where }) => {
        if (where && where.domain) {
          return Promise.resolve({ id: "shop-1" });
        }
        return Promise.resolve(null);
      });

      await LlmsTxtService.invalidate("EXAMPLE.com");

      expect(mockDeleteMany).toHaveBeenCalledWith({ where: { shopId: "shop-1" } });
    });

    it("is a no-op when the shop is unknown", async () => {
      mockFindUnique.mockResolvedValue(null);

      await LlmsTxtService.invalidate("example.com");

      expect(mockDeleteMany).not.toHaveBeenCalled();
    });
  });
});
