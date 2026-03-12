import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  InlineGrid,
  List,
  Banner,
} from "@shopify/polaris";
import { redirect, type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation } from "react-router";
import prisma from "../db.server";
import { AnalyticsService } from "../services/analytics.server";
import { getMerchantAdminConfig } from "../services/admin-config.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { authenticate } from "../shopify.server";
import { useIsSpanish } from "../hooks/use-admin-language";

interface DashboardLoaderData {
  shopConnection: {
    connected: boolean;
    name: string | null;
    myshopifyDomain: string | null;
    primaryDomainHost: string | null;
    planName: string | null;
    error: string | null;
  };
  business: {
    conversationsLast7d: number;
    assistedRevenueLast7d: number;
    proactiveSentLast7d: number;
    openHandoffs: number;
    activeCampaigns: number;
    activeSources: number;
    totalSources: number;
    failedSyncJobs: number;
    runningSyncJobs: number;
    lastSyncLabel: string;
  };
  assistant: {
    isActive: boolean;
    language: string;
    tone: string;
    enableProactive: boolean;
    enableHandoff: boolean;
  };
  alerts: string[];
  showOnboardingSuccess: boolean;
}

const SHOP_CONNECTION_QUERY = `#graphql
  query DashboardShopConnection {
    shop {
      name
      myshopifyDomain
      primaryDomain {
        host
      }
      plan {
        displayName
      }
    }
  }
`;

function buildOnboardingRedirectPath(requestUrl: URL, step: number): string {
  const params = new URLSearchParams(requestUrl.search);
  params.delete("saved");
  params.delete("onboarding");
  params.set("step", String(Math.max(1, Math.min(7, Math.floor(step) || 1))));

  const queryString = params.toString();
  return `/app/onboarding${queryString ? `?${queryString}` : ""}`;
}

export const loader = async ({ request }: LoaderFunctionArgs): Promise<DashboardLoaderData> => {
  const requestUrl = new URL(request.url);
  const showOnboardingSuccess = requestUrl.searchParams.get("onboarding") === "done";

  const fallbackData: DashboardLoaderData = {
    shopConnection: {
      connected: false,
      name: null,
      myshopifyDomain: null,
      primaryDomainHost: null,
      planName: null,
      error: "Unknown error",
    },
    business: {
      conversationsLast7d: 0,
      assistedRevenueLast7d: 0,
      proactiveSentLast7d: 0,
      openHandoffs: 0,
      activeCampaigns: 0,
      activeSources: 0,
      totalSources: 0,
      failedSyncJobs: 0,
      runningSyncJobs: 0,
      lastSyncLabel: "No sync yet",
    },
    assistant: {
      isActive: true,
      language: "en",
      tone: "professional",
      enableProactive: false,
      enableHandoff: true,
    },
    alerts: [],
    showOnboardingSuccess: false,
  };

  try {
    const { admin, session } = await authenticate.admin(request);
    const response = await admin.graphql(SHOP_CONNECTION_QUERY);

    const payload = (await response.json()) as {
      data?: {
        shop?: {
          name?: string;
          myshopifyDomain?: string;
          primaryDomain?: {
            host?: string;
          };
          plan?: {
            displayName?: string;
          };
        };
      };
      errors?: Array<{
        message?: string;
      }>;
    };

    const shopConnection = !payload.data?.shop || payload.errors?.length
      ? {
        connected: false,
        name: null,
        myshopifyDomain: null,
        primaryDomainHost: null,
        planName: null,
        error: payload.errors?.[0]?.message || "No shop data returned by Admin API",
      }
      : {
        connected: true,
        name: payload.data.shop.name || null,
        myshopifyDomain: payload.data.shop.myshopifyDomain || null,
        primaryDomainHost: payload.data.shop.primaryDomain?.host || null,
        planName: payload.data.shop.plan?.displayName || null,
        error: null,
      };

    // In tests, session may be omitted from mocks; keep loader resilient.
    if (!session?.shop) {
      return {
        ...fallbackData,
        shopConnection,
        showOnboardingSuccess,
      };
    }

    const shop = await ensureShopForSession(session);

    if (!shop) {
      return {
        ...fallbackData,
        shopConnection,
        alerts: ["Unable to resolve shop context."],
        showOnboardingSuccess,
      };
    }

    const adminConfig = await getMerchantAdminConfig(shop.id);
    const isEs = adminConfig.adminLanguage === "es";
    if (!adminConfig.onboardingCompleted) {
      throw redirect(buildOnboardingRedirectPath(requestUrl, adminConfig.onboardingStep));
    }

    const [
      report7d,
      chatbotConfig,
      activeSources,
      totalSources,
      activeCampaigns,
      failedSyncJobs,
      runningSyncJobs,
      openHandoffs,
      lastCompletedSync,
    ] = await Promise.all([
      AnalyticsService.getReport(shop.id, 7),
      prisma.chatbotConfig.findUnique({
        where: { shopId: shop.id },
        select: {
          isActive: true,
          language: true,
          tone: true,
          enableProactive: true,
          enableHandoff: true,
        },
      }),
      prisma.knowledgeSource.count({ where: { shopId: shop.id, isActive: true } }),
      prisma.knowledgeSource.count({ where: { shopId: shop.id } }),
      prisma.marketingCampaign.count({ where: { shopId: shop.id, status: "ACTIVE" } }),
      prisma.syncJob.count({ where: { shopId: shop.id, status: "FAILED" } }),
      prisma.syncJob.count({ where: { shopId: shop.id, status: { in: ["PENDING", "RUNNING"] } } }),
      prisma.handoffRequest.count({
        where: {
          shopId: shop.id,
          status: { in: ["pending", "assigned", "PENDING", "ASSIGNED"] },
        },
      }),
      prisma.syncJob.findFirst({
        where: { shopId: shop.id, completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        select: { jobType: true, completedAt: true },
      }),
    ]);

    const assistant = {
      isActive: chatbotConfig?.isActive ?? true,
      language: chatbotConfig?.language ?? "en",
      tone: chatbotConfig?.tone ?? "professional",
      enableProactive: chatbotConfig?.enableProactive ?? false,
      enableHandoff: chatbotConfig?.enableHandoff ?? true,
    };

    const alerts: string[] = [];
    if (!assistant.isActive) alerts.push(isEs ? "El asistente esta en pausa." : "Assistant is currently paused.");
    if (totalSources === 0) {
      alerts.push(
        isEs
          ? "No hay fuentes de conocimiento configuradas. Agrega al menos una fuente."
          : "No knowledge source configured. Add at least one source.",
      );
    }
    if (failedSyncJobs > 0) {
      alerts.push(
        isEs
          ? `${failedSyncJobs} job(s) de sincronizacion fallaron y requieren revision.`
          : `${failedSyncJobs} sync job(s) failed and need review.`,
      );
    }
    if (activeCampaigns === 0) {
      alerts.push(
        isEs
          ? "No hay campanas activas para ventas proactivas."
          : "No active campaign running for proactive sales.",
      );
    }

    return {
      shopConnection,
      business: {
        conversationsLast7d: report7d.conversations.total,
        assistedRevenueLast7d: report7d.revenue.totalRevenue,
        proactiveSentLast7d: report7d.proactive.sent,
        openHandoffs,
        activeCampaigns,
        activeSources,
        totalSources,
        failedSyncJobs,
        runningSyncJobs,
        lastSyncLabel: lastCompletedSync?.completedAt
          ? `${lastCompletedSync.jobType} · ${new Date(lastCompletedSync.completedAt).toLocaleString()}`
          : isEs ? "Sin sincronizaciones" : "No sync yet",
      },
      assistant,
      alerts,
      showOnboardingSuccess,
    };
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    return {
      ...fallbackData,
      shopConnection: {
        connected: false,
        name: null,
        myshopifyDomain: null,
        primaryDomainHost: null,
        planName: null,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      alerts: ["Unable to load business metrics. Please refresh."],
      showOnboardingSuccess,
    };
  }
};

export default function DashboardIndex() {
  const { shopConnection, business, assistant, alerts, showOnboardingSuccess } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isEs = useIsSpanish();

  const withEmbeddedQuery = (path: string) => {
    return `${path}${location.search || ""}`;
  };

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

  return (
    <Page
      title={isEs ? "FluxBot Centro de Control" : "FluxBot Control Center"}
      subtitle={
        isEs
          ? "Opera ventas, soporte y cumplimiento desde un solo lugar"
          : "Operate sales, support and compliance from one place"
      }
    >
      <Layout>
        {showOnboardingSuccess ? (
          <Layout.Section>
            <Banner tone="success" title={isEs ? "Asistente activado" : "Assistant activated"}>
              <p>
                {isEs
                  ? "El onboarding se completo correctamente. Tu centro de control ya esta habilitado."
                  : "Onboarding was completed successfully. Your control center is now fully enabled."}
              </p>
            </Banner>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  {isEs ? "Conexion de tienda" : "Store Connection"}
                </Text>
                <Badge>{shopConnection.connected ? (isEs ? "Conectada" : "Connected") : (isEs ? "Revisar" : "Check required")}</Badge>
              </InlineStack>

              {shopConnection.connected ? (
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    {isEs ? "Tienda" : "Store"}: {shopConnection.name || (isEs ? "Desconocida" : "Unknown")}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {isEs ? "Dominio myshopify" : "myshopify domain"}: {shopConnection.myshopifyDomain || (isEs ? "Desconocido" : "Unknown")}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {isEs ? "Dominio principal" : "Primary domain"}: {shopConnection.primaryDomainHost || (isEs ? "Desconocido" : "Unknown")}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {isEs ? "Plan" : "Plan"}: {shopConnection.planName || (isEs ? "Desconocido" : "Unknown")}
                  </Text>
                </BlockStack>
              ) : (
                <Text as="p" variant="bodyMd" tone="critical">
                  {isEs ? "No se pudieron obtener datos de la tienda desde Admin API" : "Could not fetch shop data from Admin API"}: {shopConnection.error || (isEs ? "Error desconocido" : "Unknown error")}
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Conversaciones (7d)" : "Conversations (7d)"}</Text>
                <Text as="p" variant="headingXl">{business.conversationsLast7d}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Ingresos influenciados (7d)" : "Revenue Influenced (7d)"}</Text>
                <Text as="p" variant="headingXl">{formatCurrency(business.assistedRevenueLast7d)}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Mensajes proactivos enviados (7d)" : "Proactive Messages Sent (7d)"}</Text>
                <Text as="p" variant="headingXl">{business.proactiveSentLast7d}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Handoffs abiertos" : "Open Handoffs"}</Text>
                <Text as="p" variant="headingXl">{business.openHandoffs}</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">{isEs ? "Acciones inmediatas" : "Immediate Actions"}</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  {isEs
                    ? "Flujos que los merchants usan a diario para aumentar ingresos y reducir carga de soporte."
                    : "Workflows merchants use daily to grow revenue and reduce support load."}
                </Text>
                <InlineStack gap="200" wrap>
                  <Button url={withEmbeddedQuery("/app/campaigns")}>{isEs ? "Lanzar campana" : "Launch campaign"}</Button>
                  <Button url={withEmbeddedQuery("/app/conversations")}>{isEs ? "Revisar conversaciones" : "Review conversations"}</Button>
                  <Button url={withEmbeddedQuery("/app/data-sources")}>{isEs ? "Sincronizar fuentes" : "Sync data sources"}</Button>
                  <Button url={withEmbeddedQuery("/app/settings")}>{isEs ? "Ajustar asistente" : "Tune assistant"}</Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">{isEs ? "Salud del asistente" : "Assistant Health"}</Text>
                <InlineStack align="space-between">
                  <Text as="p" variant="bodyMd">{isEs ? "Estado del asistente" : "Assistant status"}</Text>
                  <Badge tone={assistant.isActive ? "success" : "critical"}>
                    {assistant.isActive ? (isEs ? "Activo" : "Active") : (isEs ? "Pausado" : "Paused")}
                  </Badge>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="p" variant="bodyMd">{isEs ? "Idioma" : "Language"}</Text>
                  <Text as="p" variant="bodyMd">{assistant.language}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="p" variant="bodyMd">{isEs ? "Tono" : "Tone"}</Text>
                  <Text as="p" variant="bodyMd">{assistant.tone}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="p" variant="bodyMd">{isEs ? "Fuentes de conocimiento" : "Knowledge sources"}</Text>
                  <Text as="p" variant="bodyMd">{business.activeSources}/{business.totalSources} {isEs ? "activas" : "active"}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="p" variant="bodyMd">{isEs ? "Campanas" : "Campaigns"}</Text>
                  <Text as="p" variant="bodyMd">{business.activeCampaigns} {isEs ? "activas" : "active"}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="p" variant="bodyMd">{isEs ? "Pipeline de sync" : "Sync pipeline"}</Text>
                  <Text as="p" variant="bodyMd">{business.runningSyncJobs} {isEs ? "en ejecucion/pendiente" : "running/pending"}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="p" variant="bodyMd">{isEs ? "Ultima sync completada" : "Last completed sync"}</Text>
                  <Text as="p" variant="bodyMd">{business.lastSyncLabel}</Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  {isEs ? "Requiere atencion" : "Needs Attention"}
                </Text>
                <Badge tone={alerts.length > 0 ? "attention" : "success"}>
                  {alerts.length > 0 ? `${alerts.length} ${isEs ? "alertas" : "alerts"}` : (isEs ? "Todo bien" : "All good")}
                </Badge>
              </InlineStack>
              {alerts.length > 0 ? (
                <List>
                  {alerts.map((alert) => (
                    <List.Item key={alert}>{alert}</List.Item>
                  ))}
                </List>
              ) : (
                <Text as="p" variant="bodyMd" tone="subdued">
                  {isEs ? "No hay issues criticos detectados por ahora." : "No critical issues detected right now."}
                </Text>
              )}

              <InlineStack gap="200" wrap>
                <Button url={withEmbeddedQuery("/app/privacy")}>{isEs ? "Centro de cumplimiento" : "Compliance center"}</Button>
                <Button url={withEmbeddedQuery("/app/operations")}>{isEs ? "Vista de operaciones" : "Operations view"}</Button>
                <Button url={withEmbeddedQuery("/app/billing")}>{isEs ? "Facturacion" : "Billing"}</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
