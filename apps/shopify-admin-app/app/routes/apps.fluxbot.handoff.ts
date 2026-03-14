/**
 * App Proxy — Human handoff endpoint
 * Route: /apps/fluxbot/handoff  (proxied by Shopify via app_proxy config)
 *
 * POST — Creates a handoff request from the storefront widget.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { createHmac, timingSafeEqual } from "crypto";
import prisma from "../db.server";
import { HandoffService } from "../services/handoff.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

function verifyShopifyProxy(request: Request): boolean {
  const url = new URL(request.url);
  const hmac = url.searchParams.get("hmac");
  if (!hmac) return false;

  const params = new URLSearchParams(url.searchParams);
  params.delete("hmac");

  const message = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const secret = process.env.SHOPIFY_API_SECRET || "";
  const expected = createHmac("sha256", secret).update(message).digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(hmac, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyShopifyProxy(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  return json({ ok: true });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!verifyShopifyProxy(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!HandoffService.isEnabled()) {
    return json({ success: false, error: "Human handoff feature is disabled" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const url = new URL(request.url);
    const shopFromBody =
      typeof body.shop === "string"
        ? body.shop
        : typeof body.shopDomain === "string"
          ? body.shopDomain
          : "";
    const shopDomain =
      url.searchParams.get("shop") ||
      request.headers.get("X-Shopify-Shop-Domain") ||
      shopFromBody ||
      "";

    if (!shopDomain) {
      return json({ success: false, error: "Missing shop identifier" }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      select: { id: true },
    });

    if (!shop) {
      return json({ success: false, error: "Shop not found" }, { status: 404 });
    }

    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!conversationId) {
      return json({ success: false, error: "conversationId is required" }, { status: 400 });
    }

    if (!reason) {
      return json({ success: false, error: "reason is required" }, { status: 400 });
    }

    const context =
      body.context && typeof body.context === "object"
        ? { ...(body.context as Record<string, unknown>) }
        : {};

    if (typeof body.sessionId === "string") {
      context.sessionId = body.sessionId;
    }

    if (typeof body.visitorId === "string") {
      context.visitorId = body.visitorId;
    }

    if (typeof body.customerId === "string") {
      context.customerId = body.customerId;
    }

    context.source = "widget";

    const created = await HandoffService.create({
      shopId: shop.id,
      conversationId,
      reason,
      context,
    });

    return json({ success: true, data: created });
  } catch (error) {
    console.error("[ProxyHandoff] POST error:", error);
    return json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
