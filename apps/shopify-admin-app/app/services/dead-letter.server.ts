/**
 * Dead Letter Queue Service - Phase 3
 *
 * Manages permanently failed callbacks that cannot be delivered or retry.
 * Provides recovery mechanisms and observability for operational failures.
 */

import prisma from "../db.server";
import { Prisma } from "@prisma/client";

function toNullableJsonInput(
  value: Prisma.JsonValue | Record<string, unknown> | null | undefined
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

export interface DeadLetterQueueEntry {
  id: string;
  shopId: string;
  messageId: string;
  channel: string;
  failureReason: string;
  errorDetails?: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date | null;
  isResolved: boolean;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Queue a failed callback for later analysis or retry
 */
export async function queueDeadLetter(params: {
  shopId: string;
  messageId: string;
  channel: string;
  originalStatus: "SENT" | "DELIVERED" | "FAILED";
  failureReason: string;
  errorDetails?: Record<string, unknown>;
  maxRetries?: number;
}): Promise<DeadLetterQueueEntry> {
  const maxRetries = params.maxRetries || 3;

  const entry = await prisma.deadLetterCallback.create({
    data: {
      shopId: params.shopId,
      messageId: params.messageId,
      channel: params.channel,
      originalStatus: params.originalStatus,
      failureReason: params.failureReason,
      errorDetails: toNullableJsonInput(params.errorDetails ?? null),
      maxRetries,
      retryCount: 0,
      nextRetryAt: new Date(Date.now() + 60000), // Retry in 1 minute
    },
  });

  return entry as DeadLetterQueueEntry;
}

/**
 * Get queued dead letters by shop and optional channel
 */
export async function getQueuedDeadLetters(
  shopId: string,
  channel?: string
): Promise<DeadLetterQueueEntry[]> {
  const entries = await prisma.deadLetterCallback.findMany({
    where: {
      shopId,
      isResolved: false,
      ...(channel && { channel }),
    },
    orderBy: {
      nextRetryAt: "asc",
    },
  });

  return entries as DeadLetterQueueEntry[];
}

/**
 * Attempt to retry a dead letter entry
 */
export async function retryDeadLetter(
  deadLetterId: string,
  succeeded: boolean,
  errorDetails?: Record<string, unknown>
): Promise<DeadLetterQueueEntry> {
  const entry = await prisma.deadLetterCallback.findUniqueOrThrow({
    where: { id: deadLetterId },
  });

  if (succeeded) {
    const updated = await prisma.deadLetterCallback.update({
      where: { id: deadLetterId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: "retry_succeeded",
      },
    });

    return updated as DeadLetterQueueEntry;
  }

  // Increment retry count
  const nextRetryCount = entry.retryCount + 1;
  const backoffMs = Math.min(1000 * Math.pow(2, nextRetryCount), 3600000); // Exponential backoff, max 1 hour
  const nextRetryAt =
    nextRetryCount >= entry.maxRetries
      ? null // No more retries
      : new Date(Date.now() + backoffMs);

  const isResolved = nextRetryCount >= entry.maxRetries;

  const updated = await prisma.deadLetterCallback.update({
    where: { id: deadLetterId },
    data: {
      retryCount: nextRetryCount,
      nextRetryAt,
      isResolved,
      resolvedAt: isResolved ? new Date() : null,
      resolvedBy: isResolved ? "expired" : null,
      errorDetails: toNullableJsonInput(errorDetails ?? entry.errorDetails),
    },
  });

  return updated as DeadLetterQueueEntry;
}

/**
 * Manually mark a dead letter as resolved
 */
export async function resolvDeadLetterManually(
  deadLetterId: string,
  notes?: string
): Promise<DeadLetterQueueEntry> {
  const updated = await prisma.deadLetterCallback.update({
    where: { id: deadLetterId },
    data: {
      isResolved: true,
      resolvedAt: new Date(),
      resolvedBy: "manual",
      errorDetails: notes
        ? {
            manualResolutionNotes: notes,
          }
        : undefined,
    },
  });

  return updated as DeadLetterQueueEntry;
}

/**
 * Get dead letter queue statistics
 */
export async function getDeadLetterStats(shopId?: string) {
  const where = shopId ? { shopId } : undefined;

  const [queued, resolved, resolvedByRetry, resolvedByExpiry, resolvedByManual, byChannel] = await Promise.all(
    [
      prisma.deadLetterCallback.count({
        where: {
          ...where,
          isResolved: false,
        },
      }),
      prisma.deadLetterCallback.count({
        where: {
          ...where,
          isResolved: true,
        },
      }),
      prisma.deadLetterCallback.count({
        where: {
          ...where,
          isResolved: true,
          resolvedBy: "retry_succeeded",
        },
      }),
      prisma.deadLetterCallback.count({
        where: {
          ...where,
          isResolved: true,
          resolvedBy: "expired",
        },
      }),
      prisma.deadLetterCallback.count({
        where: {
          ...where,
          isResolved: true,
          resolvedBy: "manual",
        },
      }),
      prisma.deadLetterCallback.groupBy({
        by: ["channel"],
        where,
        _count: {
          id: true,
        },
      }),
    ]
  );

  return {
    queued,
    resolved,
    resolvedByRetry,
    resolvedByExpiry,
    resolvedByManual,
    byChannel: Object.fromEntries(
      byChannel.map((item: any) => [item.channel, item._count.id])
    ),
  };
}
