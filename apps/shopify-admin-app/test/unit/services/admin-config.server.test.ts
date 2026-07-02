import { beforeEach, describe, expect, it, vi } from "vitest";

const mockShopFindUnique = vi.fn();
const mockChatbotConfigFindUnique = vi.fn();

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: mockShopFindUnique,
    },
    chatbotConfig: {
      findUnique: mockChatbotConfigFindUnique,
    },
  },
}));

describe("admin-config.server", () => {
  beforeEach(() => {
    vi.resetModules();
    mockShopFindUnique.mockReset();
    mockChatbotConfigFindUnique.mockReset();
    mockChatbotConfigFindUnique.mockResolvedValue(null);
  });

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

    const { getMerchantAdminConfig } = await import("../../../app/services/admin-config.server");
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

    const { getMerchantAdminConfig } = await import("../../../app/services/admin-config.server");
    const config = await getMerchantAdminConfig("shop-1");

    expect(config.onboardingCompleted).toBe(false);
    expect(config.onboardingStep).toBe(1);
  });
});
