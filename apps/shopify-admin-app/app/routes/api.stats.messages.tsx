/**
 * API Routes: Proactive Message Statistics
 *
 * Endpoints for analytics and performance data:
 * - Overall message stats (delivery rate, conversion rate)
 * - Stats by channel
 * - Top performing triggers
 */

import type { LoaderFunctionArgs } from "react-router";
import { cors } from "remix-utils/cors";
import { ProactiveMessagingService } from "../services/proactive-messaging.server";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { ensureShopForSession } from "../services/shop-context.server";

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
 * GET /api/stats/messages
 * Get overall message statistics for a shop
 *
 * Query params:
 * - shopDomain: string (required)
 * - timeWindowMinutes?: number (default: 60)
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { session } = await authenticateAdminRequest(request);
    const shop = await ensureShopForSession(session);

    if (!shop) {
      return json({ error: "Shop not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const timeWindowMinutes = parseInt(url.searchParams.get("timeWindowMinutes") || "60");
    const timeWindowMs = timeWindowMinutes * 60 * 1000;

    // Get overall stats
    const stats = await ProactiveMessagingService.getMessageStats(shop.id, timeWindowMs);

    // Get channel stats
    const channelStats = await ProactiveMessagingService.getChannelStats(shop.id, timeWindowMs);
    const channelBreakdown = Array.from(channelStats.values());

    // Get top triggers
    const topTriggers = await ProactiveMessagingService.getTopTriggers(
      shop.id,
      10,
      timeWindowMs
    );

    return await cors(
      request,
      json({
        ok: true,
        data: {
          overall: stats,
          channels: channelBreakdown,
          topTriggers,
          timeWindowMinutes,
          generatedAt: new Date().toISOString(),
        },
      })
    );
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    console.error("[API] Error retrieving message stats", error);
    return await cors(
      request,
      json({ error: "Failed to retrieve statistics" }, { status: 500 })
    );
  }
}
