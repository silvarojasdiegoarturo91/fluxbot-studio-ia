import {
  Banner,
  Button,
  DataTable,
  FormLayout,
  Layout,
  Page,
  Select,
  Text,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { useState } from "react";
import { useIsSpanish } from "../hooks/use-admin-language";
import { authenticate } from "../shopify.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { BillingService, type BillingPlanId } from "../services/billing.server";
import { AdminPageHeader, AdminSectionCard, AdminStatusBadge } from "../components/admin-ui";

interface BillingActionData {
  ok: boolean;
  error?: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  try {
    const [status, plans] = await Promise.all([
      BillingService.getStatus(shop.id),
      Promise.resolve(BillingService.listPlans()),
    ]);

    return {
      shop,
      status,
      plans,
      error: null as string | null,
    };
  } catch (error) {
    return {
      shop,
      status: {
        hasActiveSubscription: false,
        subscriptions: [],
      },
      plans: BillingService.listPlans(),
      error: error instanceof Error ? error.message : "Failed to load billing status",
    };
  }
}

export async function action({ request }: ActionFunctionArgs): Promise<BillingActionData | Response> {
  if (request.method !== "POST") {
    return { ok: false, error: "Method not allowed" };
  }

  const { session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    return { ok: false, error: "Shop not found" };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent !== "create_subscription") {
    return { ok: false, error: "Unsupported action" };
  }

  const planId = String(formData.get("planId") || "") as BillingPlanId;
  const testMode = String(formData.get("testMode") || "true") !== "false";

  const selectedPlan = BillingService.getPlan(planId);
  if (!selectedPlan) {
    return { ok: false, error: "Invalid billing plan" };
  }

  try {
    const url = new URL(request.url);
    const returnUrl = `${url.origin}/app/billing${url.search || ""}`;

    const result = await BillingService.createSubscription({
      shopId: shop.id,
      planId,
      returnUrl,
      test: testMode,
    });

    return redirect(result.confirmationUrl);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to create subscription",
    };
  }
}

export default function BillingPage() {
  const location = useLocation();
  const isEs = useIsSpanish();
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const [planId, setPlanId] = useState<BillingPlanId>("starter");
  const [testMode, setTestMode] = useState("true");

  const isSubmitting = navigation.state === "submitting";
  const backToDashboardUrl = `/app${location.search || ""}`;

  const subscriptionRows = data.status.subscriptions.map((subscription) => [
    subscription.name,
    subscription.status,
    `${subscription.priceAmount} ${subscription.priceCurrency}`,
    subscription.interval,
    subscription.test
      ? (isEs ? "Si" : "Yes")
      : (isEs ? "No" : "No"),
  ]);

  return (
    <Page fullWidth>
      <AdminPageHeader
        eyebrow={isEs ? "Cuenta" : "Account"}
        title={isEs ? "Facturacion" : "Billing"}
        description={
          isEs
            ? "Consulta el estado del plan y activa el siguiente nivel de monetizacion sin salir del admin."
            : "Review plan status and activate the next monetization tier without leaving the admin."
        }
        backUrl={backToDashboardUrl}
        backLabel={isEs ? "Panel" : "Dashboard"}
        badge={
          <AdminStatusBadge tone={data.status.hasActiveSubscription ? "success" : "attention"}>
            {data.status.hasActiveSubscription ? (isEs ? "Suscripcion activa" : "Active subscription") : (isEs ? "Sin plan activo" : "No active plan")}
          </AdminStatusBadge>
        }
      />
      <Layout>
        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Estado de suscripcion" : "Subscription status"}
            description={isEs ? "Visibilidad actual del estado de cobro y el plan asignado a la tienda." : "Current visibility into billing state and the plan assigned to the shop."}
            badge={
              data.status.hasActiveSubscription ? (
                <AdminStatusBadge tone="success">{isEs ? "Activa" : "Active"}</AdminStatusBadge>
              ) : (
                <AdminStatusBadge tone="attention">{isEs ? "Sin plan activo" : "No active plan"}</AdminStatusBadge>
              )
            }
          >
              {data.error ? (
                <Banner tone="critical" title={isEs ? "No se pudo cargar el estado de facturacion" : "Billing status could not be loaded"}>
                  <p>{data.error}</p>
                </Banner>
              ) : null}

              {data.status.subscriptions.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={[
                    isEs ? "Nombre" : "Name",
                    isEs ? "Estado" : "Status",
                    isEs ? "Precio" : "Price",
                    isEs ? "Intervalo" : "Interval",
                    isEs ? "Prueba" : "Test",
                  ]}
                  rows={subscriptionRows}
                />
              ) : (
                <Text as="p" variant="bodyMd" tone="subdued">
                  {isEs
                    ? "Todavia no hay suscripciones activas para esta tienda."
                    : "There are no active subscriptions for this shop yet."}
                </Text>
              )}
          </AdminSectionCard>
        </Layout.Section>

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Crear o actualizar suscripcion" : "Create or update subscription"}
            description={isEs ? "Inicia la contratacion desde un flujo claro y mantén el cobro final en Shopify Admin." : "Start subscription from a clear flow while keeping final approval inside Shopify Admin."}
            badge={<AdminStatusBadge tone="info">{isEs ? "Control transversal" : "Cross-phase control"}</AdminStatusBadge>}
          >
              {actionData && "ok" in actionData && actionData.ok === false && actionData.error ? (
                <Banner tone="critical" title={isEs ? "No se pudo iniciar la suscripcion" : "Could not start subscription"}>
                  <p>{actionData.error}</p>
                </Banner>
              ) : null}

              <Form method="post">
                <FormLayout>
                  <input type="hidden" name="intent" value="create_subscription" />

                  <Select
                    label={isEs ? "Plan" : "Plan"}
                    options={data.plans.map((plan) => ({
                      label: `${plan.name} - $${plan.amountUsd}/30d`,
                      value: plan.id,
                    }))}
                    value={planId}
                    onChange={(value) => setPlanId(value as BillingPlanId)}
                  />
                  <input type="hidden" name="planId" value={planId} />

                  <Select
                    label={isEs ? "Modo de prueba" : "Test mode"}
                    options={[
                      { label: isEs ? "Si (recomendado en desarrollo)" : "Yes (recommended for development)", value: "true" },
                      { label: isEs ? "No (cargo real)" : "No (real charge)", value: "false" },
                    ]}
                    value={testMode}
                    onChange={setTestMode}
                  />
                  <input type="hidden" name="testMode" value={testMode} />

                  <Button submit variant="primary" loading={isSubmitting}>
                    {isEs ? "Continuar con Shopify Billing" : "Continue with Shopify Billing"}
                  </Button>
                </FormLayout>
              </Form>

              <Text as="p" variant="bodySm" tone="subdued">
                {isEs
                  ? "La confirmacion final del cobro siempre ocurre en Shopify Admin."
                  : "Final billing confirmation always happens in Shopify Admin."}
              </Text>
          </AdminSectionCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
