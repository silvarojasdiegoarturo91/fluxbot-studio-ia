/**
 * Unit Tests: Proactive Messaging Service — edge cases and fallbacks
 *
 * Supplements test/unit/proactive-messaging.test.ts with the remaining
 * branches: campaign dispatch failures, local execution mode, recent-message
 * dedupe, no-SEND decisions, delegate unavailability and the analytics
 * accessors (getSessionMessages / getTriggerMessages).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProactiveMessagingService } from "../../../app/services/proactive-messaging.server";
import prisma from "../../../app/db.server";
import { EventTrackingService } from "../../../app/services/event-tracking.server";
import { getIAGateway, getExecutionMode } from "../../../app/services/ia-gateway.server";
import { TriggerEvaluationService } from "../../../app/services/trigger-evaluation.server";

const mockEvaluateTriggers = vi.fn();
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("../../../app/db.server", () => ({
  default: {
    proactiveMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    shop: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../../app/services/event-tracking.server", () => ({
  EventTrackingService: {
    getActiveSessions: vi.fn(),
  },
}));

vi.mock("../../../app/services/ia-gateway.server", () => ({
  getIAGateway: vi.fn(),
  getExecutionMode: vi.fn(() => "remote"),
}));

vi.mock("../../../app/services/trigger-evaluation.server", () => ({
  TriggerEvaluationService: {
    recordTriggerFire: vi.fn(),
  },
}));

function sendEvaluation(overrides: Record<string, unknown> = {}) {
  return {
    triggerId: "trigger-1",
    triggerName: "Cart Abandonment",
    decision: "SEND",
    message: "Come back!",
    score: 0.9,
    metadata: {},
    ...overrides,
  };
}

describe("ProactiveMessagingService — extended coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvaluateTriggers.mockReset();
    mockFetch.mockReset();
    delete process.env.SHOPIFY_APP_URL;
    delete process.env.APP_URL;
    vi.mocked(getIAGateway).mockReturnValue({
      evaluateTriggers: mockEvaluateTriggers,
    } as never);
    vi.mocked(getExecutionMode).mockReturnValue("remote");
    vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue([] as never);
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      domain: "shop1.myshopify.com",
    } as never);
    vi.mocked(prisma.proactiveMessage.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.proactiveMessage.create).mockResolvedValue({
      id: "msg-1",
      status: "QUEUED",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(TriggerEvaluationService.recordTriggerFire).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", mockFetch);
  });

  describe("evaluateAndQueueMessages — decision paths", () => {
    it("skips trigger decisioning when execution mode is not remote", async () => {
      vi.mocked(getExecutionMode).mockReturnValue("local");
      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue([
        "sess-1",
      ] as never);

      const result = await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(result.evaluated).toBe(1);
      expect(result.queued).toBe(0);
      expect(result.skipped).toBe(1);
      expect(mockEvaluateTriggers).not.toHaveBeenCalled();
    });

    it("skips sessions whose shop domain is unavailable", async () => {
      vi.mocked(prisma.shop.findUnique).mockResolvedValue(null as never);
      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue([
        "sess-1",
      ] as never);

      const result = await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(result.evaluated).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it("skips sessions with no SEND recommendation", async () => {
      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue([
        "sess-1",
      ] as never);
      mockEvaluateTriggers.mockResolvedValue({
        evaluations: [
          { triggerId: "t1", decision: "WAIT", score: 0.2 },
        ],
      });

      const result = await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(result.evaluated).toBe(1);
      expect(result.skipped).toBe(1);
      expect(prisma.proactiveMessage.create).not.toHaveBeenCalled();
    });

    it("skips when the same trigger already fired within the cooldown window", async () => {
      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue([
        "sess-1",
      ] as never);
      mockEvaluateTriggers.mockResolvedValue({
        evaluations: [sendEvaluation()],
      });
      vi.mocked(prisma.proactiveMessage.findFirst).mockResolvedValue({
        id: "recent-msg",
      } as never);

      const result = await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(result.evaluated).toBe(1);
      expect(result.skipped).toBe(1);
      expect(prisma.proactiveMessage.create).not.toHaveBeenCalled();
    });

    it("counts sessions that throw during evaluation as skipped", async () => {
      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue([
        "sess-1",
      ] as never);
      mockEvaluateTriggers.mockRejectedValue(new Error("gateway exploded"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(result.evaluated).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.queued).toBe(0);
      errorSpy.mockRestore();
    });

    it("resolves channels from conditions and recipients from phone metadata", async () => {
      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue([
        "sess-1",
      ] as never);
      mockEvaluateTriggers.mockResolvedValue({
        evaluations: [
          sendEvaluation({
            metadata: {
              conditions: { channel: "email", phone: "+34911234567" },
            },
          }),
        ],
      });

      await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(prisma.proactiveMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: "EMAIL",
            recipientId: "+34911234567",
          }),
        }),
      );
    });

    it("falls back to WEB_CHAT when the recipient candidate is not a string", async () => {
      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue([
        "sess-1",
      ] as never);
      mockEvaluateTriggers.mockResolvedValue({
        evaluations: [
          sendEvaluation({
            metadata: { preferredChannel: "sms", customerPhone: 12345 },
          }),
        ],
      });

      await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(prisma.proactiveMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: "SMS",
            recipientId: undefined,
          }),
        }),
      );
    });

    it("dispatches campaigns resolved through a campaign object and marketingCampaignId", async () => {
      process.env.SHOPIFY_APP_URL = "https://app.example.com";
      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue([
        "sess-1",
      ] as never);
      mockEvaluateTriggers.mockResolvedValue({
        evaluations: [
          sendEvaluation({
            metadata: {
              campaign: { id: "camp-obj" },
              marketingCampaignId: "camp-obj",
              conditions: { variables: { sku: "A1" } },
            },
          }),
        ],
      });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ dispatched: true }),
      });

      const result = await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(result.queued).toBe(1);
      expect(prisma.proactiveMessage.create).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://app.example.com/api/campaigns/camp-obj/dispatch",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "X-Shop-Domain": "shop1.myshopify.com" }),
        }),
      );
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody).toMatchObject({
        sessionId: "sess-1",
        variables: { sku: "A1" },
      });
    });

    it("falls back to queueMessage when campaign dispatch has no base URL", async () => {
      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue([
        "sess-1",
      ] as never);
      mockEvaluateTriggers.mockResolvedValue({
        evaluations: [sendEvaluation({ metadata: { campaignId: "camp-x" } })],
      });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(result.queued).toBe(1);
      expect(prisma.proactiveMessage.create).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Campaign dispatch skipped"),
      );
      warnSpy.mockRestore();
    });

    it("falls back to queueMessage when the campaign dispatch fetch throws", async () => {
      process.env.SHOPIFY_APP_URL = "https://app.example.com";
      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue([
        "sess-1",
      ] as never);
      mockEvaluateTriggers.mockResolvedValue({
        evaluations: [sendEvaluation({ metadata: { campaignId: "camp-x" } })],
      });
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(result.queued).toBe(1);
      expect(prisma.proactiveMessage.create).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Campaign dispatch request failed"),
        expect.any(Error),
      );
      warnSpy.mockRestore();
    });

    it("falls back to queueMessage when dispatch succeeds without a dispatched flag", async () => {
      process.env.SHOPIFY_APP_URL = "https://app.example.com";
      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue([
        "sess-1",
      ] as never);
      mockEvaluateTriggers.mockResolvedValue({
        evaluations: [sendEvaluation({ metadata: { campaignId: "camp-x" } })],
      });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ reason: "Not applicable" }),
      });

      const result = await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(result.queued).toBe(1);
      expect(prisma.proactiveMessage.create).toHaveBeenCalledOnce();
    });
  });

  describe("query accessors", () => {
    it("getNextMessageBatch supports a channel filter", async () => {
      vi.mocked(prisma.proactiveMessage.findMany).mockResolvedValue([] as never);

      await ProactiveMessagingService.getNextMessageBatch(5, "EMAIL");

      expect(prisma.proactiveMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ channel: "EMAIL" }),
          take: 5,
        }),
      );
    });

    it("getSessionMessages returns recent messages for a session", async () => {
      vi.mocked(prisma.proactiveMessage.findMany).mockResolvedValue([
        { id: "m1", status: "SENT" },
      ] as never);

      const messages = await ProactiveMessagingService.getSessionMessages("shop1", "sess-9");

      expect(messages).toHaveLength(1);
      expect(prisma.proactiveMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { shopId: "shop1", sessionId: "sess-9" },
          take: 20,
        }),
      );
    });

    it("getTriggerMessages returns recent messages for a trigger", async () => {
      vi.mocked(prisma.proactiveMessage.findMany).mockResolvedValue([
        { id: "m2", triggerId: "t1" },
      ] as never);

      const messages = await ProactiveMessagingService.getTriggerMessages("t1");

      expect(messages).toHaveLength(1);
      expect(prisma.proactiveMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ triggerId: "t1" }),
        }),
      );
    });

    it("markAsFailed returns no retry when the delegate is unavailable", async () => {
      const original = (prisma.proactiveMessage as { findUniqueOrThrow?: unknown }).findUniqueOrThrow;
      (prisma.proactiveMessage as { findUniqueOrThrow?: unknown }).findUniqueOrThrow = undefined;
      try {
        await expect(
          ProactiveMessagingService.markAsFailed("msg-1", "boom"),
        ).resolves.toEqual({ shouldRetry: false });
      } finally {
        (prisma.proactiveMessage as { findUniqueOrThrow?: unknown }).findUniqueOrThrow = original;
      }
    });

    it("getSessionMessages returns an empty array when the delegate is unavailable", async () => {
      const original = (prisma.proactiveMessage as { findMany?: unknown }).findMany;
      (prisma.proactiveMessage as { findMany?: unknown }).findMany = undefined;
      try {
        await expect(
          ProactiveMessagingService.getSessionMessages("shop1", "sess-9"),
        ).resolves.toEqual([]);
      } finally {
        (prisma.proactiveMessage as { findMany?: unknown }).findMany = original;
      }
    });
  });
});
