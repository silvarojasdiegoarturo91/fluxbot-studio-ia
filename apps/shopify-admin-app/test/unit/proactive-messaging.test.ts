/**
 * Unit Tests: Proactive Messaging Service
 * 
 * Tests for:
 * - Message queuing
 * - Delivery status updates
 * - Retry logic
 * - Message expiration
 * - Statistics and analytics
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProactiveMessagingService } from "../../app/services/proactive-messaging.server";
import { EventTrackingService } from "../../app/services/event-tracking.server";
import { getIAGateway } from "../../app/services/ia-gateway.server";
import { TriggerEvaluationService } from "../../app/services/trigger-evaluation.server";

const mockEvaluateTriggers = vi.fn();
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock dependencies
vi.mock("../../app/db.server", () => ({
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

vi.mock("../../app/services/event-tracking.server", () => ({
  EventTrackingService: {
    getActiveSessions: vi.fn(),
  },
}));

vi.mock("../../app/services/ia-gateway.server", () => ({
  getIAGateway: vi.fn(),
  getExecutionMode: vi.fn(() => "remote"),
}));

vi.mock("../../app/services/trigger-evaluation.server", () => ({
  TriggerEvaluationService: {
    recordTriggerFire: vi.fn(),
  },
}));

describe("ProactiveMessagingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvaluateTriggers.mockReset();
    mockFetch.mockReset();
    delete process.env.SHOPIFY_APP_URL;
    vi.mocked(getIAGateway).mockReturnValue({
      evaluateTriggers: mockEvaluateTriggers,
    } as any);
  });

  function createStoredMessage(overrides: Record<string, unknown> = {}) {
    return {
      id: "msg-1",
      shopId: "shop1",
      sessionId: "sess1",
      triggerId: "trigger1",
      recipientId: null,
      channel: "WEB_CHAT",
      messageTemplate: "Test message",
      renderedMessage: "Test message rendered",
      messageMetadata: null,
      status: "QUEUED",
      sentAt: null,
      deliveredAt: null,
      interactedAt: null,
      outcome: null,
      errorMessage: null,
      retryCount: 0,
      maxRetries: 3,
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  describe("queueMessage", () => {
    it("should queue a new message with QUEUED status", async () => {
      const prisma = (await import("../../app/db.server")).default;
      const mockMessage = {
        id: "msg-1",
        shopId: "shop1",
        sessionId: "sess1",
        triggerId: "trigger1",
        channel: "WEB_CHAT",
        messageTemplate: "Test message",
        renderedMessage: "Test message rendered",
        status: "QUEUED",
        expiresAt: new Date(Date.now() + 60000),
        createdAt: new Date(),
        updatedAt: new Date(),
        recipientId: null,
        messageMetadata: null,
        sentAt: null,
        deliveredAt: null,
        interactedAt: null,
        outcome: null,
        errorMessage: null,
        retryCount: 0,
        maxRetries: 3,
      };

      vi.mocked(prisma.proactiveMessage.create).mockResolvedValue(mockMessage as any);

      const result = await ProactiveMessagingService.queueMessage({
        shopId: "shop1",
        sessionId: "sess1",
        triggerId: "trigger1",
        messageTemplate: "Test message",
        renderedMessage: "Test message rendered",
      });

      expect(result.status).toBe("QUEUED");
      expect(result.id).toBe("msg-1");
      expect(prisma.proactiveMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shopId: "shop1",
          sessionId: "sess1",
          triggerId: "trigger1",
          status: "QUEUED",
        }),
      });
    });

    it("should set expiration time", async () => {
      const prisma = (await import("../../app/db.server")).default;
      const mockMessage = {
        id: "msg-1",
        status: "QUEUED",
        expiresAt: new Date(Date.now() + 30000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.proactiveMessage.create).mockResolvedValue(mockMessage as any);

      const config = {
        shopId: "shop1",
        sessionId: "sess1",
        triggerId: "trigger1",
        messageTemplate: "Test",
        renderedMessage: "Test",
        expiresInMs: 30000,
      };

      await ProactiveMessagingService.queueMessage(config);

      expect(prisma.proactiveMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expiresAt: expect.any(Date),
        }),
      });
    });

    it("should use default WEB_CHAT channel if not specified", async () => {
      const prisma = (await import("../../app/db.server")).default;
      const mockMessage = {
        id: "msg-1",
        channel: "WEB_CHAT",
        status: "QUEUED",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.proactiveMessage.create).mockResolvedValue(mockMessage as any);

      await ProactiveMessagingService.queueMessage({
        shopId: "shop1",
        sessionId: "sess1",
        triggerId: "trigger1",
        messageTemplate: "Test",
        renderedMessage: "Test",
      });

      expect(prisma.proactiveMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: "WEB_CHAT",
        }),
      });
    });
  });

  describe("evaluateAndQueueMessages", () => {
    it("routes proactive messages to SMS when trigger metadata requests it", async () => {
      const prisma = (await import("../../app/db.server")).default;

      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue(["sess-sms"]);
      mockEvaluateTriggers.mockResolvedValue({
        evaluations: [
          {
            triggerId: "trigger-sms",
            triggerName: "Cart Abandonment SMS",
            decision: "SEND",
            message: "You left items in your cart",
            score: 0.9,
            metadata: {
              targetChannel: "sms",
              recipientId: "+15551234567",
            },
          },
        ],
        recommendation: {
          triggerId: "trigger-sms",
          action: "SEND",
          message: "You left items in your cart",
        },
      });
      vi.mocked(TriggerEvaluationService.recordTriggerFire).mockImplementation(() => {});
      vi.mocked(prisma.shop.findUnique).mockResolvedValue({
        domain: "shop1.myshopify.com",
      } as any);
      vi.mocked(prisma.proactiveMessage.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.proactiveMessage.create).mockResolvedValue({
        id: "msg-sms-1",
        status: "QUEUED",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(result.evaluated).toBe(1);
      expect(result.queued).toBe(1);
      expect(prisma.proactiveMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: "SMS",
            recipientId: "+15551234567",
          }),
        })
      );
    });

    it("falls back to WEB_CHAT for unsupported trigger channels", async () => {
      const prisma = (await import("../../app/db.server")).default;

      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue(["sess-web"]);
      mockEvaluateTriggers.mockResolvedValue({
        evaluations: [
          {
            triggerId: "trigger-web",
            triggerName: "Invalid Channel Trigger",
            decision: "SEND",
            message: "Fallback message",
            score: 0.8,
            metadata: {
              targetChannel: "fax",
            },
          },
        ],
        recommendation: {
          triggerId: "trigger-web",
          action: "SEND",
          message: "Fallback message",
        },
      });
      vi.mocked(TriggerEvaluationService.recordTriggerFire).mockImplementation(() => {});
      vi.mocked(prisma.shop.findUnique).mockResolvedValue({
        domain: "shop1.myshopify.com",
      } as any);
      vi.mocked(prisma.proactiveMessage.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.proactiveMessage.create).mockResolvedValue({
        id: "msg-web-1",
        status: "QUEUED",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(prisma.proactiveMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: "WEB_CHAT",
          }),
        })
      );
    });

    it("auto-dispatches campaigns via API when decision metadata includes campaignId", async () => {
      const prisma = (await import("../../app/db.server")).default;

      process.env.SHOPIFY_APP_URL = "http://localhost:3000";
      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue(["sess-campaign"]);
      mockEvaluateTriggers.mockResolvedValue({
        evaluations: [
          {
            triggerId: "trigger-campaign",
            triggerName: "Campaign Push",
            decision: "SEND",
            message: "Campaign recommendation",
            score: 0.95,
            metadata: {
              campaignId: "camp-123",
              locale: "es",
              variables: {
                productName: "Chaqueta Azul",
              },
            },
          },
        ],
        recommendation: {
          triggerId: "trigger-campaign",
          action: "SEND",
        },
      });
      vi.mocked(TriggerEvaluationService.recordTriggerFire).mockImplementation(() => {});
      vi.mocked(prisma.shop.findUnique).mockResolvedValue({
        domain: "shop1.myshopify.com",
      } as any);
      vi.mocked(prisma.proactiveMessage.findFirst).mockResolvedValue(null);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          dispatched: true,
          dispatchEventId: "evt-1",
        }),
      });

      const result = await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(result.evaluated).toBe(1);
      expect(result.queued).toBe(1);
      expect(prisma.proactiveMessage.create).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/campaigns/camp-123/dispatch",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Shop-Domain": "shop1.myshopify.com",
          }),
        }),
      );
    });

    it("falls back to queueMessage when campaign dispatch API does not dispatch", async () => {
      const prisma = (await import("../../app/db.server")).default;

      process.env.SHOPIFY_APP_URL = "http://localhost:3000";
      vi.mocked(EventTrackingService.getActiveSessions).mockResolvedValue(["sess-fallback"]);
      mockEvaluateTriggers.mockResolvedValue({
        evaluations: [
          {
            triggerId: "trigger-fallback",
            triggerName: "Campaign Fallback",
            decision: "SEND",
            message: "Fallback message",
            score: 0.8,
            metadata: {
              campaignId: "camp-fallback",
            },
          },
        ],
        recommendation: {
          triggerId: "trigger-fallback",
          action: "SEND",
        },
      });
      vi.mocked(TriggerEvaluationService.recordTriggerFire).mockImplementation(() => {});
      vi.mocked(prisma.shop.findUnique).mockResolvedValue({
        domain: "shop1.myshopify.com",
      } as any);
      vi.mocked(prisma.proactiveMessage.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.proactiveMessage.create).mockResolvedValue({
        id: "msg-fallback",
        status: "QUEUED",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          dispatched: false,
          reason: "Campaign is paused",
        }),
      });

      const result = await ProactiveMessagingService.evaluateAndQueueMessages("shop1");

      expect(result.evaluated).toBe(1);
      expect(result.queued).toBe(1);
      expect(prisma.proactiveMessage.create).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe("getNextMessageBatch", () => {
    it("should retrieve QUEUED messages not expired", async () => {
      const prisma = (await import("../../app/db.server")).default;
      const mockMessages = [
        {
          id: "msg-1",
          status: "QUEUED",
          expiresAt: new Date(Date.now() + 10000),
          createdAt: new Date(),
        },
        {
          id: "msg-2",
          status: "QUEUED",
          expiresAt: new Date(Date.now() + 20000),
          createdAt: new Date(),
        },
      ];

      vi.mocked(prisma.proactiveMessage.findMany).mockResolvedValue(mockMessages as any);

      const results = await ProactiveMessagingService.getNextMessageBatch(10);

      expect(results).toHaveLength(2);
        expect(prisma.proactiveMessage.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.any(Object),
            take: 10,
          })
        );
    });

    it("should respect batch size", async () => {
      const prisma = (await import("../../app/db.server")).default;
      vi.mocked(prisma.proactiveMessage.findMany).mockResolvedValue([]);

      await ProactiveMessagingService.getNextMessageBatch(5);

      expect(prisma.proactiveMessage.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        orderBy: expect.any(Array),
        take: 5,
      });
    });
  });

  describe("markAsSent", () => {
    it("should update status to SENT with timestamp", async () => {
      const prisma = (await import("../../app/db.server")).default;

      vi.mocked(prisma.proactiveMessage.update).mockResolvedValue(
        createStoredMessage({ status: "SENT", sentAt: new Date() }) as any
      );

      await ProactiveMessagingService.markAsSent("msg-1");

      expect(prisma.proactiveMessage.update).toHaveBeenCalledWith({
        where: { id: "msg-1" },
        data: {
          status: "SENT",
          sentAt: expect.any(Date),
        },
      });
    });
  });

  describe("markAsDelivered", () => {
    it("should update status to DELIVERED", async () => {
      const prisma = (await import("../../app/db.server")).default;

      vi.mocked(prisma.proactiveMessage.update).mockResolvedValue(
        createStoredMessage({ status: "DELIVERED", deliveredAt: new Date() }) as any
      );

      await ProactiveMessagingService.markAsDelivered("msg-1");

      expect(prisma.proactiveMessage.update).toHaveBeenCalledWith({
        where: { id: "msg-1" },
        data: {
          status: "DELIVERED",
          deliveredAt: expect.any(Date),
        },
      });
    });
  });

  describe("recordInteraction", () => {
    it("should record message acceptance", async () => {
      const prisma = (await import("../../app/db.server")).default;

      vi.mocked(prisma.proactiveMessage.update).mockResolvedValue(
        createStoredMessage({ status: "CONVERTED", outcome: "ACCEPTED" }) as any
      );

      await ProactiveMessagingService.recordInteraction("msg-1", "ACCEPTED");

      expect(prisma.proactiveMessage.update).toHaveBeenCalledWith({
        where: { id: "msg-1" },
        data: {
          status: "CONVERTED",
          outcome: "ACCEPTED",
          interactedAt: expect.any(Date),
        },
      });
    });

    it("should record message rejection", async () => {
      const prisma = (await import("../../app/db.server")).default;

      vi.mocked(prisma.proactiveMessage.update).mockResolvedValue(
        createStoredMessage({ status: "CONVERTED", outcome: "REJECTED" }) as any
      );

      await ProactiveMessagingService.recordInteraction("msg-1", "REJECTED");

      expect(prisma.proactiveMessage.update).toHaveBeenCalledWith({
        where: { id: "msg-1" },
        data: {
          status: "CONVERTED",
          outcome: "REJECTED",
          interactedAt: expect.any(Date),
        },
      });
    });

    it("should mark EXPIRED as failed", async () => {
      const prisma = (await import("../../app/db.server")).default;

      vi.mocked(prisma.proactiveMessage.update).mockResolvedValue(
        createStoredMessage({ status: "FAILED", outcome: "EXPIRED" }) as any
      );

      await ProactiveMessagingService.recordInteraction("msg-1", "EXPIRED");

      expect(prisma.proactiveMessage.update).toHaveBeenCalledWith({
        where: { id: "msg-1" },
        data: expect.objectContaining({
          status: "FAILED",
          outcome: "EXPIRED",
        }),
      });
    });
  });

  describe("markAsFailed with retry", () => {
    it("should retry if under max retries", async () => {
      const prisma = (await import("../../app/db.server")).default;
      const mockMessage = {
        id: "msg-1",
        retryCount: 0,
        maxRetries: 3,
      };

      vi.mocked(prisma.proactiveMessage.findUniqueOrThrow).mockResolvedValue(
        mockMessage as any
      );
      vi.mocked(prisma.proactiveMessage.update).mockResolvedValue(
        createStoredMessage({ status: "QUEUED", retryCount: 1 }) as any
      );

      const result = await ProactiveMessagingService.markAsFailed(
        "msg-1",
        "Network error"
      );

      expect(result.shouldRetry).toBe(true);
      expect(prisma.proactiveMessage.update).toHaveBeenCalledWith({
        where: { id: "msg-1" },
        data: expect.objectContaining({
          status: "QUEUED",
          retryCount: 1,
        }),
      });
    });

    it("should not retry if max retries exceeded", async () => {
      const prisma = (await import("../../app/db.server")).default;
      const mockMessage = {
        id: "msg-1",
        retryCount: 2,
        maxRetries: 3,
      };

      vi.mocked(prisma.proactiveMessage.findUniqueOrThrow).mockResolvedValue(
        mockMessage as any
      );
      vi.mocked(prisma.proactiveMessage.update).mockResolvedValue(
        createStoredMessage({ status: "FAILED", retryCount: 3 }) as any
      );

      const result = await ProactiveMessagingService.markAsFailed(
        "msg-1",
        "Persistent error"
      );

      expect(result.shouldRetry).toBe(false);
      expect(prisma.proactiveMessage.update).toHaveBeenCalledWith({
        where: { id: "msg-1" },
        data: expect.objectContaining({
          status: "FAILED",
          retryCount: 3,
        }),
      });
    });
  });

  describe("getMessageStats", () => {
    it("should calculate delivery and conversion rates", async () => {
      const prisma = (await import("../../app/db.server")).default;
      const mockMessages = [
        { shopId: "shop1", status: "QUEUED", createdAt: new Date() },
        { shopId: "shop1", status: "SENT", createdAt: new Date() },
        { shopId: "shop1", status: "SENT", createdAt: new Date() },
        { shopId: "shop1", status: "DELIVERED", createdAt: new Date() },
        { shopId: "shop1", status: "CONVERTED", createdAt: new Date() },
        { shopId: "shop1", status: "FAILED", createdAt: new Date() },
      ];

      vi.mocked(prisma.proactiveMessage.findMany).mockResolvedValue(mockMessages as any);

      const stats = await ProactiveMessagingService.getMessageStats("shop1");

      expect(stats.total).toBe(6);
      expect(stats.queued).toBe(1);
      expect(stats.sent).toBe(2);
      expect(stats.delivered).toBe(1);
      expect(stats.converted).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.deliveryRate).toBeGreaterThan(0);
      expect(stats.conversionRate).toBeGreaterThan(0);
    });

    it("should handle zero messages", async () => {
      const prisma = (await import("../../app/db.server")).default;

      vi.mocked(prisma.proactiveMessage.findMany).mockResolvedValue([]);

      const stats = await ProactiveMessagingService.getMessageStats("shop1");

      expect(stats.total).toBe(0);
      expect(stats.deliveryRate).toBe(0);
      expect(stats.conversionRate).toBe(0);
    });
  });

  describe("cleanupExpiredMessages", () => {
    it("should mark expired messages as FAILED", async () => {
      const prisma = (await import("../../app/db.server")).default;

      vi.mocked(prisma.proactiveMessage.updateMany).mockResolvedValue({ count: 5 });

      const result = await ProactiveMessagingService.cleanupExpiredMessages();

      expect(result).toBe(5);
      expect(prisma.proactiveMessage.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: { in: ["QUEUED", "SENT"] },
          expiresAt: { lte: expect.any(Date) },
        }),
        data: {
          status: "FAILED",
          outcome: "EXPIRED",
        },
      });
    });
  });

  describe("getChannelStats", () => {
    it("should aggregate stats by channel", async () => {
      const prisma = (await import("../../app/db.server")).default;
      const mockMessages = [
        { shopId: "shop1", channel: "WEB_CHAT", status: "SENT", createdAt: new Date() },
        { shopId: "shop1", channel: "WEB_CHAT", status: "DELIVERED", createdAt: new Date() },
        { shopId: "shop1", channel: "EMAIL", status: "SENT", createdAt: new Date() },
        { shopId: "shop1", channel: "EMAIL", status: "FAILED", createdAt: new Date() },
      ];

      vi.mocked(prisma.proactiveMessage.findMany).mockResolvedValue(mockMessages as any);

      const stats = await ProactiveMessagingService.getChannelStats("shop1");

      expect(stats.size).toBe(2);
      expect(stats.get("WEB_CHAT")).toEqual({
        channel: "WEB_CHAT",
        total: 2,
        sent: 1,
        delivered: 1,
        converted: 0,
        failed: 0,
      });
      expect(stats.get("EMAIL")).toEqual({
        channel: "EMAIL",
        total: 2,
        sent: 1,
        delivered: 0,
        converted: 0,
        failed: 1,
      });
    });
  });

  describe("getTopTriggers", () => {
    it("should rank triggers by conversion rate", async () => {
      const prisma = (await import("../../app/db.server")).default;
      const mockMessages = [
        { shopId: "shop1", triggerId: "trigger1", status: "CONVERTED", createdAt: new Date() },
        { shopId: "shop1", triggerId: "trigger1", status: "CONVERTED", createdAt: new Date() },
        { shopId: "shop1", triggerId: "trigger1", status: "SENT", createdAt: new Date() },
        { shopId: "shop1", triggerId: "trigger2", status: "SENT", createdAt: new Date() },
        { shopId: "shop1", triggerId: "trigger2", status: "SENT", createdAt: new Date() },
      ];

      vi.mocked(prisma.proactiveMessage.findMany).mockResolvedValue(mockMessages as any);

      const results = await ProactiveMessagingService.getTopTriggers("shop1");

      expect(results[0].triggerId).toBe("trigger1");
        expect(results[0].conversionRate).toBeCloseTo(66.67, 1);
      expect(results[1].triggerId).toBe("trigger2");
      expect(results[1].conversionRate).toBe(0);
    });
  });
});
