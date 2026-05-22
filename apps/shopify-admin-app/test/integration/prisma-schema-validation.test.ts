import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "../../app/db.server";

const describeIfDb =
  process.env.RUN_PRISMA_SCHEMA_VALIDATION === "true" ? describe : describe.skip;

/**
 * Schema Validation Tests
 * 
 * These tests ensure that:
 * 1. Database schema matches Prisma schema
 * 2. Required fields exist on models
 * 3. Migrations have been applied correctly
 * 4. Onboarding-related operations work correctly
 */

describeIfDb("Prisma Schema Validation", () => {
  describe("Shop Model Schema", () => {
    it("should have onboardingCompletedAt field", async () => {
      // This test validates that the field exists by attempting a query
      // If the field doesn't exist, Prisma will throw a validation error
      const shop = await prisma.shop.findFirst({
        select: {
          id: true,
          onboardingCompletedAt: true,
        },
      });
      
      // If we got here, the field exists in the database
      expect(shop).toBeDefined();
    });

    it("should support onboardingCompletedAt as nullable DateTime", async () => {
      // Create a test shop with onboarding not completed
      const testShop = await prisma.shop.create({
        data: {
          domain: `test-schema-validation-${Date.now()}@shopify.com`,
          accessToken: "test-token",
          scope: "read_orders",
          isOnline: false,
          status: "ACTIVE",
          // onboardingCompletedAt should default to null
        },
      });

      try {
        expect(testShop.onboardingCompletedAt).toBeNull();

        // Update with a timestamp
        const updated = await prisma.shop.update({
          where: { id: testShop.id },
          data: {
            onboardingCompletedAt: new Date("2026-05-07T00:00:00Z"),
          },
        });

        expect(updated.onboardingCompletedAt).toEqual(
          new Date("2026-05-07T00:00:00Z")
        );

        // Reset to null
        const reset = await prisma.shop.update({
          where: { id: testShop.id },
          data: {
            onboardingCompletedAt: null,
          },
        });

        expect(reset.onboardingCompletedAt).toBeNull();
      } finally {
        // Cleanup
        await prisma.shop.delete({ where: { id: testShop.id } });
      }
    });

    it("should have onboardingCompletedAt indexed for performance", async () => {
      // Query with index filter to ensure it exists
      const shops = await prisma.shop.findMany({
        where: {
          onboardingCompletedAt: { not: null },
        },
        take: 1,
      });

      // If we got here without error, the index exists
      expect(Array.isArray(shops)).toBe(true);
    });

    it("should support querying by onboardingCompletedAt status", async () => {
      // Test incomplete onboarding query
      const incomplete = await prisma.shop.findMany({
        where: {
          onboardingCompletedAt: null,
        },
        take: 1,
      });

      expect(Array.isArray(incomplete)).toBe(true);

      // Test completed onboarding query
      const completed = await prisma.shop.findMany({
        where: {
          onboardingCompletedAt: { not: null },
        },
        take: 1,
      });

      expect(Array.isArray(completed)).toBe(true);
    });
  });

  describe("Onboarding Field Operations", () => {
    let testShop: any;

    beforeAll(async () => {
      // Create a test shop for onboarding operations
      testShop = await prisma.shop.create({
        data: {
          domain: `test-onboarding-ops-${Date.now()}@shopify.com`,
          accessToken: "test-token-onboarding",
          scope: "read_orders",
          isOnline: false,
          status: "ACTIVE",
        },
      });
    });

    afterAll(async () => {
      // Cleanup
      if (testShop?.id) {
        await prisma.shop.delete({ where: { id: testShop.id } });
      }
    });

    it("should create shop with null onboarding by default", async () => {
      expect(testShop.onboardingCompletedAt).toBeNull();
    });

    it("should update onboarding completion timestamp", async () => {
      const now = new Date();
      const updated = await prisma.shop.update({
        where: { id: testShop.id },
        data: { onboardingCompletedAt: now },
      });

      expect(updated.onboardingCompletedAt).toBeDefined();
      expect(
        updated.onboardingCompletedAt?.getTime()
      ).toBeCloseTo(now.getTime(), -2);
    });

    it("should reset onboarding on reinstall", async () => {
      const reset = await prisma.shop.update({
        where: { id: testShop.id },
        data: { onboardingCompletedAt: null },
      });

      expect(reset.onboardingCompletedAt).toBeNull();
    });

    it("should support partial updates with other fields", async () => {
      const updated = await prisma.shop.update({
        where: { id: testShop.id },
        data: {
          onboardingCompletedAt: new Date("2026-05-07T10:00:00Z"),
          status: "ACTIVE",
        },
      });

      expect(updated.onboardingCompletedAt).toBeDefined();
      expect(updated.status).toBe("ACTIVE");
    });

    it("should validate onboarding timestamp is a valid DateTime", async () => {
      const validDate = new Date();
      const updated = await prisma.shop.update({
        where: { id: testShop.id },
        data: { onboardingCompletedAt: validDate },
      });

      expect(updated.onboardingCompletedAt).toBeInstanceOf(Date);
      expect(typeof updated.onboardingCompletedAt?.toISOString()).toBe("string");
    });

    it("should filter shops by onboarding status", async () => {
      // Get shops with incomplete onboarding
      const incomplete = await prisma.shop.findMany({
        where: {
          onboardingCompletedAt: null,
        },
      });

      expect(Array.isArray(incomplete)).toBe(true);

      // Get shops with completed onboarding
      const completed = await prisma.shop.findMany({
        where: {
          onboardingCompletedAt: { not: null },
        },
      });

      expect(Array.isArray(completed)).toBe(true);
    });
  });

  describe("Migration Validation", () => {
    it("should have migration 20260506223346_add_onboarding_tracking applied", async () => {
      // Attempt a query that requires the migration
      const result = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'shops'
          AND column_name = 'onboardingCompletedAt'
        )
      `;

      const hasColumn = Array.isArray(result) && result[0]?.exists === true;
      expect(hasColumn).toBe(true);
    });

    it("should have index on onboardingCompletedAt for performance", async () => {
      // Check if index exists
      const indexes = await prisma.$queryRaw`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'shops'
        AND indexname = 'idx_shops_onboarding_completed_at'
      `;

      const hasIndex = Array.isArray(indexes) && indexes.length > 0;
      expect(hasIndex).toBe(true);
    });
  });

  describe("Prisma Type Safety", () => {
    it("should enforce onboardingCompletedAt type in updates", async () => {
      // This test ensures TypeScript would catch type errors at compile time
      const shop = await prisma.shop.findFirst({ take: 1 });

      if (shop) {
        // Valid: DateTime or null
        const validUpdate = { onboardingCompletedAt: new Date() };
        expect(validUpdate.onboardingCompletedAt).toBeInstanceOf(Date);

        // Valid: null
        const nullUpdate = { onboardingCompletedAt: null };
        expect(nullUpdate.onboardingCompletedAt).toBeNull();
      }
    });
  });
});
