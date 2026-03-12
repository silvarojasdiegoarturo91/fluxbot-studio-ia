import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineGrid,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation } from "react-router";
import { authenticate } from "../shopify.server";
import { AnalyticsService } from "../services/analytics.server";
import { useIsSpanish } from "../hooks/use-admin-language";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") ?? "30", 10);
  const report = await AnalyticsService.getReport(session.shop, days);
  return { report, days };
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function currency(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function AnalyticsPage() {
  const { report, days } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isEs = useIsSpanish();
  const backUrl = `/app${location.search || ""}`;
  const { conversations, revenue, proactive, intents, topTriggers } = report;

  return (
    <Page
      title={isEs ? "Analitica" : "Analytics"}
      subtitle={isEs ? `Ultimos ${days} dias` : `Last ${days} days`}
      backAction={{ content: isEs ? "Panel" : "Dashboard", url: backUrl }}
    >
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Conversaciones" : "Conversations"}</Text>
                <Text as="p" variant="headingXl">{conversations.total}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Resolucion" : "Resolution"}: {pct(conversations.resolutionRate)}
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Ingresos asistidos" : "Assisted Revenue"}</Text>
                <Text as="p" variant="headingXl">{currency(revenue.totalRevenue)}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {revenue.conversionCount} {isEs ? "pedidos atribuidos" : "orders attributed"}
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Proactivos enviados" : "Proactive Sent"}</Text>
                <Text as="p" variant="headingXl">{proactive.sent}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  CVR: {pct(proactive.conversionRate)}
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Tasa de handoff" : "Handoff Rate"}</Text>
                <Text as="p" variant="headingXl">{pct(conversations.handoffRate)}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {conversations.escalated} {isEs ? "escaladas" : "escalated"}
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">{isEs ? "Atribucion de ingresos" : "Revenue Attribution"}</Text>
              <DataTable
                columnContentTypes={["text", "numeric"]}
                headings={isEs ? ["Tipo de atribucion", "Ingresos"] : ["Attribution Type", "Revenue"]}
                rows={[
                  [isEs ? "Recomendacion directa" : "Direct Recommendation", currency(revenue.directRevenue)],
                  [isEs ? "Asistido" : "Assisted", currency(revenue.assistedRevenue)],
                  [isEs ? "Recuperacion de carrito" : "Cart Recovery", currency(revenue.cartRecoveryRevenue)],
                  [isEs ? "Trigger proactivo" : "Proactive Trigger", currency(revenue.proactiveTriggerRevenue)],
                  [isEs ? "Total" : "Total", currency(revenue.totalRevenue)],
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">{isEs ? "Embudo de mensajeria proactiva" : "Proactive Messaging Funnel"}</Text>
              <DataTable
                columnContentTypes={["text", "numeric", "text"]}
                headings={isEs ? ["Etapa", "Cantidad", "Tasa"] : ["Stage", "Count", "Rate"]}
                rows={[
                  [isEs ? "En cola" : "Queued", String(proactive.queued), "—"],
                  [isEs ? "Enviados" : "Sent", String(proactive.sent), "—"],
                  [isEs ? "Entregados" : "Delivered", String(proactive.delivered), pct(proactive.deliveryRate)],
                  [isEs ? "Convertidos" : "Converted", String(proactive.converted), pct(proactive.conversionRate)],
                  [isEs ? "Fallidos" : "Failed", String(proactive.failed), "—"],
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">{isEs ? "Desglose de intenciones" : "Intent Breakdown"}</Text>
              {intents.length === 0 ? (
                <EmptyState heading={isEs ? "Sin datos de intencion" : "No intent data yet"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Los datos apareceran cuando visitantes interactuen con el chat."
                      : "Data will appear as visitors interact with the chat."}
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "numeric", "text"]}
                  headings={isEs ? ["Tipo", "Senales", "Confianza prom."] : ["Intent Type", "Signals", "Avg Confidence"]}
                  rows={intents.map((i) => [i.type, String(i.count), pct(i.avgConfidence)])}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">{isEs ? "Top triggers proactivos" : "Top Proactive Triggers"}</Text>
              {topTriggers.length === 0 ? (
                <EmptyState heading={isEs ? "Sin datos de triggers" : "No trigger data yet"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Crea y activa triggers proactivos para ver rendimiento aqui."
                      : "Create and enable proactive triggers to see performance here."}
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "numeric", "numeric", "text"]}
                  headings={isEs ? ["Trigger", "Enviados", "Conversiones", "CVR"] : ["Trigger", "Sent", "Conversions", "CVR"]}
                  rows={topTriggers.map((t) => [
                    t.triggerName,
                    String(t.messagesSent),
                    String(t.conversions),
                    pct(t.conversionRate),
                  ])}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
