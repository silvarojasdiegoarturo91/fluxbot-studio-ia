import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindMany, mockFindFirst, mockCreate, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("../../../app/db.server", () => ({
  default: {
    marketingCampaign: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
    },
  },
}));

vi.mock("../../../app/services/localization.server", () => ({
  SUPPORTED_LOCALES: [{ code: "en" }, { code: "es" }, { code: "fr" }],
}));

import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
} from "../../../app/services/campaign.server";

function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "campaign-1",
    shopId: "shop-1",
    name: "Welcome",
    status: "DRAFT",
    scheduleType: "IMMEDIATE",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("campaign CRUD", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("listCampaigns", () => {
    it("lists campaigns for the shop ordered by creation desc", async () => {
      mockFindMany.mockResolvedValue([makeCampaign()]);

      const result = await listCampaigns("shop-1");

      expect(result).toHaveLength(1);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { shopId: "shop-1" },
          orderBy: { createdAt: "desc" },
          select: expect.objectContaining({ id: true, name: true }),
        }),
      );
    });
  });

  describe("getCampaign", () => {
    it("fetches a campaign scoped to the shop", async () => {
      mockFindFirst.mockResolvedValue(makeCampaign());

      const result = await getCampaign("shop-1", "campaign-1");

      expect(result?.id).toBe("campaign-1");
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { id: "campaign-1", shopId: "shop-1" },
      });
    });
  });

  describe("createCampaign", () => {
    it("creates a campaign applying defaults", async () => {
      mockCreate.mockResolvedValue(makeCampaign());

      const result = await createCampaign("shop-1", { name: "Welcome" });

      expect(result).toBeDefined();
      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shopId: "shop-1",
          name: "Welcome",
          scheduleType: "IMMEDIATE",
          localeTemplates: {},
          targetLocales: [],
          triggerIds: [],
          frequencyCap: 1,
          campaignWindowMs: 86400000,
        }),
      });
    });

    it("preserves provided scheduling fields", async () => {
      mockCreate.mockResolvedValue(makeCampaign());
      const scheduledAt = new Date("2026-02-01T10:00:00Z");

      await createCampaign("shop-1", {
        name: "Sale",
        description: "desc",
        scheduleType: "SCHEDULED",
        cronExpression: "0 9 * * *",
        scheduledAt,
        startAt: scheduledAt,
        endAt: new Date("2026-03-01T10:00:00Z"),
        localeTemplates: { en: "Hi {{name}}" },
        targetLocales: ["en"],
        triggerIds: ["t1"],
        audienceFilter: { segments: ["s1"] },
        frequencyCap: 3,
        campaignWindowMs: 3600000,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Sale",
          description: "desc",
          scheduleType: "SCHEDULED",
          cronExpression: "0 9 * * *",
          scheduledAt,
          localeTemplates: { en: "Hi {{name}}" },
          targetLocales: ["en"],
          triggerIds: ["t1"],
          audienceFilter: { segments: ["s1"] },
          frequencyCap: 3,
          campaignWindowMs: 3600000,
        }),
      });
    });
  });

  describe("updateCampaign", () => {
    it("returns null when the campaign does not exist", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await updateCampaign("shop-1", "missing", { name: "X" });

      expect(result).toBeNull();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("updates only the provided fields", async () => {
      mockFindFirst.mockResolvedValue({ id: "campaign-1" });
      mockUpdate.mockResolvedValue(makeCampaign({ status: "ACTIVE" }));

      const result = await updateCampaign("shop-1", "campaign-1", {
        name: "New Name",
        status: "ACTIVE",
        frequencyCap: 5,
      });

      expect(result).toBeDefined();
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "campaign-1" },
        data: {
          name: "New Name",
          status: "ACTIVE",
          frequencyCap: 5,
        },
      });
    });
  });

  describe("deleteCampaign", () => {
    it("returns null when the campaign does not exist", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await deleteCampaign("shop-1", "missing");

      expect(result).toBeNull();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("deletes an existing campaign", async () => {
      mockFindFirst.mockResolvedValue({ id: "campaign-1" });
      mockDelete.mockResolvedValue({ id: "campaign-1" });

      const result = await deleteCampaign("shop-1", "campaign-1");

      expect(result).toEqual({ id: "campaign-1" });
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: "campaign-1" } });
    });
  });
});
