import {
  Page,
  Layout,
  Text,
  InlineGrid,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation } from "react-router";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { AnalyticsService } from "../services/analytics.server";
import { useIsSpanish } from "../hooks/use-admin-language";
import { AdminPageHeader, AdminSectionCard, AdminStatCard } from "../components/admin-ui";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticateAdminRequest(request);
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
    <Page fullWidth>
      <AdminPageHeader
        eyebrow={isEs ? "Insights" : "Insights"}
        title={isEs ? "Analítica" : "Analytics"}
        description={isEs ? `Últimos ${days} días de rendimiento, atribución e intenciones.` : `Last ${days} days of performance, attribution, and intent signals.`}
        backUrl={backUrl}
        backLabel={isEs ? "Panel" : "Dashboard"}
      />
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <AdminStatCard label={isEs ? "Conversaciones" : "Conversations"} value={conversations.total} meta={`${isEs ? "Resolución" : "Resolution"}: ${pct(conversations.resolutionRate)}`} />
            <AdminStatCard label={isEs ? "Ingresos asistidos" : "Assisted revenue"} value={currency(revenue.totalRevenue)} meta={`${revenue.conversionCount} ${isEs ? "pedidos atribuidos" : "orders attributed"}`} />
            <AdminStatCard label={isEs ? "Proactivos enviados" : "Proactive sent"} value={proactive.sent} meta={`CVR: ${pct(proactive.conversionRate)}`} />
            <AdminStatCard label={isEs ? "Tasa de handoff" : "Handoff rate"} value={pct(conversations.handoffRate)} meta={`${conversations.escalated} ${isEs ? "escaladas" : "escalated"}`} />
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Atribución de ingresos" : "Revenue attribution"}
            description={isEs ? "Desglosa cómo el asistente mueve valor a lo largo del funnel." : "Break down how the assistant drives value across the funnel."}
          >
              <DataTable
                columnContentTypes={["text", "numeric"]}
                headings={isEs ? ["Tipo de atribución", "Ingresos"] : ["Attribution Type", "Revenue"]}
                rows={[
                  [isEs ? "Recomendación directa" : "Direct Recommendation", currency(revenue.directRevenue)],
                  [isEs ? "Asistido" : "Assisted", currency(revenue.assistedRevenue)],
                  [isEs ? "Recuperación de carrito" : "Cart Recovery", currency(revenue.cartRecoveryRevenue)],
                  [isEs ? "Trigger proactivo" : "Proactive Trigger", currency(revenue.proactiveTriggerRevenue)],
                  [isEs ? "Total" : "Total", currency(revenue.totalRevenue)],
                ]}
              />
          </AdminSectionCard>
        </Layout.Section>

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Embudo de mensajería proactiva" : "Proactive messaging funnel"}
            description={isEs ? "Comprueba entregabilidad y conversion de las campañas activas." : "Check deliverability and conversion of active campaigns."}
          >
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
          </AdminSectionCard>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <AdminSectionCard
            title={isEs ? "Desglose de intenciones" : "Intent breakdown"}
            description={isEs ? "Identifica las necesidades dominantes que llegan al chat." : "Identify the dominant needs reaching the chat."}
          >
              {intents.length === 0 ? (
                <EmptyState heading={isEs ? "Sin datos de intención" : "No intent data yet"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Los datos aparecerán cuando visitantes interactúen con el chat."
                      : "Data will appear as visitors interact with the chat."}
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "numeric", "text"]}
                  headings={isEs ? ["Tipo", "Señales", "Confianza prom."] : ["Intent Type", "Signals", "Avg Confidence"]}
                  rows={intents.map((i) => [i.type, String(i.count), pct(i.avgConfidence)])}
                />
              )}
          </AdminSectionCard>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <AdminSectionCard
            title={isEs ? "Top triggers proactivos" : "Top proactive triggers"}
            description={isEs ? "Prioriza los triggers que más conversacion y conversion generan." : "Prioritize the triggers that drive the most conversation and conversion."}
          >
              {topTriggers.length === 0 ? (
                <EmptyState heading={isEs ? "Sin datos de triggers" : "No trigger data yet"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Crea y activa triggers proactivos para ver rendimiento aquí."
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
          </AdminSectionCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
