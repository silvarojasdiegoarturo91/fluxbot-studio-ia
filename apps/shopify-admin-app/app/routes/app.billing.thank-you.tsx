import { Banner, Box, Button, Layout, List, Page, Text } from "@shopify/polaris";
import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useIsSpanish } from "../hooks/use-admin-language";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { BillingService, type BillingPlanId } from "../services/billing.server";
import { AdminPageHeader, AdminSectionCard, AdminStatusBadge } from "../components/admin-ui";

const EMBEDDED_QUERY_KEYS = ["shop", "host", "embedded"] as const;

function buildDashboardUrl(searchParams: URLSearchParams): string {
  const params = new URLSearchParams();
  for (const key of EMBEDDED_QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value) {
      params.set(key, value);
    }
  }
  const queryString = params.toString();
  return `/app${queryString ? `?${queryString}` : ""}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticateAdminRequest(request);
  const shop = await ensureShopForSession(session);
  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const planId = requestUrl.searchParams.get("plan") as BillingPlanId | null;
  const selectedPlan = planId ? BillingService.getPlan(planId) : null;
  const status = await BillingService.getStatus(shop.id).catch(() => null);
  const resolvedCurrentPlan = status
    ? await BillingService.resolveCurrentPlan(shop.id, status).catch(() => null)
    : null;

  return {
    selectedPlan: selectedPlan
      ?? (resolvedCurrentPlan?.planId ? BillingService.getPlan(resolvedCurrentPlan.planId) : null),
    hasActiveSubscription: Boolean(
      resolvedCurrentPlan?.hasActiveSubscription ?? status?.hasActiveSubscription,
    ),
    dashboardUrl: buildDashboardUrl(requestUrl.searchParams),
  };
}

export default function BillingThankYouPage() {
  const isEs = useIsSpanish();
  const data = useLoaderData<typeof loader>();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      window.location.assign(data.dashboardUrl);
    }, 2200);
    return () => window.clearTimeout(timeout);
  }, [data.dashboardUrl]);

  return (
    <Page fullWidth>
      <AdminPageHeader
        eyebrow={isEs ? "Facturación" : "Billing"}
        title={isEs ? "¡Pago confirmado!" : "Payment confirmed!"}
        description={
          isEs
            ? "Tu suscripción quedó registrada en Shopify y ya puedes seguir usando el panel."
            : "Your subscription was confirmed in Shopify and you can continue in the dashboard."
        }
        backUrl={data.dashboardUrl}
        backLabel={isEs ? "Ir al panel" : "Go to dashboard"}
        badge={
          <AdminStatusBadge tone={data.hasActiveSubscription ? "success" : "attention"}>
            {data.hasActiveSubscription
              ? (isEs ? "Suscripción activa" : "Active subscription")
              : (isEs ? "Procesando estado" : "Processing status")}
          </AdminStatusBadge>
        }
      />
      <Layout>
        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Gracias por elegir FluxBot" : "Thanks for choosing FluxBot"}
            description={
              isEs
                ? "Esta compra se procesó con Shopify Billing API y quedó asociada a tu tienda."
                : "This purchase was processed through Shopify Billing API and linked to your shop."
            }
          >
            <Banner tone="success" title={isEs ? "Suscripción confirmada" : "Subscription confirmed"}>
              <p>
                {isEs
                  ? "Te redirigiremos al panel desde Shopify Admin sin pedir nuevamente el dominio de la tienda."
                  : "You are now back in Shopify Admin without being asked to manually enter the shop domain."}
              </p>
            </Banner>
            <Box paddingBlockStart="400">
              <Text as="h3" variant="headingSm">
                {isEs ? "Ventajas del plan" : "Plan benefits"}
              </Text>
              <Box paddingBlockStart="200">
                <List>
                  <List.Item>
                    {data.selectedPlan
                      ? (isEs
                        ? `${data.selectedPlan.includedMessages.toLocaleString()} mensajes incluidos por ciclo.`
                        : `${data.selectedPlan.includedMessages.toLocaleString()} messages included per cycle.`)
                      : (isEs ? "Acceso inmediato a las funcionalidades del plan activo." : "Immediate access to your active plan features.")}
                  </List.Item>
                  <List.Item>
                    {isEs
                      ? "Cambio de plan (upgrade/downgrade) desde esta misma sección de facturación."
                      : "Plan changes (upgrade/downgrade) from the same billing section."}
                  </List.Item>
                  <List.Item>
                    {isEs
                      ? "Ajuste de cobro proporcional gestionado por Shopify al reemplazar planes."
                      : "Proration is managed by Shopify when replacing plans."}
                  </List.Item>
                </List>
              </Box>
            </Box>
            <Box paddingBlockStart="400">
              <Button url={data.dashboardUrl} variant="primary">
                {isEs ? "Ir al panel" : "Go to dashboard"}
              </Button>
            </Box>
          </AdminSectionCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
