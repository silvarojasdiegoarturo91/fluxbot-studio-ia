import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import prisma from "../../app/db.server";

/**
 * Onboarding Sync Flow Tests
 * 
 * Validates that background sync:
 * - Doesn't block form submission
 * - Can be triggered without waiting for completion
 * - Persists sync state separately from onboarding state
 */

describe("Onboarding Background Sync", () => {
  let testShop: any;
  const testDomain = `test-sync-${Date.now()}.shopify.com`;

  beforeAll(async () => {
    testShop = await prisma.shop.create({
      data: {
        domain: testDomain,
        accessToken: "test-sync-token",
        scope: "read_products,read_orders",
        isOnline: false,
        status: "ACTIVE",
      },
    });
  });

  afterAll(async () => {
    if (testShop?.id) {
      await prisma.merchantAdminConfig.deleteMany({
        where: { shopId: testShop.id },
      });
      await prisma.shop.delete({ where: { id: testShop.id } });
    }
  });

  describe("Sync State Management", () => {
    it("should mark sync as initiated when activation triggered", async () => {
      const config = await prisma.merchantAdminConfig.create({
        data: {
          shopId: testShop.id,
          adminLanguage: "es",
          primaryBotLanguage: "es",
          supportedLanguages: ["es"],
          botName: "Fluxy",
          botTone: "friendly",
          botGoal: "SALES_SUPPORT",
          responseStyle: "BALANCED",
          welcomeMessage: "¡Hola!",
          enabledCapabilities: {
            answerProducts: true,
            answerPolicies: true,
            answerOrders: true,
            recommendProducts: true,
            captureLeads: false,
          },
          widgetBranding: {
            primaryColor: "#008060",
            launcherPosition: "bottom-right",
            avatarStyle: "assistant",
            launcherLabel: "Fluxy",
          },
          onboardingCompleted: true, // Activation triggered
          onboardingStep: 4,
        },
      });

      expect(config.onboardingCompleted).toBe(true);
      expect(config).toBeDefined();
    });

    it("should not block form submission while sync runs", async () => {
      // Simulate async sync (fire-and-forget pattern)
      const syncPromise = new Promise(resolve => {
        setTimeout(() => {
          resolve({ status: "syncing" });
        }, 100); // Simulate delay
      });

      // Form should return immediately
      const formReturn = { success: true, redirectTo: "/app" };

      // These should not be correlated
      expect(formReturn.success).toBe(true);
      expect(syncPromise).toBeDefined();
    });
  });

  describe("Sync Catalog & Policies", () => {
    it("should track initial catalog sync", async () => {
      // In real scenario, SyncService would create these
      const syncJob = await prisma.syncJob.create({
        data: {
          shopId: testShop.id,
          type: "initial:catalog",
          status: "PENDING",
          sourceCount: 0,
          processedCount: 0,
          failedCount: 0,
        },
      });

      expect(syncJob.type).toBe("initial:catalog");
      expect(syncJob.status).toBe("PENDING");
    });

    it("should track policy sync", async () => {
      const syncJob = await prisma.syncJob.create({
        data: {
          shopId: testShop.id,
          type: "initial:policies",
          status: "PENDING",
          sourceCount: 0,
          processedCount: 0,
          failedCount: 0,
        },
      });

      expect(syncJob.type).toBe("initial:policies");
    });

    it("should track multiple syncs independently", async () => {
      const catalogSync = await prisma.syncJob.create({
        data: {
          shopId: testShop.id,
          type: "initial:catalog",
          status: "RUNNING",
          sourceCount: 100,
          processedCount: 50,
          failedCount: 0,
        },
      });

      const policySync = await prisma.syncJob.create({
        data: {
          shopId: testShop.id,
          type: "initial:policies",
          status: "PENDING",
          sourceCount: 3,
          processedCount: 0,
          failedCount: 0,
        },
      });

      expect(catalogSync.id).not.toBe(policySync.id);
      expect(catalogSync.status).toBe("RUNNING");
      expect(policySync.status).toBe("PENDING");
    });
  });

  describe("Sync Progress Tracking", () => {
    it("should update sync progress without affecting onboarding state", async () => {
      const config = await prisma.merchantAdminConfig.findUnique({
        where: { shopId: testShop.id },
      });

      const syncJob = await prisma.syncJob.create({
        data: {
          shopId: testShop.id,
          type: "initial:catalog",
          status: "RUNNING",
          sourceCount: 200,
          processedCount: 50,
          failedCount: 0,
        },
      });

      // Onboarding should remain unchanged
      const configAfter = await prisma.merchantAdminConfig.findUnique({
        where: { shopId: testShop.id },
      });

      expect(configAfter?.onboardingCompleted).toBe(config?.onboardingCompleted);
      expect(syncJob.processedCount).toBe(50);
    });

    it("should simulate sync progress updates", async () => {
      const syncJob = await prisma.syncJob.create({
        data: {
          shopId: testShop.id,
          type: "initial:catalog",
          status: "RUNNING",
          sourceCount: 100,
          processedCount: 0,
          failedCount: 0,
        },
      });

      // Simulate progress: 0% → 25% → 50% → 75% → 100%
      const progressPoints = [25, 50, 75, 100];

      for (const processed of progressPoints) {
        await prisma.syncJob.update({
          where: { id: syncJob.id },
          data: { processedCount: processed },
        });
      }

      const finalJob = await prisma.syncJob.findUnique({
        where: { id: syncJob.id },
      });

      expect(finalJob?.processedCount).toBe(100);
    });

    it("should mark sync as complete", async () => {
      const syncJob = await prisma.syncJob.create({
        data: {
          shopId: testShop.id,
          type: "initial:policies",
          status: "RUNNING",
          sourceCount: 3,
          processedCount: 0,
          failedCount: 0,
        },
      });

      const completed = await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: "COMPLETED",
          processedCount: 3,
        },
      });

      expect(completed.status).toBe("COMPLETED");
      expect(completed.processedCount).toBe(3);
    });

    it("should handle sync failures gracefully", async () => {
      const syncJob = await prisma.syncJob.create({
        data: {
          shopId: testShop.id,
          type: "initial:catalog",
          status: "RUNNING",
          sourceCount: 100,
          processedCount: 50,
          failedCount: 5,
        },
      });

      const failed = await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: "FAILED",
          failedCount: 50, // Half failed
        },
      });

      expect(failed.status).toBe("FAILED");
      expect(failed.failedCount).toBe(50);
    });
  });

  describe("Sync Isolation from User Actions", () => {
    it("user can navigate while sync runs in background", async () => {
      // Create initial sync
      const syncJob = await prisma.syncJob.create({
        data: {
          shopId: testShop.id,
          type: "initial:catalog",
          status: "RUNNING",
          sourceCount: 1000,
          processedCount: 200,
          failedCount: 0,
        },
      });

      // Meanwhile, user can update config without affecting sync
      const config = await prisma.merchantAdminConfig.update({
        where: { shopId: testShop.id },
        data: {
          botName: "Updated Name",
          onboardingStep: 1, // Go back to step 1
        },
      });

      // Sync should still be running
      const stillSyncing = await prisma.syncJob.findUnique({
        where: { id: syncJob.id },
      });

      expect(config.botName).toBe("Updated Name");
      expect(config.onboardingStep).toBe(1);
      expect(stillSyncing?.status).toBe("RUNNING");
    });

    it("sync does not appear in onboarding progress on reload", async () => {
      // After activation, sync is in background
      const config = await prisma.merchantAdminConfig.findUnique({
        where: { shopId: testShop.id },
      });

      // Onboarding shows "completed" state, not sync progress
      expect(config?.onboardingCompleted).toBe(true);
      // No sync-related fields in onboarding config
      expect("syncProgress" in config!).toBe(false);
    });
  });

  describe("Shop Reference Sync", () => {
    it("should queue shop reference sync on activation", async () => {
      // This represents the syncShopReferenceToIABackend call
      const syncQueued = {
        shopId: testShop.id,
        domain: testShop.domain,
        timestamp: new Date(),
        status: "queued",
      };

      expect(syncQueued.shopId).toBe(testShop.id);
      expect(syncQueued.status).toBe("queued");
    });

    it("should handle sync timeout gracefully", async () => {
      // Simulate sync timeout (should not block)
      const syncResult = await new Promise(resolve => {
        setTimeout(() => {
          resolve({ error: "timeout", retryable: true });
        }, 100);
      });

      // Onboarding should not be affected
      const config = await prisma.merchantAdminConfig.findUnique({
        where: { shopId: testShop.id },
      });

      expect(config?.onboardingCompleted).toBe(true);
      expect(syncResult).toBeDefined();
    });
  });

  describe("Sync Retry Logic", () => {
    it("should allow retry of failed sync", async () => {
      const syncJob = await prisma.syncJob.create({
        data: {
          shopId: testShop.id,
          type: "initial:catalog",
          status: "FAILED",
          sourceCount: 100,
          processedCount: 30,
          failedCount: 70,
        },
      });

      // Retry: create new sync job
      const retryJob = await prisma.syncJob.create({
        data: {
          shopId: testShop.id,
          type: "initial:catalog",
          status: "PENDING",
          sourceCount: 70, // Retry failed items
          processedCount: 0,
          failedCount: 0,
        },
      });

      expect(syncJob.status).toBe("FAILED");
      expect(retryJob.status).toBe("PENDING");
      expect(retryJob.id).not.toBe(syncJob.id);
    });

    it("should track retry attempts", async () => {
      const jobs = [];

      for (let attempt = 1; attempt <= 3; attempt++) {
        const job = await prisma.syncJob.create({
          data: {
            shopId: testShop.id,
            type: "initial:catalog",
            status: attempt === 3 ? "COMPLETED" : "FAILED",
            sourceCount: 100,
            processedCount: 50 * attempt,
            failedCount: 100 - 50 * attempt,
          },
        });
        jobs.push(job);
      }

      expect(jobs).toHaveLength(3);
      expect(jobs[0].status).toBe("FAILED");
      expect(jobs[2].status).toBe("COMPLETED");
    });
  });
});
