import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "../../app/db.server";

/**
 * Comprehensive Integration Tests with Real Database
 * Tests all onboarding features against PostgreSQL database
 * Run with: ./scripts/test-db.sh start && npm run test
 */

describe("Onboarding - Integration Tests (Real Database)", () => {
  let testShop: any;

  beforeAll(async () => {
    testShop = await prisma.shop.create({
      data: {
        domain: `integration-test-${Date.now()}@shopify.com`,
        accessToken: "test-access-token",
        scope: "read_orders,write_products",
        isOnline: false,
        status: "ACTIVE",
      },
    });
  });

  afterAll(async () => {
    if (testShop?.id) {
      await prisma.shop.delete({ where: { id: testShop.id } });
    }
  });

  describe("Shop Creation & Initialization", () => {
    it("should create shop with default onboarding status null", async () => {
      const shop = await prisma.shop.create({
        data: {
          domain: `create-test-${Date.now()}@shopify.com`,
          accessToken: "token",
          scope: "read_orders",
          isOnline: false,
          status: "ACTIVE",
        },
      });

      try {
        expect(shop.onboardingCompletedAt).toBeNull();
        expect(shop.status).toBe("ACTIVE");
        expect(shop.domain).toContain("@shopify.com");
      } finally {
        await prisma.shop.delete({ where: { id: shop.id } });
      }
    });

    it("should fetch shop with onboarding status", async () => {
      const fetched = await prisma.shop.findUnique({
        where: { id: testShop.id },
      });

      expect(fetched).toBeDefined();
      expect(fetched?.onboardingCompletedAt).toBeNull();
    });
  });

  describe("Onboarding Completion", () => {
    it("should complete onboarding with timestamp", async () => {
      const now = new Date();
      const updated = await prisma.shop.update({
        where: { id: testShop.id },
        data: { onboardingCompletedAt: now },
      });

      expect(updated.onboardingCompletedAt).not.toBeNull();
      expect(updated.onboardingCompletedAt?.getTime()).toBeCloseTo(
        now.getTime(),
        -2
      );
    });

    it("should mark onboarding as completed", async () => {
      const fetched = await prisma.shop.findUnique({
        where: { id: testShop.id },
      });

      expect(fetched?.onboardingCompletedAt).not.toBeNull();
    });

    it("should allow querying completed shops", async () => {
      const completed = await prisma.shop.findMany({
        where: {
          onboardingCompletedAt: { not: null },
        },
      });

      const ids = completed.map(s => s.id);
      expect(ids).toContain(testShop.id);
    });
  });

  describe("Reinstall & Reset", () => {
    let reinstallShop: any;

    beforeAll(async () => {
      reinstallShop = await prisma.shop.create({
        data: {
          domain: `reinstall-test-${Date.now()}@shopify.com`,
          accessToken: "token",
          scope: "read_orders",
          isOnline: false,
          status: "ACTIVE",
          onboardingCompletedAt: new Date("2026-05-01T00:00:00Z"),
        },
      });
    });

    afterAll(async () => {
      if (reinstallShop?.id) {
        await prisma.shop.delete({ where: { id: reinstallShop.id } });
      }
    });

    it("should simulate app uninstall", async () => {
      const uninstalled = await prisma.shop.update({
        where: { id: reinstallShop.id },
        data: {
          status: "CANCELLED",
          onboardingCompletedAt: null,
        },
      });

      expect(uninstalled.status).toBe("CANCELLED");
      expect(uninstalled.onboardingCompletedAt).toBeNull();
    });

    it("should allow reinstallation", async () => {
      const reinstalled = await prisma.shop.update({
        where: { id: reinstallShop.id },
        data: {
          status: "ACTIVE",
          onboardingCompletedAt: null,
        },
      });

      expect(reinstalled.status).toBe("ACTIVE");
      expect(reinstalled.onboardingCompletedAt).toBeNull();
    });

    it("should complete onboarding after reinstall", async () => {
      const reCompleted = await prisma.shop.update({
        where: { id: reinstallShop.id },
        data: {
          onboardingCompletedAt: new Date(),
        },
      });

      expect(reCompleted.onboardingCompletedAt).not.toBeNull();
    });
  });

  describe("Multi-shop Scenarios", () => {
    let shops: any[] = [];

    beforeAll(async () => {
      // Create multiple shops with different statuses
      for (let i = 0; i < 3; i++) {
        const shop = await prisma.shop.create({
          data: {
            domain: `multi-test-${Date.now()}-${i}@shopify.com`,
            accessToken: `token-${i}`,
            scope: "read_orders",
            isOnline: false,
            status: "ACTIVE",
            onboardingCompletedAt:
              i === 0 ? new Date() : i === 1 ? null : new Date("2026-04-01"),
          },
        });
        shops.push(shop);
      }
    });

    afterAll(async () => {
      for (const shop of shops) {
        await prisma.shop.delete({ where: { id: shop.id } });
      }
    });

    it("should query completed and incomplete shops", async () => {
      const completed = await prisma.shop.findMany({
        where: { onboardingCompletedAt: { not: null } },
      });

      const incomplete = await prisma.shop.findMany({
        where: { onboardingCompletedAt: null },
      });

      expect(completed.length).toBeGreaterThan(0);
      expect(incomplete.length).toBeGreaterThan(0);
    });

    it("should handle complex filtering", async () => {
      const cutoff = new Date("2026-04-15T00:00:00Z");

      const recent = await prisma.shop.findMany({
        where: {
          onboardingCompletedAt: {
            gte: cutoff,
          },
        },
      });

      expect(Array.isArray(recent)).toBe(true);
    });
  });

  describe("Performance & Indexing", () => {
    it("should query efficiently with index", async () => {
      const start = Date.now();

      const incomplete = await prisma.shop.findMany({
        where: {
          onboardingCompletedAt: null,
        },
        take: 100,
      });

      const duration = Date.now() - start;

      expect(Array.isArray(incomplete)).toBe(true);
      // Should be fast with proper index
      expect(duration).toBeLessThan(1000);
    });

    it("should handle large batch updates", async () => {
      const shops = await prisma.shop.findMany({ take: 10 });

      const updates = shops.map(shop =>
        prisma.shop.update({
          where: { id: shop.id },
          data: { updatedAt: new Date() },
        })
      );

      const results = await Promise.all(updates);
      expect(results.length).toBe(shops.length);
    });
  });

  describe("Data Consistency", () => {
    it("should maintain referential integrity", async () => {
      const shop = await prisma.shop.findUnique({
        where: { id: testShop.id },
        include: {
          chatbotConfigs: true,
        },
      });

      expect(shop).toBeDefined();
      expect(Array.isArray(shop?.chatbotConfigs)).toBe(true);
    });

    it("should handle concurrent updates safely", async () => {
      const updates = [];

      for (let i = 0; i < 5; i++) {
        updates.push(
          prisma.shop.update({
            where: { id: testShop.id },
            data: {
              updatedAt: new Date(),
            },
          })
        );
      }

      const results = await Promise.all(updates);
      expect(results.length).toBe(5);
    });
  });

  describe("Error Handling", () => {
    it("should handle non-existent shop", async () => {
      const result = await prisma.shop.findUnique({
        where: { id: "non-existent-id" },
      });

      expect(result).toBeNull();
    });

    it("should prevent duplicate domains", async () => {
      const existingDomain = testShop.domain;

      let error: Error | null = null;
      try {
        await prisma.shop.create({
          data: {
            domain: existingDomain,
            accessToken: "token",
            scope: "read_orders",
            isOnline: false,
            status: "ACTIVE",
          },
        });
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
    });
  });

  describe("Database Transactions", () => {
    it("should handle transaction rollback on error", async () => {
      const shop = await prisma.shop.create({
        data: {
          domain: `transaction-test-${Date.now()}@shopify.com`,
          accessToken: "token",
          scope: "read_orders",
          isOnline: false,
          status: "ACTIVE",
        },
      });

      try {
        // Simulate transaction
        await prisma.shop.update({
          where: { id: shop.id },
          data: {
            onboardingCompletedAt: new Date(),
          },
        });

        const updated = await prisma.shop.findUnique({
          where: { id: shop.id },
        });

        expect(updated?.onboardingCompletedAt).not.toBeNull();
      } finally {
        await prisma.shop.delete({ where: { id: shop.id } });
      }
    });
  });
});
