import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindFirst, mockCreate, mockUpdate, mockFindMany, mockConversationUpdate, mockAuditCreate } =
  vi.hoisted(() => ({
    mockFindFirst: vi.fn(),
    mockCreate: vi.fn(),
    mockUpdate: vi.fn(),
    mockFindMany: vi.fn(),
    mockConversationUpdate: vi.fn().mockResolvedValue({}),
    mockAuditCreate: vi.fn().mockResolvedValue({}),
  }));

vi.mock("../../../app/db.server", () => ({
  default: {
    handoffRequest: {
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
      findMany: mockFindMany,
    },
    conversation: {
      update: mockConversationUpdate,
    },
    auditLog: {
      create: mockAuditCreate,
    },
  },
}));

vi.mock("../../../app/config.server", () => ({
  getConfig: () => ({ features: { humanHandoff: true } }),
}));

import { HandoffService } from "../../../app/services/handoff.server";

function makeHandoff(overrides: Record<string, unknown> = {}) {
  return {
    id: "handoff-1",
    shopId: "shop-1",
    conversationId: "conv-1",
    reason: "low confidence",
    context: {},
    assignedTo: null,
    agentNotes: null,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("handoff.server", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("reports whether the feature is enabled", () => {
    expect(HandoffService.isEnabled()).toBe(true);
  });

  describe("create", () => {
    it("reuses an existing pending handoff for the same conversation", async () => {
      const existing = makeHandoff();
      mockFindFirst.mockResolvedValue(existing);

      const result = await HandoffService.create({
        shopId: "shop-1",
        conversationId: "conv-1",
        reason: "reason",
      });

      expect(result).toBe(existing);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            shopId: "shop-1",
            conversationId: "conv-1",
            status: { in: ["pending", "assigned"] },
          },
        }),
      );
    });

    it("creates a new handoff with pending status when none exists", async () => {
      mockFindFirst.mockResolvedValue(null);
      const handoff = makeHandoff();
      mockCreate.mockResolvedValue(handoff);

      const result = await HandoffService.create({
        shopId: "shop-1",
        conversationId: "conv-1",
        reason: "reason",
        context: { page: "/products" },
      });

      expect(result).toBe(handoff);
      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shopId: "shop-1",
          conversationId: "conv-1",
          reason: "reason",
          context: { page: "/products" },
          status: "pending",
        }),
      });
    });

    it("creates a new handoff with assigned status when assignedTo is provided", async () => {
      mockFindFirst.mockResolvedValue(null);
      mockCreate.mockResolvedValue(makeHandoff({ status: "assigned" }));

      await HandoffService.create({
        shopId: "shop-1",
        conversationId: "conv-1",
        reason: "reason",
        assignedTo: "agent@fluxbot.com",
        agentNotes: "note",
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assignedTo: "agent@fluxbot.com",
          agentNotes: "note",
          status: "assigned",
        }),
      });
    });

    it("swallows conversation update errors", async () => {
      mockFindFirst.mockResolvedValue(null);
      mockCreate.mockResolvedValue(makeHandoff());
      mockConversationUpdate.mockRejectedValueOnce(new Error("conversation missing"));

      const result = await HandoffService.create({
        shopId: "shop-1",
        conversationId: "conv-1",
        reason: "reason",
      });

      expect(result.id).toBe("handoff-1");
    });
  });

  describe("listByShop", () => {
    it("queries by shop with conversation include and clamps the limit", async () => {
      mockFindMany.mockResolvedValue([makeHandoff()]);

      const result = await HandoffService.listByShop("shop-1", 999);

      expect(result).toHaveLength(1);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { shopId: "shop-1" },
          include: { conversation: { select: expect.any(Object) } },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
      );
    });
  });

  describe("update", () => {
    it("throws when the handoff does not exist", async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(
        HandoffService.update({ handoffId: "missing", shopId: "shop-1" }),
      ).rejects.toThrow("Handoff request not found");
    });

    it("updates status and resolves the conversation on final statuses", async () => {
      mockFindFirst.mockResolvedValue(makeHandoff({ status: "pending" }));
      const updated = makeHandoff({ status: "completed" });
      mockUpdate.mockResolvedValue(updated);

      const result = await HandoffService.update({
        handoffId: "handoff-1",
        shopId: "shop-1",
        status: "completed",
        agentNotes: "done",
      });

      expect(result).toBe(updated);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "handoff-1" },
        data: expect.objectContaining({
          status: "completed",
          agentNotes: "done",
          resolvedAt: expect.any(Date),
        }),
      });
      expect(mockConversationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "conv-1" },
          data: expect.objectContaining({ status: "RESOLVED" }),
        }),
      );
    });

    it("normalizes unknown statuses to pending and does not resolve", async () => {
      mockFindFirst.mockResolvedValue(makeHandoff({ status: "pending" }));
      mockUpdate.mockResolvedValue(makeHandoff());

      await HandoffService.update({
        handoffId: "handoff-1",
        shopId: "shop-1",
        status: "bogus" as never,
      });

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "handoff-1" },
        data: expect.objectContaining({ status: "pending", resolvedAt: null }),
      });
    });
  });
});
