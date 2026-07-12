/**
 * Chat API Endpoint
 * Handles messages from the storefront widget
 */

import type { ActionFunctionArgs } from "react-router";
import { cors } from "remix-utils/cors";
import prisma from "../db.server";
import { getIAGateway } from "../services/ia-gateway.server";
import { getMerchantAdminConfig } from "../services/admin-config.server";
import { resolveEffectiveLocale } from "../services/chat-locale.server";
import {
  detectBasicIntent,
  isSimpleMessage,
  safeFallbackMessage,
  safeGreetingMessage,
  sanitizeAssistantMessage,
} from "../services/chat-safety.server";

// Helper to create JSON responses
function json(data: any, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

interface ChatRequest {
  message: string;
  conversationId?: string;
  visitorId?: string;
  customerId?: string;
  sessionId?: string;
  channel?:
    | "WEB_CHAT"
    | "WHATSAPP"
    | "INSTAGRAM"
    | "EMAIL"
    | "SMS"
    | "SHOPIFY_PROXY"
    | "EXTERNAL_WIDGET";
  locale?: string;
  metadata?: Record<string, any>;
  context?: {
    locale?: string;
  };
}

interface ChatResponse {
  success: boolean;
  conversationId: string;
  message?: string;
  confidence?: number;
  requiresEscalation?: boolean;
  escalationReason?: string;
  toolsUsed?: string[];
  actions?: Array<Record<string, unknown>>;
  sourceReferences?: Array<{
    documentId: string;
    chunkId: string;
    title: string;
    relevance: number;
    url?: string;
  }>;
  error?: string;
}

/**
 * POST /api/chat
 * Process chat messages from storefront widget
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    // Parse request body
    const body = (await request.json()) as ChatRequest;
    const {
      message,
      conversationId,
      visitorId,
      customerId,
      sessionId,
      channel = "WEB_CHAT",
      locale,
      metadata,
      context,
    } = body;

    // Validate shop from request headers or body
    const shopDomain = request.headers.get("X-Shop-Domain") || metadata?.shop;
    if (!shopDomain) {
      return json({ success: false, error: "Missing shop identifier" }, { status: 400 });
    }

    // Find shop
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
    });

    if (!shop) {
      return json({ success: false, error: "Shop not found" }, { status: 404 });
    }
    // Validate message
    if (!message || message.trim().length === 0) {
      return json({ success: false, error: "Message is required" }, { status: 400 });
    }
    const adminConfig = await getMerchantAdminConfig(shop.id);

    const basicIntent = detectBasicIntent(message);
    if (basicIntent === "greeting" || (basicIntent === "unknown" && isSimpleMessage(message))) {
      const response: ChatResponse = {
        success: true,
        conversationId: conversationId || `conv-${Date.now()}`,
        message: safeGreetingMessage(),
        confidence: 0.99,
        requiresEscalation: false,
        toolsUsed: [],
        actions: [],
        sourceReferences: [],
      };
      return await cors(request, json(response));
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
      const initialLocale = resolveEffectiveLocale({
        primaryBotLanguage: adminConfig.primaryBotLanguage,
        supportedLanguages: adminConfig.supportedLanguages,
        requestLocale: locale,
        storefrontLocale: context?.locale,
      });
      // Create new conversation
      conversation = await prisma.conversation.create({
        data: {
          shopId: shop.id,
          channel: channel as any,
          visitorId,
          customerId,
          sessionId,
          locale: initialLocale,
          status: "ACTIVE",
          metadata,
        },
        include: { messages: true },
      });
    }

    const effectiveLocale = resolveEffectiveLocale({
      primaryBotLanguage: adminConfig.primaryBotLanguage,
      supportedLanguages: adminConfig.supportedLanguages,
      requestLocale: locale,
      storefrontLocale: context?.locale,
      conversationLocale: conversation.locale,
    });

    if (conversation.locale !== effectiveLocale) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { locale: effectiveLocale },
      });
    }

    // Process chat message via IAGateway (local or remote depending on IA_EXECUTION_MODE)
    const gateway = getIAGateway();
    const chatResponse = await gateway.chat(
      {
        message,
        conversationId: conversationId || conversation.id,
        shopId: shop.id,
        locale: effectiveLocale,
        channel,
      },
      shopDomain,
    );

    // Return response
    const response: ChatResponse = {
      success: true,
      conversationId: conversation.id,
      message: sanitizeAssistantMessage(chatResponse.message || "", basicIntent),
      confidence: chatResponse.confidence,
      requiresEscalation: chatResponse.requiresEscalation,
      escalationReason: chatResponse.escalationReason,
      toolsUsed: chatResponse.toolsUsed,
      actions: chatResponse.actions,
      sourceReferences: chatResponse.sourceReferences,
    };

    // Enable CORS for storefront requests
    return await cors(request, json(response));
  } catch (error) {
    console.error("Chat API Error:", error);

    const response: ChatResponse = {
      success: true,
      conversationId: `conv-${Date.now()}`,
      message: safeFallbackMessage("unknown"),
      confidence: 0.35,
      requiresEscalation: false,
      toolsUsed: [],
      actions: [],
      sourceReferences: [],
    };
    return await cors(request, json(response));
  }
}

/**
 * GET /api/chat?conversationId=xxx
 * Retrieve conversation history
 */
export async function loader({ request }: ActionFunctionArgs) {
  try {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");

    if (!conversationId) {
      return json({ success: false, error: "conversationId required" }, { status: 400 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            toolInvocations: true,
          },
        },
        customerIdentity: true,
      },
    });

    if (!conversation) {
      return json({ success: false, error: "Conversation not found" }, { status: 404 });
    }

    return await cors(
      request,
      json({
        success: true,
        conversation: {
          id: conversation.id,
          status: conversation.status,
          channel: conversation.channel,
          startedAt: conversation.startedAt,
          messages: conversation.messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            confidence: msg.confidence,
            createdAt: msg.createdAt,
            toolsUsed: msg.toolInvocations?.map((t: any) => t.toolName) || [],
          })),
        },
      })
    );
  } catch (error) {
    console.error("Chat history retrieval error:", error);
    return json({ success: false, error: "Failed to retrieve conversation" }, { status: 500 });
  }
}
