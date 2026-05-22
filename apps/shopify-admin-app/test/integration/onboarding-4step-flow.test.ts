import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../app/db.server";
import {
  getMerchantAdminConfig,
  saveMerchantAdminConfig,
} from "../../app/services/admin-config.server";

const describeIfDb =
  process.env.RUN_PRISMA_SCHEMA_VALIDATION === "true" ? describe : describe.skip;

describeIfDb("4-Step Onboarding Flow", () => {
  let testShop: { id: string; domain: string } | null = null;
  const testDomain = `test-4step-${Date.now()}.shopify.com`;

  const baseConfig = {
    adminLanguage: "es" as const,
    primaryBotLanguage: "es" as const,
    supportedLanguages: ["es" as const],
    botName: "",
    botTone: "professional" as const,
    botGoal: "SALES_SUPPORT" as const,
    responseStyle: "BALANCED" as const,
    welcomeMessage: "",
    enabledCapabilities: {
      answerProducts: false,
      answerPolicies: false,
      answerOrders: false,
      recommendProducts: false,
      captureLeads: false,
    },
    widgetBranding: {
      primaryColor: "#008060",
      launcherPosition: "bottom-right" as const,
      avatarStyle: "assistant" as const,
      launcherLabel: "",
    },
    onboardingStep: 1,
    onboardingCompleted: false,
  };

  beforeAll(async () => {
    testShop = await prisma.shop.create({
      data: {
        domain: testDomain,
        accessToken: "test-token-4step",
        scope: "read_products,read_orders",
        isOnline: false,
        status: "ACTIVE",
      },
    });

    await saveMerchantAdminConfig(testShop.id, baseConfig);
  });

  afterAll(async () => {
    if (!testShop) return;
    await prisma.chatbotConfig.deleteMany({ where: { shopId: testShop.id } });
    await prisma.shop.delete({ where: { id: testShop.id } });
  });

  it("should save language, bot name, and welcome message", async () => {
    const config = await saveMerchantAdminConfig(testShop!.id, {
      adminLanguage: "es",
      botName: "Fluxy",
      welcomeMessage: "¡Hola! Soy Fluxy, tu asistente IA.",
      onboardingStep: 1,
    });

    expect(config.botName).toBe("Fluxy");
    expect(config.welcomeMessage).toContain("Fluxy");
    expect(config.onboardingStep).toBe(1);
  });

  it("should save mission, tone, and capabilities", async () => {
    const config = await saveMerchantAdminConfig(testShop!.id, {
      botGoal: "SALES",
      botTone: "friendly",
      enabledCapabilities: {
        answerProducts: true,
        answerPolicies: true,
        answerOrders: true,
        recommendProducts: true,
        captureLeads: false,
      },
      onboardingStep: 2,
    });

    expect(config.botGoal).toBe("SALES");
    expect(config.botTone).toBe("friendly");
    expect(config.enabledCapabilities.answerProducts).toBe(true);
    expect(config.enabledCapabilities.answerPolicies).toBe(true);
    expect(config.onboardingStep).toBe(2);
  });

  it("should save branding", async () => {
    const config = await saveMerchantAdminConfig(testShop!.id, {
      widgetBranding: {
        primaryColor: "#FF6B35",
        avatarStyle: "spark",
        launcherPosition: "bottom-left",
        launcherLabel: "Mi Asistente",
      },
      onboardingStep: 3,
    });

    expect(config.widgetBranding.primaryColor).toBe("#FF6B35");
    expect(config.widgetBranding.avatarStyle).toBe("spark");
    expect(config.widgetBranding.launcherPosition).toBe("bottom-left");
    expect(config.widgetBranding.launcherLabel).toBe("Mi Asistente");
    expect(config.onboardingStep).toBe(3);
  });

  it("should complete onboarding", async () => {
    const config = await saveMerchantAdminConfig(testShop!.id, {
      onboardingCompleted: true,
      onboardingStep: 4,
    });

    expect(config.onboardingCompleted).toBe(true);
    expect(config.onboardingStep).toBe(4);
  });

  it("should preserve settings across updates", async () => {
    const config = await getMerchantAdminConfig(testShop!.id);

    expect(config.botName).toBeDefined();
    expect(config.welcomeMessage).toBeDefined();
    expect(config.enabledCapabilities).toBeDefined();
    expect(config.botGoal).toBeDefined();
    expect(config.botTone).toBeDefined();
    expect(config.widgetBranding.primaryColor).toBeDefined();
    expect(config.onboardingCompleted).toBe(true);
  });

  it("should track progression through all 4 steps", async () => {
    for (const step of [1, 2, 3, 4]) {
      const config = await saveMerchantAdminConfig(testShop!.id, {
        onboardingStep: step,
      });
      expect(config.onboardingStep).toBe(step);
    }
  });

  it("should allow going back and forth between steps", async () => {
    let config = await saveMerchantAdminConfig(testShop!.id, { onboardingStep: 2 });
    expect(config.onboardingStep).toBe(2);

    config = await saveMerchantAdminConfig(testShop!.id, { onboardingStep: 1 });
    expect(config.onboardingStep).toBe(1);
  });

  it("should maintain data consistency across updates", async () => {
    const updated = await saveMerchantAdminConfig(testShop!.id, {
      botName: "TestBot",
      botGoal: "SALES",
      widgetBranding: {
        primaryColor: "#FF6B35",
        avatarStyle: "assistant",
        launcherPosition: "bottom-right",
        launcherLabel: "Test",
      },
      onboardingStep: 2,
    });

    expect(updated.botName).toBe("TestBot");
    expect(updated.botGoal).toBe("SALES");
    expect(updated.widgetBranding.primaryColor).toBe("#FF6B35");
  });
});
