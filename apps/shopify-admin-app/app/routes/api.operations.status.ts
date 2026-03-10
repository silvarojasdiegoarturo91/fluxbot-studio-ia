/**
 * Operations Status API - Phase 3
 *
 * Provides runtime visibility for omnichannel delivery and proactive scheduler.
 */

import type { LoaderFunctionArgs } from "react-router";
import { getDeliveryStatus } from "../services/delivery.server";
import { getProactiveJobSchedulerStats } from "../jobs/scheduler.server";
import { getOperationsMetrics } from "../services/operations-metrics.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

/**
 * GET /api/operations/status
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const requestUrl = new URL(request.url);
    const windowMinutesRaw = Number(requestUrl.searchParams.get("windowMinutes") || "60");
    const windowMinutes =
      Number.isFinite(windowMinutesRaw) && windowMinutesRaw > 0
        ? Math.min(24 * 60, Math.floor(windowMinutesRaw))
        : 60;

    const operations = await getOperationsMetrics(windowMinutes * 60 * 1000);

    return json({
      success: true,
      delivery: getDeliveryStatus(),
      scheduler: getProactiveJobSchedulerStats(),
      operations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get operations status";
    return json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
