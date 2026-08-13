import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockShopFindUnique, mockShopUpdate, mockChatbotConfigFindUnique, mockChatbotConfigUpsert } =
  vi.hoisted(() => ({
    mockShopFindUnique: vi.fn(),
    mockShopUpdate: vi.fn(),
    mockChatbotConfigFindUnique: vi.fn(),
    mockChatbotConfigUpsert: vi.fn(),
  }));

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: mockShopFindUnique,
      update: mockShopUpdate,
    },
    chatbotConfig: {
      findUnique: mockChatbotConfigFindUnique,
      upsert: mockChatbotConfigUpsert,
    },
  },
}));

import {
  getDefaultMerchantAdminConfig,
  getMerchantAdminConfig,
  saveMerchantAdminConfig,
} from "../../../app/services/admin-config.server";

describe("admin-config.server", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockChatbotConfigFindUnique.mockResolvedValue(null);
    mockShopUpdate.mockResolvedValue({});
    mockChatbotConfigUpsert.mockResolvedValue({});
  });

  describe("getDefaultMerchantAdminConfig", () => {
    it("returns a fresh default config with independent nested objects", () => {
      const a = getDefaultMerchantAdminConfig();
      const b = getDefaultMerchantAdminConfig();

      expect(a.botName).toBeDefined();
      expect(a.adminLanguage).toBeDefined();
      expect(a.enabledCapabilities).toBeDefined();
      expect(a.widgetBranding).toBeDefined();
      expect(a.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      a.enabledCapabilities.answerProducts = false;
      expect(b.enabledCapabilities.answerProducts).not.toBe(false);
    });
  });

  describe("getMerchantAdminConfig", () => {
    it("treats onboardingCompletedAt as completed even when metadata is stale", async () => {
      mockShopFindUnique.mockResolvedValue({
        onboardingCompletedAt: new Date("2026-06-01T10:00:00.000Z"),
        metadata: {
          adminSetup: {
            onboardingCompleted: false,
            onboardingStep: 2,
            adminLanguage: "es",
          },
        },
      });

      const config = await getMerchantAdminConfig("shop-1");

      expect(config.onboardingCompleted).toBe(true);
      expect(config.onboardingStep).toBe(4);
    });

    it("keeps onboarding incomplete for fresh installs and reinstalls", async () => {
      mockShopFindUnique.mockResolvedValue({
        onboardingCompletedAt: null,
        metadata: {
          adminSetup: {
            onboardingCompleted: false,
            onboardingStep: 1,
          },
        },
      });

      const config = await getMerchantAdminConfig("shop-1");

      expect(config.onboardingCompleted).toBe(false);
      expect(config.onboardingStep).toBe(1);
    });

    it("merges chatbotConfig language and name over metadata defaults", async () => {
      mockShopFindUnique.mockResolvedValue({
        onboardingCompletedAt: null,
        metadata: {
          adminSetup: {
            onboardingCompleted: true,
            onboardingStep: 7,
            adminLanguage: "es",
            botName: "Flux",
          },
        },
      });
      mockChatbotConfigFindUnique.mockResolvedValue({
        name: "Flux IA",
        tone: "friendly",
        language: "en",
        isActive: true,
      });

      const config = await getMerchantAdminConfig("shop-1");

      expect(config.adminLanguage).toBe("en");
      expect(config.primaryBotLanguage).toBe("en");
      expect(config.supportedLanguages).toEqual(["en"]);
      expect(config.botName).toBe("Flux IA");
      expect(config.botTone).toBe("friendly");
    });

    it("applies metadata defaults when chatbotConfig is absent", async () => {
      mockShopFindUnique.mockResolvedValue({
        onboardingCompletedAt: null,
        metadata: {
          adminSetup: {
            botName: "Chat",
            botTone: "concise",
            botGoal: "SUPPORT",
            responseStyle: "BALANCED",
            adminLanguage: "es",
            enabledCapabilities: { answerProducts: true },
            widgetBranding: { launcherPosition: "bottom-left", avatarStyle: "spark" },
            onboardingCompleted: true,
          },
        },
      });
      mockChatbotConfigFindUnique.mockResolvedValue(null);

      const config = await getMerchantAdminConfig("shop-1");

      expect(config.botName).toBe("Chat");
      expect(config.botTone).toBe("concise");
      expect(config.botGoal).toBe("SUPPORT");
      expect(config.responseStyle).toBe("BALANCED");
      expect(config.enabledCapabilities.answerProducts).toBe(true);
      expect(config.widgetBranding.launcherPosition).toBe("bottom-left");
      expect(config.widgetBranding.avatarStyle).toBe("spark");
    });

    it("handles missing shop metadata with defaults and clamps onboardingStep", async () => {
      mockShopFindUnique.mockResolvedValue(null);
      mockChatbotConfigFindUnique.mockResolvedValue(null);

      const config = await getMerchantAdminConfig("shop-1");

      expect(config.botName).toBeDefined();
      expect(config.onboardingStep).toBeGreaterThanOrEqual(1);
      expect(config.onboardingStep).toBeLessThanOrEqual(7);
      expect(config.onboardingCompleted).toBe(false);
    });
  });

  describe("saveMerchantAdminConfig", () => {
    it("merges a patch into the current config and persists both records", async () => {
      mockShopFindUnique.mockResolvedValue({
        metadata: {
          adminSetup: {
            botName: "Flux",
            botTone: "professional",
            botGoal: "SALES",
            responseStyle: "CONCISE",
            adminLanguage: "en",
            enabledCapabilities: { answerProducts: false, recommendProducts: false },
            widgetBranding: { launcherPosition: "bottom-right", avatarStyle: "assistant" },
            onboardingStep: 1,
          },
        },
      });

      const saved = await saveMerchantAdminConfig("shop-1", {
        botName: "Flux IA",
        botGoal: "SUPPORT",
        enabledCapabilities: { answerProducts: true },
        widgetBranding: { avatarStyle: "spark" },
      });

      expect(saved.botName).toBe("Flux IA");
      expect(saved.botGoal).toBe("SUPPORT");
      expect(saved.enabledCapabilities.answerProducts).toBe(true);
      expect(saved.enabledCapabilities.recommendProducts).toBe(false);
      expect(saved.widgetBranding.avatarStyle).toBe("spark");
      expect(saved.widgetBranding.launcherPosition).toBe("bottom-right");
      expect(mockShopUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "shop-1" },
          data: expect.objectContaining({ metadata: expect.any(Object) }),
        }),
      );
      expect(mockChatbotConfigUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { shopId: "shop-1" },
          create: expect.objectContaining({
            name: "Flux IA",
            tone: "professional",
            language: "en",
            isActive: true,
          }),
          update: expect.objectContaining({ name: "Flux IA" }),
        }),
      );
    });

    it("accepts an explicitly provided currentConfig", async () => {
      mockShopFindUnique.mockResolvedValue({ metadata: {} });

      const current = getDefaultMerchantAdminConfig();
      await saveMerchantAdminConfig("shop-1", { botName: "X" }, { currentConfig: current });

      expect(mockChatbotConfigFindUnique).not.toHaveBeenCalled();
      expect(mockChatbotConfigUpsert).toHaveBeenCalled();
    });

    it("clamps onboardingStep to the 1..7 range in merged output", async () => {
      mockShopFindUnique.mockResolvedValue({
        metadata: { adminSetup: { onboardingStep: 1 } },
      });

      const saved = await saveMerchantAdminConfig("shop-1", { onboardingStep: 99 } as never);

      expect(saved.onboardingStep).toBe(7);
    });
  });
});
