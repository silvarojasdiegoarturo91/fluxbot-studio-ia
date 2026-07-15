/**
 * Event Tracking API Endpoint - Phase 2
 * 
 * Receives behavioral events from the storefront widget.
 * Handles single events and batch uploads.
 * 
 * POST /api/events/track - Track single event
 * POST /api/events/track-batch - Track multiple events
 * GET /api/events/session/:sessionId - Get session events (internal)
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { EventTrackingService } from "../services/event-tracking.server";
import { verifyShopifyProxyRequest } from "../services/shopify-proxy-auth.server";

// Helper to create JSON responses
function json(data: any, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*", // Allow cross-origin from storefront
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Shop-Domain",
      ...init?.headers,
    },
  });
}

interface TrackEventRequest {
  shopDomain: string;
  sessionId: string;
  visitorId?: string;
  customerId?: string;
  eventType: string;
  eventData: Record<string, any>;
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
 * POST /api/events/track
 * Track a single behavioral event
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return json({}, { status: 204 });
    }

    if (!verifyShopifyProxyRequest(request)) {
      return json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as TrackEventRequest;
    const { sessionId, visitorId, customerId, eventType, eventData } = body;
    const url = new URL(request.url);
    const shopDomain =
      url.searchParams.get("shop") ||
      body.shopDomain ||
      request.headers.get("X-Shop-Domain") ||
      request.headers.get("X-Shopify-Shop-Domain") ||
      "";

    // Validate required fields
    if (!shopDomain || !sessionId || !eventType) {
      return json(
        { success: false, error: "Missing required fields: shopDomain, sessionId, eventType" },
        { status: 400 }
      );
    }

    // Find shop ID from domain
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      select: { id: true },
    });

    if (!shop) {
      return json({ success: false, error: "Shop not found" }, { status: 404 });
    }

    // Track event
    const event = await EventTrackingService.trackEvent({
      shopId: shop.id,
      sessionId,
      visitorId,
      customerId,
      eventType,
      eventData: eventData || {},
    });

    return json({
      success: true,
      eventId: event.id,
      timestamp: event.timestamp,
    });
  } catch (error: any) {
    console.error("[Event Tracking Error]", error);
    return json(
      { success: false, error: error.message || "Failed to track event" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/events/session/:sessionId
 * Get events for a session (internal use only)
 */
export async function loader({ params, request }: LoaderFunctionArgs) {
  try {
    const sessionId = params.sessionId;

    if (!sessionId) {
      return json({ success: false, error: "Session ID is required" }, { status: 400 });
    }

    if (!verifyShopifyProxyRequest(request)) {
      return json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Verify shop domain from header or signed proxy URL
    const shopDomain =
      request.headers.get("X-Shop-Domain") ||
      request.headers.get("X-Shopify-Shop-Domain") ||
      new URL(request.url).searchParams.get("shop");
    if (!shopDomain) {
      return json({ success: false, error: "Shop domain header missing" }, { status: 401 });
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      select: { id: true },
    });

    if (!shop) {
      return json({ success: false, error: "Shop not found" }, { status: 404 });
    }

    // Get events
    const events = await EventTrackingService.getSessionEvents(shop.id, sessionId);
    const stats = await EventTrackingService.getSessionStats(shop.id, sessionId);
    const patterns = await EventTrackingService.detectSessionPatterns(shop.id, sessionId);

    return json({
      success: true,
      session: {
        sessionId,
        events,
        stats,
        patterns,
      },
    });
  } catch (error: any) {
    console.error("[Get Session Events Error]", error);
    return json(
      { success: false, error: error.message || "Failed to get session events" },
      { status: 500 }
    );
  }
}
