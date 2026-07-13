import prisma from "../db.server";
import type { Message } from "./ai-orchestration.server";
import type { MerchantAdminConfig } from "./admin-config.server";

export interface ChatRequestContext {
  shop: {
    id: string;
    domain?: string;
    name?: string;
  };
  store: {
    locale?: string;
    channel?: string;
  };
  widget: {
    botName?: string;
    botGoal?: string;
    welcomeMessage?: string;
    launcherLabel?: string;
    launcherPosition?: string;
    primaryColor?: string;
  };
  conversation: {
    history: Message[];
  previousSessions: PreviousConversationContext[];
  };
  catalog?: {
    source: "productProjection" | "search" | "none";
    products: Array<Record<string, unknown>>;
  };
  diagnostics?: {
    traceId?: string;
    route?: string;
  };
}

export interface PreviousConversationContext {
  conversationId: string;
  sessionId?: string | null;
  locale?: string | null;
  lastMessages: Message[];
}

function normalizeMessageRole(role: unknown): Message["role"] {
  return role === "ASSISTANT" ? "ASSISTANT" : "USER";
}

function summarizeConversationMessages(messages: Array<{ role: unknown; content: string }>): Message[] {
  return messages.map((message) => ({
    role: normalizeMessageRole(message.role),
    content: message.content,
  }));
}

export async function loadPreviousConversationContexts(params: {
  shopId: string;
  conversationId: string;
  visitorId?: string | null;
  customerId?: string | null;
  sessionId?: string | null;
  limit?: number;
}): Promise<PreviousConversationContext[]> {
  const filters: Array<Record<string, string>> = [];
  if (params.customerId) filters.push({ customerId: params.customerId });
  if (params.visitorId) filters.push({ visitorId: params.visitorId });
  if (params.sessionId) filters.push({ sessionId: params.sessionId });

  if (filters.length === 0) {
    return [];
  }

  const candidates = await prisma.conversation.findMany({
    where: {
      shopId: params.shopId,
      id: { not: params.conversationId },
      OR: filters,
    },
    orderBy: { lastMessageAt: "desc" },
    take: params.limit ?? 3,
    select: {
      id: true,
      sessionId: true,
      locale: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 4,
        select: {
          role: true,
          content: true,
        },
      },
    },
  });

  return candidates.map((conversation) => ({
    conversationId: conversation.id,
    sessionId: conversation.sessionId,
    locale: conversation.locale,
    lastMessages: summarizeConversationMessages([...conversation.messages].reverse()),
  }));
}

export async function buildChatRequestContext(params: {
  shopId: string;
  shopDomain?: string;
  shopName?: string;
  locale?: string;
  channel?: string;
  adminConfig: MerchantAdminConfig;
  conversationHistory: Message[];
  previousSessions?: PreviousConversationContext[];
  catalog?: {
    source: "productProjection" | "search" | "none";
    products: Array<Record<string, unknown>>;
  };
  diagnostics?: {
    traceId?: string;
    route?: string;
  };
}): Promise<ChatRequestContext> {
  return {
    shop: {
      id: params.shopId,
      domain: params.shopDomain,
      name: params.shopName,
    },
    store: {
      locale: params.locale,
      channel: params.channel,
    },
    widget: {
      botName: params.adminConfig.botName,
      botGoal: params.adminConfig.botGoal,
      welcomeMessage: params.adminConfig.welcomeMessage,
      launcherLabel: params.adminConfig.widgetBranding.launcherLabel,
      launcherPosition: params.adminConfig.widgetBranding.launcherPosition,
      primaryColor: params.adminConfig.widgetBranding.primaryColor,
    },
    conversation: {
      history: params.conversationHistory,
      previousSessions: params.previousSessions ?? [],
    },
    catalog: params.catalog,
    diagnostics: params.diagnostics,
  };
}
