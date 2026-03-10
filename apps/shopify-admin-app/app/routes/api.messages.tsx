/**
 * API Routes: Proactive Messaging
 *
 * Endpoints for:
 * - Retrieving session messages
 * - Recording message interactions
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
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

interface InteractionRequest {
  shopDomain?: string;
  messageId?: string;
  interaction?: "CLICKED" | "DISMISSED" | "ACCEPTED" | "REJECTED" | "EXPIRED";
}

/**
 * GET /api/messages
 * Retrieve all messages for a session
 *
 * Query params:
 * - sessionId: string (required)
 * - shopDomain: string (required)
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return json({ error: "sessionId required" }, { status: 400 });
  }

  const shopDomain =
    url.searchParams.get("shopDomain") || request.headers.get("X-Shop-Domain");
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

    const messages = await ProactiveMessagingService.getSessionMessages(sessionId);

    return await cors(
      request,
      json({
        ok: true,
        data: messages,
        count: messages.length,
      })
    );
  } catch (error) {
    console.error(`[API] Error retrieving session messages: ${sessionId}`, error);
    return await cors(
      request,
      json({ error: "Failed to retrieve messages" }, { status: 500 })
    );
  }
}

/**
 * PATCH /api/messages
 * Record interaction with a message (click, dismiss, accept, reject)
 *
 * Body:
 * {
 *   "shopDomain": string,
 *   "messageId": string,
 *   "interaction": "CLICKED" | "DISMISSED" | "ACCEPTED" | "REJECTED" | "EXPIRED",
 * }
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "PATCH" && request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = (await request.json()) as InteractionRequest;
    const url = new URL(request.url);
    const shopDomain = body.shopDomain || request.headers.get("X-Shop-Domain");
    const messageId = body.messageId || url.searchParams.get("messageId");
    const interaction = body.interaction;

    if (!shopDomain) {
      return json({ error: "shopDomain required" }, { status: 400 });
    }

    if (!messageId) {
      return json({ error: "messageId required" }, { status: 400 });
    }

    if (!interaction) {
      return json({ error: "interaction required" }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      select: { id: true },
    });

    if (!shop) {
      return json({ error: "Shop not found" }, { status: 404 });
    }

    // Validate interaction type
    const validInteractions = ["CLICKED", "DISMISSED", "ACCEPTED", "REJECTED", "EXPIRED"];
    if (!validInteractions.includes(interaction)) {
      return json({ error: "Invalid interaction type" }, { status: 400 });
    }

    // Record the interaction
    await ProactiveMessagingService.recordInteraction(messageId, interaction);

    return await cors(
      request,
      json({
        ok: true,
        messageId,
        interaction,
      })
    );
  } catch (error) {
    console.error("[API] Error recording message interaction", error);
    return await cors(
      request,
      json({ error: "Failed to record interaction" }, { status: 500 })
    );
  }
}
