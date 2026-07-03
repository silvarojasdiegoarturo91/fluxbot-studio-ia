import {
  Banner,
  Box,
  Button,
  DataTable,
  FormLayout,
  Layout,
  Page,
  ProgressBar,
  Select,
  Text,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { useState } from "react";
import { useIsSpanish } from "../hooks/use-admin-language";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { BillingService, type BillingPlanId } from "../services/billing.server";
import { AdminPageHeader, AdminSectionCard, AdminStatusBadge } from "../components/admin-ui";

interface BillingActionData {
  ok: boolean;
  error?: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticateAdminRequest(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  try {
    const [status, plans, usageStatus] = await Promise.all([
      BillingService.getStatus(shop.id),
      Promise.resolve(BillingService.listPlans()),
      BillingService.getUsageStatus(shop.id),
    ]);

    return {
      shop,
      status,
      plans,
      usageStatus,
      error: null as string | null,
    };
  } catch (error) {
    return {
      shop,
      status: { hasActiveSubscription: false, subscriptions: [] },
      plans: BillingService.listPlans(),
      usageStatus: { currentUsage: 0, includedUsage: 500, billedBlocks: 0, cappedAmount: 100, status: "active" },
      error: error instanceof Error ? error.message : "Failed to load billing status",
    };
  }
}

export async function action({ request }: ActionFunctionArgs): Promise<BillingActionData | Response> {
  if (request.method !== "POST") {
    return { ok: false, error: "Method not allowed" };
  }

  const { session } = await authenticateAdminRequest(request);
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

  const { usageStatus } = data;
  const usagePct = usageStatus.includedUsage > 0
    ? Math.min(100, Math.round((usageStatus.currentUsage / usageStatus.includedUsage) * 100))
    : 0;
  const extraUsage = Math.max(0, usageStatus.currentUsage - usageStatus.includedUsage);
  const activePlan = data.plans.find((p) =>
    data.status.subscriptions.some((s) => s.name.toLowerCase().includes(p.id))
  );
  const extraBlockPrice = activePlan?.extraBlockPrice ?? 10;
  const billedAmount = usageStatus.billedBlocks * extraBlockPrice;
  const cappedPct = usageStatus.cappedAmount > 0
    ? Math.min(100, Math.round((billedAmount / usageStatus.cappedAmount) * 100))
    : 0;

  const subscriptionRows = data.status.subscriptions.map((subscription) => [
    subscription.name,
    subscription.status,
    `${subscription.priceAmount} ${subscription.priceCurrency}`,
    subscription.interval,
    subscription.test ? (isEs ? "Sí" : "Yes") : "No",
  ]);

  return (
    <Page fullWidth>
      <AdminPageHeader
        eyebrow={isEs ? "Cuenta" : "Account"}
        title={isEs ? "Facturación" : "Billing"}
        description={
          isEs
            ? "Consumo por tramos, estado del plan y activacion del siguiente nivel."
            : "Tranche usage, plan status and next tier activation."
        }
        backUrl={backToDashboardUrl}
        backLabel={isEs ? "Panel" : "Dashboard"}
        badge={
          <AdminStatusBadge tone={data.status.hasActiveSubscription ? "success" : "attention"}>
            {data.status.hasActiveSubscription
              ? (isEs ? "Suscripcion activa" : "Active subscription")
              : (isEs ? "Sin plan activo" : "No active plan")}
          </AdminStatusBadge>
        }
      />
      <Layout>

        {/* Usage meter */}
        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Consumo del ciclo actual" : "Current cycle usage"}
            description={
              isEs
                ? "Mensajes consumidos vs límite base. Cada bloque extra genera un cargo variable."
                : "Messages consumed vs base limit. Each extra block triggers a variable charge."
            }
            badge={
              usagePct >= 90
                ? <AdminStatusBadge tone="warning">{isEs ? "Próximo al límite" : "Approaching limit"}</AdminStatusBadge>
                : <AdminStatusBadge tone="success">{isEs ? "Con margen" : "Within limit"}</AdminStatusBadge>
            }
          >
            <Box paddingBlockEnd="400">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                {isEs ? "Mensajes del plan base" : "Base plan messages"}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {usageStatus.currentUsage.toLocaleString()} / {usageStatus.includedUsage.toLocaleString()} ({usagePct}%)
              </Text>
              <Box paddingBlockStart="200">
                <ProgressBar
                  progress={usagePct}
                  tone={usagePct >= 90 ? "highlight" : "primary"}
                  size="medium"
                />
              </Box>
            </Box>

            {extraUsage > 0 && (
              <Box paddingBlockEnd="400">
                <Banner tone="warning" title={isEs ? "Tramos extra activos" : "Extra tranches active"}>
                  <p>
                    {isEs
                      ? `${extraUsage.toLocaleString()} mensajes adicionales consumidos — ${usageStatus.billedBlocks} tramo(s) cobrado(s) ($${billedAmount.toFixed(2)} USD).`
                      : `${extraUsage.toLocaleString()} extra messages used — ${usageStatus.billedBlocks} tranche(s) charged ($${billedAmount.toFixed(2)} USD).`}
                  </p>
                </Banner>
              </Box>
            )}

            <Box paddingBlockEnd="200">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                {isEs ? "Tope de cargo variable" : "Variable charge cap"}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                ${billedAmount.toFixed(2)} / ${usageStatus.cappedAmount.toFixed(2)} USD ({cappedPct}%)
              </Text>
              <Box paddingBlockStart="200">
                <ProgressBar
                  progress={cappedPct}
                  tone={cappedPct >= 80 ? "highlight" : "primary"}
                  size="small"
                />
              </Box>
            </Box>
          </AdminSectionCard>
        </Layout.Section>

        {/* Current subscriptions */}
        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Estado de suscripción" : "Subscription status"}
            description={isEs ? "Plan activo y estado de cobro." : "Active plan and billing state."}
            badge={
              data.status.hasActiveSubscription
                ? <AdminStatusBadge tone="success">{isEs ? "Activa" : "Active"}</AdminStatusBadge>
                : <AdminStatusBadge tone="attention">{isEs ? "Sin plan" : "No plan"}</AdminStatusBadge>
            }
          >
            {data.error && (
              <Banner tone="critical" title={isEs ? "Error cargando estado" : "Error loading status"}>
                <p>{data.error}</p>
              </Banner>
            )}

            {data.status.subscriptions.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text"]}
                headings={[
                  isEs ? "Nombre" : "Name",
                  isEs ? "Estado" : "Status",
                  isEs ? "Precio base" : "Base price",
                  isEs ? "Intervalo" : "Interval",
                  isEs ? "Prueba" : "Test",
                ]}
                rows={subscriptionRows}
              />
            ) : (
              <Text as="p" variant="bodyMd" tone="subdued">
                {isEs
                  ? "No hay suscripciones activas para esta tienda."
                  : "There are no active subscriptions for this shop."}
              </Text>
            )}
          </AdminSectionCard>
        </Layout.Section>

        {/* Plan change form */}
        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Cambiar plan" : "Change plan"}
            description={
              isEs
                ? "Plan con cargo base mensual + tramos variables automaticos al superar los mensajes incluidos."
                : "Plan with monthly base charge + automatic variable tranches when included messages are exceeded."
            }
            badge={<AdminStatusBadge tone="info">{isEs ? "Pago por tramos" : "Tranche billing"}</AdminStatusBadge>}
          >
            {actionData && "ok" in actionData && !actionData.ok && actionData.error && (
              <Banner tone="critical" title={isEs ? "Error al iniciar suscripción" : "Subscription error"}>
                <p>{actionData.error}</p>
              </Banner>
            )}

            <Form method="post">
              <FormLayout>
                <input type="hidden" name="intent" value="create_subscription" />

                <Select
                  label={isEs ? "Plan" : "Plan"}
                  options={data.plans.map((plan) => ({
                    label: `${plan.name} — $${plan.amountUsd}/mes · ${plan.includedMessages.toLocaleString()} msgs · +$${plan.extraBlockPrice} c/${plan.extraBlockSize} msgs extra (tope $${plan.cappedAmountUsd})`,
                    value: plan.id,
                  }))}
                  value={planId}
                  onChange={(value) => setPlanId(value as BillingPlanId)}
                />
                <input type="hidden" name="planId" value={planId} />

                <Select
                  label={isEs ? "Modo de prueba" : "Test mode"}
                  options={[
                    { label: isEs ? "Sí (desarrollo)" : "Yes (development)", value: "true" },
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

            <Box paddingBlockStart="300">
              <Text as="p" variant="bodySm" tone="subdued">
                {isEs
                  ? "La aprobacion final ocurre en Shopify Admin. Los tramos extra se cobran automaticamente al superar cada bloque de mensajes."
                  : "Final approval happens in Shopify Admin. Extra tranches are charged automatically when each message block is exceeded."}
              </Text>
            </Box>
          </AdminSectionCard>
        </Layout.Section>

      </Layout>
    </Page>
  );
}
