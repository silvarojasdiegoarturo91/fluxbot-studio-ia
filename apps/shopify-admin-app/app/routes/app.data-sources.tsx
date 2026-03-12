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
  Select,
  TextField,
  Banner,
  InlineStack,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { useEffect, useMemo, useState } from "react";
import type { KnowledgeSourceType } from "@prisma/client";
import prisma from "../db.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { authenticate } from "../shopify.server";
import { getMerchantAdminConfig } from "../services/admin-config.server";
import { useIsSpanish } from "../hooks/use-admin-language";

interface DataSourcesActionData {
  ok: boolean;
  message?: string;
  error?: string;
}

const SOURCE_TYPE_OPTIONS: Array<{ label: string; value: KnowledgeSourceType }> = [
  { label: "Catalog", value: "CATALOG" },
  { label: "Policies", value: "POLICIES" },
  { label: "Pages", value: "PAGES" },
  { label: "Blog", value: "BLOG" },
  { label: "FAQ", value: "FAQ" },
  { label: "Custom", value: "CUSTOM" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const [sources, syncJobs, projectionCounts, runningSyncJobs, failedSyncJobs] = await Promise.all([
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
  ]);

  const [productsProjected, policiesProjected, ordersProjected] = projectionCounts;

  return {
    shop,
    sources,
    syncJobs,
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

  const { session } = await authenticate.admin(request);
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

    await prisma.syncJob.create({
      data: {
        shopId: shop.id,
        jobType,
        status: "PENDING",
        progress: 0,
        processedItems: 0,
      },
    });

    return { ok: true, message: isEs ? `Job de sync en cola (${jobType}).` : `Sync job queued (${jobType}).` };
  }

  return { ok: false, error: isEs ? "Accion no soportada" : "Unsupported action" };
}

export default function DataSourcesPage() {
  const location = useLocation();
  const isEs = useIsSpanish();
  const { sources, syncJobs, runningSyncJobs, failedSyncJobs, projections } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const backToDashboardUrl = `/app${location.search || ""}`;

  const [sourceType, setSourceType] = useState<KnowledgeSourceType>("CATALOG");
  const [sourceName, setSourceName] = useState("");
  const [sourceEndpoint, setSourceEndpoint] = useState("");
  const [jobType, setJobType] = useState("initial:catalog");

  useEffect(() => {
    if (actionData?.ok) {
      setSourceName("");
      setSourceEndpoint("");
    }
  }, [actionData]);

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
    job.status,
    `${Math.round((job.progress || 0) * 100)}%`,
    `${job.processedItems || 0}${job.totalItems ? `/${job.totalItems}` : ""}`,
    job.createdAt ? new Date(job.createdAt).toLocaleString() : "-",
    job.completedAt ? new Date(job.completedAt).toLocaleString() : "-",
    job.errorMessage || "-",
  ]);

  return (
    <Page
      title={isEs ? "Fuentes de datos" : "Data Sources"}
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
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Fuentes activas" : "Active sources"}</Text>
                <Text as="p" variant="headingXl">{activeSources}/{sources.length}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Productos proyectados" : "Projected products"}</Text>
                <Text as="p" variant="headingXl">{projections.productsProjected}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Sync jobs en ejecucion" : "Running sync jobs"}</Text>
                <Text as="p" variant="headingXl">{runningSyncJobs}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Sync jobs fallidos" : "Failed sync jobs"}</Text>
                <Text as="p" variant="headingXl">{failedSyncJobs}</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <Form method="post">
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">{isEs ? "Agregar fuente de datos" : "Add data source"}</Text>
                  <FormLayout>
                    <input type="hidden" name="intent" value="create_source" />

                    <Select
                      label={isEs ? "Tipo de fuente" : "Source type"}
                      options={isEs
                        ? [
                          { label: "Catalogo", value: "CATALOG" },
                          { label: "Politicas", value: "POLICIES" },
                          { label: "Paginas", value: "PAGES" },
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
                      placeholder={isEs ? "Catalogo principal" : "Main catalog"}
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
            </Card>

            <Card>
              <Form method="post">
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">{isEs ? "Encolar sincronizacion" : "Queue synchronization"}</Text>
                  <FormLayout>
                    <input type="hidden" name="intent" value="queue_sync" />
                    <Select
                      label={isEs ? "Tipo de job de sync" : "Sync job type"}
                      options={isEs
                        ? [
                          { label: "Sync inicial de catalogo", value: "initial:catalog" },
                          { label: "Sync delta de productos", value: "delta:products" },
                          { label: "Sync de politicas", value: "delta:policies" },
                          { label: "Sync de paginas", value: "delta:pages" },
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
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">{isEs ? "Fuentes configuradas" : "Configured sources"}</Text>
                <Badge tone="info">{`${sources.length} ${isEs ? "totales" : "total"}`}</Badge>
              </InlineStack>

              {sourceRows.length === 0 ? (
                <EmptyState heading={isEs ? "No hay fuentes configuradas" : "No sources configured"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Agrega tu primera fuente para iniciar el grounding de catalogo y politicas."
                      : "Add your first source to start catalog and policy grounding."}
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "numeric", "text", "text"]}
                  headings={isEs
                    ? ["Nombre", "Tipo", "Estado", "Documentos", "Ultima sync", "Accion"]
                    : ["Name", "Type", "Status", "Documents", "Last sync", "Action"]}
                  rows={sourceRows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">{isEs ? "Sync jobs recientes" : "Recent sync jobs"}</Text>

              {syncRows.length === 0 ? (
                <EmptyState heading={isEs ? "Aun no hay sync jobs" : "No sync jobs yet"} image="">
                  <Text as="p" variant="bodySm">
                    {isEs
                      ? "Encola tu primer sync para poblar proyecciones de productos y politicas."
                      : "Queue your first sync to populate product and policy projections."}
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text", "text"]}
                  headings={isEs
                    ? ["Job", "Estado", "Progreso", "Items", "Creado", "Completado", "Error"]
                    : ["Job", "Status", "Progress", "Items", "Created", "Completed", "Error"]}
                  rows={syncRows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
