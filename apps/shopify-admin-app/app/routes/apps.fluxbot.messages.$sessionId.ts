/**
 * App Proxy — Proactive messages endpoint
 * Route: /apps/fluxbot/messages/:sessionId  (proxied by Shopify via app_proxy config)
 *
 * GET  — Returns pending WEB_CHAT proactive messages for a session.
 * PATCH — Marks a message as delivered or records an interaction.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { ProactiveMessagingService } from "../services/proactive-messaging.server";

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

function normalizeInteraction(value: unknown) {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();
  if (normalized === "DELIVERED") return "DELIVERED" as const;
  if (normalized === "DISMISSED") return "REJECTED" as const;
  if (
    normalized === "ACCEPTED" ||
    normalized === "REJECTED" ||
    normalized === "CLICKED" ||
    normalized === "EXPIRED"
  ) {
    return normalized;
  }

  return null;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (!verifyShopifyProxy(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = params.sessionId;
  if (!sessionId) {
    return json({ success: false, error: "sessionId is required" }, { status: 400 });
  }

  try {
    const messages = await ProactiveMessagingService.getSessionMessages(sessionId);

    // Filter to only WEB_CHAT channel messages that are queued (pending delivery)
    const pending = messages.filter(
      (message) => message.channel === "WEB_CHAT" && message.status === "QUEUED",
    );

    return json({ success: true, messages: pending });
  } catch (error) {
    console.error("[ProxyMessages] GET error:", error);
    return json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (!verifyShopifyProxy(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method !== "PATCH") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const sessionId = params.sessionId;
  if (!sessionId) {
    return json({ success: false, error: "sessionId is required" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const messageId = typeof body.messageId === "string" ? body.messageId : "";

    if (!messageId) {
      return json({ success: false, error: "messageId is required" }, { status: 400 });
    }

    const interaction = normalizeInteraction(body.interaction);

    if (body.interaction != null && !interaction) {
      return json({ success: false, error: "Invalid interaction" }, { status: 400 });
    }

    if (interaction && interaction !== "DELIVERED") {
      await ProactiveMessagingService.recordInteraction(
        messageId,
        interaction,
      );
    } else {
      await ProactiveMessagingService.markAsDelivered(messageId);
    }

    return json({ success: true });
  } catch (error) {
    console.error("[ProxyMessages] PATCH error:", error);
    return json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
