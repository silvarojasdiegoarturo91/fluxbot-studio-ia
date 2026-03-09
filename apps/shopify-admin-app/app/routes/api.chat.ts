/**
 * Chat API Endpoint
 * Handles messages from the storefront widget
 */

import type { ActionFunctionArgs } from "react-router";
import { cors } from "remix-utils/cors";
import prisma from "../db.server";
import { AIOrchestrationService } from "../services/ai-orchestration.server";

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
  channel?: "WEB_CHAT" | "WHATSAPP" | "INSTAGRAM" | "EMAIL" | "SMS";
  locale?: string;
  metadata?: Record<string, any>;
}

interface ChatResponse {
  success: boolean;
  conversationId: string;
  message?: string;
  confidence?: number;
  requiresEscalation?: boolean;
  escalationReason?: string;
  toolsUsed?: string[];
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
    const { message, conversationId, visitorId, customerId, sessionId, channel = "WEB_CHAT", locale = "en", metadata } = body;

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
      // Create new conversation
      conversation = await prisma.conversation.create({
        data: {
          shopId: shop.id,
          channel,
          visitorId,
          customerId,
          sessionId,
          locale,
          status: "ACTIVE",
          metadata,
        },
        include: { messages: true },
      });
    }

    // Process chat message using AI Orchestration Service
    const chatResponse = await AIOrchestrationService.chat(
      shop.id,
      conversationId || conversation.id,
      message,
      locale || 'en'
    );

    // Return response
    const response: ChatResponse = {
      success: true,
      conversationId: conversation.id,
      message: chatResponse.message,
      confidence: chatResponse.confidence,
      requiresEscalation: chatResponse.requiresEscalation,
      escalationReason: chatResponse.escalationReason,
      toolsUsed: chatResponse.toolsUsed,
      sourceReferences: chatResponse.sourceReferences,
    };

    // Enable CORS for storefront requests
    return await cors(request, json(response));
  } catch (error) {
    console.error("Chat API Error:", error);

    const errorMessage = error instanceof Error ? error.message : "Internal server error";

    return json(
      {
        success: false,
        error: errorMessage,
        conversationId: "",
      },
      { status: 500 }
    );
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
