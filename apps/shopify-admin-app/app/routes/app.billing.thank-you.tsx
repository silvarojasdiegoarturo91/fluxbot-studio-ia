import { Banner, Box, Button, Layout, List, Page, Text } from "@shopify/polaris";
import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useIsSpanish } from "../hooks/use-admin-language";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { ensureShopForSession } from "../services/shop-context.server";
import type { BillingPlanId } from "../services/billing.server";
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

function buildBillingUrl(searchParams: URLSearchParams): string {
  const params = new URLSearchParams();
  for (const key of EMBEDDED_QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value) {
      params.set(key, value);
    }
  }
  const queryString = params.toString();
  return `/app/billing${queryString ? `?${queryString}` : ""}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { BillingService } = await import("../services/billing.server");
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

  const hasActiveSubscription = Boolean(
    resolvedCurrentPlan?.hasActiveSubscription ?? status?.hasActiveSubscription,
  );

  return {
    selectedPlan: selectedPlan
      ?? (resolvedCurrentPlan?.planId ? BillingService.getPlan(resolvedCurrentPlan.planId) : null),
    hasActiveSubscription,
    dashboardUrl: buildDashboardUrl(requestUrl.searchParams),
    billingUrl: buildBillingUrl(requestUrl.searchParams),
  };
}

export default function BillingThankYouPage() {
  const isEs = useIsSpanish();
  const data = useLoaderData<typeof loader>();
  const isApproved = data.hasActiveSubscription;

  useEffect(() => {
    if (!isApproved) {
      return;
    }
    const timeout = window.setTimeout(() => {
      window.location.assign(data.dashboardUrl);
    }, 2200);
    return () => window.clearTimeout(timeout);
  }, [data.dashboardUrl, isApproved]);

  return (
    <Page fullWidth>
      <AdminPageHeader
        eyebrow={isEs ? "Facturación" : "Billing"}
        title={isApproved
          ? (isEs ? "¡Pago confirmado!" : "Payment confirmed!")
          : (isEs ? "Aprobación pendiente" : "Approval pending")}
        description={
          isApproved
            ? (isEs
              ? "Tu suscripción quedó registrada en Shopify y ya puedes seguir usando el panel."
              : "Your subscription was confirmed in Shopify and you can continue in the dashboard.")
            : (isEs
              ? "No detectamos una suscripción activa. Si rechazaste el cargo, vuelve a intentarlo desde facturación."
              : "No active subscription was detected. If you declined the charge, retry from billing.")
        }
        backUrl={isApproved ? data.dashboardUrl : data.billingUrl}
        backLabel={isApproved ? (isEs ? "Ir al panel" : "Go to dashboard") : (isEs ? "Volver a facturación" : "Back to billing")}
        badge={
          <AdminStatusBadge tone={isApproved ? "success" : "attention"}>
            {isApproved
              ? (isEs ? "Suscripción activa" : "Active subscription")
              : (isEs ? "Sin aprobación" : "Not approved")}
          </AdminStatusBadge>
        }
      />
      <Layout>
        <Layout.Section>
          <AdminSectionCard
            title={isApproved
              ? (isEs ? "Gracias por elegir FluxBot" : "Thanks for choosing FluxBot")
              : (isEs ? "Completar aprobación en Shopify" : "Complete approval in Shopify")}
            description={
              isApproved
                ? (isEs
                  ? "Esta compra se procesó con Shopify Billing API y quedó asociada a tu tienda."
                  : "This purchase was processed through Shopify Billing API and linked to your shop.")
                : (isEs
                  ? "Para activar el plan debes aceptar el cargo en Shopify. Puedes volver a solicitar aprobación ahora."
                  : "To activate your plan you must approve the charge in Shopify. You can request approval again now.")
            }
          >
            <Banner
              tone={isApproved ? "success" : "warning"}
              title={isApproved
                ? (isEs ? "Suscripción confirmada" : "Subscription confirmed")
                : (isEs ? "Suscripción no confirmada" : "Subscription not confirmed")}
            >
              <p>
                {isApproved
                  ? (isEs
                    ? "Te redirigiremos al panel desde Shopify Admin sin pedir nuevamente el dominio de la tienda."
                    : "You are now back in Shopify Admin without being asked to manually enter the shop domain.")
                  : (isEs
                    ? "Si cancelaste o rechazaste el cobro, vuelve a facturación para solicitar aprobación otra vez."
                    : "If you cancelled or declined the charge, go back to billing and request approval again.")}
              </p>
            </Banner>
            {isApproved && (
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
            )}
            <Box paddingBlockStart="400">
              <Button url={isApproved ? data.dashboardUrl : data.billingUrl} variant="primary">
                {isApproved
                  ? (isEs ? "Ir al panel" : "Go to dashboard")
                  : (isEs ? "Volver a facturación" : "Back to billing")}
              </Button>
            </Box>
          </AdminSectionCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
