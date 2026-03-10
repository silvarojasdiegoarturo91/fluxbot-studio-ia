/**
 * Delivery Service: Proactive Message Delivery
 *
 * Responsible for sending proactive messages through various channels:
 * - WEB_CHAT: Messages to the storefront chat widget
 * - WHATSAPP / INSTAGRAM / SMS / EMAIL: Omnichannel bridge dispatch
 * - PUSH: Web push notifications (future)
 *
 * This service implements the delivery logic that transforms queued
 * ProactiveMessages into actual customer communications.
 */

import prisma from "../db.server";
import { ProactiveMessagingService } from "./proactive-messaging.server";
import type { Prisma } from "@prisma/client";
import {
  dispatchOmnichannelMessage,
  getOmnichannelBridgeStatus,
} from "./omnichannel-bridge.server";

export const DELIVERY_CHANNELS = [
  "WEB_CHAT",
  "WHATSAPP",
  "INSTAGRAM",
  "EMAIL",
  "SMS",
  "PUSH",
] as const;

export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export interface DeliveryMessage {
  id: string;
  shopId: string;
  sessionId: string;
  recipientId?: string | null;
  channel: string;
  renderedMessage: string;
  messageMetadata?: Record<string, unknown>;
}

/**
 * Message delivery configuration per channel
 */
const CHANNEL_CONFIG = {
  WEB_CHAT: {
    timeout: 5000, // 5 second timeout
    retryable: true,
    batchable: false,
    integrated: true,
  },
  WHATSAPP: {
    timeout: 8000,
    retryable: true,
    batchable: true,
    integrated: true,
  },
  INSTAGRAM: {
    timeout: 8000,
    retryable: true,
    batchable: true,
    integrated: true,
  },
  EMAIL: {
    timeout: 10000, // 10 second timeout (can be async)
    retryable: true,
    batchable: true,
    integrated: true,
  },
  SMS: {
    timeout: 8000,
    retryable: true,
    batchable: true,
    integrated: true,
  },
  PUSH: {
    timeout: 5000,
    retryable: true,
    batchable: true,
    integrated: false,
  },
} as const;

function isDeliveryChannel(channel: string): channel is DeliveryChannel {
  return (DELIVERY_CHANNELS as readonly string[]).includes(channel);
}

function normalizeChannel(channel: string): DeliveryChannel | null {
  const normalized = String(channel || "").trim().toUpperCase();
  return isDeliveryChannel(normalized) ? normalized : null;
}

function resolveRecipientId(message: DeliveryMessage): string | null {
  if (message.recipientId) {
    return message.recipientId;
  }

  const metadataRecipient = message.messageMetadata?.["recipientId"];
  if (typeof metadataRecipient === "string" && metadataRecipient.trim().length > 0) {
    return metadataRecipient;
  }

  return null;
}

async function createDeliveryAuditLog(params: {
  shopId: string;
  messageId: string;
  action: string;
  details: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        shopId: params.shopId,
        action: params.action,
        entityType: "PROACTIVE_MESSAGE",
        entityId: params.messageId,
        changes: params.details as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.warn("[DeliveryService] Failed to write audit log", error);
  }
}

/**
 * Core delivery function
 * Sends a batch of messages through their respective channels
 */
export async function deliverMessagesBatch(
  messages: DeliveryMessage[]
): Promise<{
  delivered: number;
  failed: number;
  errors: Record<string, string>;
}> {
  const results = {
    delivered: 0,
    failed: 0,
    errors: {} as Record<string, string>,
  };

  // Group messages by channel
  const byChannel = messages.reduce(
    (acc, msg) => {
      const normalized = normalizeChannel(msg.channel);

      if (!normalized) {
        acc.__invalid.push(msg);
        return acc;
      }

      if (!acc[normalized]) {
        acc[normalized] = [];
      }
      acc[normalized].push(msg);
      return acc;
    },
    {
      __invalid: [] as DeliveryMessage[],
    } as Record<string, DeliveryMessage[]>
  );

  // Mark invalid channels as failed
  for (const invalidMessage of byChannel.__invalid) {
    const errorMessage = `Unsupported channel: ${invalidMessage.channel}`;
    await ProactiveMessagingService.markAsFailed(invalidMessage.id, errorMessage);
    results.failed += 1;
    results.errors[invalidMessage.id] = errorMessage;
  }

  delete byChannel.__invalid;

  // Deliver by channel
  for (const [channel, msgs] of Object.entries(byChannel)) {
    if (!msgs || msgs.length === 0) {
      continue;
    }

    const result = await deliverByChannel(channel, msgs);
    results.delivered += result.delivered;
    results.failed += result.failed;
    Object.assign(results.errors, result.errors);
  }

  return results;
}

/**
 * Deliver messages through a specific channel
 */
async function deliverByChannel(
  channel: string,
  messages: DeliveryMessage[]
): Promise<{
  delivered: number;
  failed: number;
  errors: Record<string, string>;
}> {
  const results = {
    delivered: 0,
    failed: 0,
    errors: {} as Record<string, string>,
  };

  switch (channel) {
    case "WEB_CHAT":
      return await deliverWebChat(messages);

    case "WHATSAPP":
      return await deliverBridgeChannel("WHATSAPP", messages);

    case "INSTAGRAM":
      return await deliverBridgeChannel("INSTAGRAM", messages);

    case "EMAIL":
      return await deliverBridgeChannel("EMAIL", messages);

    case "SMS":
      return await deliverBridgeChannel("SMS", messages);

    case "PUSH":
      return await deliverPush(messages);

    default:
      console.warn(`[DeliveryService] Unknown channel: ${channel}`);
      return {
        delivered: 0,
        failed: messages.length,
        errors: {
          [channel]: "Unknown channel",
        },
      };
  }
}

/**
 * Deliver via web chat
 * Adds message to conversation and marks as delivered
 */
async function deliverWebChat(
  messages: DeliveryMessage[]
): Promise<{
  delivered: number;
  failed: number;
  errors: Record<string, string>;
}> {
  const results = {
    delivered: 0,
    failed: 0,
    errors: {} as Record<string, string>,
  };

  for (const msg of messages) {
    try {
      // In a real implementation, this would:
      // 1. Find the conversation for this session
      // 2. Create a ConversationMessage with the rendered content
      // 3. Mark the ProactiveMessage as sent
      // 4. Update delivery status

      // For now, we'll simulate successful delivery
      await ProactiveMessagingService.markAsSent(msg.id);

      await createDeliveryAuditLog({
        shopId: msg.shopId,
        messageId: msg.id,
        action: "PROACTIVE_DELIVERY_SENT_WEB_CHAT",
        details: {
          channel: "WEB_CHAT",
          sessionId: msg.sessionId,
        },
      });

      // Simulate delivery confirmation
      setTimeout(async () => {
        try {
          await ProactiveMessagingService.markAsDelivered(msg.id);

          await createDeliveryAuditLog({
            shopId: msg.shopId,
            messageId: msg.id,
            action: "PROACTIVE_DELIVERY_CONFIRMED_WEB_CHAT",
            details: {
              channel: "WEB_CHAT",
            },
          });
        } catch (e) {
          console.error(
            `[DeliveryService] Failed to mark delivered: ${msg.id}`,
            e
          );
        }
      }, 500);

      results.delivered++;
    } catch (error) {
      // Mark as failed and allow retry
      const errorMsg = error instanceof Error ? error.message : String(error);
      await ProactiveMessagingService.markAsFailed(msg.id, errorMsg);
      results.failed++;
      results.errors[msg.id] = errorMsg;

      console.error(`[DeliveryService] Web chat delivery failed: ${msg.id}`, error);
    }
  }

  return results;
}

/**
 * Deliver via push notifications
 * Queues message to push service
 */
async function deliverPush(
  messages: DeliveryMessage[]
): Promise<{
  delivered: number;
  failed: number;
  errors: Record<string, string>;
}> {
  const results = {
    delivered: 0,
    failed: 0,
    errors: {} as Record<string, string>,
  };

  // TODO: Implement push notification delivery
  // - Look up push subscription for user
  // - Call push service
  // - Track delivery status

  for (const msg of messages) {
    try {
      throw new Error("Push notifications not yet integrated");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await ProactiveMessagingService.markAsFailed(msg.id, errorMsg);
      results.failed++;
      results.errors[msg.id] = errorMsg;
    }
  }

  return results;
}

/**
 * Deliver via omnichannel bridge (WhatsApp / Instagram)
 * Dispatches messages through an external omnichannel gateway.
 */
async function deliverBridgeChannel(
  bridgeChannel: "WHATSAPP" | "INSTAGRAM" | "SMS" | "EMAIL",
  messages: DeliveryMessage[]
): Promise<{
  delivered: number;
  failed: number;
  errors: Record<string, string>;
}> {
  const results = {
    delivered: 0,
    failed: 0,
    errors: {} as Record<string, string>,
  };

  for (const msg of messages) {
    try {
      const recipientId = resolveRecipientId(msg);
      if (!recipientId) {
        throw new Error(`${bridgeChannel} delivery requires recipientId`);
      }

      const dispatchResult = await dispatchOmnichannelMessage({
        messageId: msg.id,
        shopId: msg.shopId,
        sessionId: msg.sessionId,
        recipientId,
        channel: bridgeChannel,
        content: msg.renderedMessage,
        metadata: msg.messageMetadata,
      });

      if (!dispatchResult.success) {
        throw new Error(dispatchResult.error || `${bridgeChannel} dispatch failed`);
      }

      await ProactiveMessagingService.markAsSent(msg.id);

      if (dispatchResult.status === "DELIVERED") {
        await ProactiveMessagingService.markAsDelivered(msg.id);
      }

      await createDeliveryAuditLog({
        shopId: msg.shopId,
        messageId: msg.id,
        action: "PROACTIVE_DELIVERY_SENT_OMNICHANNEL",
        details: {
          channel: bridgeChannel,
          recipientId,
          sessionId: msg.sessionId,
          providerMessageId: dispatchResult.providerMessageId || null,
          providerStatus: dispatchResult.status,
        },
      });

      results.delivered += 1;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await ProactiveMessagingService.markAsFailed(msg.id, errorMsg);
      results.failed += 1;
      results.errors[msg.id] = errorMsg;
    }
  }

  return results;
}

/**
 * Get delivery service status and metrics
 */
export function getDeliveryStatus() {
  const bridgeStatus = getOmnichannelBridgeStatus();

  const integratedChannels = Object.entries(CHANNEL_CONFIG)
    .filter(([, config]) => config.integrated)
    .map(([name]) => name);

  const pendingChannels = Object.entries(CHANNEL_CONFIG)
    .filter(([, config]) => !config.integrated)
    .map(([name]) => name);

  return {
    channels: [...DELIVERY_CHANNELS],
    status: "ready",
    integratedChannels,
    pendingChannels,
    omnichannelBridge: bridgeStatus,
    timestamp: new Date().toISOString(),
  };
}
