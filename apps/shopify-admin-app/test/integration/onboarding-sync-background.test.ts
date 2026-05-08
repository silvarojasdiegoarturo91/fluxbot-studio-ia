import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../app/db.server";
import {
  getMerchantAdminConfig,
  saveMerchantAdminConfig,
} from "../../app/services/admin-config.server";

/**
 * Onboarding sync flow tests
 *
 * Validates that background sync jobs can run independently from onboarding
 * state and that the real Prisma schema is used.
 */

describe("Onboarding Background Sync", () => {
  let testShop: { id: string; domain: string } | null = null;
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

    await saveMerchantAdminConfig(testShop.id, {
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
      onboardingCompleted: true,
      onboardingStep: 4,
    });
  });

  afterAll(async () => {
    if (!testShop) return;

    await prisma.syncJob.deleteMany({ where: { shopId: testShop.id } });
    await prisma.chatbotConfig.deleteMany({ where: { shopId: testShop.id } });
    await prisma.shop.delete({ where: { id: testShop.id } });
  });

  it("keeps onboarding state in shop metadata separate from sync jobs", async () => {
    const config = await getMerchantAdminConfig(testShop!.id);
    expect(config.onboardingCompleted).toBe(true);
    expect(config.onboardingStep).toBe(4);
  });

  it("creates an initial catalog sync job", async () => {
    const syncJob = await prisma.syncJob.create({
      data: {
        shopId: testShop!.id,
        jobType: "initial:catalog",
        status: "PENDING",
        progress: 0,
        totalItems: 0,
        processedItems: 0,
      },
    });

    expect(syncJob.jobType).toBe("initial:catalog");
    expect(syncJob.status).toBe("PENDING");
  });

  it("tracks progress updates independently", async () => {
    const syncJob = await prisma.syncJob.create({
      data: {
        shopId: testShop!.id,
        jobType: "initial:policies",
        status: "RUNNING",
        progress: 10,
        totalItems: 3,
        processedItems: 0,
      },
    });

    const updated = await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        progress: 66,
        processedItems: 2,
      },
    });

    expect(updated.progress).toBe(66);
    expect(updated.processedItems).toBe(2);
  });

  it("does not mutate onboarding data when sync updates", async () => {
    const before = await getMerchantAdminConfig(testShop!.id);

    await prisma.syncJob.create({
      data: {
        shopId: testShop!.id,
        jobType: "delta:products",
        status: "RUNNING",
        progress: 50,
        totalItems: 100,
        processedItems: 50,
      },
    });

    const after = await getMerchantAdminConfig(testShop!.id);
    expect(after.onboardingCompleted).toBe(before.onboardingCompleted);
    expect(after.onboardingStep).toBe(before.onboardingStep);
  });

  it("supports failed and completed sync jobs", async () => {
    const failed = await prisma.syncJob.create({
      data: {
        shopId: testShop!.id,
        jobType: "initial:catalog",
        status: "FAILED",
        progress: 30,
        totalItems: 100,
        processedItems: 30,
        errorMessage: "temporary failure",
      },
    });

    const completed = await prisma.syncJob.create({
      data: {
        shopId: testShop!.id,
        jobType: "initial:catalog",
        status: "COMPLETED",
        progress: 100,
        totalItems: 100,
        processedItems: 100,
      },
    });

    expect(failed.status).toBe("FAILED");
    expect(completed.status).toBe("COMPLETED");
  });
});
