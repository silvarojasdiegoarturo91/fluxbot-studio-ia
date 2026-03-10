/**
 * Proactive Message Evaluation Job - Phase 2 P2
 * 
 * Background job that:
 * 1. Runs periodically (every 5-30 seconds)
 * 2. Finds active sessions in the shop
 * 3. Evaluates triggers for each session
 * 4. Queues messages for delivery
 * 5. Tracks job metrics
 * 
 * This job replaces manual trigger evaluation with continuous
 * proactive engagement for all shops.
 */

import { ProactiveMessagingService } from "../services/proactive-messaging.server";
import prisma from "../db.server";

export interface EvaluationJobResult {
  jobId: string;
  shopId: string;
  status: "SUCCESS" | "FAILED" | "PARTIAL";
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  evaluated: number;
  queued: number;
  skipped: number;
  errors: string[];
}

/**
 * Run proactive message evaluation for a single shop
 */
export async function evaluateShopSessions(
  shopId: string
): Promise<EvaluationJobResult> {
  const startedAt = new Date();
  const errors: string[] = [];

  try {
    // Check if shop is active
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop || shop.status !== "ACTIVE") {
      return {
        jobId: `job-${Date.now()}`,
        shopId,
        status: "FAILED",
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        evaluated: 0,
        queued: 0,
        skipped: 0,
        errors: [`Shop ${shopId} is not active or not found`],
      };
    }

    // Evaluate and queue messages
    const result = await ProactiveMessagingService.evaluateAndQueueMessages(shopId);

    const completedAt = new Date();

    return {
      jobId: `job-${Date.now()}`,
      shopId,
      status: result.skipped === 0 ? "SUCCESS" : "PARTIAL",
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      evaluated: result.evaluated,
      queued: result.queued,
      skipped: result.skipped,
      errors,
    };
  } catch (error) {
    const completedAt = new Date();
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(errorMessage);

    console.error(`[Proactive Job] Failed to evaluate shop ${shopId}:`, error);

    return {
      jobId: `job-${Date.now()}`,
      shopId,
      status: "FAILED",
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      evaluated: 0,
      queued: 0,
      skipped: 0,
      errors,
    };
  }
}

/**
 * Run proactive message evaluation for all active shops
 * This is the main job entry point
 */
export async function evaluateAllShops(): Promise<{
  totalShops: number;
  results: EvaluationJobResult[];
  totalQueued: number;
  averageDurationMs: number;
}> {
  const startTime = Date.now();

  // Get all active shops
  const activeShops = await prisma.shop.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  const results: EvaluationJobResult[] = [];
  let totalQueued = 0;

  // Evaluate each shop
  for (const shop of activeShops) {
    try {
      const result = await evaluateShopSessions(shop.id);
      results.push(result);
      totalQueued += result.queued;
    } catch (error) {
      console.error(`[Proactive Job] Error evaluating shop ${shop.id}:`, error);
      results.push({
        jobId: `job-${Date.now()}`,
        shopId: shop.id,
        status: "FAILED",
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0,
        evaluated: 0,
        queued: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      });
    }
  }

  const totalDurationMs = Date.now() - startTime;
  const averageDurationMs =
    results.length > 0 ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length : 0;

  return {
    totalShops: activeShops.length,
    results,
    totalQueued,
    averageDurationMs,
  };
}

/**
 * Cleanup expired messages
 * Run periodically (e.g., every 5 minutes)
 */
export async function cleanupExpiredMessages(): Promise<{
  cleanedUp: number;
  startedAt: Date;
  completedAt: Date;
}> {
  const startedAt = new Date();

  try {
    const cleanedUp = await ProactiveMessagingService.cleanupExpiredMessages();

    const completedAt = new Date();

    console.log(`[Proactive Job] Cleaned up ${cleanedUp} expired messages`);

    return {
      cleanedUp,
      startedAt,
      completedAt,
    };
  } catch (error) {
    console.error(`[Proactive Job] Failed to cleanup expired messages:`, error);
    throw error;
  }
}

/**
 * Get job statistics
 */
export async function getJobStats(timeWindowMs: number = 3600000): Promise<{
  period: string;
  shopsEvaluated: number;
  messagesQueued: number;
  averageQueuedPerShop: number;
  averageJobDuration: number;
}> {
  const since = new Date(Date.now() - timeWindowMs);

  // For now, return mock stats
  // In production, store job results in a ProactiveJob table
  return {
    period: `Last ${timeWindowMs / 1000}s`,
    shopsEvaluated: 0,
    messagesQueued: 0,
    averageQueuedPerShop: 0,
    averageJobDuration: 0,
  };
}
