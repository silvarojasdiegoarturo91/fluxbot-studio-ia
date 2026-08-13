import type { CSSProperties } from "react";
import { Badge, BlockStack, Card, EmptyState, InlineGrid, InlineStack, Layout, Page, Text } from "@shopify/polaris";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import prisma from "../db.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { iaClient } from "../services/ia-backend.server";
import { useIsSpanish } from "../hooks/use-admin-language";
import { AdminPageHeader, AdminSectionCard, AdminStatCard, AdminStatusBadge } from "../components/admin-ui";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticateAdminRequest(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const url = new URL(request.url);
  const source = url.searchParams.get("source");

  if (source === "external") {
    const detail = await iaClient.widgetAdmin
      .conversationDetail(params.id ?? "", shop.domain)
      .then((result) => result?.conversation ?? null)
      .catch(() => null);

    if (!detail) {
      throw new Response("Not found", { status: 404 });
    }

    return {
      source: "external" as const,
      conversation: {
        id: detail.id,
        channel: "EXTERNAL_WIDGET",
        status: "EXTERNAL",
        locale: null,
        visitorId: detail.visitorId,
        sessionId: detail.sessionId,
        customerId: null,
        startedAt: new Date(detail.createdAt),
        lastMessageAt: null,
      },
      messages: detail.messages.map((message) => ({
        id: `ext-${message.role}-${message.createdAt}`,
        role: message.role.toUpperCase(),
        content: message.content,
        confidence: null,
        tokensUsed: null,
        metadata: null,
        createdAt: message.createdAt,
        toolInvocations: [],
      })),
      handoffs: [],
    };
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, shopId: shop.id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { toolInvocations: { orderBy: { createdAt: "asc" } } },
      },
      handoffRequests: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!conversation) {
    throw new Response("Not found", { status: 404 });
  }

  return {
    source: "shopify" as const,
    conversation,
    messages: conversation.messages,
    handoffs: conversation.handoffRequests,
  };
}

const STATUS_TONES: Record<string, "success" | "warning" | "critical" | "attention" | "info"> = {
  ACTIVE: "success",
  RESOLVED: "attention",
  ESCALATED: "warning",
  EXTERNAL: "info",
};

function statusTone(status: string): "success" | "warning" | "critical" | "attention" | "info" {
  return STATUS_TONES[status] ?? "critical";
}

function statusLabel(status: string, isEs: boolean): string {
  const labels: Record<string, { es: string; en: string }> = {
    ACTIVE: { es: "Activa", en: "Active" },
    RESOLVED: { es: "Resuelta", en: "Resolved" },
    ESCALATED: { es: "Escalada", en: "Escalated" },
    ABANDONED: { es: "Abandonada", en: "Abandoned" },
    EXTERNAL: { es: "Widget externo", en: "External" },
  };
  return labels[status]?.[isEs ? "es" : "en"] ?? status;
}

const HANDOFF_TONES: Record<string, "success" | "warning" | "critical" | "info"> = {
  pending: "warning",
  assigned: "info",
  completed: "success",
  resolved: "success",
  cancelled: "critical",
};

function handoffTone(status: string): "success" | "warning" | "critical" | "info" {
  return HANDOFF_TONES[status.toLowerCase()] ?? "info";
}

function handoffStatusLabel(status: string, isEs: boolean): string {
  const labels: Record<string, { es: string; en: string }> = {
    pending: { es: "Pendiente", en: "Pending" },
    assigned: { es: "Asignado", en: "Assigned" },
    completed: { es: "Completado", en: "Completed" },
    resolved: { es: "Resuelto", en: "Resolved" },
    cancelled: { es: "Cancelado", en: "Cancelled" },
  };
  const normalized = status.toLowerCase();
  return labels[normalized]?.[isEs ? "es" : "en"] ?? status;
}

function messageRoleLabel(role: string, isEs: boolean): string {
  const labels: Record<string, { es: string; en: string }> = {
    USER: { es: "Cliente", en: "Customer" },
    ASSISTANT: { es: "Asistente", en: "Assistant" },
    SYSTEM: { es: "Sistema", en: "System" },
    TOOL: { es: "Herramienta", en: "Tool" },
  };
  return labels[role]?.[isEs ? "es" : "en"] ?? role;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

interface ToolView {
  name: string;
  success?: boolean;
  errorMessage?: string | null;
}

interface MessageView {
  id: string;
  role: string;
  content: string;
  confidence: number | null;
  tokensUsed: number | null;
  createdAt: string;
  tools: ToolView[];
}

interface HandoffView {
  id: string;
  reason: string;
  status: string;
  assignedTo: string | null;
  agentNotes: string | null;
  createdAt: string | Date;
  resolvedAt: string | Date | null;
}

function normalizeMessage(message: {
  id: string;
  role: string;
  content: string;
  confidence: number | null;
  tokensUsed: number | null;
  metadata: unknown;
  createdAt: Date | string;
  toolInvocations?: Array<{
    toolName: string;
    success: boolean;
    errorMessage: string | null;
  }>;
}): MessageView {
  const tools: ToolView[] = [];
  const metadata = asRecord(message.metadata);

  const metadataTools = Array.isArray(metadata?.toolsUsed) ? (metadata.toolsUsed as unknown[]) : [];
  for (const item of metadataTools) {
    if (typeof item === "string") {
      tools.push({ name: item });
      continue;
    }
    const record = asRecord(item);
    if (!record) continue;
    const name = typeof record.name === "string" ? record.name : undefined;
    if (!name) continue;
    tools.push({
      name,
      success: typeof record.success === "boolean" ? record.success : undefined,
      errorMessage: typeof record.error === "string" ? record.error : undefined,
    });
  }

  for (const invocation of message.toolInvocations ?? []) {
    tools.push({
      name: invocation.toolName,
      success: invocation.success,
      errorMessage: invocation.errorMessage,
    });
  }

  return {
    id: message.id,
    role: message.role,
    content: message.content,
    confidence: message.confidence,
    tokensUsed: message.tokensUsed,
    createdAt: new Date(message.createdAt).toISOString(),
    tools,
  };
}

function formatDate(value: string | Date | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function MessageBubble({ message, isEs }: { message: MessageView; isEs: boolean }) {
  const isUser = message.role === "USER";
  const isAssistant = message.role === "ASSISTANT";

  const bubbleStyle: CSSProperties = isUser
    ? {
        backgroundColor: "#2C6E63",
        color: "#FFFFFF",
        borderRadius: "12px 12px 2px 12px",
        padding: "10px 14px",
        maxWidth: "min(560px, 82%)",
      }
    : isAssistant
      ? {
          backgroundColor: "#E7E9EB",
          color: "#202223",
          borderRadius: "2px 12px 12px 12px",
          padding: "10px 14px",
          maxWidth: "min(560px, 82%)",
        }
      : {
          backgroundColor: "#F6F6F7",
          color: "#6D7175",
          borderRadius: "999px",
          padding: "6px 14px",
          maxWidth: "min(560px, 82%)",
          border: "1px solid #E1E3E5",
        };

  const metaColor = isUser ? "rgba(255, 255, 255, 0.85)" : "#6D7175";

  return (
    <div
      data-testid={`message-${message.role}`}
      className="fb-admin-message-row"
      style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", width: "100%" }}
    >
      <div className="fb-admin-message-bubble" style={bubbleStyle}>
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center" wrap>
            <span style={{ fontSize: "12px", fontWeight: 600, color: metaColor }}>
              {messageRoleLabel(message.role, isEs)}
            </span>
            <span style={{ fontSize: "12px", color: metaColor }}>
              {formatDate(message.createdAt)}
            </span>
          </InlineStack>
          <Text as="p" variant="bodyMd">
            {message.content}
          </Text>
          {message.tokensUsed != null || message.confidence != null ? (
            <InlineStack gap="300" wrap>
              {message.tokensUsed != null ? (
                <span style={{ fontSize: "12px", color: metaColor }}>
                  {`Tokens: ${message.tokensUsed}`}
                </span>
              ) : null}
              {message.confidence != null ? (
                <span style={{ fontSize: "12px", color: metaColor }}>
                  {isEs
                    ? `Confianza: ${Math.round(message.confidence * 100)}%`
                    : `Confidence: ${Math.round(message.confidence * 100)}%`}
                </span>
              ) : null}
            </InlineStack>
          ) : null}
          {message.tools.length > 0 ? (
            <BlockStack gap="100">
              {message.tools.map((tool, index) => (
                <div
                  key={`${tool.name}-${index}`}
                  className="fb-admin-tool-chip"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "2px 10px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    background: tool.success === false ? "#FFF4F4" : "#F6F6F7",
                    color: tool.success === false ? "#D82C0D" : "#6D7175",
                    border: "1px solid #E1E3E5",
                    width: "fit-content",
                  }}
                >
                  <span>{tool.name}</span>
                  {tool.success !== undefined ? (
                    <span>{tool.success ? "ok" : "error"}</span>
                  ) : null}
                  {tool.errorMessage ? <span>{tool.errorMessage}</span> : null}
                </div>
              ))}
            </BlockStack>
          ) : null}
        </BlockStack>
      </div>
    </div>
  );
}

function HandoffCard({ handoff, isEs }: { handoff: HandoffView; isEs: boolean }) {
  return (
    <Card key={handoff.id}>
      <BlockStack gap="200">
        <InlineStack gap="300" blockAlign="center" wrap>
          <Text as="h3" variant="headingSm">
            {isEs ? "Handoff" : "Handoff"}
          </Text>
          <Badge tone={handoffTone(handoff.status)}>{handoffStatusLabel(handoff.status, isEs)}</Badge>
        </InlineStack>
        <Text as="p" variant="bodyMd">
          {handoff.reason}
        </Text>
        <InlineStack gap="400" wrap>
          <Text as="span" variant="bodySm" tone="subdued">
            {isEs ? "Asignado" : "Assigned"}: {handoff.assignedTo || (isEs ? "Sin asignar" : "Unassigned")}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {isEs ? "Creado" : "Created"}: {formatDate(handoff.createdAt)}
          </Text>
          {handoff.resolvedAt ? (
            <Text as="span" variant="bodySm" tone="subdued">
              {isEs ? "Resuelto" : "Resolved"}: {formatDate(handoff.resolvedAt)}
            </Text>
          ) : null}
        </InlineStack>
        {handoff.agentNotes ? (
          <Text as="p" variant="bodySm">
            {isEs ? "Notas" : "Notes"}: {handoff.agentNotes}
          </Text>
        ) : null}
      </BlockStack>
    </Card>
  );
}

export default function ConversationDetailPage() {
  const isEs = useIsSpanish();
  const { source, conversation, messages, handoffs } = useLoaderData<typeof loader>();

  const normalizedMessages = messages.map(normalizeMessage);

  return (
    <Page fullWidth>
      <AdminPageHeader
        eyebrow={isEs ? "Soporte" : "Support"}
        title={isEs ? "Conversación" : "Conversation"}
        description={isEs ? "Revisa el transcript completo y el contexto de la sesión." : "Review the full transcript and session context."}
        backUrl="/app/conversations"
        backLabel={isEs ? "Conversaciones" : "Conversations"}
        badge={source === "external" ? (
          <AdminStatusBadge tone="info">{isEs ? "Widget externo" : "External widget"}</AdminStatusBadge>
        ) : undefined}
      />
      <Layout>
        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Detalles de la conversación" : "Conversation details"}
            description={isEs ? "Identificadores de sesión y estado operativo." : "Session identifiers and operational status."}
            badge={<AdminStatusBadge tone={statusTone(conversation.status)}>{statusLabel(conversation.status, isEs)}</AdminStatusBadge>}
          >
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
              <AdminStatCard label={isEs ? "Canal" : "Channel"} value={conversation.channel} />
              <AdminStatCard label={isEs ? "Idioma" : "Locale"} value={conversation.locale ?? "-"} />
              <AdminStatCard label={isEs ? "Inicio" : "Started"} value={formatDate(conversation.startedAt)} />
              <AdminStatCard label={isEs ? "Mensajes" : "Messages"} value={normalizedMessages.length} />
            </InlineGrid>
            {conversation.sessionId || conversation.visitorId || conversation.customerId ? (
              <div style={{ marginTop: "16px" }}>
                <BlockStack gap="100">
                  {conversation.sessionId ? (
                    <Text as="span" variant="bodySm" tone="subdued">
                      {isEs ? "Sesión" : "Session"}: {conversation.sessionId}
                    </Text>
                  ) : null}
                  {conversation.visitorId ? (
                    <Text as="span" variant="bodySm" tone="subdued">
                      {isEs ? "Visitante" : "Visitor"}: {conversation.visitorId}
                    </Text>
                  ) : null}
                  {conversation.customerId ? (
                    <Text as="span" variant="bodySm" tone="subdued">
                      {isEs ? "Cliente" : "Customer"}: {conversation.customerId}
                    </Text>
                  ) : null}
                </BlockStack>
              </div>
            ) : null}
          </AdminSectionCard>
        </Layout.Section>

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Transcripción" : "Transcript"}
            description={isEs ? "Conversación completa en orden cronológico." : "Full conversation in chronological order."}
          >
            {normalizedMessages.length === 0 ? (
              <EmptyState heading={isEs ? "Sin mensajes" : "No messages"} image="">
                <Text as="p" variant="bodySm">
                  {isEs
                    ? "Esta conversación todavía no tiene mensajes guardados."
                    : "This conversation does not have any saved messages yet."}
                </Text>
              </EmptyState>
            ) : (
              <div
                className="fb-admin-transcript"
                style={{ display: "flex", flexDirection: "column", gap: "12px" }}
              >
                {normalizedMessages.map((message) => (
                  <MessageBubble key={message.id} message={message} isEs={isEs} />
                ))}
              </div>
            )}
          </AdminSectionCard>
        </Layout.Section>

        {handoffs.length > 0 ? (
          <Layout.Section>
            <AdminSectionCard
              title={isEs ? "Handoffs" : "Handoffs"}
              description={isEs ? "Escalaciones registradas para esta conversación." : "Escalations recorded for this conversation."}
            >
              <BlockStack gap="300">
                {handoffs.map((handoff) => (
                  <HandoffCard key={handoff.id} handoff={handoff} isEs={isEs} />
                ))}
              </BlockStack>
            </AdminSectionCard>
          </Layout.Section>
        ) : null}
      </Layout>
    </Page>
  );
}
