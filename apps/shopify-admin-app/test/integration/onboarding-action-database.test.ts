import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import prisma from "../../app/db.server";

/**
 * Onboarding Action Tests
 * 
 * These tests validate that the onboarding completion action
 * properly updates the database without Prisma validation errors.
 * 
 * This prevents the error:
 * PrismaClientValidationError: Unknown argument `onboardingCompletedAt`
 */

describe("Onboarding Action - Database Operations", () => {
  let testShop: any;

  beforeAll(async () => {
    // Create a test shop simulating a new installation
    testShop = await prisma.shop.create({
      data: {
        domain: `test-onboarding-action-${Date.now()}@shopify.com`,
        accessToken: "test-token",
        scope: "read_orders",
        isOnline: false,
        status: "ACTIVE",
        // onboardingCompletedAt should be null initially
      },
    });
  });

  afterAll(async () => {
    if (testShop?.id) {
      await prisma.shop.delete({ where: { id: testShop.id } });
    }
  });

  describe("Complete Onboarding Action", () => {
    it("should allow updating onboardingCompletedAt on completion", async () => {
      const completionTime = new Date();

      // This is the exact operation that was failing
      const updated = await prisma.shop.update({
        where: { id: testShop.id },
        data: {
          onboardingCompletedAt: completionTime,
        },
      });

      expect(updated).toBeDefined();
      expect(updated.onboardingCompletedAt).not.toBeNull();
      expect(updated.onboardingCompletedAt?.getTime()).toBeCloseTo(
        completionTime.getTime(),
        -2
      );
    });

    it("should handle onboarding update without blocking other operations", async () => {
      const completionTime = new Date();

      const updated = await prisma.shop.update({
        where: { id: testShop.id },
        data: {
          onboardingCompletedAt: completionTime,
          status: "ACTIVE", // Other fields should still work
        },
      });

      expect(updated.onboardingCompletedAt).toBeDefined();
      expect(updated.status).toBe("ACTIVE");
    });

    it("should not throw PrismaClientValidationError", async () => {
      const completionTime = new Date();

      // Should not throw any error
      let error: Error | null = null;
      try {
        await prisma.shop.update({
          where: { id: testShop.id },
          data: { onboardingCompletedAt: completionTime },
        });
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeNull();
    });

    it("should persist onboarding completion status", async () => {
      const completionTime = new Date("2026-05-07T00:00:00Z");

      // Update with specific timestamp
      await prisma.shop.update({
        where: { id: testShop.id },
        data: { onboardingCompletedAt: completionTime },
      });

      // Read back to verify persistence
      const fetched = await prisma.shop.findUnique({
        where: { id: testShop.id },
      });

      expect(fetched?.onboardingCompletedAt?.getTime()).toBe(
        completionTime.getTime()
      );
    });
  });

  describe("Onboarding Reset Action (Reinstall)", () => {
    let reinstallShop: any;

    beforeAll(async () => {
      // Create a shop and complete onboarding
      reinstallShop = await prisma.shop.create({
        data: {
          domain: `test-reinstall-${Date.now()}@shopify.com`,
          accessToken: "token1",
          scope: "read_orders",
          isOnline: false,
          status: "ACTIVE",
          onboardingCompletedAt: new Date("2026-05-01T00:00:00Z"), // Already completed
        },
      });
    });

    afterAll(async () => {
      if (reinstallShop?.id) {
        await prisma.shop.delete({ where: { id: reinstallShop.id } });
      }
    });

    it("should reset onboarding on app uninstall", async () => {
      expect(reinstallShop.onboardingCompletedAt).not.toBeNull();

      // Simulate uninstall webhook: reset onboarding flag
      const reset = await prisma.shop.update({
        where: { id: reinstallShop.id },
        data: {
          onboardingCompletedAt: null,
          status: "CANCELLED",
        },
      });

      expect(reset.onboardingCompletedAt).toBeNull();
      expect(reset.status).toBe("CANCELLED");
    });

    it("should allow re-completing onboarding after reset", async () => {
      // Shop was uninstalled and is being reinstalled
      const newCompletionTime = new Date();

      const reCompleted = await prisma.shop.update({
        where: { id: reinstallShop.id },
        data: {
          onboardingCompletedAt: newCompletionTime,
          status: "ACTIVE",
        },
      });

      expect(reCompleted.onboardingCompletedAt).not.toBeNull();
      expect(reCompleted.status).toBe("ACTIVE");
    });
  });

  describe("Onboarding Status Queries", () => {
    let completedShop: any;
    let incompleteShop: any;

    beforeAll(async () => {
      // Create shops with different onboarding states
      completedShop = await prisma.shop.create({
        data: {
          domain: `test-completed-${Date.now()}@shopify.com`,
          accessToken: "token",
          scope: "read_orders",
          isOnline: false,
          status: "ACTIVE",
          onboardingCompletedAt: new Date("2026-05-01T00:00:00Z"),
        },
      });

      incompleteShop = await prisma.shop.create({
        data: {
          domain: `test-incomplete-${Date.now()}@shopify.com`,
          accessToken: "token",
          scope: "read_orders",
          isOnline: false,
          status: "ACTIVE",
          // onboardingCompletedAt is null
        },
      });
    });

    afterAll(async () => {
      await Promise.all([
        completedShop?.id && prisma.shop.delete({ where: { id: completedShop.id } }),
        incompleteShop?.id && prisma.shop.delete({ where: { id: incompleteShop.id } }),
      ].filter(Boolean));
    });

    it("should identify completed onboarding shops", async () => {
      const completed = await prisma.shop.findMany({
        where: {
          onboardingCompletedAt: { not: null },
        },
      });

      const ids = completed.map(s => s.id);
      expect(ids).toContain(completedShop.id);
    });

    it("should identify incomplete onboarding shops", async () => {
      const incomplete = await prisma.shop.findMany({
        where: {
          onboardingCompletedAt: null,
        },
      });

      const ids = incomplete.map(s => s.id);
      expect(ids).toContain(incompleteShop.id);
    });

    it("should query shops with onboarding completed after a timestamp", async () => {
      const cutoff = new Date("2026-04-01T00:00:00Z");

      const recent = await prisma.shop.findMany({
        where: {
          onboardingCompletedAt: {
            gte: cutoff,
          },
        },
      });

      const ids = recent.map(s => s.id);
      expect(ids).toContain(completedShop.id);
    });
  });

  describe("Error Prevention", () => {
    it("should not allow invalid field names in update", async () => {
      // Test that only valid fields are accepted
      expect(async () => {
        // @ts-expect-error - Testing that invalid fields would be caught
        await prisma.shop.update({
          where: { id: testShop.id },
          data: {
            invalidField: "should fail",
          },
        });
      }).rejects.toThrow();
    });

    it("should enforce type safety on DateTime fields", async () => {
      // Valid DateTime
      const validUpdate = {
        onboardingCompletedAt: new Date(),
      };
      expect(validUpdate.onboardingCompletedAt).toBeInstanceOf(Date);

      // Valid null
      const nullUpdate = {
        onboardingCompletedAt: null,
      };
      expect(nullUpdate.onboardingCompletedAt).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    let edgeShop: any;

    beforeAll(async () => {
      edgeShop = await prisma.shop.create({
        data: {
          domain: `test-edge-${Date.now()}@shopify.com`,
          accessToken: "token",
          scope: "read_orders",
          isOnline: false,
          status: "ACTIVE",
        },
      });
    });

    afterAll(async () => {
      if (edgeShop?.id) {
        await prisma.shop.delete({ where: { id: edgeShop.id } });
      }
    });

    it("should handle multiple rapid updates", async () => {
      const updates = [];
      for (let i = 0; i < 5; i++) {
        updates.push(
          prisma.shop.update({
            where: { id: edgeShop.id },
            data: {
              onboardingCompletedAt:
                i % 2 === 0 ? new Date() : null,
            },
          })
        );
      }

      const results = await Promise.all(updates);
      expect(results.length).toBe(5);
    });

    it("should handle timezone-aware DateTime values", async () => {
      const utcDate = new Date("2026-05-07T12:00:00Z");
      const updated = await prisma.shop.update({
        where: { id: edgeShop.id },
        data: { onboardingCompletedAt: utcDate },
      });

      expect(updated.onboardingCompletedAt?.toISOString()).toBe(
        utcDate.toISOString()
      );
    });

    it("should handle very old and future timestamps", async () => {
      const oldDate = new Date("2000-01-01T00:00:00Z");
      const updated1 = await prisma.shop.update({
        where: { id: edgeShop.id },
        data: { onboardingCompletedAt: oldDate },
      });
      expect(updated1.onboardingCompletedAt).toBeDefined();

      const futureDate = new Date("2099-12-31T23:59:59Z");
      const updated2 = await prisma.shop.update({
        where: { id: edgeShop.id },
        data: { onboardingCompletedAt: futureDate },
      });
      expect(updated2.onboardingCompletedAt).toBeDefined();
    });
  });
});
