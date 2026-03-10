/**
 * Event Batch Tracking API - Phase 2
 * 
 * POST /api/events/track-batch
 * Receives multiple events at once for performance optimization.
 */

import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { EventTrackingService, type TrackEventParams } from "../services/event-tracking.server";

// Helper to create JSON responses
function json(data: any, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Shop-Domain",
      ...init?.headers,
    },
  });
}

interface TrackBatchRequest {
  shopDomain: string;
  events: Array<{
    sessionId: string;
    visitorId?: string;
    customerId?: string;
    eventType: string;
    eventData: Record<string, any>;
  }>;
}

/**
 * POST /api/events/track-batch
 * Track multiple events at once
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return json({}, { status: 204 });
    }

    const body = (await request.json()) as TrackBatchRequest;
    const { shopDomain, events } = body;

    // Validate
    if (!shopDomain || !events || !Array.isArray(events) || events.length === 0) {
      return json(
        { success: false, error: "Invalid request: shopDomain and events array required" },
        { status: 400 }
      );
    }

    if (events.length > 100) {
      return json(
        { success: false, error: "Too many events in batch (max 100)" },
        { status: 400 }
      );
    }

    // Find shop
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      select: { id: true },
    });

    if (!shop) {
      return json({ success: false, error: "Shop not found" }, { status: 404 });
    }

    // Prepare events for batch insert
    const eventsToTrack: TrackEventParams[] = events.map((e) => ({
      shopId: shop.id,
      sessionId: e.sessionId,
      visitorId: e.visitorId,
      customerId: e.customerId,
      eventType: e.eventType,
      eventData: e.eventData || {},
    }));

    // Track batch
    const count = await EventTrackingService.trackEventsBatch(eventsToTrack);

    return json({
      success: true,
      eventsTracked: count,
    });
  } catch (error: any) {
    console.error("[Batch Event Tracking Error]", error);
    return json(
      { success: false, error: error.message || "Failed to track events batch" },
      { status: 500 }
    );
  }
}
