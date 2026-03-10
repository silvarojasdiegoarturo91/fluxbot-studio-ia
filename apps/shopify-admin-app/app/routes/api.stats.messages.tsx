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
import prisma from "../db.server";
import { ProactiveMessagingService } from "../services/proactive-messaging.server";

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
  const url = new URL(request.url);
  const shopDomain =
    url.searchParams.get("shopDomain") || request.headers.get("X-Shop-Domain");
  const timeWindowMinutes = parseInt(url.searchParams.get("timeWindowMinutes") || "60");

  if (!shopDomain) {
    return json({ error: "shopDomain required" }, { status: 400 });
  }

  try {
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      select: { id: true },
    });

    if (!shop) {
      return json({ error: "Shop not found" }, { status: 404 });
    }

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
    console.error(`[API] Error retrieving message stats for shop: ${shopDomain}`, error);
    return await cors(
      request,
      json({ error: "Failed to retrieve statistics" }, { status: 500 })
    );
  }
}
