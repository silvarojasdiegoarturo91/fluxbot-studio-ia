import {
  Page,
  Layout,
  BlockStack,
  Text,
  Badge,
  InlineGrid,
  DataTable,
  EmptyState,
  Button,
  FormLayout,
  Select,
  TextField,
  Banner,
  Checkbox,
  Modal,
  Popover,
  ActionList,
  InlineStack,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useLocation, useNavigate, useNavigation, useSubmit } from "react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { KnowledgeSourceType, Prisma } from "@prisma/client";
import prisma from "../db.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { getMerchantAdminConfig } from "../services/admin-config.server";
import { SyncService, type SyncJobType } from "../services/sync-service.server";
import { processPendingSyncJobsForShop } from "../jobs/sync-worker.server";
import { appendProductFaq, getProductAdminMetadata, setProductDisabled } from "../services/product-faqs.server";
import { useIsSpanish } from "../hooks/use-admin-language";
import { AdminPageHeader, AdminSectionCard, AdminStatCard, AdminStatusBadge } from "../components/admin-ui";

interface DataSourcesActionData {
  ok: boolean;
  message?: string;
  error?: string;
}

interface ManagedProductRow {
  id: string;
  productId: string;
  title: string;
  handle: string;
  collections: string[];
  tags: string[];
  disabled: boolean;
  faqCount: number;
}

const SOURCE_TYPE_OPTIONS: Array<{ label: string; value: KnowledgeSourceType }> = [
  { label: "Catalog", value: "CATALOG" },
  { label: "Policies", value: "POLICIES" },
  { label: "Pages", value: "PAGES" },
  { label: "Blog", value: "BLOG" },
  { label: "FAQ", value: "FAQ" },
  { label: "Custom", value: "CUSTOM" },
];

const SYNC_JOB_TYPES: SyncJobType[] = [
  "initial:catalog",
  "initial:policies",
  "initial:pages",
  "delta:products",
  "delta:policies",
  "delta:pages",
];

function isSyncJobType(value: string): value is SyncJobType {
  return SYNC_JOB_TYPES.includes(value as SyncJobType);
}

const ENTRY_RECOVERY_STALE_MS = process.env.SYNC_RUNNING_STALE_MS
  ? parseInt(process.env.SYNC_RUNNING_STALE_MS, 10)
  : 10 * 60 * 1000;
const ENTRY_RECOVERY_STALE_LIMIT = process.env.SYNC_STALE_REQUEUE_LIMIT
  ? parseInt(process.env.SYNC_STALE_REQUEUE_LIMIT, 10)
  : 20;
const ENTRY_RECOVERY_DISPATCH_LIMIT = process.env.SYNC_DISPATCH_LIMIT
  ? parseInt(process.env.SYNC_DISPATCH_LIMIT, 10)
  : 25;
const ENTRY_RECOVERY_TERMINAL_REQUEUE_LIMIT = process.env.SYNC_ENTRY_RETRY_LIMIT
  ? parseInt(process.env.SYNC_ENTRY_RETRY_LIMIT, 10)
  : 6;
const ENTRY_RECOVERY_TERMINAL_MAX_AGE_MS = process.env.SYNC_ENTRY_RETRY_MAX_AGE_MS
  ? parseInt(process.env.SYNC_ENTRY_RETRY_MAX_AGE_MS, 10)
  : 60 * 60 * 1000;

async function runDataSourcesEntryRecovery(shopId: string): Promise<void> {
  const staleLimit = Number.isFinite(ENTRY_RECOVERY_STALE_LIMIT) && ENTRY_RECOVERY_STALE_LIMIT > 0
    ? ENTRY_RECOVERY_STALE_LIMIT
    : 20;
  const staleMs = Number.isFinite(ENTRY_RECOVERY_STALE_MS) && ENTRY_RECOVERY_STALE_MS > 0
    ? ENTRY_RECOVERY_STALE_MS
    : 10 * 60 * 1000;
  const terminalLimit = Number.isFinite(ENTRY_RECOVERY_TERMINAL_REQUEUE_LIMIT) && ENTRY_RECOVERY_TERMINAL_REQUEUE_LIMIT > 0
    ? ENTRY_RECOVERY_TERMINAL_REQUEUE_LIMIT
    : 6;
  const terminalMaxAgeMs = Number.isFinite(ENTRY_RECOVERY_TERMINAL_MAX_AGE_MS) && ENTRY_RECOVERY_TERMINAL_MAX_AGE_MS > 0
    ? ENTRY_RECOVERY_TERMINAL_MAX_AGE_MS
    : 60 * 60 * 1000;
  const dispatchLimit = Number.isFinite(ENTRY_RECOVERY_DISPATCH_LIMIT) && ENTRY_RECOVERY_DISPATCH_LIMIT > 0
    ? ENTRY_RECOVERY_DISPATCH_LIMIT
    : 25;

  const staleRequeued = await SyncService.requeueStaleRunningJobs({
    shopId,
    maxAgeMs: staleMs,
    limit: staleLimit,
    triggerSource: "entry-routine",
  });

  const terminalRequeued = await SyncService.requeueRecentTerminalJobs(shopId, {
    maxAgeMs: terminalMaxAgeMs,
    limit: terminalLimit,
    triggerSource: "entry-routine",
  });

  const pendingCount = await prisma.syncJob.count({
    where: { shopId, status: "PENDING" },
  });
  const jobsToDispatch = Math.min(dispatchLimit, pendingCount);

  const dispatchResult = jobsToDispatch > 0
    ? await processPendingSyncJobsForShop(shopId, jobsToDispatch, "entry-routine")
    : { processed: 0, failed: 0, jobs: [] };

  if (staleRequeued > 0 || terminalRequeued > 0 || dispatchResult.processed > 0 || dispatchResult.failed > 0) {
    console.info("[DataSources] entry recovery executed", {
      triggerSource: "entry-routine",
      shopId,
      staleRequeued,
      terminalRequeued,
      dispatchedCompleted: dispatchResult.processed,
      dispatchedFailed: dispatchResult.failed,
    });
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticateAdminRequest(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  await runDataSourcesEntryRecovery(shop.id);

  const [sources, syncJobs, projectionCounts, runningSyncJobs, failedSyncJobs, productRowsRaw] = await Promise.all([
    prisma.knowledgeSource.findMany({
      where: { shopId: shop.id },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: { documents: true },
        },
      },
    }),
    prisma.syncJob.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        jobType: true,
        status: true,
        progress: true,
        processedItems: true,
        totalItems: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
    }),
    Promise.all([
      prisma.productProjection.count({ where: { shopId: shop.id, deletedAt: null } }),
      prisma.policyProjection.count({ where: { shopId: shop.id } }),
      prisma.orderProjection.count({ where: { shopId: shop.id } }),
    ]),
    prisma.syncJob.count({ where: { shopId: shop.id, status: { in: ["PENDING", "RUNNING"] } } }),
    prisma.syncJob.count({ where: { shopId: shop.id, status: "FAILED" } }),
    prisma.productProjection.findMany({
      where: { shopId: shop.id, deletedAt: null },
      orderBy: { title: "asc" },
      select: {
        id: true,
        productId: true,
        title: true,
        handle: true,
        metadata: true,
      },
      take: 100,
    }),
  ]);

  const [productsProjected, policiesProjected, ordersProjected] = projectionCounts;

  const productRows: ManagedProductRow[] = productRowsRaw.map((product) => {
    const metadata = getProductAdminMetadata(product.metadata as Prisma.JsonValue | null | undefined);
    return {
      id: product.id,
      productId: product.productId,
      title: product.title,
      handle: product.handle,
      collections: metadata.collections,
      tags: metadata.tags,
      disabled: metadata.disabled,
      faqCount: metadata.faqs.length,
    };
  });

  return {
    shop,
    sources,
    syncJobs,
    productRows,
    runningSyncJobs,
    failedSyncJobs,
    projections: {
      productsProjected,
      policiesProjected,
      ordersProjected,
    },
  };
}

export async function action({ request }: ActionFunctionArgs): Promise<DataSourcesActionData> {
  if (request.method !== "POST") {
    return { ok: false, error: "Method not allowed" };
  }

  const { session } = await authenticateAdminRequest(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    return { ok: false, error: "Shop not found" };
  }

  const adminConfig = await getMerchantAdminConfig(shop.id);
  const isEs = adminConfig.adminLanguage === "es";

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "create_source") {
    const sourceType = String(formData.get("sourceType") || "").toUpperCase() as KnowledgeSourceType;
    const name = String(formData.get("name") || "").trim();
    const endpoint = String(formData.get("endpoint") || "").trim();

    if (!name) {
      return { ok: false, error: isEs ? "El nombre de la fuente es obligatorio" : "Source name is required" };
    }

    if (!SOURCE_TYPE_OPTIONS.some((option) => option.value === sourceType)) {
      return { ok: false, error: isEs ? "Tipo de fuente invalido" : "Invalid source type" };
    }

    await prisma.knowledgeSource.create({
      data: {
        shopId: shop.id,
        sourceType,
        name,
        isActive: true,
        metadata: endpoint ? { endpoint } : undefined,
      },
    });

    return { ok: true, message: isEs ? "Fuente de datos creada." : "Data source created." };
  }

  if (intent === "toggle_source") {
    const sourceId = String(formData.get("sourceId") || "").trim();
    const nextState = String(formData.get("nextState") || "false").toLowerCase() === "true";

    if (!sourceId) {
      return { ok: false, error: isEs ? "sourceId es obligatorio" : "sourceId is required" };
    }

    const updated = await prisma.knowledgeSource.updateMany({
      where: {
        id: sourceId,
        shopId: shop.id,
      },
      data: {
        isActive: nextState,
      },
    });

    if (updated.count === 0) {
      return { ok: false, error: isEs ? "Fuente no encontrada" : "Source not found" };
    }

    return { ok: true, message: isEs
      ? `Fuente ${nextState ? "activada" : "desactivada"}.`
      : `Source ${nextState ? "enabled" : "disabled"}.` };
  }

  if (intent === "queue_sync") {
    const jobType = String(formData.get("jobType") || "initial:catalog").trim();

    if (!isSyncJobType(jobType)) {
      return { ok: false, error: isEs ? "Tipo de job de sync invalido" : "Invalid sync job type" };
    }

    await SyncService.queueSyncJob(shop.id, jobType, 0);
    await processPendingSyncJobsForShop(shop.id, 1, "dispatcher");

    return { ok: true, message: isEs ? `Job de sync en cola (${jobType}).` : `Sync job queued (${jobType}).` };
  }

  if (intent === "reprocess_sync_job") {
    const jobId = String(formData.get("jobId") || "").trim();

    if (!jobId) {
      return { ok: false, error: isEs ? "jobId es obligatorio" : "jobId is required" };
    }

    const requeued = await SyncService.requeueSyncJob(shop.id, jobId);
    if (!requeued) {
      return {
        ok: false,
        error: isEs
          ? "No se pudo reprocesar el job (estado no elegible o no existe)."
          : "Unable to reprocess job (job missing or status not eligible).",
      };
    }

    await processPendingSyncJobsForShop(shop.id, 1, "manual-reprocess");

    return {
      ok: true,
      message: isEs ? "Job reprocesado y reenviado a la cola." : "Job reprocessed and requeued.",
    };
  }

  if (intent === "add_product_faq") {
    const productProjectionId = String(formData.get("productProjectionId") || "").trim();
    const category = String(formData.get("category") || "").trim();
    const question = String(formData.get("question") || "").trim();
    const answer = String(formData.get("answer") || "").trim();

    if (!productProjectionId || !question || !answer) {
      return {
        ok: false,
        error: isEs
          ? "Producto, pregunta y respuesta son obligatorios."
          : "Product, question, and answer are required.",
      };
    }

    await appendProductFaq({
      shopId: shop.id,
      productProjectionId,
      category,
      question,
      answer,
    });

    return {
      ok: true,
      message: isEs ? "Pregunta frecuente agregada." : "FAQ added.",
    };
  }

  if (intent === "disable_product") {
    const productProjectionId = String(formData.get("productProjectionId") || "").trim();

    if (!productProjectionId) {
      return { ok: false, error: isEs ? "Producto invalido." : "Invalid product." };
    }

    await setProductDisabled({
      shopId: shop.id,
      productProjectionId,
      disabled: true,
    });

    return {
      ok: true,
      message: isEs ? "Producto deshabilitado." : "Product disabled.",
    };
  }

  return { ok: false, error: isEs ? "Acción no soportada" : "Unsupported action" };
}

export default function DataSourcesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const isEs = useIsSpanish();
  const { sources, syncJobs, productRows, runningSyncJobs, failedSyncJobs, projections } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const backToDashboardUrl = `/app${location.search || ""}`;

  const [sourceType, setSourceType] = useState<KnowledgeSourceType>("CATALOG");
  const [sourceName, setSourceName] = useState("");
  const [sourceEndpoint, setSourceEndpoint] = useState("");
  const [jobType, setJobType] = useState("initial:catalog");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [activeActionMenuProductId, setActiveActionMenuProductId] = useState<string | null>(null);
  const [faqModalProduct, setFaqModalProduct] = useState<ManagedProductRow | null>(null);
  const [disableModalProduct, setDisableModalProduct] = useState<ManagedProductRow | null>(null);
  const [faqCategory, setFaqCategory] = useState("");
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");

  useEffect(() => {
    if (actionData?.ok) {
      setSourceName("");
      setSourceEndpoint("");
      setFaqModalProduct(null);
      setDisableModalProduct(null);
      setFaqCategory("");
      setFaqQuestion("");
      setFaqAnswer("");
    }
  }, [actionData]);

  useEffect(() => {
    setSelectedProductIds((current) => current.filter((id) => productRows.some((row) => row.id === id)));
  }, [productRows]);

  const isSubmitting = navigation.state === "submitting";
  const activeSources = useMemo(() => sources.filter((source) => source.isActive).length, [sources]);

  const sourceRows = sources.map((source) => [
    source.name,
    source.sourceType,
    source.isActive
      ? <Badge tone="success">{isEs ? "Activa" : "Active"}</Badge>
      : <Badge tone="attention">{isEs ? "Pausada" : "Paused"}</Badge>,
    String(source._count.documents),
    source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString() : isEs ? "Nunca" : "Never",
    <Form method="post" key={`toggle-${source.id}`}>
      <input type="hidden" name="intent" value="toggle_source" />
      <input type="hidden" name="sourceId" value={source.id} />
      <input type="hidden" name="nextState" value={source.isActive ? "false" : "true"} />
      <Button submit loading={isSubmitting}>{source.isActive ? (isEs ? "Desactivar" : "Disable") : (isEs ? "Activar" : "Enable")}</Button>
    </Form>,
  ]);

  const syncRows = syncJobs.map((job) => [
    job.jobType,
    job.status === "FAILED"
      ? <Badge tone="critical">FAILED</Badge>
      : job.status === "RUNNING"
        ? <Badge tone="attention">RUNNING</Badge>
        : job.status === "PENDING"
          ? <Badge tone="attention">PENDING</Badge>
          : job.status === "COMPLETED"
            ? <Badge tone="success">COMPLETED</Badge>
            : <Badge>{job.status}</Badge>,
    `${Math.round((job.progress || 0) * 100)}%`,
    `${job.processedItems || 0}${job.totalItems ? `/${job.totalItems}` : ""}`,
    job.createdAt ? new Date(job.createdAt).toLocaleString() : "-",
    job.startedAt ? new Date(job.startedAt).toLocaleString() : "-",
    job.completedAt ? new Date(job.completedAt).toLocaleString() : "-",
    job.errorMessage
      ? (
        <Text as="span" tone={job.status === "FAILED" ? "critical" : "subdued"}>
          {job.errorMessage}
        </Text>
      )
      : "-",
    ["FAILED", "CANCELLED", "RUNNING", "COMPLETED", "PENDING"].includes(job.status)
      ? (
        <Form method="post" key={`reprocess-${job.id}`}>
          <input type="hidden" name="intent" value="reprocess_sync_job" />
          <input type="hidden" name="jobId" value={job.id} />
          <Button submit loading={isSubmitting}>
            {isEs ? "Reprocesar" : "Reprocess"}
          </Button>
        </Form>
      )
      : "-",
  ]);

  const allProductsSelected = productRows.length > 0 && selectedProductIds.length === productRows.length;

  const toggleSelectAllProducts = useCallback((checked: boolean) => {
    setSelectedProductIds(checked ? productRows.map((product) => product.id) : []);
  }, [productRows]);

  const toggleProductSelection = useCallback((productId: string, checked: boolean) => {
    setSelectedProductIds((current) => {
      if (checked) {
        if (current.includes(productId)) return current;
        return [...current, productId];
      }
      return current.filter((id) => id !== productId);
    });
  }, []);

  const openFaqManagementPage = useCallback((productProjectionId: string) => {
    navigate(`/app/data-sources/products/${productProjectionId}/faq${location.search || ""}`);
  }, [location.search, navigate]);

  const openFaqModal = useCallback((product: ManagedProductRow) => {
    setActiveActionMenuProductId(null);
    setFaqModalProduct(product);
  }, []);

  const openDisableModal = useCallback((product: ManagedProductRow) => {
    setActiveActionMenuProductId(null);
    setDisableModalProduct(product);
  }, []);

  const submitAddFaq = useCallback(() => {
    if (!faqModalProduct) return;
    const formData = new FormData();
    formData.append("intent", "add_product_faq");
    formData.append("productProjectionId", faqModalProduct.id);
    formData.append("category", faqCategory.trim());
    formData.append("question", faqQuestion.trim());
    formData.append("answer", faqAnswer.trim());
    submit(formData, { method: "POST" });
  }, [faqAnswer, faqCategory, faqModalProduct, faqQuestion, submit]);

  const submitDisableProduct = useCallback(() => {
    if (!disableModalProduct) return;
    const formData = new FormData();
    formData.append("intent", "disable_product");
    formData.append("productProjectionId", disableModalProduct.id);
    submit(formData, { method: "POST" });
  }, [disableModalProduct, submit]);

  const productRowsTable = productRows.map((product) => [
    <Checkbox
      key={`check-${product.id}`}
      label=""
      labelHidden
      checked={selectedProductIds.includes(product.id)}
      onChange={(checked) => toggleProductSelection(product.id, checked)}
    />,
    product.title,
    product.collections.length > 0 ? product.collections.join(", ") : "-",
    product.tags.length > 0 ? product.tags.join(", ") : "-",
    product.disabled
      ? <Badge tone="attention">{isEs ? "Deshabilitado" : "Disabled"}</Badge>
      : <Badge tone="success">{isEs ? "Activo" : "Active"}</Badge>,
    `${product.faqCount}`,
    <Popover
      key={`actions-${product.id}`}
      active={activeActionMenuProductId === product.id}
      activator={(
        <Button
          variant="plain"
          onClick={() => setActiveActionMenuProductId((current) => current === product.id ? null : product.id)}
          accessibilityLabel={isEs ? "Abrir acciones del producto" : "Open product actions"}
        >
          ...
        </Button>
      )}
      onClose={() => setActiveActionMenuProductId(null)}
    >
      <ActionList
        items={[
          {
            content: isEs ? "Agregar preguntas frecuentes" : "Add frequently asked questions",
            onAction: () => openFaqModal(product),
          },
          {
            content: isEs ? "Disable" : "Disable",
            onAction: () => openDisableModal(product),
            disabled: product.disabled,
          },
          {
            content: isEs ? "Gestionar preguntas frecuentes" : "Manage frequently asked questions",
            onAction: () => openFaqManagementPage(product.id),
          },
        ]}
      />
    </Popover>,
  ]);

  return (
    <Page fullWidth>
      <AdminPageHeader
        eyebrow={isEs ? "Grounding" : "Grounding"}
        title={isEs ? "Fuentes de datos" : "Data sources"}
        description={
          isEs
            ? "Conecta, activa y monitoriza las fuentes que alimentan respuestas, catálogo y políticas."
            : "Connect, activate, and monitor the sources that power answers, catalog data, and policies."
        }
        backUrl={backToDashboardUrl}
        backLabel={isEs ? "Panel" : "Dashboard"}
        badge={<AdminStatusBadge tone={failedSyncJobs > 0 ? "warning" : "success"}>{failedSyncJobs > 0 ? `${failedSyncJobs} ${isEs ? "fallos" : "failures"}` : (isEs ? "Sync estable" : "Sync healthy")}</AdminStatusBadge>}
      />
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
            <AdminStatCard label={isEs ? "Fuentes activas" : "Active sources"} value={`${activeSources}/${sources.length}`} />
            <AdminStatCard label={isEs ? "Productos proyectados" : "Projected products"} value={projections.productsProjected} />
            <AdminStatCard label={isEs ? "Sync jobs en ejecución" : "Running sync jobs"} value={runningSyncJobs} />
            <AdminStatCard label={isEs ? "Sync jobs fallidos" : "Failed sync jobs"} value={failedSyncJobs} badge={<AdminStatusBadge tone={failedSyncJobs > 0 ? "warning" : "success"}>{failedSyncJobs > 0 ? (isEs ? "Revisar" : "Review") : "OK"}</AdminStatusBadge>} />
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Productos aprendidos" : "Learned products"}
            description={isEs
              ? "Administra productos, estado y preguntas frecuentes para el agente IA."
              : "Manage products, status, and frequently asked questions for the AI agent."}
            badge={<AdminStatusBadge tone="info">{`${productRows.length} ${isEs ? "productos" : "products"}`}</AdminStatusBadge>}
          >
            {productRowsTable.length === 0 ? (
              <EmptyState heading={isEs ? "No hay productos sincronizados" : "No synced products"} image="">
                <Text as="p" variant="bodySm">
                  {isEs
                    ? "Ejecuta una sincronización de catálogo para gestionar preguntas frecuentes por producto."
                    : "Run a catalog sync to manage product frequently asked questions."}
                </Text>
              </EmptyState>
            ) : (
              <BlockStack gap="300">
                <InlineStack align="start">
                  <Checkbox
                    label={isEs ? "Seleccionar todos los productos" : "Select all products"}
                    checked={allProductsSelected}
                    onChange={toggleSelectAllProducts}
                  />
                </InlineStack>
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "numeric", "text"]}
                  headings={isEs
                    ? ["Sel", "Producto", "Colecciones", "Etiquetas", "Estado", "Preguntas frecuentes", "Acciones"]
                    : ["Sel", "Product", "Collections", "Tags", "Status", "FAQs", "Actions"]}
                  rows={productRowsTable}
                />
              </BlockStack>
            )}
          </AdminSectionCard>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <AdminSectionCard
              title={isEs ? "Agregar fuente de datos" : "Add data source"}
              description={isEs ? "Registra nuevas entradas de conocimiento sin mezclar configuración y operación." : "Register new knowledge inputs without mixing configuration and operations."}
            >
              <Form method="post">
                <BlockStack gap="300">
                  <FormLayout>
                    <input type="hidden" name="intent" value="create_source" />

                    <Select
                      label={isEs ? "Tipo de fuente" : "Source type"}
                      options={isEs
                        ? [
                          { label: "Catálogo", value: "CATALOG" },
                          { label: "Políticas", value: "POLICIES" },
                          { label: "Páginas", value: "PAGES" },
                          { label: "Blog", value: "BLOG" },
                          { label: "FAQ", value: "FAQ" },
                          { label: "Custom", value: "CUSTOM" },
                        ]
                        : SOURCE_TYPE_OPTIONS}
                      value={sourceType}
                      onChange={(value) => setSourceType(value as KnowledgeSourceType)}
                    />
                    <input type="hidden" name="sourceType" value={sourceType} />

                    <TextField
                      label={isEs ? "Nombre de la fuente" : "Source name"}
                      value={sourceName}
                      onChange={setSourceName}
                      autoComplete="off"
                      placeholder={isEs ? "Catálogo principal" : "Main catalog"}
                    />
                    <input type="hidden" name="name" value={sourceName} />

                    <TextField
                      label={isEs ? "Endpoint o referencia (opcional)" : "Endpoint or reference (optional)"}
                      value={sourceEndpoint}
                      onChange={setSourceEndpoint}
                      autoComplete="off"
                      placeholder="https://..."
                    />
                    <input type="hidden" name="endpoint" value={sourceEndpoint} />

                    <Button submit variant="primary" loading={isSubmitting}>
                      {isEs ? "Guardar fuente" : "Save source"}
                    </Button>
                  </FormLayout>
                </BlockStack>
              </Form>
            </AdminSectionCard>

            <AdminSectionCard
              title={isEs ? "Encolar sincronización" : "Queue synchronization"}
              description={isEs ? "Lanza trabajos de sync cuando necesites refrescar inventario, políticas o páginas." : "Launch sync jobs when you need to refresh inventory, policies, or pages."}
            >
              <Form method="post">
                <BlockStack gap="300">
                  <FormLayout>
                    <input type="hidden" name="intent" value="queue_sync" />
                    <Select
                      label={isEs ? "Tipo de job de sync" : "Sync job type"}
                      options={isEs
                        ? [
                          { label: "Sync inicial de catálogo", value: "initial:catalog" },
                          { label: "Sync delta de productos", value: "delta:products" },
                          { label: "Sync de políticas", value: "delta:policies" },
                          { label: "Sync de páginas", value: "delta:pages" },
                        ]
                        : [
                          { label: "Initial catalog sync", value: "initial:catalog" },
                          { label: "Delta products sync", value: "delta:products" },
                          { label: "Policies sync", value: "delta:policies" },
                          { label: "Pages sync", value: "delta:pages" },
                        ]}
                      value={jobType}
                      onChange={setJobType}
                    />
                    <input type="hidden" name="jobType" value={jobType} />

                    <Button submit loading={isSubmitting}>{isEs ? "Encolar sync" : "Queue sync"}</Button>
                  </FormLayout>
                </BlockStack>
              </Form>
            </AdminSectionCard>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Fuentes configuradas" : "Configured sources"}
            description={isEs ? "Inventario operativo de fuentes disponibles y su estado de activación." : "Operational inventory of available sources and their activation state."}
            badge={<AdminStatusBadge tone="info">{`${sources.length} ${isEs ? "totales" : "total"}`}</AdminStatusBadge>}
          >
              {sourceRows.length === 0 ? (
                <EmptyState heading={isEs ? "No hay fuentes configuradas" : "No sources configured"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Agrega tu primera fuente para iniciar el grounding de catálogo y políticas."
                      : "Add your first source to start catalog and policy grounding."}
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "numeric", "text", "text"]}
                  headings={isEs
                    ? ["Nombre", "Tipo", "Estado", "Documentos", "Última sync", "Acción"]
                    : ["Name", "Type", "Status", "Documents", "Last sync", "Action"]}
                  rows={sourceRows}
                />
              )}
          </AdminSectionCard>
        </Layout.Section>

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Sync jobs recientes" : "Recent sync jobs"}
            description={isEs ? "Historial corto para comprobar progreso, errores y capacidad operativa." : "Short history to inspect progress, errors, and operational capacity."}
          >
              {syncRows.length === 0 ? (
                <EmptyState heading={isEs ? "Aún no hay sync jobs" : "No sync jobs yet"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Encola tu primer sync para poblar proyecciones de productos y políticas."
                      : "Queue your first sync to populate product and policy projections."}
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text", "text", "text", "text"]}
                  headings={isEs
                    ? ["Job", "Estado", "Progreso", "Items", "Creado", "Iniciado", "Completado", "Error", "Acción"]
                    : ["Job", "Status", "Progress", "Items", "Created", "Started", "Completed", "Error", "Action"]}
                  rows={syncRows}
                />
              )}
          </AdminSectionCard>
        </Layout.Section>
      </Layout>

      <Modal
        open={Boolean(faqModalProduct)}
        onClose={() => setFaqModalProduct(null)}
        title={isEs ? "Agregar preguntas frecuentes del producto" : "Add product frequently asked questions"}
        primaryAction={{
          content: isEs ? "Guardar" : "Save",
          onAction: submitAddFaq,
          disabled: faqQuestion.trim().length === 0 || faqAnswer.trim().length === 0 || isSubmitting,
          loading: isSubmitting,
        }}
        secondaryActions={[{
          content: isEs ? "Cancelar" : "Cancel",
          onAction: () => setFaqModalProduct(null),
        }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text variant="bodySm" as="p">
              {isEs
                ? "Gestiona las preguntas frecuentes de tus productos."
                : "Manage frequently asked questions for your products."}
            </Text>
            <Text variant="bodySm" as="p">
              <strong>{faqModalProduct?.title || "-"}</strong>
            </Text>
            <TextField
              label={isEs ? "Categoria" : "Category"}
              value={faqCategory}
              onChange={setFaqCategory}
              autoComplete="off"
              placeholder={isEs ? "ej. dimensiones, material, ensamblaje" : "e.g. dimensions, material, assembly"}
            />
            <TextField
              label={isEs ? "Pregunta" : "Question"}
              value={faqQuestion}
              onChange={setFaqQuestion}
              autoComplete="off"
            />
            <TextField
              label={isEs ? "Responder" : "Answer"}
              value={faqAnswer}
              onChange={setFaqAnswer}
              autoComplete="off"
              multiline={5}
              maxLength={1000}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={Boolean(disableModalProduct)}
        onClose={() => setDisableModalProduct(null)}
        title={isEs ? "Deshabilitar producto aprendido" : "Disable learned product"}
        primaryAction={{
          content: isEs ? "Confirmar" : "Confirm",
          destructive: true,
          onAction: submitDisableProduct,
          loading: isSubmitting,
        }}
        secondaryActions={[{
          content: isEs ? "Cancelar" : "Cancel",
          onAction: () => setDisableModalProduct(null),
        }]}
      >
        <Modal.Section>
          <Text as="p" variant="bodySm">
            {isEs
              ? `¿Seguro que quieres deshabilitar "${disableModalProduct?.title || ""}" para el agente IA?`
              : `Are you sure you want to disable "${disableModalProduct?.title || ""}" for the AI agent?`}
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
