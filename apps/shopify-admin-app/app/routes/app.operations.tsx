import {
  Page,
  Layout,
  BlockStack,
  Text,
  InlineGrid,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation } from "react-router";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { getDeliveryStatus } from "../services/delivery.server";
import { getProactiveJobSchedulerStats } from "../jobs/scheduler.server";
import { getOperationsMetrics } from "../services/operations-metrics.server";
import { useIsSpanish } from "../hooks/use-admin-language";
import { AdminPageHeader, AdminSectionCard, AdminStatCard, AdminStatusBadge } from "../components/admin-ui";

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticateAdminRequest(request);
  const requestUrl = new URL(request.url);
  const windowMinutesRaw = Number(requestUrl.searchParams.get("windowMinutes") || "60");
  const windowMinutes =
    Number.isFinite(windowMinutesRaw) && windowMinutesRaw > 0
      ? Math.min(24 * 60, Math.floor(windowMinutesRaw))
      : 60;

  const [operations] = await Promise.all([
    getOperationsMetrics(windowMinutes * 60 * 1000),
  ]);

  return {
    shopDomain: session.shop,
    windowMinutes,
    operations,
    delivery: getDeliveryStatus(),
    scheduler: getProactiveJobSchedulerStats(),
  };
}

export default function OperationsPage() {
  const { shopDomain, windowMinutes, operations, delivery, scheduler } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isEs = useIsSpanish();
  const backToDashboardUrl = `/app${location.search || ""}`;

  const channelRows = Object.entries(operations.byChannel).map(([channel, stats]) => [
    channel,
    String(stats.callbacks),
    String(stats.applied),
    String(stats.ignored),
    String(stats.failures),
    `${stats.avgLatencyMs}ms`,
  ]);

  const retentionSchedulerRunning = scheduler?.isRunning?.retention === true;

  return (
    <Page fullWidth>
      <AdminPageHeader
        eyebrow={isEs ? "Runtime" : "Runtime"}
        title={isEs ? "Operaciones" : "Operations"}
        description={
          isEs
            ? `Visibilidad runtime Fase 6 para ${shopDomain} con una ventana operativa de ${windowMinutes} minutos.`
            : `Phase 6 runtime visibility for ${shopDomain} with a ${windowMinutes}-minute operational window.`
        }
        backUrl={backToDashboardUrl}
        backLabel={isEs ? "Panel" : "Dashboard"}
        badge={<AdminStatusBadge tone={retentionSchedulerRunning ? "success" : "attention"}>{retentionSchedulerRunning ? (isEs ? "Scheduler ejecutando" : "Scheduler running") : (isEs ? "Scheduler detenido" : "Scheduler stopped")}</AdminStatusBadge>}
      />
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <AdminStatCard label={isEs ? "Eventos de callback" : "Callback events"} value={operations.callback.total} meta={isEs ? `Últimos ${windowMinutes}m` : `Last ${windowMinutes}m`} />
            <AdminStatCard label={isEs ? "Tasa aplicada" : "Applied rate"} value={pct(operations.callback.appliedRate)} meta={`${isEs ? "Ignorados" : "Ignored"}: ${pct(operations.callback.ignoredRate)}`} />
            <AdminStatCard label={isEs ? "Cola de errores (DLQ)" : "Dead letter queue"} value={operations.deadLetter.queued} meta={`${isEs ? "Resueltos" : "Resolved"}: ${operations.deadLetter.resolved}`} />
            <AdminStatCard label={isEs ? "Scheduler de retención" : "Retention scheduler"} value={retentionSchedulerRunning ? (isEs ? "Ejecutando" : "Running") : (isEs ? "Detenido" : "Stopped")} badge={<AdminStatusBadge tone={retentionSchedulerRunning ? "success" : "attention"}>{retentionSchedulerRunning ? (isEs ? "Activo" : "Active") : (isEs ? "Pausa" : "Paused")}</AdminStatusBadge>} meta={`${isEs ? "Fallos de entrega" : "Delivery failures"}: ${operations.callback.deliveryFailures}`} />
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Cobertura por canal" : "Channel coverage"}
            description={isEs ? "Visualiza integraciones ya cubiertas y canales aún pendientes." : "Visualize integrated channels and the ones still pending."}
          >
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {isEs ? "Canales integrados" : "Integrated channels"}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {delivery.integratedChannels.join(", ") || (isEs ? "Ninguno" : "None")}
                  </Text>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {isEs ? "Canales pendientes" : "Pending channels"}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {delivery.pendingChannels.join(", ") || (isEs ? "Ninguno" : "None")}
                  </Text>
                </BlockStack>
              </InlineGrid>
          </AdminSectionCard>
        </Layout.Section>

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Rendimiento de callbacks por canal" : "Callback performance by channel"}
            description={isEs ? "Tabla operativa para revisar aplicacion, ignorados, fallos y latencia." : "Operational table to review applied callbacks, ignored events, failures, and latency."}
          >
              {channelRows.length === 0 ? (
                <EmptyState heading={isEs ? "Sin metricas de callback" : "No callback metrics yet"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Las metricas aparecerán cuando se reciban callbacks omnicanal."
                      : "Metrics will appear when omnichannel callbacks are received."}
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "numeric", "numeric", "numeric", "numeric", "text"]}
                  headings={
                    isEs
                      ? ["Canal", "Callbacks", "Aplicados", "Ignorados", "Fallos", "Latencia prom."]
                      : ["Channel", "Callbacks", "Applied", "Ignored", "Failures", "Avg Latency"]
                  }
                  rows={channelRows}
                />
              )}
          </AdminSectionCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
