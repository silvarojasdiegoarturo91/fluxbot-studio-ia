/**
 * App Proxy — Events endpoint
 * Route: /apps/fluxbot/events  (proxied by Shopify via app_proxy config)
 *
 * Receives behavior events from the storefront widget (sendBeacon / fetch).
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { verifyShopifyProxyRequest } from "../services/shopify-proxy-auth.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, X-Shopify-Shop-Domain",
};

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    ...init,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...init?.headers },
  });
}

function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyShopifyProxyRequest(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  return json({ ok: true });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return preflight();
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!verifyShopifyProxyRequest(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const shopDomain =
      url.searchParams.get("shop") ||
      request.headers.get("X-Shopify-Shop-Domain") ||
      "";

    if (!shopDomain) {
      return json({ success: false, error: "Missing shop identifier" }, { status: 400 });
    }

    const body = await request.json();
    const {
      event,
      conversationId,
      sessionId,
      visitorId,
      customerId,
      data: eventData = {},
      timestamp,
    } = body as Record<string, any>;

    if (!event) {
      return json({ success: false, error: "Event type is required" }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) {
      return json({ success: false, error: "Shop not found" }, { status: 404 });
    }

    // Record behavior event
    if (sessionId) {
      await prisma.behaviorEvent.create({
        data: {
          shopId: shop.id,
          sessionId,
          visitorId,
          customerId,
          eventType: String(event).toUpperCase(),
          eventData: { ...eventData, rawEvent: event, timestamp },
        },
      });
    }

    // Record as conversation event if we have a conversationId
    if (conversationId) {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (conv && conv.shopId === shop.id) {
        await prisma.conversationEvent.create({
          data: {
            conversationId,
            eventType: String(event),
            eventData: { ...eventData, timestamp },
          },
        });
      }
    }

    return json({ success: true });
  } catch (error) {
    console.error("[ProxyEvents] Error:", error);
    return json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
