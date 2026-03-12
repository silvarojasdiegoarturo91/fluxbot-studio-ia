import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineGrid,
  DataTable,
  Badge,
  EmptyState,
} from "@shopify/polaris";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation } from "react-router";
import { authenticate } from "../shopify.server";
import { getDeliveryStatus } from "../services/delivery.server";
import { getProactiveJobSchedulerStats } from "../jobs/scheduler.server";
import { getOperationsMetrics } from "../services/operations-metrics.server";
import { useIsSpanish } from "../hooks/use-admin-language";

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
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
    <Page
      title={isEs ? "Operaciones" : "Operations"}
      subtitle={
        isEs
          ? `Visibilidad runtime Fase 6 · ${shopDomain} · ventana ${windowMinutes}m`
          : `Phase 6 runtime visibility · ${shopDomain} · ${windowMinutes}m window`
      }
      backAction={{ content: isEs ? "Panel" : "Dashboard", url: backToDashboardUrl }}
    >
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Eventos de callback" : "Callback Events"}
                </Text>
                <Text as="p" variant="headingXl">{operations.callback.total}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? `Ultimos ${windowMinutes}m` : `Last ${windowMinutes}m`}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Tasa aplicada" : "Applied Rate"}
                </Text>
                <Text as="p" variant="headingXl">{pct(operations.callback.appliedRate)}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Ignorados" : "Ignored"}: {pct(operations.callback.ignoredRate)}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Cola de errores (DLQ)" : "Dead Letter Queue"}
                </Text>
                <Text as="p" variant="headingXl">{operations.deadLetter.queued}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Resueltos" : "Resolved"}: {operations.deadLetter.resolved}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Scheduler de retencion" : "Retention Scheduler"}
                </Text>
                <Text as="p" variant="headingXl">
                  <Badge tone={retentionSchedulerRunning ? "success" : "attention"}>
                    {retentionSchedulerRunning
                      ? (isEs ? "Ejecutando" : "Running")
                      : (isEs ? "Detenido" : "Stopped")}
                  </Badge>
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Fallos de entrega" : "Delivery failures"}: {operations.callback.deliveryFailures}
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {isEs ? "Cobertura por canal" : "Channel Coverage"}
              </Text>
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
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {isEs ? "Rendimiento de callbacks por canal" : "Callback Performance by Channel"}
              </Text>

              {channelRows.length === 0 ? (
                <EmptyState heading={isEs ? "Sin metricas de callback" : "No callback metrics yet"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Las metricas apareceran cuando se reciban callbacks omnicanal."
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
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
