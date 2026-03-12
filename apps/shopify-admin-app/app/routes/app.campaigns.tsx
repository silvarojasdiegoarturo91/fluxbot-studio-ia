/**
 * Marketing Campaigns admin page — Phase 3
 *
 * Allows merchants to:
 *  - View all marketing campaigns
 *  - Create new campaigns with locale-keyed message templates
 *  - Activate / pause / archive campaigns
 *  - See dispatch and conversion metrics
 */

import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineGrid,
  Badge,
  Button,
  DataTable,
  Modal,
  FormLayout,
  TextField,
  Select,
  EmptyState,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation, useSubmit } from "react-router";
import { useState, useCallback } from "react";
import { ensureShopForSession } from "../services/shop-context.server";
import { authenticate } from "../shopify.server";
import { useIsSpanish } from "../hooks/use-admin-language";
import {
  listCampaigns,
  createCampaign,
  updateCampaign,
  type CampaignScheduleType,
  type CampaignStatus,
} from "../services/campaign.server";

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);
  if (!shop) return { campaigns: [] };
  const campaigns = await listCampaigns(shop.id);
  return { campaigns };
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const VALID_SCHEDULE_TYPES: CampaignScheduleType[] = ["IMMEDIATE", "SCHEDULED", "RECURRING"];
  const VALID_STATUSES: CampaignStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];

  const { session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);
  if (!shop) return { error: "Shop not found" };

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const scheduleType = (formData.get("scheduleType") as string) ?? "IMMEDIATE";
    const enTemplate = formData.get("template_en") as string;
    const esTemplate = formData.get("template_es") as string;

    if (!name?.trim()) return { error: "Campaign name is required." };

    const localeTemplates: Record<string, string> = {};
    if (enTemplate?.trim()) localeTemplates["en"] = enTemplate.trim();
    if (esTemplate?.trim()) localeTemplates["es"] = esTemplate.trim();

    const normalizedSchedule = VALID_SCHEDULE_TYPES.includes(scheduleType as CampaignScheduleType)
      ? (scheduleType as CampaignScheduleType)
      : "IMMEDIATE";

    await createCampaign(shop.id, {
      name: name.trim(),
      description: description?.trim() || undefined,
      scheduleType: normalizedSchedule,
      localeTemplates,
    });

    return { success: true };
  }

  if (intent === "updateStatus") {
    const campaignId = formData.get("campaignId") as string;
    const status = formData.get("status") as string;
    if (campaignId && VALID_STATUSES.includes(status as CampaignStatus)) {
      await updateCampaign(shop.id, campaignId, { status: status as CampaignStatus });
    }
    return { success: true };
  }

  return { error: "Unknown intent." };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE_TONES: Record<string, "success" | "info" | "warning" | "critical" | "new"> = {
  ACTIVE: "success",
  DRAFT: "info",
  PAUSED: "warning",
  COMPLETED: "success",
  ARCHIVED: "critical",
};

function getStatusLabel(status: string, isEs: boolean) {
  const labels: Record<string, { en: string; es: string }> = {
    ACTIVE: { en: "Active", es: "Activa" },
    DRAFT: { en: "Draft", es: "Borrador" },
    PAUSED: { en: "Paused", es: "Pausada" },
    COMPLETED: { en: "Completed", es: "Completada" },
    ARCHIVED: { en: "Archived", es: "Archivada" },
  };

  const fallback = status.charAt(0) + status.slice(1).toLowerCase();
  const key = isEs ? "es" : "en";
  return labels[status]?.[key] ?? fallback;
}

function getScheduleLabel(scheduleType: string, isEs: boolean) {
  const labels: Record<string, { en: string; es: string }> = {
    IMMEDIATE: { en: "Immediate", es: "Inmediata" },
    SCHEDULED: { en: "Scheduled", es: "Programada" },
    RECURRING: { en: "Recurring", es: "Recurrente" },
  };

  const fallback = scheduleType.charAt(0) + scheduleType.slice(1).toLowerCase();
  const key = isEs ? "es" : "en";
  return labels[scheduleType]?.[key] ?? fallback;
}

function statusBadge(status: string, isEs: boolean) {
  const tone = STATUS_BADGE_TONES[status] ?? "info";
  return <Badge tone={tone}>{getStatusLabel(status, isEs)}</Badge>;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Campaign = Awaited<ReturnType<typeof listCampaigns>>[number];

export default function CampaignsPage() {
  const { campaigns: rawCampaigns } = useLoaderData<typeof loader>();
  const campaigns = (rawCampaigns ?? []) as Campaign[];
  const location = useLocation();
  const isEs = useIsSpanish();
  const backUrl = `/app${location.search || ""}`;
  const submit = useSubmit();

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleType, setScheduleType] = useState("IMMEDIATE");
  const [templateEn, setTemplateEn] = useState("");
  const [templateEs, setTemplateEs] = useState("");

  const handleOpenModal = useCallback(() => setModalOpen(true), []);
  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setName("");
    setDescription("");
    setScheduleType("IMMEDIATE");
    setTemplateEn("");
    setTemplateEs("");
  }, []);

  const handleCreate = useCallback(() => {
    const fd = new FormData();
    fd.append("intent", "create");
    fd.append("name", name);
    fd.append("description", description);
    fd.append("scheduleType", scheduleType);
    fd.append("template_en", templateEn);
    fd.append("template_es", templateEs);
    submit(fd, { method: "POST" });
    handleCloseModal();
  }, [name, description, scheduleType, templateEn, templateEs, submit, handleCloseModal]);

  const handleStatusChange = useCallback(
    (campaignId: string, status: string) => {
      const fd = new FormData();
      fd.append("intent", "updateStatus");
      fd.append("campaignId", campaignId);
      fd.append("status", status);
      submit(fd, { method: "POST" });
    },
    [submit],
  );

  const totalActive = campaigns.filter((c) => c.status === "ACTIVE").length;
  const totalDispatched = campaigns.reduce((s, c) => s + c.totalDispatched, 0);
  const totalConverted = campaigns.reduce((s, c) => s + c.totalConverted, 0);
  const overallCvr =
    totalDispatched > 0 ? ((totalConverted / totalDispatched) * 100).toFixed(1) : "—";

  const rows = campaigns.map((c) => [
    c.name,
    statusBadge(c.status, isEs),
    getScheduleLabel(c.scheduleType, isEs),
    c.totalDispatched.toLocaleString(),
    c.totalConverted.toLocaleString(),
    c.totalDispatched > 0
      ? `${((c.totalConverted / c.totalDispatched) * 100).toFixed(1)}%`
      : "—",
    <InlineStack key={c.id} gap="200">
      {c.status === "DRAFT" && (
        <Button
          variant="plain"
          tone="success"
          onClick={() => handleStatusChange(c.id, "ACTIVE")}
        >
          {isEs ? "Activar" : "Activate"}
        </Button>
      )}
      {c.status === "ACTIVE" && (
        <Button
          variant="plain"
          onClick={() => handleStatusChange(c.id, "PAUSED")}
        >
          {isEs ? "Pausar" : "Pause"}
        </Button>
      )}
      {c.status === "PAUSED" && (
        <Button
          variant="plain"
          tone="success"
          onClick={() => handleStatusChange(c.id, "ACTIVE")}
        >
          {isEs ? "Reanudar" : "Resume"}
        </Button>
      )}
      {(c.status === "ACTIVE" || c.status === "PAUSED") && (
        <Button
          variant="plain"
          tone="critical"
          onClick={() => handleStatusChange(c.id, "ARCHIVED")}
        >
          {isEs ? "Archivar" : "Archive"}
        </Button>
      )}
    </InlineStack>,
  ]);

  return (
    <Page
      title={isEs ? "Campanas de marketing" : "Marketing Campaigns"}
      subtitle={
        isEs
          ? "Crea y gestiona campanas proactivas por idioma"
          : "Create and manage locale-aware proactive campaigns"
      }
      backAction={{ content: isEs ? "Panel" : "Dashboard", url: backUrl }}
      primaryAction={
        <Button variant="primary" onClick={handleOpenModal}>
          {isEs ? "Nueva campana" : "New campaign"}
        </Button>
      }
    >
      <Layout>
        {/* KPI row */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Campanas activas" : "Active campaigns"}
                </Text>
                <Text as="p" variant="headingXl">{totalActive}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {isEs ? "Total de envios" : "Total dispatched"}
                </Text>
                <Text as="p" variant="headingXl">{totalDispatched.toLocaleString()}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "CVR global" : "Overall CVR"}</Text>
                <Text as="p" variant="headingXl">{overallCvr}{overallCvr !== "—" ? "%" : ""}</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Campaigns table */}
        <Layout.Section>
          <Card>
            {campaigns.length === 0 ? (
              <EmptyState
                heading={isEs ? "Aun no hay campanas" : "No campaigns yet"}
                image=""
                action={{
                  content: isEs ? "Crear campana" : "Create campaign",
                  onAction: handleOpenModal,
                }}
              >
                <p>
                  {isEs
                    ? "Crea campanas proactivas por idioma para llegar a cada visitante con el mensaje correcto en el momento adecuado."
                    : "Create locale-aware proactive campaigns to reach visitors in their preferred language with the right message at the right moment."}
                </p>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text", "numeric", "numeric", "text", "text"]}
                headings={
                  isEs
                    ? ["Nombre", "Estado", "Programacion", "Enviados", "Convertidos", "CVR", "Acciones"]
                    : ["Name", "Status", "Schedule", "Dispatched", "Converted", "CVR", "Actions"]
                }
                rows={rows}
              />
            )}
          </Card>
        </Layout.Section>
      </Layout>

      {/* Create campaign modal */}
      <Modal
        open={modalOpen}
        onClose={handleCloseModal}
        title={isEs ? "Nueva campana de marketing" : "New marketing campaign"}
        primaryAction={{
          content: isEs ? "Crear" : "Create",
          onAction: handleCreate,
          disabled: !name.trim(),
        }}
        secondaryActions={[{ content: isEs ? "Cancelar" : "Cancel", onAction: handleCloseModal }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label={isEs ? "Nombre de campana" : "Campaign name"}
              value={name}
              onChange={setName}
              autoComplete="off"
              requiredIndicator
            />
            <TextField
              label={isEs ? "Descripcion" : "Description"}
              value={description}
              onChange={setDescription}
              autoComplete="off"
              multiline={2}
            />
            <Select
              label={isEs ? "Tipo de programacion" : "Schedule type"}
              options={
                isEs
                  ? [
                    { label: "Inmediata (por trigger)", value: "IMMEDIATE" },
                    { label: "Programada (una sola vez)", value: "SCHEDULED" },
                    { label: "Recurrente (cron)", value: "RECURRING" },
                  ]
                  : [
                    { label: "Immediate (trigger-based)", value: "IMMEDIATE" },
                    { label: "Scheduled (one-time)", value: "SCHEDULED" },
                    { label: "Recurring (cron)", value: "RECURRING" },
                  ]
              }
              value={scheduleType}
              onChange={setScheduleType}
            />
            <Banner title={isEs ? "Plantillas de mensaje" : "Message templates"} tone="info">
              <p>
                {isEs ? "Usa" : "Use"} <code>{"{{variableName}}"}</code>{" "}
                {isEs ? "para contenido dinamico, por ejemplo" : "for dynamic content, e.g."}{" "}
                <code>{"{{productName}}"}</code>.
              </p>
            </Banner>
            <TextField
              label={isEs ? "Plantilla en ingles (en)" : "English template (en)"}
              value={templateEn}
              onChange={setTemplateEn}
              autoComplete="off"
              multiline={3}
              helpText={
                isEs
                  ? "ej. \"Hi! Still thinking about {{productName}}? Here's 10% off.\""
                  : "e.g. \"Hi! Still thinking about {{productName}}? Here's 10% off.\""
              }
            />
            <TextField
              label={isEs ? "Plantilla en espanol (es)" : "Spanish template (es)"}
              value={templateEs}
              onChange={setTemplateEs}
              autoComplete="off"
              multiline={3}
              helpText={
                isEs
                  ? 'ej. "Hola, sigues pensando en {{productName}}? Aqui tienes un 10% de descuento."'
                  : 'e.g. "Hi! Still thinking about {{productName}}? Here is 10% off."'
              }
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
