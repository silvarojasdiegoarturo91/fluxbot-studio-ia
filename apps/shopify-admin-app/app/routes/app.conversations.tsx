import {
  Page,
  Layout,
  Text,
  Badge,
  InlineGrid,
  DataTable,
  EmptyState,
  InlineStack,
  Button,
  Banner,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import prisma from "../db.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { getMerchantAdminConfig } from "../services/admin-config.server";
import { iaClient } from "../services/ia-backend.server";
import { useIsSpanish } from "../hooks/use-admin-language";
import { AdminPageHeader, AdminSectionCard, AdminStatCard, AdminStatusBadge } from "../components/admin-ui";

interface ConversationsActionData {
  ok: boolean;
  message?: string;
  error?: string;
}

const STATUS_FILTERS = ["ALL", "ACTIVE", "ESCALATED", "RESOLVED", "ABANDONED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_LABELS: Record<string, { en: string; es: string }> = {
  ALL: { en: "All", es: "Todas" },
  ACTIVE: { en: "Active", es: "Activas" },
  ESCALATED: { en: "Escalated", es: "Escaladas" },
  RESOLVED: { en: "Resolved", es: "Resueltas" },
  ABANDONED: { en: "Abandoned", es: "Abandonadas" },
  EXTERNAL: { en: "External", es: "Externa" },
};

function shorten(text: string, max = 90): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function statusTone(status: string): "success" | "warning" | "critical" | "attention" | "info" {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "RESOLVED":
      return "attention";
    case "ESCALATED":
      return "warning";
    case "EXTERNAL":
      return "info";
    default:
      return "critical";
  }
}

function statusLabel(status: string, isEs: boolean): string {
  return STATUS_LABELS[status]?.[isEs ? "es" : "en"] ?? status;
}

interface ConversationRow {
  id: string;
  source: "shopify" | "external";
  channel: string;
  status: string;
  locale: string | null;
  sessionId: string | null;
  startedAt: string | Date;
  lastMessageAt: string | Date | null;
  lastMessagePreview: string | null;
  messageCount: number;
  handoffCount: number;
}

interface ExternalConversationRow {
  id: string;
  source: "external";
  channel: string;
  status: string;
  locale: null;
  sessionId: string | null;
  startedAt: string | Date;
  lastMessageAt: null;
  lastMessagePreview: null;
  messageCount: number;
  handoffCount: number;
}

function normalizeShopifyConversation(conversation: {
  id: string;
  channel: string;
  status: string;
  locale: string | null;
  sessionId: string | null;
  startedAt: string | Date;
  lastMessageAt: string | Date | null;
  messages?: Array<{ content: string }>;
  _count?: { messages?: number; handoffRequests?: number };
}): ConversationRow {
  return {
    id: conversation.id,
    source: "shopify",
    channel: conversation.channel,
    status: conversation.status,
    locale: conversation.locale,
    sessionId: conversation.sessionId,
    startedAt: conversation.startedAt,
    lastMessageAt: conversation.lastMessageAt,
    lastMessagePreview: conversation.messages?.[0]?.content ?? null,
    messageCount: conversation._count?.messages ?? 0,
    handoffCount: conversation._count?.handoffRequests ?? 0,
  };
}

function normalizeExternalConversation(conversation: {
  id: string;
  sessionId: string | null;
  createdAt: string;
}): ExternalConversationRow {
  return {
    id: conversation.id,
    source: "external",
    channel: "EXTERNAL_WIDGET",
    status: "EXTERNAL",
    locale: null,
    sessionId: conversation.sessionId,
    startedAt: conversation.createdAt,
    lastMessageAt: null,
    lastMessagePreview: null,
    messageCount: 0,
    handoffCount: 0,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticateAdminRequest(request);
  const url = new URL(request.url);

  const statusFilterRaw = String(url.searchParams.get("status") || "ALL").toUpperCase();
  const statusFilter: StatusFilter = STATUS_FILTERS.includes(statusFilterRaw as StatusFilter)
    ? (statusFilterRaw as StatusFilter)
    : "ALL";

  const limitRaw = Number(url.searchParams.get("limit") || "25");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : 25;

  const shop = await ensureShopForSession(session);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const whereConversation = {
    shopId: shop.id,
    ...(statusFilter === "ALL" ? {} : { status: statusFilter }),
  };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [conversations, activeNow, escalated7d, resolved7d, total7d, pendingHandoffs, externalConversations] = await Promise.all([
    prisma.conversation.findMany({
      where: whereConversation,
      orderBy: { startedAt: "desc" },
      take: limit,
      select: {
        id: true,
        channel: true,
        status: true,
        locale: true,
        sessionId: true,
        startedAt: true,
        lastMessageAt: true,
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            content: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            messages: true,
            handoffRequests: true,
          },
        },
      },
    }),
    prisma.conversation.count({ where: { shopId: shop.id, status: "ACTIVE" } }),
    prisma.conversation.count({
      where: {
        shopId: shop.id,
        status: "ESCALATED",
        startedAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.conversation.count({
      where: {
        shopId: shop.id,
        status: "RESOLVED",
        startedAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.conversation.count({
      where: {
        shopId: shop.id,
        startedAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.handoffRequest.findMany({
      where: {
        shopId: shop.id,
        status: { in: ["pending", "assigned", "PENDING", "ASSIGNED"] },
      },
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
        assignedTo: true,
        conversationId: true,
      },
    }),
    iaClient.widgetAdmin
      .conversationRecent(shop.id, shop.domain)
      .then((result) => result?.conversations ?? [])
      .catch((error) => {
        console.warn("[Conversations] Failed to fetch external-widget conversations", error);
        return [];
      }),
  ]);

  const externalRows: ExternalConversationRow[] = externalConversations.map(normalizeExternalConversation);

  return {
    shop,
    statusFilter,
    limit,
    summary: {
      activeNow,
      escalated7d,
      resolved7d,
      total7d,
      openHandoffs: pendingHandoffs.length,
    },
    conversations,
    externalConversations: externalRows,
    pendingHandoffs,
  };
}

export async function action({ request }: ActionFunctionArgs): Promise<ConversationsActionData> {
  if (request.method !== "POST") {
    return { ok: false, error: "Method not allowed" };
  }

  const { session } = await authenticateAdminRequest(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    return { ok: false, error: "Shop not found" };
  }

  const adminConfig = await getMerchantAdminConfig(shop.id);
  const isEs = adminConfig.adminLanguage === "es";

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "resolve_handoff") {
    const conversationSource = String(formData.get("conversationSource") || "");
    if (conversationSource === "external") {
      return {
        ok: false,
        error: isEs
          ? "Los handoffs solo aplican a conversaciones de Shopify."
          : "Handoffs only apply to Shopify conversations.",
      };
    }

    const handoffId = String(formData.get("handoffId") || "").trim();
    if (!handoffId) {
      return { ok: false, error: isEs ? "handoffId es obligatorio" : "handoffId is required" };
    }

    const result = await prisma.handoffRequest.updateMany({
      where: {
        id: handoffId,
        shopId: shop.id,
        status: { in: ["pending", "assigned", "PENDING", "ASSIGNED"] },
      },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return { ok: false, error: isEs ? "Handoff no encontrado o ya resuelto" : "Handoff not found or already resolved" };
    }

    return { ok: true, message: isEs ? "Handoff marcado como resuelto." : "Handoff marked as resolved." };
  }

  return { ok: false, error: isEs ? "Acción no soportada" : "Unsupported action" };
}

export default function ConversationsPage() {
  const location = useLocation();
  const isEs = useIsSpanish();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { statusFilter, summary, conversations, externalConversations, pendingHandoffs } = useLoaderData<typeof loader>();
  const backToDashboardUrl = `/app${location.search || ""}`;
  // Preserve Shopify embedded-session query params (shop, host, embedded) so
  // Polaris Button url navigation does not drop the authenticated context and
  // bounce to the auth login page. Uses URLSearchParams so an existing query
  // in `path` (e.g. "?source=external") merges with location.search cleanly.
  const withEmbeddedQuery = (path: string) => {
    const [basePath, existingQuery = ""] = path.split("?");
    const params = new URLSearchParams(existingQuery);
    const locationParams = new URLSearchParams(location.search);
    for (const [key, value] of locationParams.entries()) {
      params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const withStatusFilter = (nextFilter: StatusFilter) => {
    const params = new URLSearchParams(location.search);
    if (nextFilter === "ALL") {
      params.delete("status");
    } else {
      params.set("status", nextFilter);
    }

    const queryString = params.toString();
    return `/app/conversations${queryString ? `?${queryString}` : ""}`;
  };

  const isSubmitting = navigation.state === "submitting";

  const rows: ConversationRow[] = [
    ...conversations.map(normalizeShopifyConversation),
    ...(externalConversations ?? []),
  ];

  const conversationRows = rows.map((conversation) => [
    new Date(conversation.startedAt).toLocaleString(),
    <Badge key={`status-${conversation.id}`} tone={statusTone(conversation.status)}>{statusLabel(conversation.status, isEs)}</Badge>,
    conversation.source === "external"
      ? <Badge key={`source-${conversation.id}`} tone="info">{isEs ? "Widget externo" : "External"}</Badge>
      : <Badge key={`source-${conversation.id}`} tone="success">{isEs ? "Shopify" : "Shopify"}</Badge>,
    conversation.channel,
    conversation.locale ?? "-",
    String(conversation.messageCount),
    conversation.lastMessagePreview ? shorten(conversation.lastMessagePreview) : (isEs ? "Sin mensajes" : "No messages"),
    conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleString() : "-",
    conversation.handoffCount > 0
      ? <Badge key={`handoff-${conversation.id}`} tone="warning">{`${conversation.handoffCount} ${isEs ? "handoff" : "handoff"}`}</Badge>
      : <Badge key={`handoff-${conversation.id}`} tone="success">{isEs ? "Sin handoff" : "No handoff"}</Badge>,
    <Button
      key={`view-${conversation.id}`}
      variant="plain"
    >
      {/* Polaris 12.10 types children as string; react-router Link (Element) is
          fine at runtime and performs SPA navigation inside the embedded iframe. */}
      {(
        <Link
          to={{
            pathname: `/app/conversations/${conversation.id}`,
            search: conversation.source === "external" ? "?source=external" : "",
          }}
        >
          {isEs ? "Ver" : "View"}
        </Link>
      ) as unknown as string}
    </Button>,
  ]);

  const handoffRows = pendingHandoffs.map((handoff) => [
    handoff.conversationId,
    handoff.reason,
    handoff.assignedTo || (isEs ? "Sin asignar" : "Unassigned"),
    handoff.status,
    new Date(handoff.createdAt).toLocaleString(),
    <Form method="post" key={`resolve-${handoff.id}`}>
      <input type="hidden" name="intent" value="resolve_handoff" />
      <input type="hidden" name="handoffId" value={handoff.id} />
      <Button submit loading={isSubmitting}>{isEs ? "Resolver" : "Resolve"}</Button>
    </Form>,
  ]);

  return (
    <Page fullWidth>
      <AdminPageHeader
        eyebrow={isEs ? "Soporte" : "Support"}
        title={isEs ? "Conversaciones" : "Conversations"}
        description={
          isEs
            ? "Supervisa tráfico, detecta escalaciones y resuelve handoffs sin perder contexto."
            : "Monitor traffic, detect escalations, and resolve handoffs without losing context."
        }
        backUrl={backToDashboardUrl}
        backLabel={isEs ? "Panel" : "Dashboard"}
        badge={
          <AdminStatusBadge tone={summary.openHandoffs > 0 ? "warning" : "success"}>
            {summary.openHandoffs > 0 ? `${summary.openHandoffs} ${isEs ? "handoffs abiertos" : "open handoffs"}` : (isEs ? "Sin bloqueos" : "No blockers")}
          </AdminStatusBadge>
        }
      />
      <Layout>
        {actionData?.ok && actionData.message ? (
          <Layout.Section>
            <Banner tone="success" title={actionData.message} />
          </Layout.Section>
        ) : null}

        {!actionData?.ok && actionData?.error ? (
          <Layout.Section>
            <Banner tone="critical" title={actionData.error} />
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 5 }} gap="400">
            <AdminStatCard label={isEs ? "Activas ahora" : "Active now"} value={summary.activeNow} />
            <AdminStatCard label={isEs ? "Total (7d)" : "Total (7d)"} value={summary.total7d} />
            <AdminStatCard label={isEs ? "Escaladas (7d)" : "Escalated (7d)"} value={summary.escalated7d} />
            <AdminStatCard label={isEs ? "Resueltas (7d)" : "Resolved (7d)"} value={summary.resolved7d} />
            <AdminStatCard label={isEs ? "Handoffs abiertos" : "Open handoffs"} value={summary.openHandoffs} badge={<AdminStatusBadge tone={summary.openHandoffs > 0 ? "warning" : "success"}>{summary.openHandoffs > 0 ? (isEs ? "Prioridad" : "Priority") : "OK"}</AdminStatusBadge>} />
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Filtrar conversaciones" : "Filter conversations"}
            description={isEs ? "Cambia rápido de vista entre estados operativos clave." : "Quickly switch between the operational states that matter."}
            badge={<AdminStatusBadge tone="info">{`${isEs ? "Actual" : "Current"}: ${statusLabel(statusFilter, isEs)}`}</AdminStatusBadge>}
          >
              <InlineStack gap="200" wrap>
                {STATUS_FILTERS.map((filter) => (
                  <Button key={filter} url={withStatusFilter(filter)} variant={statusFilter === filter ? "primary" : "secondary"}>
                    {statusLabel(filter, isEs)}
                  </Button>
                ))}
              </InlineStack>
          </AdminSectionCard>
        </Layout.Section>

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Conversaciones recientes" : "Recent conversations"}
            description={isEs ? "Panel operativo para revisar sesiones recientes y detectar huecos en soporte." : "Operational view to review recent sessions and detect support gaps."}
          >
              {conversationRows.length === 0 ? (
                <EmptyState heading={isEs ? "No se encontraron conversaciones" : "No conversations found"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Las conversaciones aparecerán aquí cuando visitantes interactúen con tu asistente."
                      : "Conversations will appear here as visitors interact with your assistant."}
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "numeric", "text", "text", "text", "text"]}
                  headings={isEs
                    ? ["Inicio", "Estado", "Origen", "Canal", "Idioma", "Mensajes", "Último mensaje", "Última actividad", "Handoff", "Ver"]
                    : ["Started", "Status", "Source", "Channel", "Locale", "Messages", "Last message", "Last activity", "Handoff", "View"]}
                  rows={conversationRows}
                />
              )}
          </AdminSectionCard>
        </Layout.Section>

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Handoffs pendientes" : "Pending handoffs"}
            description={isEs ? "Mantén el flujo de escalaciones en movimiento y evita backlog invisible." : "Keep escalations moving and avoid invisible backlog."}
          >
              {handoffRows.length === 0 ? (
                <EmptyState heading={isEs ? "No hay handoffs pendientes" : "No pending handoffs"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Todas las escalaciones estan resueltas o asignadas."
                      : "All escalations are currently resolved or assigned."}
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                  headings={isEs
                    ? ["Conversación", "Motivo", "Asignado", "Estado", "Creado", "Acción"]
                    : ["Conversation", "Reason", "Assigned", "Status", "Created", "Action"]}
                  rows={handoffRows}
                />
              )}
          </AdminSectionCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
