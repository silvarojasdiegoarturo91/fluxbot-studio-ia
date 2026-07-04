import {
  Banner,
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  InlineGrid,
  InlineStack,
  List,
  Layout,
  Page,
  ProgressBar,
  Text,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { useEffect } from "react";
import { useIsSpanish } from "../hooks/use-admin-language";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { ensureShopForSession } from "../services/shop-context.server";
import {
  BillingService,
  type ActiveSubscription,
  type BillingPlan,
  type BillingPlanId,
} from "../services/billing.server";
import { AdminPageHeader, AdminSectionCard, AdminStatusBadge } from "../components/admin-ui";

interface BillingActionData {
  ok: boolean;
  error?: string;
  confirmationUrl?: string;
}

const BILLING_RETURN_QUERY_KEYS = ["shop", "host", "embedded"] as const;

function buildDashboardUrlFromSearch(searchParams: URLSearchParams): string {
  const params = new URLSearchParams();
  for (const key of BILLING_RETURN_QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value) {
      params.set(key, value);
    }
  }
  const queryString = params.toString();
  return `/app${queryString ? `?${queryString}` : ""}`;
}

export function buildBillingReturnUrl(options: {
  requestUrl: URL;
  planId: BillingPlanId;
  sessionShopDomain?: string;
}): string {
  const { requestUrl, planId, sessionShopDomain } = options;
  const returnUrl = new URL("/app/billing/thank-you", requestUrl.origin);
  const sourceParams = requestUrl.searchParams;
  const shop = sourceParams.get("shop") || sessionShopDomain;
  const host = sourceParams.get("host");
  const embedded = sourceParams.get("embedded");

  if (shop) {
    returnUrl.searchParams.set("shop", shop);
  }
  if (host) {
    returnUrl.searchParams.set("host", host);
  }
  if (embedded) {
    returnUrl.searchParams.set("embedded", embedded);
  }
  returnUrl.searchParams.set("plan", planId);

  // Shopify enforces max 255 chars for returnUrl.
  if (returnUrl.toString().length > 255) {
    returnUrl.searchParams.delete("embedded");
  }
  if (returnUrl.toString().length > 255) {
    returnUrl.searchParams.delete("plan");
  }
  if (returnUrl.toString().length > 255) {
    returnUrl.searchParams.delete("host");
  }

  return returnUrl.toString();
}

type BillingPlanDirection = "initial" | "upgrade" | "downgrade";

export type BillingPlanCard = {
  plan: BillingPlan;
  direction: BillingPlanDirection;
  badgeLabel: string;
  ctaLabel: string;
  iconLabel: string;
  isRecommended: boolean;
  featureBullets: string[];
};

function formatIsoDateLabel(value?: string, isEs = false): string {
  if (!value) return isEs ? "No disponible" : "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return isEs ? "No disponible" : "Not available";
  return parsed.toLocaleDateString(isEs ? "es-ES" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function resolvePlanIdFromSubscriptionName(name: string, plans: BillingPlan[]): BillingPlanId | null {
  const normalized = name.trim().toLowerCase();
  const matched = plans.find((plan) =>
    plan.name.trim().toLowerCase() === normalized || normalized.includes(plan.id),
  );
  return matched?.id ?? null;
}

export function resolveActivePlanId(options: {
  plans: BillingPlan[];
  activePlanCode?: string;
  subscriptions: ActiveSubscription[];
}): BillingPlanId | null {
  const { plans, activePlanCode, subscriptions } = options;
  if (activePlanCode && plans.some((plan) => plan.id === activePlanCode)) {
    return activePlanCode as BillingPlanId;
  }

  for (const subscription of subscriptions) {
    const candidate = resolvePlanIdFromSubscriptionName(subscription.name, plans);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function planIconLabel(planId: BillingPlanId): string {
  if (planId === "starter") return "S";
  if (planId === "growth") return "G";
  return "P";
}

function buildPlanFeatureBullets(plan: BillingPlan, isEs: boolean): string[] {
  const conversationLimit =
    plan.id === "starter" ? 500 : plan.id === "growth" ? 2000 : 10000;
  const agentLimit =
    plan.id === "starter" ? 1 : plan.id === "growth" ? 3 : 10;
  const personalizationLabel =
    plan.id === "starter"
      ? (isEs ? "Personalización básica" : "Basic personalization")
      : plan.id === "growth"
        ? (isEs ? "Personalización avanzada" : "Advanced personalization")
        : (isEs ? "Personalización enterprise" : "Enterprise personalization");
  const supportLabel =
    plan.id === "starter"
      ? (isEs ? "Soporte estándar" : "Standard support")
      : plan.id === "growth"
        ? (isEs ? "Soporte prioritario" : "Priority support")
        : (isEs ? "Soporte dedicado" : "Dedicated support");
  return [
    isEs
      ? `${conversationLimit.toLocaleString()} conversaciones/mes`
      : `${conversationLimit.toLocaleString()} conversations/month`,
    isEs
      ? `${plan.includedMessages.toLocaleString()} mensajes incluidos/mes`
      : `${plan.includedMessages.toLocaleString()} included messages/month`,
    isEs
      ? `${agentLimit} agentes/chatbots`
      : `${agentLimit} agents/chatbots`,
    isEs
      ? `Bloques extra: ${plan.extraBlockSize.toLocaleString()} por $${plan.extraBlockPrice}`
      : `Extra blocks: ${plan.extraBlockSize.toLocaleString()} per $${plan.extraBlockPrice}`,
    isEs
      ? `Tope variable: $${plan.cappedAmountUsd} USD`
      : `Variable cap: $${plan.cappedAmountUsd} USD`,
    personalizationLabel,
    supportLabel,
    isEs ? "Integraciones Shopify y panel embebido" : "Shopify integrations and embedded admin",
  ];
}

export function buildBillingPlanCards(options: {
  plans: BillingPlan[];
  activePlanId: BillingPlanId | null;
  hasUnknownActivePlan: boolean;
  isEs: boolean;
}): BillingPlanCard[] {
  const { plans, activePlanId, hasUnknownActivePlan, isEs } = options;
  const activePlan = activePlanId ? plans.find((plan) => plan.id === activePlanId) ?? null : null;
  const availablePlans = activePlanId ? plans.filter((plan) => plan.id !== activePlanId) : plans;
  const upgrades = availablePlans.filter((plan) => {
    if (hasUnknownActivePlan) return true;
    if (!activePlan) return true;
    return plan.amountUsd > activePlan.amountUsd;
  });
  const recommendedPlanId = upgrades.length > 0
    ? upgrades.sort((a, b) => a.amountUsd - b.amountUsd)[0]?.id
    : undefined;

  return availablePlans.map((plan) => {
    let direction: BillingPlanDirection = "initial";
    if (hasUnknownActivePlan) {
      direction = "upgrade";
    } else if (activePlan) {
      direction = plan.amountUsd > activePlan.amountUsd ? "upgrade" : "downgrade";
    }

    const badgeLabel =
      direction === "upgrade"
        ? (isEs ? "Upgrade" : "Upgrade")
        : direction === "downgrade"
          ? (isEs ? "Downgrade" : "Downgrade")
          : (isEs ? "Nuevo plan" : "New plan");
    const ctaLabel =
      direction === "upgrade"
        ? (isEs ? `Subir a ${plan.name}` : `Upgrade to ${plan.name}`)
        : direction === "downgrade"
          ? (isEs ? `Bajar a ${plan.name}` : `Downgrade to ${plan.name}`)
          : (isEs ? `Elegir ${plan.name}` : `Choose ${plan.name}`);

    return {
      plan,
      direction,
      badgeLabel,
      ctaLabel,
      iconLabel: planIconLabel(plan.id),
      isRecommended: plan.id === recommendedPlanId,
      featureBullets: buildPlanFeatureBullets(plan, isEs),
    };
  });
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
      BillingService.listPlans(shop.id),
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
      plans: await BillingService.listPlans(),
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

  const selectedPlan = BillingService.getPlan(planId);
  if (!selectedPlan) {
    return { ok: false, error: "Invalid billing plan" };
  }

  try {
    const requestUrl = new URL(request.url);
    const sessionShopDomain = (session as unknown as { shop?: string }).shop;
    const returnUrl = buildBillingReturnUrl({
      requestUrl,
      planId,
      sessionShopDomain,
    });

    const result = await BillingService.createSubscription({
      shopId: shop.id,
      planId,
      returnUrl,
      // Pass session credentials directly so createSubscription never needs a DB
      // lookup for the access token, avoiding stale-token failures.
      shopDomain: sessionShopDomain,
      accessToken: (session as unknown as { accessToken?: string }).accessToken,
    });

    return {
      ok: true,
      confirmationUrl: result.confirmationUrl,
    };
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
  const isSubmitting = navigation.state === "submitting";
  const submittingPlanId = isSubmitting ? String(navigation.formData?.get("planId") || "") : "";
  const backToDashboardUrl = buildDashboardUrlFromSearch(new URLSearchParams(location.search));

  // When Shopify returns a confirmationUrl, navigate the TOP-LEVEL frame.
  // A simple redirect() navigates the iframe itself, which causes admin.shopify.com
  // to reject the connection because the parent domain blocks iframe navigation.
  useEffect(() => {
    const url = actionData && "confirmationUrl" in actionData ? actionData.confirmationUrl : undefined;
    if (url) {
      const target = typeof window !== "undefined" && window.top ? window.top : window;
      target.location.href = url;
    }
  }, [actionData]);

  const { usageStatus } = data;
  const usagePct = usageStatus.includedUsage > 0
    ? Math.min(100, Math.round((usageStatus.currentUsage / usageStatus.includedUsage) * 100))
    : 0;
  const extraUsage = Math.max(0, usageStatus.currentUsage - usageStatus.includedUsage);
  const activePlanId = resolveActivePlanId({
    plans: data.plans,
    activePlanCode: data.usageStatus.activePlanCode,
    subscriptions: data.status.subscriptions,
  });
  const activeSubscription = data.status.subscriptions[0] ?? null;
  const activePlan = activePlanId ? data.plans.find((plan) => plan.id === activePlanId) ?? null : null;
  const hasUnknownActivePlan = data.status.hasActiveSubscription && !activePlanId;
  const availablePlanCards = buildBillingPlanCards({
    plans: data.plans,
    activePlanId,
    hasUnknownActivePlan,
    isEs,
  });
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
    formatIsoDateLabel(subscription.createdAt, isEs),
    subscription.test ? (isEs ? "Sí" : "Yes") : "No",
  ]);

  return (
    <Page fullWidth>
      <AdminPageHeader
        eyebrow={isEs ? "Cuenta" : "Account"}
        title={isEs ? "Facturación" : "Billing"}
        description={
          isEs
            ? "Consumo por tramos, estado del plan y activación del siguiente nivel."
            : "Tranche usage, plan status and next tier activation."
        }
        backUrl={backToDashboardUrl}
        backLabel={isEs ? "Panel" : "Dashboard"}
        badge={
          <AdminStatusBadge tone={data.status.hasActiveSubscription ? "success" : "attention"}>
            {data.status.hasActiveSubscription
              ? (isEs ? "Suscripción activa" : "Active subscription")
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
                columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                headings={[
                  isEs ? "Nombre" : "Name",
                  isEs ? "Estado" : "Status",
                  isEs ? "Precio base" : "Base price",
                  isEs ? "Intervalo" : "Interval",
                  isEs ? "Activa desde" : "Active since",
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
                ? "Tu plan actual se muestra como estado. Solo verás opciones válidas de upgrade o downgrade."
                : "Your current plan is shown as status. You only see valid upgrade or downgrade options."
            }
            badge={<AdminStatusBadge tone="info">{isEs ? "Pago por tramos" : "Tranche billing"}</AdminStatusBadge>}
          >
            {actionData && "ok" in actionData && !actionData.ok && actionData.error && (
              <Banner tone="critical" title={isEs ? "Error al iniciar suscripción" : "Subscription error"}>
                <p>{actionData.error}</p>
              </Banner>
            )}
            <Box paddingBlockEnd="400">
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">
                      {isEs ? "Plan actual" : "Current plan"}
                    </Text>
                    <Badge tone={data.status.hasActiveSubscription ? "success" : "attention"}>
                      {data.status.hasActiveSubscription
                        ? (isEs ? "Activo" : "Active")
                        : (isEs ? "Sin plan de pago" : "No paid plan")}
                    </Badge>
                  </InlineStack>
                  <Text as="p" variant="headingMd">
                    {activePlan?.name
                      || (hasUnknownActivePlan
                        ? (isEs ? "Plan externo detectado" : "External plan detected")
                        : (isEs ? "Plan Free" : "Free plan"))}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {isEs ? "Activo desde:" : "Active since:"} {formatIsoDateLabel(activeSubscription?.createdAt, isEs)}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {isEs ? "Estado:" : "Status:"} {activeSubscription?.status || (isEs ? "Sin suscripción" : "No subscription")}
                  </Text>
                </BlockStack>
              </Card>
            </Box>

            {availablePlanCards.length === 0 ? (
              <Banner tone="info" title={isEs ? "Sin cambios disponibles" : "No plan changes available"}>
                <p>{isEs ? "Ya estás en el mejor plan disponible." : "You are already on the best available plan."}</p>
              </Banner>
            ) : (
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                {availablePlanCards.map((card) => (
                  <Card key={card.plan.id}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 28,
                              height: 28,
                              borderRadius: 999,
                              background: "var(--p-color-bg-surface-secondary)",
                              fontWeight: 600,
                            }}
                          >
                            {card.iconLabel}
                          </span>
                          <Text as="h3" variant="headingSm">{card.plan.name}</Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone={card.direction === "upgrade" ? "success" : card.direction === "downgrade" ? "attention" : "info"}>
                            {card.badgeLabel}
                          </Badge>
                          {card.isRecommended ? (
                            <Badge tone="success">{isEs ? "Recomendado" : "Recommended"}</Badge>
                          ) : null}
                        </InlineStack>
                      </InlineStack>

                      <Text as="p" variant="headingLg">
                        ${card.plan.amountUsd}/{isEs ? "mes" : "month"}
                      </Text>

                      <List type="bullet">
                        {card.featureBullets.map((item) => (
                          <List.Item key={`${card.plan.id}-${item}`}>{item}</List.Item>
                        ))}
                      </List>

                      <Form method="post">
                        <input type="hidden" name="intent" value="create_subscription" />
                        <input type="hidden" name="planId" value={card.plan.id} />
                        <BlockStack gap="200">
                          <Button
                            submit
                            variant="primary"
                            loading={submittingPlanId === card.plan.id}
                          >
                            {card.ctaLabel}
                          </Button>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {isEs
                              ? "Shopify gestiona el reemplazo, cobro proporcional y activación del nuevo plan."
                              : "Shopify handles replacement, proration, and activation of the new plan."}
                          </Text>
                        </BlockStack>
                      </Form>
                    </BlockStack>
                  </Card>
                ))}
              </InlineGrid>
            )}
          </AdminSectionCard>
        </Layout.Section>

      </Layout>
    </Page>
  );
}
