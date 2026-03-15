/**
 * App Proxy — Chat endpoint
 * Route: /apps/fluxbot/chat  (proxied by Shopify via app_proxy config)
 *
 * Shopify signs every proxy request with HMAC-SHA256.
 * We verify the signature, then delegate to the same logic used by api.chat.ts.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { getIAGateway } from "../services/ia-gateway.server";
import { verifyShopifyProxyRequest } from "../services/shopify-proxy-auth.server";

// ── helpers ──────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, X-Shopify-Shop-Domain",
};

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      ...CORS_HEADERS,
      ...init?.headers,
    },
  });
}

function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ── loader (GET — not used, but needs a response) ────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyShopifyProxyRequest(request, { allowUnsignedInDevelopment: true })) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  return json({ ok: true });
}

// ── action (POST — chat message from storefront widget) ──────────────────────

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return preflight();
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!verifyShopifyProxyRequest(request, { allowUnsignedInDevelopment: true })) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      message,
      conversationId,
      visitorId,
      customerId,
      sessionId,
      locale = "en",
      context = {},
    } = body as Record<string, any>;

    const url = new URL(request.url);
    // Shopify injects the shop domain as a query param on proxied requests
    const shopDomain =
      url.searchParams.get("shop") ||
      request.headers.get("X-Shopify-Shop-Domain") ||
      context.shop ||
      context.shopDomain ||
      (typeof body.shop === "string" ? body.shop : "") ||
      (typeof body.shopDomain === "string" ? body.shopDomain : "") ||
      "";

    if (!shopDomain) {
      return json({ success: false, error: "Missing shop identifier" }, { status: 400 });
    }

    if (!message?.trim()) {
      return json({ success: false, error: "Message is required" }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) {
      return json({ success: false, error: "Shop not found" }, { status: 404 });
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!conversation || conversation.shopId !== shop.id) {
        return json({ success: false, error: "Conversation not found" }, { status: 404 });
      }
    } else {
      conversation = await prisma.conversation.create({
        data: {
          shopId: shop.id,
          channel: "WEB_CHAT",
          visitorId: visitorId ?? context.visitorId,
          customerId: customerId ?? context.customerId,
          sessionId: sessionId ?? context.sessionId,
          locale,
          status: "ACTIVE",
        },
        include: { messages: true },
      });
    }

    const gateway = getIAGateway();
    const chatResponse = await gateway.chat(
      {
        message,
        conversationId: conversationId || conversation.id,
        shopId: shop.id,
        locale,
        channel: "WEB_CHAT",
      },
      shopDomain,
    );

    // Persist messages
    await prisma.conversationMessage.create({
      data: { conversationId: conversation.id, role: "USER", content: message },
    });
    if (chatResponse.message) {
      await prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: chatResponse.message,
          confidence: chatResponse.confidence,
          metadata: {
            toolsUsed: chatResponse.toolsUsed,
            sourceReferences: chatResponse.sourceReferences,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return json({
      success: true,
      conversationId: conversation.id,
      message: chatResponse.message,
      confidence: chatResponse.confidence,
      requiresEscalation: chatResponse.requiresEscalation,
      actions: chatResponse.actions,
      // Products surfaced via metadata so the widget's existing metadata.products handler works
      metadata: {
        products: chatResponse.actions
          ?.filter((a: any) => a.type === "product_recommend")
          .flatMap((a: any) => a.products ?? []) ?? [],
      },
      sourceReferences: chatResponse.sourceReferences,
    });
  } catch (error) {
    console.error("[ProxyChat] Error:", error);
    return json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
