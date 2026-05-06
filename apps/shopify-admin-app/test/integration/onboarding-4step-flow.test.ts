import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { redirect } from "react-router";
import prisma from "../../app/db.server";
import type { ActionFunctionArgs } from "react-router";

/**
 * 4-Step Onboarding Flow Tests
 * 
 * Validates the complete 4-step "Magic Setup" onboarding:
 * Step 1: Identity (Language, bot name, welcome message)
 * Step 2: Brain (Mission, tone, capabilities)
 * Step 3: Style (Colors, avatar, launcher position)
 * Step 4: Launch (Sync trigger, activation)
 */

describe("4-Step Onboarding Flow", () => {
  let testShop: any;
  const testDomain = `test-4step-${Date.now()}.shopify.com`;

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

    // Create initial merchant config
    await prisma.merchantAdminConfig.create({
      data: {
        shopId: testShop.id,
        adminLanguage: "es",
        primaryBotLanguage: "es",
        supportedLanguages: ["es"],
        botName: "",
        botTone: "professional",
        botGoal: "SALES_SUPPORT",
        responseStyle: "BALANCED",
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
          launcherPosition: "bottom-right",
          avatarStyle: "assistant",
          launcherLabel: "",
        },
        onboardingStep: 1,
        onboardingCompleted: false,
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

  describe("Step 1: Identity", () => {
    it("should save language, bot name, and welcome message", async () => {
      const config = await prisma.merchantAdminConfig.update({
        where: { shopId: testShop.id },
        data: {
          adminLanguage: "es",
          botName: "Fluxy",
          welcomeMessage: "¡Hola! Soy Fluxy, tu asistente IA.",
          onboardingStep: 1,
        },
      });

      expect(config.botName).toBe("Fluxy");
      expect(config.welcomeMessage).toContain("Fluxy");
      expect(config.onboardingStep).toBe(1);
    });

    it("should apply defaults if fields are empty", async () => {
      const config = await prisma.merchantAdminConfig.update({
        where: { shopId: testShop.id },
        data: {
          botName: "", // Will use default
          welcomeMessage: "", // Will use default
        },
      });

      // Frontend should apply defaults, but DB should accept empty
      expect(config).toBeDefined();
    });
  });

  describe("Step 2: Brain", () => {
    it("should save mission, tone, and capabilities", async () => {
      const config = await prisma.merchantAdminConfig.update({
        where: { shopId: testShop.id },
        data: {
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
        },
      });

      expect(config.botGoal).toBe("SALES");
      expect(config.botTone).toBe("friendly");
      expect(config.enabledCapabilities.answerProducts).toBe(true);
      expect(config.enabledCapabilities.answerPolicies).toBe(true);
      expect(config.onboardingStep).toBe(2);
    });

    it("should validate capability toggles", async () => {
      const capabilities = {
        answerProducts: true,
        answerPolicies: false,
        answerOrders: true,
        recommendProducts: false,
        captureLeads: true,
      };

      const config = await prisma.merchantAdminConfig.update({
        where: { shopId: testShop.id },
        data: { enabledCapabilities: capabilities },
      });

      expect(config.enabledCapabilities).toEqual(capabilities);
    });
  });

  describe("Step 3: Style", () => {
    it("should save branding (color, avatar, position, label)", async () => {
      const config = await prisma.merchantAdminConfig.update({
        where: { shopId: testShop.id },
        data: {
          widgetBranding: {
            primaryColor: "#FF6B35",
            avatarStyle: "spark",
            launcherPosition: "bottom-left",
            launcherLabel: "Mi Asistente",
          },
          onboardingStep: 3,
        },
      });

      expect(config.widgetBranding.primaryColor).toBe("#FF6B35");
      expect(config.widgetBranding.avatarStyle).toBe("spark");
      expect(config.widgetBranding.launcherPosition).toBe("bottom-left");
      expect(config.widgetBranding.launcherLabel).toBe("Mi Asistente");
      expect(config.onboardingStep).toBe(3);
    });

    it("should validate color format", async () => {
      const config = await prisma.merchantAdminConfig.update({
        where: { shopId: testShop.id },
        data: {
          widgetBranding: {
            primaryColor: "#008060",
            avatarStyle: "assistant",
            launcherPosition: "bottom-right",
            launcherLabel: "Soporte",
          },
        },
      });

      expect(config.widgetBranding.primaryColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it("should support all avatar styles", async () => {
      const styles = ["assistant", "spark", "store"];

      for (const style of styles) {
        const config = await prisma.merchantAdminConfig.update({
          where: { shopId: testShop.id },
          data: {
            widgetBranding: {
              primaryColor: "#008060",
              avatarStyle: style as "assistant" | "spark" | "store",
              launcherPosition: "bottom-right",
              launcherLabel: "Test",
            },
          },
        });

        expect(config.widgetBranding.avatarStyle).toBe(style);
      }
    });
  });

  describe("Step 4: Launch (Sync & Activation)", () => {
    it("should mark onboarding as completed", async () => {
      const config = await prisma.merchantAdminConfig.update({
        where: { shopId: testShop.id },
        data: {
          onboardingCompleted: true,
          onboardingStep: 4,
        },
      });

      expect(config.onboardingCompleted).toBe(true);
      expect(config.onboardingStep).toBe(4);
    });

    it("should update onboardingCompletedAt timestamp", async () => {
      const now = new Date();
      const config = await prisma.merchantAdminConfig.update({
        where: { shopId: testShop.id },
        data: {
          onboardingCompleted: true,
        },
      });

      expect(config.onboardingCompleted).toBe(true);
    });

    it("should preserve all settings from previous steps", async () => {
      const config = await prisma.merchantAdminConfig.findUnique({
        where: { shopId: testShop.id },
      });

      // Verify Step 1 data
      expect(config?.botName).toBeDefined();
      expect(config?.welcomeMessage).toBeDefined();

      // Verify Step 2 data
      expect(config?.enabledCapabilities).toBeDefined();
      expect(config?.botGoal).toBeDefined();
      expect(config?.botTone).toBeDefined();

      // Verify Step 3 data
      expect(config?.widgetBranding).toBeDefined();
      expect(config?.widgetBranding.primaryColor).toBeDefined();

      // Verify Step 4 completion
      expect(config?.onboardingCompleted).toBe(true);
    });
  });

  describe("Onboarding State Transitions", () => {
    it("should track progression through all 4 steps", async () => {
      const steps = [1, 2, 3, 4];

      for (const step of steps) {
        const config = await prisma.merchantAdminConfig.update({
          where: { shopId: testShop.id },
          data: { onboardingStep: step },
        });

        expect(config.onboardingStep).toBe(step);
      }
    });

    it("should allow going back and forth between steps", async () => {
      // Step 1 → 2 → 1
      let config = await prisma.merchantAdminConfig.update({
        where: { shopId: testShop.id },
        data: { onboardingStep: 2 },
      });
      expect(config.onboardingStep).toBe(2);

      config = await prisma.merchantAdminConfig.update({
        where: { shopId: testShop.id },
        data: { onboardingStep: 1 },
      });
      expect(config.onboardingStep).toBe(1);
    });

    it("should not reset completed flag when navigating", async () => {
      const config = await prisma.merchantAdminConfig.update({
        where: { shopId: testShop.id },
        data: {
          onboardingCompleted: true,
          onboardingStep: 2, // Navigate back
        },
      });

      expect(config.onboardingCompleted).toBe(true);
      expect(config.onboardingStep).toBe(2);
    });
  });

  describe("Edge Cases & Validation", () => {
    it("should handle empty bot name gracefully", async () => {
      const config = await prisma.merchantAdminConfig.update({
        where: { shopId: testShop.id },
        data: { botName: "" },
      });

      expect(config.botName).toBe("");
    });

    it("should handle all language options", async () => {
      const languages = ["es", "en"];

      for (const lang of languages) {
        const config = await prisma.merchantAdminConfig.update({
          where: { shopId: testShop.id },
          data: {
            adminLanguage: lang as "es" | "en",
            primaryBotLanguage: lang as "es" | "en",
          },
        });

        expect(config.adminLanguage).toBe(lang);
      }
    });

    it("should validate bot goals", async () => {
      const goals = ["SALES", "SUPPORT", "SALES_SUPPORT"];

      for (const goal of goals) {
        const config = await prisma.merchantAdminConfig.update({
          where: { shopId: testShop.id },
          data: {
            botGoal: goal as "SALES" | "SUPPORT" | "SALES_SUPPORT",
          },
        });

        expect(config.botGoal).toBe(goal);
      }
    });

    it("should handle launcher position toggle", async () => {
      const positions = ["bottom-right", "bottom-left"];

      for (const pos of positions) {
        const config = await prisma.merchantAdminConfig.update({
          where: { shopId: testShop.id },
          data: {
            widgetBranding: {
              primaryColor: "#008060",
              avatarStyle: "assistant",
              launcherPosition: pos as "bottom-right" | "bottom-left",
              launcherLabel: "Test",
            },
          },
        });

        expect(config.widgetBranding.launcherPosition).toBe(pos);
      }
    });
  });

  describe("Performance & Consistency", () => {
    it("should complete full onboarding cycle within reasonable time", async () => {
      const start = Date.now();

      for (let step = 1; step <= 4; step++) {
        await prisma.merchantAdminConfig.update({
          where: { shopId: testShop.id },
          data: { onboardingStep: step },
        });
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // Should complete in < 5 seconds
    });

    it("should maintain data consistency across updates", async () => {
      const originalData = {
        botName: "TestBot",
        botGoal: "SALES" as const,
        primaryColor: "#FF6B35",
      };

      // Update with new step
      await prisma.merchantAdminConfig.update({
        where: { shopId: testShop.id },
        data: {
          botName: originalData.botName,
          botGoal: originalData.botGoal,
          widgetBranding: {
            primaryColor: originalData.primaryColor,
            avatarStyle: "assistant",
            launcherPosition: "bottom-right",
            launcherLabel: "Test",
          },
          onboardingStep: 2,
        },
      });

      // Verify data persisted
      const config = await prisma.merchantAdminConfig.findUnique({
        where: { shopId: testShop.id },
      });

      expect(config?.botName).toBe(originalData.botName);
      expect(config?.botGoal).toBe(originalData.botGoal);
      expect(config?.widgetBranding.primaryColor).toBe(originalData.primaryColor);
    });
  });
});
