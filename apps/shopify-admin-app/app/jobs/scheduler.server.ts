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

interface ProactiveSchedulerState {
  evaluationJobHandle: NodeJS.Timeout | null;
  cleanupJobHandle: NodeJS.Timeout | null;
  evaluationLastRun: number;
  cleanupLastRun: number;
  startupBlockedLogged: boolean;
  evaluationStats: SchedulerStatsState;
  cleanupStats: CleanupStatsState;
}

// Configuration
const EVALUATION_INTERVAL_MS = process.env.PROACTIVE_EVAL_INTERVAL_MS
  ? parseInt(process.env.PROACTIVE_EVAL_INTERVAL_MS)
  : 10000; // 10 seconds default

const CLEANUP_INTERVAL_MS = process.env.PROACTIVE_CLEANUP_INTERVAL_MS
  ? parseInt(process.env.PROACTIVE_CLEANUP_INTERVAL_MS)
  : 300000; // 5 minutes default

const schedulerGlobal = globalThis as typeof globalThis & {
  __fluxbotProactiveSchedulerState?: ProactiveSchedulerState;
};

const schedulerState: ProactiveSchedulerState =
  schedulerGlobal.__fluxbotProactiveSchedulerState ?? {
    evaluationJobHandle: null,
    cleanupJobHandle: null,
    evaluationLastRun: 0,
    cleanupLastRun: 0,
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
    `[ProactiveJobScheduler] Starting with evaluation interval: ${EVALUATION_INTERVAL_MS}ms, cleanup interval: ${CLEANUP_INTERVAL_MS}ms`
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

  console.log(`[ProactiveJobScheduler] Stopped`);
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
 * Get current job scheduler stats
 * Useful for monitoring and debugging
 */
export function getProactiveJobSchedulerStats() {
  return {
    isRunning: {
      evaluation: schedulerState.evaluationJobHandle !== null,
      cleanup: schedulerState.cleanupJobHandle !== null,
    },
    intervals: {
      evaluationMs: EVALUATION_INTERVAL_MS,
      cleanupMs: CLEANUP_INTERVAL_MS,
    },
    evaluation: schedulerState.evaluationStats,
    cleanup: schedulerState.cleanupStats,
    timestamp: new Date().toISOString(),
  };
}
