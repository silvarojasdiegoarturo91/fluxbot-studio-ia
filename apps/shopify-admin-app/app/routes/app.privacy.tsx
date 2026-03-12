import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Badge,
  InlineGrid,
  DataTable,
  EmptyState,
  Button,
  FormLayout,
  TextField,
  Select,
  Banner,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { ensureShopForSession } from "../services/shop-context.server";
import {
  AuditReportService,
  BreachNotificationService,
  ComplianceSIEMExportService,
  DataResidencyService,
  LegalHoldService,
  ProcessingRecordService,
  RegionalDeploymentControlService,
  RetentionEnforcementService,
  SupportAgentAccessService,
  type LegalHoldScope,
  type DataRegion,
  type SIEMConnectorTarget,
} from "../services/enterprise-compliance.server";
import { getDeliveryStatus } from "../services/delivery.server";
import { getProactiveJobSchedulerStats } from "../jobs/scheduler.server";
import { getMerchantAdminConfig } from "../services/admin-config.server";
import { useIsSpanish } from "../hooks/use-admin-language";

interface PrivacyActionResponse {
  ok: boolean;
  message?: string;
  error?: string;
  siemExport?: {
    exportId: string;
    generatedAt: string;
    windowDays: number;
    eventCount: number;
  };
  siemDispatch?: {
    connectors: Array<{
      connector: SIEMConnectorTarget;
      attempted: boolean;
      delivered: boolean;
      statusCode?: number;
      ingestedEvents?: number;
      error?: string;
    }>;
  };
}

function parseDays(raw: string | null, defaultValue = 365) {
  const parsed = Number(raw || defaultValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return Math.min(3650, Math.floor(parsed));
}

function parseBoolean(raw: FormDataEntryValue | null, fallback = false) {
  if (raw === null || raw === undefined) {
    return fallback;
  }

  const normalized = String(raw).toLowerCase().trim();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return fallback;
}

function parseRegions(raw: string): DataRegion[] {
  const validRegions: DataRegion[] = ["EU", "US", "APAC", "GLOBAL"];
  return raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is DataRegion => validRegions.includes(item as DataRegion));
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = parseDays(url.searchParams.get("days"), 365);

  const shop = await ensureShopForSession(session);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const existingActivities = await ProcessingRecordService.getActivities(shop.id);
  if (existingActivities.length === 0) {
    await ProcessingRecordService.seedDefaultActivities(shop.id);
  }

  const [report, residencyConfig, breaches] = await Promise.all([
    AuditReportService.generateReport(shop.id, days),
    DataResidencyService.getConfig(shop.id),
    BreachNotificationService.getBreaches(shop.id),
  ]);

  const retentionPolicy = RetentionEnforcementService.getPolicy(shop.id);
  const [deploymentControl, legalHolds, activeLegalHolds] = await Promise.all([
    RegionalDeploymentControlService.getConfig(shop.id),
    LegalHoldService.list(shop.id, { includeReleased: true }),
    LegalHoldService.getActiveHoldCount(shop.id),
  ]);
  const scheduler = getProactiveJobSchedulerStats();

  return {
    shop,
    days,
    report,
    residencyConfig,
    breaches,
    processingActivities: await ProcessingRecordService.getActivities(shop.id),
    activeSupportTokens: SupportAgentAccessService.getActiveTokenCount(shop.id),
    deliveryStatus: getDeliveryStatus(),
    retentionPolicy,
    deploymentControl,
    legalHolds,
    activeLegalHolds,
    scheduler,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return {
      ok: false,
      error: "Method not allowed",
    } satisfies PrivacyActionResponse;
  }

  const { session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    return {
      ok: false,
      error: "Shop not found",
    } satisfies PrivacyActionResponse;
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const adminConfig = await getMerchantAdminConfig(shop.id);
  const isEs = adminConfig.adminLanguage === "es";

  if (intent === "set_residency") {
    const rawRegion = String(formData.get("region") || "GLOBAL").toUpperCase();
    const validRegions: DataRegion[] = ["EU", "US", "APAC", "GLOBAL"];

    if (!validRegions.includes(rawRegion as DataRegion)) {
      return {
        ok: false,
        error: isEs ? "Region invalida" : "Invalid region",
      } satisfies PrivacyActionResponse;
    }

    const countriesInput = String(formData.get("enforcedCountries") || "");
    const countries = countriesInput
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter((item) => item.length > 0);

    await DataResidencyService.setConfig(shop.id, rawRegion as DataRegion, countries);
    return {
      ok: true,
      message: isEs ? "Politica de residencia de datos actualizada." : "Data residency policy updated.",
    } satisfies PrivacyActionResponse;
  }

  if (intent === "set_retention_policy") {
    const convDaysRaw = Number(formData.get("conversationRetentionDays") || "365");
    const behaviorDaysRaw = Number(formData.get("behaviorEventRetentionDays") || "90");

    RetentionEnforcementService.setPolicy(shop.id, {
      conversationRetentionDays: Number.isFinite(convDaysRaw) ? convDaysRaw : 365,
      behaviorEventRetentionDays: Number.isFinite(behaviorDaysRaw) ? behaviorDaysRaw : 90,
    });

    return {
      ok: true,
      message: isEs ? "Politica de retencion actualizada." : "Retention policy updated.",
    } satisfies PrivacyActionResponse;
  }

  if (intent === "run_retention_now") {
    const result = await RetentionEnforcementService.enforce(shop.id);
    const suffix = result.skipped && result.skipReason ? ` ${result.skipReason}` : "";
    return {
      ok: true,
      message: isEs
        ? `Ejecucion de retencion completada. Conversaciones eliminadas: ${result.conversationsDeleted}, eventos eliminados: ${result.eventsDeleted}.${suffix}`
        : `Retention run completed. Conversations deleted: ${result.conversationsDeleted}, events deleted: ${result.eventsDeleted}.${suffix}`,
    } satisfies PrivacyActionResponse;
  }

  if (intent === "seed_processing_activities") {
    await ProcessingRecordService.seedDefaultActivities(shop.id);
    return {
      ok: true,
      message: isEs ? "Actividades de procesamiento por defecto creadas." : "Default processing activities seeded.",
    } satisfies PrivacyActionResponse;
  }

  if (intent === "set_deployment_control") {
    const rawPrimaryRegion = String(formData.get("primaryRegion") || "GLOBAL").toUpperCase();
    const validRegions: DataRegion[] = ["EU", "US", "APAC", "GLOBAL"];
    const primaryRegion: DataRegion = validRegions.includes(rawPrimaryRegion as DataRegion)
      ? (rawPrimaryRegion as DataRegion)
      : "GLOBAL";

    const failoverRegions = parseRegions(String(formData.get("failoverRegions") || ""))
      .filter((region) => region !== primaryRegion);

    const strictIsolation = parseBoolean(formData.get("strictIsolation"), false);
    const piiRestrictedToPrimary = parseBoolean(formData.get("piiRestrictedToPrimary"), false);

    await RegionalDeploymentControlService.setConfig(shop.id, {
      primaryRegion,
      failoverRegions,
      strictIsolation,
      piiRestrictedToPrimary,
    });

    return {
      ok: true,
      message: isEs ? "Controles de despliegue regional actualizados." : "Regional deployment controls updated.",
    } satisfies PrivacyActionResponse;
  }

  if (intent === "create_legal_hold") {
    const title = String(formData.get("holdTitle") || "").trim();
    const reason = String(formData.get("holdReason") || "").trim();
    const scopeRaw = String(formData.get("holdScope") || "ALL").toUpperCase();
    const validScope: LegalHoldScope[] = [
      "ALL",
      "CONVERSATIONS",
      "BEHAVIOR_EVENTS",
      "AUDIT_LOGS",
      "CONSENT_RECORDS",
    ];

    if (title.length === 0 || reason.length === 0) {
      return {
        ok: false,
        error: isEs ? "El titulo y motivo del bloqueo legal son obligatorios." : "Legal hold title and reason are required.",
      } satisfies PrivacyActionResponse;
    }

    const scope: LegalHoldScope[] = validScope.includes(scopeRaw as LegalHoldScope)
      ? [scopeRaw as LegalHoldScope]
      : ["ALL"];

    const expiresAtRaw = String(formData.get("holdExpiresAt") || "").trim();
    let expiresAt: Date | undefined;
    if (expiresAtRaw.length > 0) {
      const parsedDate = new Date(expiresAtRaw);
      if (Number.isNaN(parsedDate.getTime())) {
        return {
          ok: false,
          error: isEs ? "Fecha de expiracion de bloqueo legal invalida." : "Invalid legal hold expiration date.",
        } satisfies PrivacyActionResponse;
      }
      expiresAt = parsedDate;
    }

    await LegalHoldService.create(shop.id, {
      title,
      reason,
      scope,
      placedBy: "admin",
      expiresAt,
    });

    return {
      ok: true,
      message: isEs ? "Bloqueo legal creado." : "Legal hold created.",
    } satisfies PrivacyActionResponse;
  }

  if (intent === "release_legal_hold") {
    const holdId = String(formData.get("holdId") || "").trim();
    if (holdId.length === 0) {
      return {
        ok: false,
        error: isEs ? "Falta el ID del bloqueo legal" : "Missing legal hold ID",
      } satisfies PrivacyActionResponse;
    }

    const released = await LegalHoldService.release(
      shop.id,
      holdId,
      "admin",
      "Manual release from admin UI",
    );
    if (!released) {
      return {
        ok: false,
        error: isEs ? "Bloqueo legal no encontrado o ya liberado." : "Legal hold not found or already released.",
      } satisfies PrivacyActionResponse;
    }

    return {
      ok: true,
      message: isEs ? "Bloqueo legal liberado." : "Legal hold released.",
    } satisfies PrivacyActionResponse;
  }

  if (intent === "export_siem") {
    const windowDays = parseDays(String(formData.get("siemWindowDays") || "30"), 30);
    const dispatchConnectors = parseBoolean(formData.get("dispatchConnectors"), false);
    const connectorsRaw = String(formData.get("siemConnectors") || "datadog,splunk");
    const connectors = connectorsRaw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry): entry is SIEMConnectorTarget => entry === "datadog" || entry === "splunk");

    const result = await ComplianceSIEMExportService.generateNDJSON(shop.id, windowDays);
    const dispatch = dispatchConnectors
      ? await ComplianceSIEMExportService.dispatchToConnectors(
        result,
        connectors.length > 0 ? connectors : ["datadog", "splunk"],
      )
      : undefined;

    const deliveredCount = dispatch
      ? dispatch.connectors.filter((item) => item.delivered).length
      : 0;

    return {
      ok: true,
      message: dispatch
        ? isEs
          ? `Exportacion SIEM generada (${result.eventCount} eventos). Conectores entregados: ${deliveredCount}/${dispatch.connectors.length}.`
          : `SIEM export generated (${result.eventCount} events). Connectors delivered: ${deliveredCount}/${dispatch.connectors.length}.`
        : isEs
          ? `Exportacion SIEM generada (${result.eventCount} eventos).`
          : `SIEM export generated (${result.eventCount} events).`,
      siemExport: {
        exportId: result.exportId,
        generatedAt: result.generatedAt.toISOString(),
        windowDays: result.windowDays,
        eventCount: result.eventCount,
      },
      siemDispatch: dispatch ? { connectors: dispatch.connectors } : undefined,
    } satisfies PrivacyActionResponse;
  }

  return {
    ok: false,
    error: isEs ? "Accion no soportada" : "Unsupported action",
  } satisfies PrivacyActionResponse;
}

export default function PrivacyPage() {
  const location = useLocation();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isEs = useIsSpanish();
  const {
    shop,
    days,
    report,
    residencyConfig,
    breaches,
    processingActivities,
    activeSupportTokens,
    deliveryStatus,
    retentionPolicy,
    deploymentControl,
    legalHolds,
    activeLegalHolds,
    scheduler,
  } = useLoaderData<typeof loader>();

  const [region, setRegion] = useState<DataRegion>(residencyConfig.region as DataRegion);
  const [enforcedCountriesInput, setEnforcedCountriesInput] = useState(
    residencyConfig.enforcedCountries.join(", "),
  );
  const [conversationRetentionDays, setConversationRetentionDays] = useState(
    String(retentionPolicy.conversationRetentionDays),
  );
  const [behaviorEventRetentionDays, setBehaviorEventRetentionDays] = useState(
    String(retentionPolicy.behaviorEventRetentionDays),
  );
  const [primaryRegion, setPrimaryRegion] = useState<DataRegion>(
    deploymentControl.primaryRegion as DataRegion,
  );
  const [failoverRegionsInput, setFailoverRegionsInput] = useState(
    deploymentControl.failoverRegions.join(", "),
  );
  const [strictIsolation, setStrictIsolation] = useState(
    deploymentControl.strictIsolation ? "true" : "false",
  );
  const [piiRestrictedToPrimary, setPiiRestrictedToPrimary] = useState(
    deploymentControl.piiRestrictedToPrimary ? "true" : "false",
  );
  const [holdTitle, setHoldTitle] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [holdScope, setHoldScope] = useState<LegalHoldScope>("ALL");
  const [holdExpiresAt, setHoldExpiresAt] = useState("");
  const [siemWindowDays, setSiemWindowDays] = useState("30");
  const [siemConnectors, setSiemConnectors] = useState("datadog,splunk");
  const [dispatchConnectors, setDispatchConnectors] = useState("false");

  useEffect(() => {
    setRegion(residencyConfig.region as DataRegion);
    setEnforcedCountriesInput(residencyConfig.enforcedCountries.join(", "));
    setConversationRetentionDays(String(retentionPolicy.conversationRetentionDays));
    setBehaviorEventRetentionDays(String(retentionPolicy.behaviorEventRetentionDays));
    setPrimaryRegion(deploymentControl.primaryRegion as DataRegion);
    setFailoverRegionsInput(deploymentControl.failoverRegions.join(", "));
    setStrictIsolation(deploymentControl.strictIsolation ? "true" : "false");
    setPiiRestrictedToPrimary(deploymentControl.piiRestrictedToPrimary ? "true" : "false");
  }, [residencyConfig, retentionPolicy, deploymentControl]);

  const backToDashboardUrl = `/app${location.search || ""}`;
  const schedulerRetention = scheduler?.retention;

  const consentRows = Object.entries(report.consentBreakdown).map(([type, count]) => [
    type,
    String(count),
  ]);
  const schedulerRetentionLastRun = schedulerRetention?.lastRunAt
    ? new Date(schedulerRetention.lastRunAt).toLocaleString()
    : isEs ? "Nunca" : "Never";
  const isSubmitting = navigation.state === "submitting";
  const legalHoldRows = legalHolds.map((hold) => [
    hold.title,
    hold.scope.join(", "),
    hold.releasedAt ? (isEs ? "Liberado" : "Released") : (isEs ? "Activo" : "Active"),
    hold.expiresAt ? new Date(hold.expiresAt).toLocaleString() : isEs ? "Sin vencimiento" : "No expiry",
    hold.releasedAt
      ? "-"
      : (
        <Form method="post">
          <input type="hidden" name="intent" value="release_legal_hold" />
          <input type="hidden" name="holdId" value={hold.id} />
          <Button submit loading={isSubmitting}>{isEs ? "Liberar" : "Release"}</Button>
        </Form>
      ),
  ]);
  const lastSiemExport = actionData?.siemExport;
  const lastSiemDispatchRows =
    actionData?.siemDispatch?.connectors?.map((connector) => [
      connector.connector,
      connector.attempted ? (isEs ? "Si" : "Yes") : (isEs ? "No" : "No"),
      connector.delivered ? (isEs ? "Si" : "Yes") : (isEs ? "No" : "No"),
      connector.statusCode ? String(connector.statusCode) : "-",
      connector.ingestedEvents ? String(connector.ingestedEvents) : "-",
      connector.error || "-",
    ]) ?? [];

  return (
    <Page
      title={isEs ? "Privacidad y cumplimiento" : "Privacy & Compliance"}
      subtitle={isEs ? `${shop.domain} • Ultimos ${days} dias` : `${shop.domain} • Last ${days} days`}
      backAction={{ content: isEs ? "Panel" : "Dashboard", url: backToDashboardUrl }}
    >
      <Layout>
        {actionData?.ok && actionData.message ? (
          <Layout.Section>
            <Banner tone="success" title={actionData.message} />
          </Layout.Section>
        ) : null}

        {!actionData?.ok && actionData?.error ? (
          <Layout.Section>
            <Banner tone="critical" title={actionData.error} />
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Eventos de consentimiento (365d)" : "Consent Events (365d)"}
                </Text>
                <Text as="p" variant="headingLg">
                  {report.totalConsentEvents}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Entradas de auditoria" : "Audit Log Entries"}
                </Text>
                <Text as="p" variant="headingLg">
                  {report.auditLogEntries}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Solicitudes del titular" : "Data Subject Requests"}
                </Text>
                <Text as="p" variant="headingLg">
                  {report.dataExportRequests + report.dataDeletionRequests}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Exportar" : "Export"}: {report.dataExportRequests} | {isEs ? "Borrar" : "Delete"}: {report.dataDeletionRequests}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Tokens activos de soporte" : "Active Support Tokens"}
                </Text>
                <Text as="p" variant="headingLg">
                  {activeSupportTokens}
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Form method="post">
              <BlockStack gap="300">
                <input type="hidden" name="intent" value="set_residency" />
              <Text as="h2" variant="headingMd">
                  {isEs ? "Controles de residencia de datos" : "Data Residency Controls"}
              </Text>
                <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {isEs ? "Region" : "Region"}
                    </Text>
                    <Select
                      label={isEs ? "Region" : "Region"}
                      labelHidden
                      options={[
                        { label: isEs ? "Global" : "Global", value: "GLOBAL" },
                        { label: "EU", value: "EU" },
                        { label: "US", value: "US" },
                        { label: "APAC", value: "APAC" },
                      ]}
                      value={region}
                      onChange={(value) => setRegion(value as DataRegion)}
                    />
                    <input type="hidden" name="region" value={region} />
                  </BlockStack>

                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {isEs ? "Aplicacion" : "Enforcement"}
                    </Text>
                    <Badge tone={residencyConfig.enforced ? "success" : "attention"}>
                      {residencyConfig.enforced
                        ? (isEs ? "APLICADO" : "ENFORCED")
                        : (isEs ? "NO APLICADO" : "NOT ENFORCED")}
                    </Badge>
                  </BlockStack>

                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {isEs ? "Paises aplicados (ISO)" : "Enforced countries (ISO)"}
                    </Text>
                    <TextField
                      label={isEs ? "Paises" : "Countries"}
                      labelHidden
                      value={enforcedCountriesInput}
                      onChange={setEnforcedCountriesInput}
                      autoComplete="off"
                      helpText={isEs ? "Separado por comas, ej. DE, FR, ES" : "Comma separated, e.g. DE, FR, ES"}
                    />
                    <input type="hidden" name="enforcedCountries" value={enforcedCountriesInput} />
                  </BlockStack>
                </InlineGrid>

                <Button submit variant="primary" loading={isSubmitting}>
                  {isEs ? "Guardar politica de residencia" : "Save data residency policy"}
                </Button>
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Form method="post">
              <BlockStack gap="300">
                <input type="hidden" name="intent" value="set_deployment_control" />
                <Text as="h2" variant="headingMd">
                  {isEs ? "Controles de despliegue regional" : "Regional Deployment Controls"}
                </Text>
                <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {isEs ? "Region primaria" : "Primary region"}
                    </Text>
                    <Select
                      label={isEs ? "Region primaria" : "Primary region"}
                      labelHidden
                      options={[
                        { label: "Global", value: "GLOBAL" },
                        { label: "EU", value: "EU" },
                        { label: "US", value: "US" },
                        { label: "APAC", value: "APAC" },
                      ]}
                      value={primaryRegion}
                      onChange={(value) => setPrimaryRegion(value as DataRegion)}
                    />
                    <input type="hidden" name="primaryRegion" value={primaryRegion} />
                  </BlockStack>

                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {isEs ? "Regiones de failover" : "Failover regions"}
                    </Text>
                    <TextField
                      label={isEs ? "Regiones de failover" : "Failover regions"}
                      labelHidden
                      value={failoverRegionsInput}
                      onChange={setFailoverRegionsInput}
                      autoComplete="off"
                      helpText={isEs ? "Separado por comas: EU, US, APAC" : "Comma separated: EU, US, APAC"}
                    />
                    <input type="hidden" name="failoverRegions" value={failoverRegionsInput} />
                  </BlockStack>

                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {isEs ? "Aislamiento estricto" : "Strict isolation"}
                    </Text>
                    <Select
                      label={isEs ? "Aislamiento estricto" : "Strict isolation"}
                      labelHidden
                      options={[
                        { label: isEs ? "Desactivado" : "Disabled", value: "false" },
                        { label: isEs ? "Activado" : "Enabled", value: "true" },
                      ]}
                      value={strictIsolation}
                      onChange={setStrictIsolation}
                    />
                    <input type="hidden" name="strictIsolation" value={strictIsolation} />
                  </BlockStack>

                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {isEs ? "PII anclada a region primaria" : "PII pinned to primary region"}
                    </Text>
                    <Select
                      label={isEs ? "PII anclada" : "PII pinned"}
                      labelHidden
                      options={[
                        { label: isEs ? "Desactivado" : "Disabled", value: "false" },
                        { label: isEs ? "Activado" : "Enabled", value: "true" },
                      ]}
                      value={piiRestrictedToPrimary}
                      onChange={setPiiRestrictedToPrimary}
                    />
                    <input
                      type="hidden"
                      name="piiRestrictedToPrimary"
                      value={piiRestrictedToPrimary}
                    />
                  </BlockStack>
                </InlineGrid>

                <Button submit variant="primary" loading={isSubmitting}>
                  {isEs ? "Guardar controles de despliegue" : "Save deployment controls"}
                </Button>
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {isEs ? "Flujo de bloqueo legal" : "Legal Hold Workflow"}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {isEs ? "Bloqueos legales activos" : "Active legal holds"}: {activeLegalHolds}
              </Text>

              <Form method="post">
                <FormLayout>
                  <input type="hidden" name="intent" value="create_legal_hold" />
                  <TextField
                    label={isEs ? "Titulo" : "Title"}
                    value={holdTitle}
                    onChange={setHoldTitle}
                    autoComplete="off"
                  />
                  <TextField
                    label={isEs ? "Motivo" : "Reason"}
                    value={holdReason}
                    onChange={setHoldReason}
                    autoComplete="off"
                    multiline={2}
                  />
                  <Select
                    label={isEs ? "Alcance" : "Scope"}
                    options={[
                      { label: isEs ? "Todos los datos" : "All data", value: "ALL" },
                      { label: isEs ? "Conversaciones" : "Conversations", value: "CONVERSATIONS" },
                      { label: isEs ? "Eventos de comportamiento" : "Behavior events", value: "BEHAVIOR_EVENTS" },
                      { label: isEs ? "Logs de auditoria" : "Audit logs", value: "AUDIT_LOGS" },
                      { label: isEs ? "Registros de consentimiento" : "Consent records", value: "CONSENT_RECORDS" },
                    ]}
                    value={holdScope}
                    onChange={(value) => setHoldScope(value as LegalHoldScope)}
                  />
                  <input type="hidden" name="holdScope" value={holdScope} />
                  <TextField
                    label={isEs ? "Expira en (opcional)" : "Expires at (optional)"}
                    value={holdExpiresAt}
                    onChange={setHoldExpiresAt}
                    autoComplete="off"
                    placeholder="2026-12-31T23:59:59.000Z"
                  />
                  <input type="hidden" name="holdExpiresAt" value={holdExpiresAt} />
                  <Button submit variant="primary" loading={isSubmitting}>
                    {isEs ? "Crear bloqueo legal" : "Create legal hold"}
                  </Button>
                </FormLayout>
              </Form>

              {legalHoldRows.length === 0 ? (
                <EmptyState heading={isEs ? "Sin bloqueos legales" : "No legal holds"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Crea bloqueos legales para detener purgas de retencion durante revisiones legales o regulatorias."
                      : "Create legal holds to block retention purges during legal or regulatory review."}
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={
                    isEs
                      ? ["Titulo", "Alcance", "Estado", "Expira", "Accion"]
                      : ["Title", "Scope", "Status", "Expires", "Action"]
                  }
                  rows={legalHoldRows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {isEs ? "Pipeline de exportacion SIEM" : "SIEM Export Pipeline"}
              </Text>
              <Form method="post">
                <FormLayout>
                  <input type="hidden" name="intent" value="export_siem" />
                  <TextField
                    label={isEs ? "Ventana (dias)" : "Window (days)"}
                    type="number"
                    min={1}
                    max={3650}
                    value={siemWindowDays}
                    onChange={setSiemWindowDays}
                    autoComplete="off"
                  />
                  <input type="hidden" name="siemWindowDays" value={siemWindowDays} />
                  <TextField
                    label={isEs ? "Conectores" : "Connectors"}
                    value={siemConnectors}
                    onChange={setSiemConnectors}
                    autoComplete="off"
                    helpText={isEs ? "Separado por comas: datadog,splunk" : "Comma separated: datadog,splunk"}
                  />
                  <input type="hidden" name="siemConnectors" value={siemConnectors} />
                  <Select
                    label={isEs ? "Enviar a conectores" : "Dispatch to connectors"}
                    options={[
                      { label: isEs ? "No (solo exportacion)" : "No (export only)", value: "false" },
                      { label: isEs ? "Si (Datadog/Splunk)" : "Yes (Datadog/Splunk)", value: "true" },
                    ]}
                    value={dispatchConnectors}
                    onChange={setDispatchConnectors}
                  />
                  <input type="hidden" name="dispatchConnectors" value={dispatchConnectors} />
                  <Button submit loading={isSubmitting}>
                    {isEs ? "Generar exportacion SIEM" : "Generate SIEM export"}
                  </Button>
                </FormLayout>
              </Form>

              {lastSiemExport ? (
                <DataTable
                  columnContentTypes={["text", "text"]}
                  headings={isEs ? ["Campo", "Valor"] : ["Field", "Value"]}
                  rows={[
                    [isEs ? "ID de exportacion" : "Export ID", lastSiemExport.exportId],
                    [isEs ? "Generado" : "Generated", new Date(lastSiemExport.generatedAt).toLocaleString()],
                    [isEs ? "Ventana (dias)" : "Window (days)", String(lastSiemExport.windowDays)],
                    [isEs ? "Eventos" : "Events", String(lastSiemExport.eventCount)],
                  ]}
                />
              ) : null}

              {lastSiemDispatchRows.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                  headings={
                    isEs
                      ? ["Conector", "Intentado", "Entregado", "Estado", "Eventos", "Error"]
                      : ["Connector", "Attempted", "Delivered", "Status", "Events", "Error"]
                  }
                  rows={lastSiemDispatchRows}
                />
              ) : null}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {isEs ? "Automatizacion de retencion" : "Retention Automation"}
              </Text>

              {activeLegalHolds > 0 ? (
                <Banner
                  tone="warning"
                  title={
                    isEs
                      ? "Hay exclusiones de retencion activas por alcances de bloqueo legal."
                      : "Retention exclusions are active due to legal hold scopes."
                  }
                />
              ) : null}

              <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                <Form method="post">
                  <FormLayout>
                    <input type="hidden" name="intent" value="set_retention_policy" />
                    <TextField
                      label={
                        isEs ? "Retencion de conversaciones (dias)" : "Conversation retention (days)"
                      }
                      type="number"
                      min={1}
                      max={3650}
                      value={conversationRetentionDays}
                      onChange={setConversationRetentionDays}
                      autoComplete="off"
                    />
                    <input
                      type="hidden"
                      name="conversationRetentionDays"
                      value={conversationRetentionDays}
                    />

                    <TextField
                      label={
                        isEs
                          ? "Retencion de eventos de comportamiento (dias)"
                          : "Behavior event retention (days)"
                      }
                      type="number"
                      min={1}
                      max={3650}
                      value={behaviorEventRetentionDays}
                      onChange={setBehaviorEventRetentionDays}
                      autoComplete="off"
                    />
                    <input
                      type="hidden"
                      name="behaviorEventRetentionDays"
                      value={behaviorEventRetentionDays}
                    />

                    <Button submit variant="primary" loading={isSubmitting}>
                      {isEs ? "Guardar politica de retencion" : "Save retention policy"}
                    </Button>
                  </FormLayout>
                </Form>

                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {isEs ? "Estado del scheduler" : "Scheduler status"}
                  </Text>
                  <Badge tone={scheduler?.isRunning?.retention ? "success" : "attention"}>
                    {scheduler?.isRunning?.retention
                      ? (isEs ? "EJECUTANDO" : "RUNNING")
                      : (isEs ? "DETENIDO" : "STOPPED")}
                  </Badge>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {isEs ? "Ultima ejecucion" : "Last run"}: {schedulerRetentionLastRun}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {isEs ? "Total de ejecuciones" : "Total runs"}: {schedulerRetention?.runs ?? 0}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {isEs ? "Ultima limpieza" : "Last deleted"}: {isEs ? "conversaciones" : "conversations"}{" "}
                    {schedulerRetention?.conversationsDeleted ?? 0}, {isEs ? "eventos" : "events"}{" "}
                    {schedulerRetention?.eventsDeleted ?? 0}
                  </Text>
                  <Form method="post">
                    <input type="hidden" name="intent" value="run_retention_now" />
                    <Button submit loading={isSubmitting}>
                      {isEs ? "Ejecutar retencion ahora" : "Run retention now"}
                    </Button>
                  </Form>
                </BlockStack>
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {isEs ? "Preparacion de cumplimiento omnicanal" : "Omnichannel Compliance Readiness"}
              </Text>
              <DataTable
                columnContentTypes={["text", "text"]}
                headings={isEs ? ["Categoria", "Valor"] : ["Category", "Value"]}
                rows={[
                  [
                    isEs ? "Estado del bridge" : "Bridge Status",
                    deliveryStatus.omnichannelBridge.configured
                      ? (isEs ? "Configurado" : "Configured")
                      : (isEs ? "No configurado" : "Not configured"),
                  ],
                  [
                    isEs ? "Canales integrados" : "Integrated Channels",
                    deliveryStatus.integratedChannels.join(", "),
                  ],
                  [
                    isEs ? "Canales pendientes" : "Pending Channels",
                    deliveryStatus.pendingChannels.join(", ") || (isEs ? "Ninguno" : "None"),
                  ],
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {isEs ? "Desglose de consentimiento" : "Consent Breakdown"}
              </Text>
              {consentRows.length === 0 ? (
                <EmptyState heading={isEs ? "Sin eventos de consentimiento" : "No consent events"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Los registros apareceran cuando los visitantes acepten o rechacen consentimiento."
                      : "Consent records will appear as visitors grant or reject consent."}
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "numeric"]}
                  headings={isEs ? ["Tipo de consentimiento", "Eventos"] : ["Consent Type", "Events"]}
                  rows={consentRows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {isEs ? "Actividades de procesamiento (Articulo 30)" : "Processing Activities (Article 30)"}
              </Text>
              <Form method="post">
                <input type="hidden" name="intent" value="seed_processing_activities" />
                <Button submit loading={isSubmitting}>
                  {isEs ? "Cargar actividades por defecto" : "Seed default activities"}
                </Button>
              </Form>
              {processingActivities.length === 0 ? (
                <EmptyState heading={isEs ? "Sin actividades de procesamiento" : "No processing activities"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Carga actividades por defecto para establecer tu registro GDPR de procesamiento."
                      : "Seed default activities to establish your GDPR processing register."}
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "numeric"]}
                  headings={
                    isEs
                      ? ["Actividad", "Proposito", "Base legal", "Retencion (dias)"]
                      : ["Activity", "Purpose", "Legal Basis", "Retention (days)"]
                  }
                  rows={processingActivities.map((activity) => [
                    activity.activityName,
                    activity.purpose,
                    activity.legalBasis,
                    String(activity.retentionDays),
                  ])}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {isEs ? "Registro de brechas" : "Breach Registry"}
              </Text>
              {breaches.length === 0 ? (
                <EmptyState heading={isEs ? "Sin brechas registradas" : "No breaches registered"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Buenas noticias. No hay notificaciones de brecha activas registradas."
                      : "Great news. No active breach notifications are currently recorded."}
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "text", "text"]}
                  headings={
                    isEs
                      ? ["Detectado en", "Severidad", "Usuarios afectados", "Reportado", "SLA 72h"]
                      : ["Detected At", "Severity", "Affected Users", "Reported", "72h SLA"]
                  }
                  rows={breaches.map((breach) => [
                    new Date(breach.detectedAt).toLocaleString(),
                    breach.severity,
                    String(breach.affectedDataSubjects),
                    breach.reportedToAuthority
                      ? (isEs ? "Si" : "Yes")
                      : (isEs ? "No" : "No"),
                    breach.reportedAt72h
                      ? (isEs ? "Cumplido" : "Met")
                      : (isEs ? "Incumplido" : "Missed"),
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
