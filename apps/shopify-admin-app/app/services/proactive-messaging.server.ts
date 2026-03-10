/**
 * Proactive Messaging Service - Phase 2 P2
 * 
 * Orchestrates proactive message lifecycle:
 * 1. Queue messages based on trigger evaluations
 * 2. Manage message delivery (send, retry, expire)
 * 3. Track message interactions (delivered, clicked, converted)
 * 4. Record analytics and attribution
 * 
 * Pipeline:
 * BehaviorEvent → TriggerEvaluation → ProactiveMessage (queued)
 *    → Delivery Service → Mark sent/delivered
 *    → Click Handler → Update status → Attribution
 */

import prisma from "../db.server";
import { EventTrackingService } from "./event-tracking.server";
import { TriggerEvaluationService } from "./trigger-evaluation.server";

type ProactiveMessageDelegate = {
  create: (...args: any[]) => Promise<any>;
  findMany: (...args: any[]) => Promise<any[]>;
  findFirst: (...args: any[]) => Promise<any>;
  findUniqueOrThrow: (...args: any[]) => Promise<any>;
  update: (...args: any[]) => Promise<any>;
  updateMany: (...args: any[]) => Promise<{ count: number }>;
};

let proactiveDelegateWarningShown = false;

function getProactiveMessageDelegate(
  requiredMethods: Array<keyof ProactiveMessageDelegate>
): ProactiveMessageDelegate | null {
  const delegate = (prisma as unknown as { proactiveMessage?: Partial<ProactiveMessageDelegate> })
    .proactiveMessage;

  const missingMethod = requiredMethods.find(
    (method) => typeof delegate?.[method] !== "function"
  );

  if (missingMethod) {
    if (!proactiveDelegateWarningShown) {
      console.warn(
        `[ProactiveMessagingService] Prisma delegate unavailable (missing proactiveMessage.${missingMethod}). Run \`npm run prisma:generate\` and restart the app.`
      );
      proactiveDelegateWarningShown = true;
    }
    return null;
  }

  proactiveDelegateWarningShown = false;
  return delegate as ProactiveMessageDelegate;
}

const SUPPORTED_PROACTIVE_CHANNELS = new Set([
  "WEB_CHAT",
  "WHATSAPP",
  "INSTAGRAM",
  "EMAIL",
  "SMS",
  "PUSH",
]);

export interface ProactiveMessageConfig {
  shopId: string;
  sessionId: string;
  triggerId: string;
  recipientId?: string;
  channel?: string; // WEB_CHAT, EMAIL, SMS, etc. (default: WEB_CHAT)
  messageTemplate: string;
  renderedMessage: string;
  messageMetadata?: Record<string, any>;
  expiresInMs?: number; // Message validity period (default: 60000 = 1 minute)
}

export interface ProactiveMessageRecord {
  id: string;
  shopId: string;
  sessionId: string;
  triggerId: string;
  recipientId?: string | null;
  channel: string;
  messageTemplate: string;
  renderedMessage: string;
  messageMetadata?: any;
  status: string;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  interactedAt?: Date | null;
  outcome?: string | null;
  errorMessage?: string | null;
  retryCount: number;
  maxRetries: number;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageDeliveryResult {
  success: boolean;
  messageId: string;
  deliveredAt?: Date;
  error?: string;
  nextRetryAt?: Date;
}

export class ProactiveMessagingService {
  private static resolveChannelFromRecommendation(recommendation: {
    metadata?: Record<string, any>;
  }): string {
    const metadata = recommendation.metadata || {};
    const conditions = (metadata.conditions || {}) as Record<string, any>;

    const rawChannel =
      metadata.targetChannel ||
      metadata.channel ||
      metadata.preferredChannel ||
      conditions.targetChannel ||
      conditions.channel ||
      "WEB_CHAT";

    const normalized = String(rawChannel).trim().toUpperCase();
    return SUPPORTED_PROACTIVE_CHANNELS.has(normalized) ? normalized : "WEB_CHAT";
  }

  private static resolveRecipientIdFromRecommendation(recommendation: {
    metadata?: Record<string, any>;
  }): string | undefined {
    const metadata = recommendation.metadata || {};
    const conditions = (metadata.conditions || {}) as Record<string, any>;

    const candidate =
      metadata.recipientId ||
      metadata.phone ||
      metadata.customerPhone ||
      conditions.recipientId ||
      conditions.phone ||
      conditions.customerPhone;

    if (typeof candidate !== "string") return undefined;
    const trimmed = candidate.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * Queue a new proactive message
   * Called after trigger evaluation returns SEND decision
   */
  static async queueMessage(config: ProactiveMessageConfig): Promise<ProactiveMessageRecord> {
    const delegate = getProactiveMessageDelegate(["create"]);
    if (!delegate) {
      throw new Error("Proactive message delegate unavailable");
    }

    const expiresAt = config.expiresInMs
      ? new Date(Date.now() + config.expiresInMs)
      : new Date(Date.now() + 60000); // Default 1 minute

    const message = await delegate.create({
      data: {
        shopId: config.shopId,
        sessionId: config.sessionId,
        triggerId: config.triggerId,
        recipientId: config.recipientId,
        channel: config.channel || "WEB_CHAT",
        messageTemplate: config.messageTemplate,
        renderedMessage: config.renderedMessage,
        messageMetadata: config.messageMetadata,
        status: "QUEUED",
        expiresAt,
      },
    });

    return message as ProactiveMessageRecord;
  }

  /**
   * Get next batch of messages to deliver
   * Messages must be QUEUED, not expired, and ready for delivery
   */
  static async getNextMessageBatch(
    batchSize: number = 10,
    channelFilter?: string
  ): Promise<ProactiveMessageRecord[]> {
    const delegate = getProactiveMessageDelegate(["findMany"]);
    if (!delegate) {
      return [];
    }

    const now = new Date();

    const messages = await delegate.findMany({
      where: {
        status: "QUEUED",
        expiresAt: {
          gt: now, // Not expired
        },
        ...(channelFilter && { channel: channelFilter }),
      },
      orderBy: [
        { createdAt: "asc" }, // Older messages first (FIFO)
      ],
      take: batchSize,
    });

    return messages as ProactiveMessageRecord[];
  }

  /**
   * Mark message as sent
   * Called after delivery service successfully sends
   */
  static async markAsSent(messageId: string): Promise<void> {
    const delegate = getProactiveMessageDelegate(["update"]);
    if (!delegate) {
      return;
    }

    await delegate.update({
      where: { id: messageId },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });
  }

  /**
   * Mark message as delivered
   * Called after delivery confirmation (e.g., widget received it)
   */
  static async markAsDelivered(messageId: string): Promise<void> {
    const delegate = getProactiveMessageDelegate(["update"]);
    if (!delegate) {
      return;
    }

    await delegate.update({
      where: { id: messageId },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
      },
    });
  }

  /**
   * Record message interaction (click, accept, dismiss, etc.)
   */
  static async recordInteraction(
    messageId: string,
    outcome: "ACCEPTED" | "REJECTED" | "CLICKED" | "EXPIRED" | string
  ): Promise<void> {
    const delegate = getProactiveMessageDelegate(["update"]);
    if (!delegate) {
      return;
    }

    await delegate.update({
      where: { id: messageId },
      data: {
        status: outcome === "EXPIRED" ? "FAILED" : "CONVERTED",
        outcome,
        interactedAt: new Date(),
      },
    });
  }

  /**
   * Mark message delivery failed and retry if under limit
   */
  static async markAsFailed(
    messageId: string,
    errorMessage: string,
    retryDelayMs?: number
  ): Promise<{ shouldRetry: boolean; nextRetryAt?: Date }> {
    const delegate = getProactiveMessageDelegate(["findUniqueOrThrow", "update"]);
    if (!delegate) {
      return { shouldRetry: false };
    }

    const message = await delegate.findUniqueOrThrow({
      where: { id: messageId },
    });

    const newRetryCount = message.retryCount + 1;
    const shouldRetry = newRetryCount < message.maxRetries;

    if (shouldRetry) {
      const nextRetryAt = new Date(Date.now() + (retryDelayMs || 5000)); // Default 5s backoff

      await delegate.update({
        where: { id: messageId },
        data: {
          status: "QUEUED", // Re-queue for retry
          retryCount: newRetryCount,
          errorMessage,
          expiresAt: nextRetryAt, // Soft expiry to prevent infinite retries
        },
      });

      return { shouldRetry: true, nextRetryAt };
    } else {
      // Max retries exceeded
      await delegate.update({
        where: { id: messageId },
        data: {
          status: "FAILED",
          retryCount: newRetryCount,
          errorMessage: `Max retries exceeded: ${errorMessage}`,
        },
      });

      return { shouldRetry: false };
    }
  }

  /**
   * Evaluate and queue messages for active sessions
   * Main entry point for proactive messaging orchestration
   * Called periodically (e.g., every 5-30 seconds)
   */
  static async evaluateAndQueueMessages(shopId: string): Promise<{
    evaluated: number;
    queued: number;
    skipped: number;
  }> {
    const delegate = getProactiveMessageDelegate(["findFirst"]);
    if (!delegate) {
      return { evaluated: 0, queued: 0, skipped: 0 };
    }

    // Get active sessions (last 5 minutes)
    const activeSessions = await EventTrackingService.getActiveSessions(shopId, 300000);

    let evaluated = 0;
    let queued = 0;
    let skipped = 0;

    for (const sessionId of activeSessions) {
      evaluated++;

      try {
        // Evaluate triggers for this session
        const evaluations = await TriggerEvaluationService.evaluateSessionTriggers(
          shopId,
          sessionId
        );

        // Find best SEND recommendation
        const recommendation = evaluations.find((e) => e.decision === "SEND");

        if (!recommendation) {
          skipped++;
          continue;
        }

        // Check if message was already sent recently for this trigger
        const recentMessage = await delegate.findFirst({
          where: {
            shopId,
            sessionId,
            triggerId: recommendation.triggerId,
            status: { in: ["SENT", "DELIVERED", "CONVERTED"] },
            createdAt: {
              gte: new Date(Date.now() - 30000), // Last 30 seconds
            },
          },
        });

        if (recentMessage) {
          skipped++;
          continue;
        }

        const resolvedChannel = this.resolveChannelFromRecommendation(recommendation);
        const resolvedRecipientId = this.resolveRecipientIdFromRecommendation(recommendation);

        // Queue the message
        await this.queueMessage({
          shopId,
          sessionId,
          triggerId: recommendation.triggerId,
          recipientId: resolvedRecipientId,
          channel: resolvedChannel,
          messageTemplate: recommendation.message || recommendation.triggerName,
          renderedMessage: recommendation.message || "Check this out!",
          messageMetadata: {
            decision: recommendation.decision,
            score: recommendation.score,
            triggerName: recommendation.triggerName,
            targetChannel: resolvedChannel,
            recipientId: resolvedRecipientId,
          },
          expiresInMs: 60000, // 1 minute validity
        });

        queued++;

        // Record trigger fire for cooldown
        TriggerEvaluationService.recordTriggerFire(
          recommendation.triggerId,
          sessionId
        );
      } catch (error) {
        console.error(`[Proactive] Failed to evaluate session ${sessionId}:`, error);
        skipped++;
      }
    }

    return { evaluated, queued, skipped };
  }

  /**
   * Get message delivery statistics for a shop
   */
  static async getMessageStats(shopId: string, timeWindowMs: number = 3600000): Promise<{
    total: number;
    queued: number;
    sent: number;
    delivered: number;
    converted: number;
    failed: number;
    deliveryRate: number;
    conversionRate: number;
  }> {
    const delegate = getProactiveMessageDelegate(["findMany"]);
    if (!delegate) {
      return {
        total: 0,
        queued: 0,
        sent: 0,
        delivered: 0,
        converted: 0,
        failed: 0,
        deliveryRate: 0,
        conversionRate: 0,
      };
    }

    const since = new Date(Date.now() - timeWindowMs);

    const messages = await delegate.findMany({
      where: {
        shopId,
        createdAt: { gte: since },
      },
    });

    const total = messages.length;
    const queued = messages.filter((m) => m.status === "QUEUED").length;
    const sent = messages.filter((m) => m.status === "SENT").length;
    const delivered = messages.filter((m) => m.status === "DELIVERED").length;
    const converted = messages.filter((m) => m.status === "CONVERTED").length;
    const failed = messages.filter((m) => m.status === "FAILED").length;

    const sentOrDelivered = sent + delivered + converted;
    const deliveryRate = total > 0 ? (sentOrDelivered / total) * 100 : 0;
    const conversionRate = sentOrDelivered > 0 ? (converted / sentOrDelivered) * 100 : 0;

    return {
      total,
      queued,
      sent,
      delivered,
      converted,
      failed,
      deliveryRate,
      conversionRate,
    };
  }

  /**
   * Get messages for a session (for debugging/UI)
   */
  static async getSessionMessages(
    sessionId: string,
    limit: number = 20
  ): Promise<ProactiveMessageRecord[]> {
    const delegate = getProactiveMessageDelegate(["findMany"]);
    if (!delegate) {
      return [];
    }

    const messages = await delegate.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return messages as ProactiveMessageRecord[];
  }

  /**
   * Get messages for a trigger (analytics)
   */
  static async getTriggerMessages(
    triggerId: string,
    timeWindowMs: number = 3600000
  ): Promise<ProactiveMessageRecord[]> {
    const delegate = getProactiveMessageDelegate(["findMany"]);
    if (!delegate) {
      return [];
    }

    const since = new Date(Date.now() - timeWindowMs);

    const messages = await delegate.findMany({
      where: {
        triggerId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });

    return messages as ProactiveMessageRecord[];
  }

  /**
   * Get expired messages and mark as FAILED
   * Run periodically to clean up expired messages
   */
  static async cleanupExpiredMessages(): Promise<number> {
    const delegate = getProactiveMessageDelegate(["updateMany"]);
    if (!delegate) {
      return 0;
    }

    const now = new Date();

    const result = await delegate.updateMany({
      where: {
        status: { in: ["QUEUED", "SENT"] },
        expiresAt: {
          lte: now,
        },
      },
      data: {
        status: "FAILED",
        outcome: "EXPIRED",
      },
    });

    return result.count;
  }

  /**
   * Get delivery performance by channel
   */
  static async getChannelStats(
    shopId: string,
    timeWindowMs: number = 3600000
  ): Promise<Map<string, any>> {
    const delegate = getProactiveMessageDelegate(["findMany"]);
    if (!delegate) {
      return new Map();
    }

    const since = new Date(Date.now() - timeWindowMs);

    const messages = await delegate.findMany({
      where: {
        shopId,
        createdAt: { gte: since },
      },
    });

    const stats = new Map();

    for (const message of messages) {
      const channel = message.channel;
      if (!stats.has(channel)) {
        stats.set(channel, {
          channel,
          total: 0,
          sent: 0,
          delivered: 0,
          converted: 0,
          failed: 0,
        });
      }

      const channelStats = stats.get(channel);
      channelStats.total++;

      switch (message.status) {
        case "SENT":
          channelStats.sent++;
          break;
        case "DELIVERED":
          channelStats.delivered++;
          break;
        case "CONVERTED":
          channelStats.converted++;
          break;
        case "FAILED":
          channelStats.failed++;
          break;
      }
    }

    return stats;
  }

  /**
   * Get top performing triggers
   */
  static async getTopTriggers(
    shopId: string,
    limit: number = 10,
    timeWindowMs: number = 3600000
  ): Promise<Array<{
    triggerId: string;
    messageCount: number;
    conversionCount: number;
    conversionRate: number;
  }>> {
    const delegate = getProactiveMessageDelegate(["findMany"]);
    if (!delegate) {
      return [];
    }

    const since = new Date(Date.now() - timeWindowMs);

    const messages = await delegate.findMany({
      where: {
        shopId,
        createdAt: { gte: since },
      },
    });

    const triggerStats = new Map<
      string,
      { messageCount: number; conversionCount: number }
    >();

    for (const message of messages) {
      if (!triggerStats.has(message.triggerId)) {
        triggerStats.set(message.triggerId, {
          messageCount: 0,
          conversionCount: 0,
        });
      }

      const stats = triggerStats.get(message.triggerId)!;
      stats.messageCount++;
      if (message.status === "CONVERTED") {
        stats.conversionCount++;
      }
    }

    const results = Array.from(triggerStats.entries())
      .map(([triggerId, stats]) => ({
        triggerId,
        messageCount: stats.messageCount,
        conversionCount: stats.conversionCount,
        conversionRate: (stats.conversionCount / stats.messageCount) * 100,
      }))
      .sort((a, b) => b.conversionRate - a.conversionRate)
      .slice(0, limit);

    return results;
  }
}
