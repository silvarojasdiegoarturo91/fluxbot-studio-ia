import prisma from "../db.server";

export interface CallbackMetrics {
  total: number;
  applied: number;
  ignored: number;
  deliveryFailures: number;
  appliedRate: number;
  ignoredRate: number;
}

export interface ChannelMetrics {
  [channel: string]: {
    callbacks: number;
    applied: number;
    ignored: number;
    failures: number;
    avgLatencyMs: number;
  };
}

export interface DeadLetterMetrics {
  queued: number;
  resolved: number;
  resolvedByRetry: number;
  resolvedByExpiry: number;
  resolvedByManual: number;
}

export interface OperationsMetrics {
  windowMs: number;
  since: string;
  callback: CallbackMetrics;
  byChannel: ChannelMetrics;
  deadLetter: DeadLetterMetrics;
}

export async function getOperationsMetrics(timeWindowMs: number = 60 * 60 * 1000): Promise<OperationsMetrics> {
  const now = Date.now();
  const sinceDate = new Date(now - timeWindowMs);

  // Get callback metrics (applied, ignored, failures)
  const [applied, ignored, deliveryFailures] = await Promise.all([
    prisma.auditLog.count({
      where: {
        action: "PROACTIVE_DELIVERY_CALLBACK_APPLIED",
        createdAt: {
          gte: sinceDate,
        },
      },
    }),
    prisma.auditLog.count({
      where: {
        action: "PROACTIVE_DELIVERY_CALLBACK_IGNORED",
        createdAt: {
          gte: sinceDate,
        },
      },
    }),
    prisma.auditLog.count({
      where: {
        action: "PROACTIVE_DELIVERY_CALLBACK_APPLIED",
        createdAt: {
          gte: sinceDate,
        },
        changes: {
          path: ["requestedStatus"],
          equals: "FAILED",
        },
      },
    }),
  ]);

  const total = applied + ignored;

  // Get channel-specific metrics
  const channelMetrics: ChannelMetrics = {};
  const channelLogs = await prisma.auditLog.findMany({
    where: {
      action: {
        in: ["PROACTIVE_DELIVERY_CALLBACK_APPLIED", "PROACTIVE_DELIVERY_CALLBACK_IGNORED"],
      },
      createdAt: {
        gte: sinceDate,
      },
    },
    select: {
      changes: true,
    },
  });

  // Group metrics by channel
  const channelMap: Record<
    string,
    {
      callbacks: number;
      applied: number;
      ignored: number;
      failures: number;
      latencies: number[];
    }
  > = {};

  for (const log of channelLogs) {
    const changes = log.changes as any;
    const channel = changes?.originChannel || "UNKNOWN";
    const isApplied = changes?.applied === true;
    const requestedStatus = changes?.requestedStatus;

    if (!channelMap[channel]) {
      channelMap[channel] = {
        callbacks: 0,
        applied: 0,
        ignored: 0,
        failures: 0,
        latencies: [],
      };
    }

    channelMap[channel].callbacks++;
    if (isApplied) {
      channelMap[channel].applied++;
      if (requestedStatus === "FAILED") {
        channelMap[channel].failures++;
      }
    } else {
      channelMap[channel].ignored++;
    }

    // Estimate latency from createdAt if available
    // For now, use a placeholder (would be enhanced with callbackTimestamp)
    if (changes?.callbackTimestamp) {
      const callbackTime = (changes.callbackTimestamp as number) * 1000;
      const nowMs = Date.now();
      channelMap[channel].latencies.push(Math.min(nowMs - callbackTime, 10000));
    }
  }

  // Convert to output format
  for (const [channel, data] of Object.entries(channelMap)) {
    const avgLatency =
      data.latencies.length > 0
        ? data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length
        : 0;

    channelMetrics[channel] = {
      callbacks: data.callbacks,
      applied: data.applied,
      ignored: data.ignored,
      failures: data.failures,
      avgLatencyMs: Math.round(avgLatency),
    };
  }

  // Get dead-letter queue metrics
  const [deadLetterQueued, deadLetterResolved, deadLetterRetry, deadLetterExpiry, deadLetterManual] = await Promise.all([
    prisma.deadLetterCallback.count({
      where: {
        isResolved: false,
        createdAt: {
          gte: sinceDate,
        },
      },
    }),
    prisma.deadLetterCallback.count({
      where: {
        isResolved: true,
        createdAt: {
          gte: sinceDate,
        },
      },
    }),
    prisma.deadLetterCallback.count({
      where: {
        isResolved: true,
        resolvedBy: "retry_succeeded",
        createdAt: {
          gte: sinceDate,
        },
      },
    }),
    prisma.deadLetterCallback.count({
      where: {
        isResolved: true,
        resolvedBy: "expired",
        createdAt: {
          gte: sinceDate,
        },
      },
    }),
    prisma.deadLetterCallback.count({
      where: {
        isResolved: true,
        resolvedBy: "manual",
        createdAt: {
          gte: sinceDate,
        },
      },
    }),
  ]);

  return {
    windowMs: timeWindowMs,
    since: sinceDate.toISOString(),
    callback: {
      total,
      applied,
      ignored,
      deliveryFailures,
      appliedRate: total > 0 ? applied / total : 0,
      ignoredRate: total > 0 ? ignored / total : 0,
    },
    byChannel: channelMetrics,
    deadLetter: {
      queued: deadLetterQueued,
      resolved: deadLetterResolved,
      resolvedByRetry: deadLetterRetry,
      resolvedByExpiry: deadLetterExpiry,
      resolvedByManual: deadLetterManual,
    },
  };
}
