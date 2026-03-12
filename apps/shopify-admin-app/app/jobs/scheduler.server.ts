/**
 * Background Job: Proactive Message Evaluation
 *
 * Continuously evaluates all active sessions and queues proactive messages
 * based on trigger conditions.
 *
 * This runs as a periodic job:
 * - Every 10-30 seconds (configurable)
 * - Batches all shops
 * - Handles errors gracefully per shop
 * - Tracks metrics for monitoring
 */

import { ProactiveMessagingService } from "../services/proactive-messaging.server";
import { evaluateAllShops, cleanupExpiredMessages } from "./evaluate-proactive.server";
import { deliverMessagesBatch } from "../services/delivery.server";
import { RetentionEnforcementService } from "../services/enterprise-compliance.server";
import { processPendingSyncJobs } from "./sync-worker.server";
import { dispatchCampaign } from "../services/campaign.server";
import prisma from "../db.server";

interface SchedulerStatsState {
  shopsEvaluated: number;
  messagesQueued: number;
  errors: number;
  lastError: string | null;
  lastRunAt: Date | null;
}

interface CleanupStatsState {
  messagesCleanedUp: number;
  errors: number;
  lastError: string | null;
  lastRunAt: Date | null;
}

interface RetentionStatsState {
  runs: number;
  shopsProcessed: number;
  conversationsDeleted: number;
  eventsDeleted: number;
  errors: number;
  lastError: string | null;
  lastRunAt: Date | null;
}

interface SyncStatsState {
  runs: number;
  processedJobs: number;
  failedJobs: number;
  errors: number;
  lastError: string | null;
  lastRunAt: Date | null;
}

interface CampaignStatsState {
  runs: number;
  campaignsEvaluated: number;
  dispatches: number;
  errors: number;
  lastError: string | null;
  lastRunAt: Date | null;
}

interface ProactiveSchedulerState {
  evaluationJobHandle: NodeJS.Timeout | null;
  cleanupJobHandle: NodeJS.Timeout | null;
  retentionJobHandle: NodeJS.Timeout | null;
  syncJobHandle: NodeJS.Timeout | null;
  campaignJobHandle: NodeJS.Timeout | null;
  evaluationLastRun: number;
  cleanupLastRun: number;
  retentionLastRun: number;
  syncLastRun: number;
  campaignLastRun: number;
  startupBlockedLogged: boolean;
  evaluationStats: SchedulerStatsState;
  cleanupStats: CleanupStatsState;
  retentionStats: RetentionStatsState;
  syncStats: SyncStatsState;
  campaignStats: CampaignStatsState;
}

// Configuration
const EVALUATION_INTERVAL_MS = process.env.PROACTIVE_EVAL_INTERVAL_MS
  ? parseInt(process.env.PROACTIVE_EVAL_INTERVAL_MS)
  : 10000; // 10 seconds default

const CLEANUP_INTERVAL_MS = process.env.PROACTIVE_CLEANUP_INTERVAL_MS
  ? parseInt(process.env.PROACTIVE_CLEANUP_INTERVAL_MS)
  : 300000; // 5 minutes default

const RETENTION_INTERVAL_MS = process.env.COMPLIANCE_RETENTION_INTERVAL_MS
  ? parseInt(process.env.COMPLIANCE_RETENTION_INTERVAL_MS)
  : 24 * 60 * 60 * 1000; // 24h default

const SYNC_INTERVAL_MS = process.env.SYNC_WORKER_INTERVAL_MS
  ? parseInt(process.env.SYNC_WORKER_INTERVAL_MS)
  : 15000; // 15 seconds default

const CAMPAIGN_INTERVAL_MS = process.env.CAMPAIGN_EVAL_INTERVAL_MS
  ? parseInt(process.env.CAMPAIGN_EVAL_INTERVAL_MS)
  : 60000; // 60 seconds default

const schedulerGlobal = globalThis as typeof globalThis & {
  __fluxbotProactiveSchedulerState?: ProactiveSchedulerState;
};

const schedulerState: ProactiveSchedulerState =
  schedulerGlobal.__fluxbotProactiveSchedulerState ?? {
    evaluationJobHandle: null,
    cleanupJobHandle: null,
    retentionJobHandle: null,
    syncJobHandle: null,
    campaignJobHandle: null,
    evaluationLastRun: 0,
    cleanupLastRun: 0,
    retentionLastRun: 0,
    syncLastRun: 0,
    campaignLastRun: 0,
    startupBlockedLogged: false,
    evaluationStats: {
      shopsEvaluated: 0,
      messagesQueued: 0,
      errors: 0,
      lastError: null,
      lastRunAt: null,
    },
    cleanupStats: {
      messagesCleanedUp: 0,
      errors: 0,
      lastError: null,
      lastRunAt: null,
    },
    retentionStats: {
      runs: 0,
      shopsProcessed: 0,
      conversationsDeleted: 0,
      eventsDeleted: 0,
      errors: 0,
      lastError: null,
      lastRunAt: null,
    },
    syncStats: {
      runs: 0,
      processedJobs: 0,
      failedJobs: 0,
      errors: 0,
      lastError: null,
      lastRunAt: null,
    },
    campaignStats: {
      runs: 0,
      campaignsEvaluated: 0,
      dispatches: 0,
      errors: 0,
      lastError: null,
      lastRunAt: null,
    },
  };

schedulerGlobal.__fluxbotProactiveSchedulerState = schedulerState;

function isSchedulerPrismaReady(): boolean {
  const prismaClient = prisma as unknown as {
    shop?: {
      findMany?: unknown;
    };
    proactiveMessage?: {
      findMany?: unknown;
      updateMany?: unknown;
    };
  };

  return (
    typeof prismaClient.shop?.findMany === "function" &&
    typeof prismaClient.proactiveMessage?.findMany === "function" &&
    typeof prismaClient.proactiveMessage?.updateMany === "function"
  );
}

function isRetentionSchedulerReady(): boolean {
  const prismaClient = prisma as unknown as {
    shop?: {
      findMany?: unknown;
    };
    conversation?: {
      deleteMany?: unknown;
    };
    behaviorEvent?: {
      deleteMany?: unknown;
    };
  };

  return (
    typeof prismaClient.shop?.findMany === "function" &&
    typeof prismaClient.conversation?.deleteMany === "function" &&
    typeof prismaClient.behaviorEvent?.deleteMany === "function"
  );
}

function isSyncSchedulerReady(): boolean {
  const prismaClient = prisma as unknown as {
    syncJob?: {
      findFirst?: unknown;
      updateMany?: unknown;
    };
  };

  return (
    typeof prismaClient.syncJob?.findFirst === "function" &&
    typeof prismaClient.syncJob?.updateMany === "function"
  );
}

function isCampaignSchedulerReady(): boolean {
  const prismaClient = prisma as unknown as {
    marketingCampaign?: {
      findMany?: unknown;
      updateMany?: unknown;
      update?: unknown;
    };
    behaviorEvent?: {
      findMany?: unknown;
    };
  };

  return (
    typeof prismaClient.marketingCampaign?.findMany === "function" &&
    typeof prismaClient.marketingCampaign?.updateMany === "function" &&
    typeof prismaClient.marketingCampaign?.update === "function" &&
    typeof prismaClient.behaviorEvent?.findMany === "function"
  );
}
/**
 * Start background job scheduler
 * Called once on application startup
 */
export function startProactiveJobScheduler() {
  if (!isSchedulerPrismaReady()) {
    if (!schedulerState.startupBlockedLogged) {
      console.warn(
        "[ProactiveJobScheduler] Startup skipped: Prisma client is missing proactive delegates. Run `npm run prisma:generate` and restart the app."
      );
      schedulerState.startupBlockedLogged = true;
    }
    return;
  }

  schedulerState.startupBlockedLogged = false;

  console.log(
    `[ProactiveJobScheduler] Starting with evaluation interval: ${EVALUATION_INTERVAL_MS}ms, cleanup interval: ${CLEANUP_INTERVAL_MS}ms, retention interval: ${RETENTION_INTERVAL_MS}ms, sync interval: ${SYNC_INTERVAL_MS}ms, campaign interval: ${CAMPAIGN_INTERVAL_MS}ms`
  );

  // Start evaluation job
  if (!schedulerState.evaluationJobHandle) {
    schedulerState.evaluationJobHandle = setInterval(async () => {
      await runEvaluationJob();
    }, EVALUATION_INTERVAL_MS);

    console.log(`[ProactiveJobScheduler] Evaluation job started`);
  }

  // Start cleanup job
  if (!schedulerState.cleanupJobHandle) {
    schedulerState.cleanupJobHandle = setInterval(async () => {
      await runCleanupJob();
    }, CLEANUP_INTERVAL_MS);

    console.log(`[ProactiveJobScheduler] Cleanup job started`);
  }

  // Start retention enforcement job
  if (!schedulerState.retentionJobHandle) {
    schedulerState.retentionJobHandle = setInterval(async () => {
      await runRetentionJob();
    }, RETENTION_INTERVAL_MS);

    console.log(`[ProactiveJobScheduler] Retention job started`);
  }

  // Start sync worker job
  if (!schedulerState.syncJobHandle) {
    schedulerState.syncJobHandle = setInterval(async () => {
      await runSyncWorkerJob();
    }, SYNC_INTERVAL_MS);

    console.log(`[ProactiveJobScheduler] Sync worker job started`);
  }

  // Start campaign auto-dispatch job
  if (!schedulerState.campaignJobHandle) {
    schedulerState.campaignJobHandle = setInterval(async () => {
      await runCampaignAutoDispatchJob();
    }, CAMPAIGN_INTERVAL_MS);

    console.log(`[ProactiveJobScheduler] Campaign auto-dispatch job started`);
  }
}

/**
 * Stop background job scheduler
 * Called on application shutdown
 */
export function stopProactiveJobScheduler() {
  console.log(`[ProactiveJobScheduler] Stopping`);

  if (schedulerState.evaluationJobHandle) {
    clearInterval(schedulerState.evaluationJobHandle);
    schedulerState.evaluationJobHandle = null;
  }

  if (schedulerState.cleanupJobHandle) {
    clearInterval(schedulerState.cleanupJobHandle);
    schedulerState.cleanupJobHandle = null;
  }

  if (schedulerState.retentionJobHandle) {
    clearInterval(schedulerState.retentionJobHandle);
    schedulerState.retentionJobHandle = null;
  }

  if (schedulerState.syncJobHandle) {
    clearInterval(schedulerState.syncJobHandle);
    schedulerState.syncJobHandle = null;
  }

  if (schedulerState.campaignJobHandle) {
    clearInterval(schedulerState.campaignJobHandle);
    schedulerState.campaignJobHandle = null;
  }

  console.log(`[ProactiveJobScheduler] Stopped`);
}

/**
 * Run sync worker job: claim and process pending SyncJob rows
 */
async function runSyncWorkerJob() {
  const now = Date.now();

  if (!isSyncSchedulerReady()) {
    return;
  }

  // Prevent overlapping runs
  if (now - schedulerState.syncLastRun < SYNC_INTERVAL_MS / 2) {
    return;
  }

  schedulerState.syncLastRun = now;

  try {
    const result = await processPendingSyncJobs(2);

    schedulerState.syncStats = {
      runs: schedulerState.syncStats.runs + 1,
      processedJobs: schedulerState.syncStats.processedJobs + result.processed,
      failedJobs: schedulerState.syncStats.failedJobs + result.failed,
      errors: schedulerState.syncStats.errors,
      lastError: null,
      lastRunAt: new Date(),
    };

    if (result.processed > 0 || result.failed > 0) {
      console.log(
        `[ProactiveJobScheduler] Sync worker processed: ${result.processed} completed, ${result.failed} failed`,
      );
    }
  } catch (error) {
    schedulerState.syncStats = {
      ...schedulerState.syncStats,
      runs: schedulerState.syncStats.runs + 1,
      errors: schedulerState.syncStats.errors + 1,
      lastError: error instanceof Error ? error.message : String(error),
      lastRunAt: new Date(),
    };
    console.error(`[ProactiveJobScheduler] Sync worker failed:`, error);
  }
}

/**
 * Run campaign scheduler: dispatch due SCHEDULED / RECURRING campaigns.
 */
async function runCampaignAutoDispatchJob() {
  const nowTs = Date.now();

  if (!isCampaignSchedulerReady()) {
    return;
  }

  // Prevent overlapping runs
  if (nowTs - schedulerState.campaignLastRun < CAMPAIGN_INTERVAL_MS / 2) {
    return;
  }

  schedulerState.campaignLastRun = nowTs;
  const now = new Date();

  try {
    const dueCampaigns = await prisma.marketingCampaign.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          {
            scheduleType: "SCHEDULED",
            scheduledAt: { lte: now },
          },
          {
            scheduleType: "RECURRING",
          },
        ],
      },
      select: {
        id: true,
        shopId: true,
        scheduleType: true,
        scheduledAt: true,
        campaignWindowMs: true,
        lastDispatchedAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    let dispatches = 0;

    for (const campaign of dueCampaigns) {
      const isScheduledDue =
        campaign.scheduleType === "SCHEDULED" &&
        !!campaign.scheduledAt &&
        campaign.scheduledAt <= now &&
        (!campaign.lastDispatchedAt || campaign.lastDispatchedAt < campaign.scheduledAt);

      const isRecurringDue =
        campaign.scheduleType === "RECURRING" &&
        (!campaign.lastDispatchedAt ||
          nowTs - campaign.lastDispatchedAt.getTime() >= campaign.campaignWindowMs);

      if (!isScheduledDue && !isRecurringDue) {
        continue;
      }

      const recentSessions = await prisma.behaviorEvent.findMany({
        where: {
          shopId: campaign.shopId,
          timestamp: { gte: new Date(nowTs - 60 * 60 * 1000) },
        },
        select: {
          sessionId: true,
          visitorId: true,
        },
        distinct: ["sessionId"],
        take: 20,
      });

      for (const session of recentSessions) {
        if (!session.sessionId) continue;

        const dispatchResult = await dispatchCampaign(campaign.shopId, campaign.id, {
          sessionId: session.sessionId,
          visitorId: session.visitorId ?? undefined,
          locale: "en",
          channel: "WEB_CHAT",
        });

        if (dispatchResult.dispatched) {
          dispatches++;
        }
      }

      // One-shot scheduled campaigns become COMPLETED after their due dispatch pass.
      if (campaign.scheduleType === "SCHEDULED") {
        await prisma.marketingCampaign.update({
          where: { id: campaign.id },
          data: { status: "COMPLETED" },
        });
      }
    }

    schedulerState.campaignStats = {
      runs: schedulerState.campaignStats.runs + 1,
      campaignsEvaluated: dueCampaigns.length,
      dispatches,
      errors: schedulerState.campaignStats.errors,
      lastError: null,
      lastRunAt: new Date(),
    };

    if (dueCampaigns.length > 0) {
      console.log(
        `[ProactiveJobScheduler] Campaign scheduler: evaluated ${dueCampaigns.length}, dispatched ${dispatches}`,
      );
    }
  } catch (error) {
    schedulerState.campaignStats = {
      ...schedulerState.campaignStats,
      runs: schedulerState.campaignStats.runs + 1,
      errors: schedulerState.campaignStats.errors + 1,
      lastError: error instanceof Error ? error.message : String(error),
      lastRunAt: new Date(),
    };

    console.error(`[ProactiveJobScheduler] Campaign scheduler failed:`, error);
  }
}

/**
 * Run evaluation job: Process all shops and queue messages
 */
async function runEvaluationJob() {
  const now = Date.now();

  if (!isSchedulerPrismaReady()) {
    return;
  }

  // Prevent overlapping runs
  if (now - schedulerState.evaluationLastRun < EVALUATION_INTERVAL_MS / 2) {
    return;
  }

  schedulerState.evaluationLastRun = now;
  const startTime = Date.now();

  try {
    const result = await evaluateAllShops();

    schedulerState.evaluationStats = {
      shopsEvaluated: result.totalShops,
      messagesQueued: result.totalQueued,
      errors: result.results.filter((r) => r.status === "FAILED").length,
      lastError: null,
      lastRunAt: new Date(),
    };

    const duration = Date.now() - startTime;
    console.log(
      `[ProactiveJobScheduler] Evaluation completed: ${duration}ms, shops: ${result.totalShops}, queued: ${result.totalQueued}, avg: ${result.averageDurationMs.toFixed(0)}ms`
    );

    // Deliver queued messages
    await deliverQueuedMessages();
  } catch (error) {
    schedulerState.evaluationStats.lastError =
      error instanceof Error ? error.message : String(error);
    schedulerState.evaluationStats.errors++;
    console.error(`[ProactiveJobScheduler] Evaluation job failed:`, error);
  }
}

/**
 * Process and deliver queued messages
 */
async function deliverQueuedMessages() {
  try {
    const batch = await ProactiveMessagingService.getNextMessageBatch(50);

    if (batch.length === 0) {
      return;
    }

    const result = await deliverMessagesBatch(batch);

    console.log(
      `[ProactiveJobScheduler] Delivery: ${result.delivered} sent, ${result.failed} failed`
    );
  } catch (error) {
    console.error(`[ProactiveJobScheduler] Delivery batch failed:`, error);
  }
}

/**
 * Run cleanup job: Mark expired messages as failed
 */
async function runCleanupJob() {
  const now = Date.now();

  if (!isSchedulerPrismaReady()) {
    return;
  }

  // Prevent overlapping runs
  if (now - schedulerState.cleanupLastRun < CLEANUP_INTERVAL_MS / 2) {
    return;
  }

  schedulerState.cleanupLastRun = now;
  const startTime = Date.now();

  try {
    const result = await cleanupExpiredMessages();

    schedulerState.cleanupStats = {
      messagesCleanedUp: result.cleanedUp,
      errors: 0,
      lastError: null,
      lastRunAt: new Date(),
    };

    const duration = Date.now() - startTime;
    console.log(
      `[ProactiveJobScheduler] Cleanup completed: ${duration}ms, cleaned: ${result.cleanedUp}`
    );
  } catch (error) {
    schedulerState.cleanupStats.lastError =
      error instanceof Error ? error.message : String(error);
    schedulerState.cleanupStats.errors++;
    console.error(`[ProactiveJobScheduler] Cleanup job failed:`, error);
  }
}

/**
 * Run retention job: enforce data retention policy for all active shops
 */
async function runRetentionJob() {
  const now = Date.now();

  if (!isRetentionSchedulerReady()) {
    return;
  }

  // Prevent overlapping runs
  if (now - schedulerState.retentionLastRun < RETENTION_INTERVAL_MS / 2) {
    return;
  }

  schedulerState.retentionLastRun = now;
  const startedAt = Date.now();

  try {
    const activeShops = await prisma.shop.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    let conversationsDeleted = 0;
    let eventsDeleted = 0;
    let errors = 0;

    for (const shop of activeShops) {
      try {
        const result = await RetentionEnforcementService.enforce(shop.id);
        conversationsDeleted += result.conversationsDeleted;
        eventsDeleted += result.eventsDeleted;
      } catch (error) {
        errors++;
        console.error(`[ProactiveJobScheduler] Retention failed for shop ${shop.id}:`, error);
      }
    }

    schedulerState.retentionStats = {
      runs: schedulerState.retentionStats.runs + 1,
      shopsProcessed: activeShops.length,
      conversationsDeleted,
      eventsDeleted,
      errors,
      lastError: errors > 0 ? `${errors} shop retention runs failed` : null,
      lastRunAt: new Date(),
    };

    const duration = Date.now() - startedAt;
    console.log(
      `[ProactiveJobScheduler] Retention completed: ${duration}ms, shops: ${activeShops.length}, conversationsDeleted: ${conversationsDeleted}, eventsDeleted: ${eventsDeleted}, errors: ${errors}`,
    );
  } catch (error) {
    schedulerState.retentionStats = {
      ...schedulerState.retentionStats,
      runs: schedulerState.retentionStats.runs + 1,
      errors: schedulerState.retentionStats.errors + 1,
      lastError: error instanceof Error ? error.message : String(error),
      lastRunAt: new Date(),
    };

    console.error(`[ProactiveJobScheduler] Retention job failed:`, error);
  }
}

/**
 * Get current job scheduler stats
 * Useful for monitoring and debugging
 */
export function getProactiveJobSchedulerStats() {
  return {
    isRunning: {
      evaluation: schedulerState.evaluationJobHandle !== null,
      cleanup: schedulerState.cleanupJobHandle !== null,
      retention: schedulerState.retentionJobHandle !== null,
      sync: schedulerState.syncJobHandle !== null,
      campaigns: schedulerState.campaignJobHandle !== null,
    },
    intervals: {
      evaluationMs: EVALUATION_INTERVAL_MS,
      cleanupMs: CLEANUP_INTERVAL_MS,
      retentionMs: RETENTION_INTERVAL_MS,
      syncMs: SYNC_INTERVAL_MS,
      campaignMs: CAMPAIGN_INTERVAL_MS,
    },
    evaluation: schedulerState.evaluationStats,
    cleanup: schedulerState.cleanupStats,
    retention: schedulerState.retentionStats,
    sync: schedulerState.syncStats,
    campaigns: schedulerState.campaignStats,
    timestamp: new Date().toISOString(),
  };
}
