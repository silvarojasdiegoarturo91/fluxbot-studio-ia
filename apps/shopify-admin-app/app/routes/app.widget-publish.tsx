import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  Link,
  List,
  Page,
  Text,
} from "@shopify/polaris";
import type { Prisma } from "@prisma/client";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { useIsSpanish } from "../hooks/use-admin-language";
import prisma from "../db.server";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublishedTheme {
  id: string;
  name: string;
}

interface WidgetPublishLoaderData {
  shopDomain: string;
  publishedTheme: PublishedTheme | null;
  themeEditorUrl: string | null;
  widgetPublishedAt: string | null;
  extensionHandle: string;
  themeQueryError: string | null;
}

interface WidgetPublishActionData {
  ok: boolean;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXTENSION_HANDLE = "ai-chat-widget";

const THEMES_QUERY = `#graphql
  query WidgetPublishThemes {
    themes(first: 10) {
      nodes {
        id
        name
        role
      }
    }
  }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractShopifyId(gid: string): string {
  return gid.split("/").pop() ?? gid;
}

function buildThemeEditorUrl(shopDomain: string, themeId: string): string {
  const numericId = extractShopifyId(themeId);
  return `https://${shopDomain}/admin/themes/${numericId}/editor?context=apps`;
}

function getMetadataRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs): Promise<WidgetPublishLoaderData> {
  const { admin, session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  // Read widgetPublishedAt from shop metadata
  const shopRecord = await prisma.shop.findUnique({
    where: { id: shop.id },
    select: { metadata: true },
  });

  const meta = getMetadataRecord(shopRecord?.metadata);
  const widgetPublishedAt =
    typeof meta.widgetPublishedAt === "string" ? meta.widgetPublishedAt : null;

  // Query published theme from Shopify Admin GraphQL
  let publishedTheme: PublishedTheme | null = null;
  let themeEditorUrl: string | null = null;
  let themeQueryError: string | null = null;

  try {
    const response = await admin.graphql(THEMES_QUERY);
    const payload = (await response.json()) as {
      data?: {
        themes?: {
          nodes?: Array<{ id: string; name: string; role: string }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };

    if (payload.errors?.length) {
      themeQueryError = payload.errors[0]?.message ?? "Theme query failed";
    } else {
      const mainTheme = payload.data?.themes?.nodes?.find(
        (t) => t.role === "MAIN"
      );
      if (mainTheme) {
        publishedTheme = { id: mainTheme.id, name: mainTheme.name };
        themeEditorUrl = buildThemeEditorUrl(session.shop, mainTheme.id);
      }
    }
  } catch (err) {
    themeQueryError =
      err instanceof Error ? err.message : "Failed to query themes";
  }

  return {
    shopDomain: session.shop,
    publishedTheme,
    themeEditorUrl,
    widgetPublishedAt,
    extensionHandle: EXTENSION_HANDLE,
    themeQueryError,
  };
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs): Promise<WidgetPublishActionData> {
  if (request.method !== "POST") {
    return { ok: false, error: "Method not allowed" };
  }

  const { session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    return { ok: false, error: "Shop not found" };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent !== "confirm_published" && intent !== "reset_status") {
    return { ok: false, error: "Unsupported action" };
  }

  // Merge metadata safely
  const shopRecord = await prisma.shop.findUnique({
    where: { id: shop.id },
    select: { metadata: true },
  });
  const existingMeta = getMetadataRecord(shopRecord?.metadata);

  const updatedMeta =
    intent === "confirm_published"
      ? { ...existingMeta, widgetPublishedAt: new Date().toISOString() }
      : (({ widgetPublishedAt: _removed, ...rest }) => rest)(existingMeta);

  await prisma.shop.update({
    where: { id: shop.id },
    data: { metadata: updatedMeta as Prisma.InputJsonValue },
  });

  return { ok: true };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WidgetPublishPage() {
  const {
    shopDomain,
    publishedTheme,
    themeEditorUrl,
    widgetPublishedAt,
    themeQueryError,
  } = useLoaderData<typeof loader>();

  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const location = useLocation();
  const isEs = useIsSpanish();

  const isSubmitting = navigation.state === "submitting";
  const backToDashboardUrl = `/app${location.search || ""}`;
  const isPublished = Boolean(widgetPublishedAt);

  const publishedDate = widgetPublishedAt
    ? new Date(widgetPublishedAt).toLocaleDateString(isEs ? "es-ES" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Page
      title={isEs ? "Publicación del Widget" : "Widget Publish"}
      subtitle={
        isEs
          ? `Activa el chat en tu storefront · ${shopDomain}`
          : `Activate the chat on your storefront · ${shopDomain}`
      }
      backAction={{ content: isEs ? "Panel" : "Dashboard", url: backToDashboardUrl }}
    >
      <Layout>
        {/* Status banner */}
        <Layout.Section>
          {actionData && !actionData.ok && (
            <Banner tone="critical">
              <Text as="p" variant="bodyMd">
                {actionData.error ?? (isEs ? "Error al guardar" : "Error saving")}
              </Text>
            </Banner>
          )}
          {themeQueryError && (
            <Banner tone="warning">
              <Text as="p" variant="bodyMd">
                {isEs
                  ? `No se pudo obtener el tema publicado: ${themeQueryError}`
                  : `Could not fetch published theme: ${themeQueryError}`}
              </Text>
            </Banner>
          )}
        </Layout.Section>

        {/* Current status */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  {isEs ? "Estado del Widget" : "Widget Status"}
                </Text>
                {isPublished ? (
                  <Badge tone="success">{isEs ? "Activo" : "Live"}</Badge>
                ) : (
                  <Badge tone="attention">{isEs ? "No publicado" : "Not Published"}</Badge>
                )}
              </InlineStack>

              {isPublished && publishedDate && (
                <Text as="p" variant="bodyMd" tone="subdued">
                  {isEs
                    ? `Marcado como activo el ${publishedDate}`
                    : `Marked as live on ${publishedDate}`}
                </Text>
              )}

              {publishedTheme && (
                <Text as="p" variant="bodyMd">
                  {isEs ? "Tema publicado: " : "Published theme: "}
                  <strong>{publishedTheme.name}</strong>
                </Text>
              )}

              <InlineStack gap="300">
                {!isPublished ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="confirm_published" />
                    <Button
                      submit
                      variant="primary"
                      loading={isSubmitting}
                    >
                      {isEs ? "Marcar como activo" : "Mark as Live"}
                    </Button>
                  </Form>
                ) : (
                  <Form method="post">
                    <input type="hidden" name="intent" value="reset_status" />
                    <Button
                      submit
                      variant="secondary"
                      tone="critical"
                      loading={isSubmitting}
                    >
                      {isEs ? "Restablecer estado" : "Reset Status"}
                    </Button>
                  </Form>
                )}

                {themeEditorUrl && (
                  <Button
                    variant="secondary"
                    url={themeEditorUrl}
                    target="_blank"
                  >
                    {isEs ? "Abrir editor de tema" : "Open Theme Editor"}
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Step-by-step guide */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                {isEs ? "Guía de instalación" : "Installation Guide"}
              </Text>

              <BlockStack gap="300">
                {/* Step 1 */}
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    {isEs ? "Paso 1 — Desplegar la extensión" : "Step 1 — Deploy the extension"}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {isEs
                      ? "Asegúrate de que la extensión del tema está desplegada con Shopify CLI:"
                      : "Ensure the theme extension is deployed using Shopify CLI:"}
                  </Text>
                  <List type="bullet">
                    <List.Item>
                      <Text as="span" variant="bodyMd">
                        <code>shopify app deploy</code>
                        {isEs
                          ? " — despliega la extensión al Partner Dashboard"
                          : " — deploys the extension to the Partner Dashboard"}
                      </Text>
                    </List.Item>
                    <List.Item>
                      <Text as="span" variant="bodyMd">
                        {isEs
                          ? `Handle de extensión: `
                          : `Extension handle: `}
                        <strong>{EXTENSION_HANDLE}</strong>
                      </Text>
                    </List.Item>
                  </List>
                </BlockStack>

                {/* Step 2 */}
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    {isEs
                      ? "Paso 2 — Activar el bloque en el Editor de Temas"
                      : "Step 2 — Enable the block in Theme Editor"}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {isEs
                      ? "En el Editor de Temas, ve a la sección App Embeds y activa el widget:"
                      : "In the Theme Editor, go to the App Embeds section and enable the widget:"}
                  </Text>
                  <List type="bullet">
                    <List.Item>
                      <Text as="span" variant="bodyMd">
                        {isEs
                          ? "Abre el Editor de Temas para tu tema publicado"
                          : "Open the Theme Editor for your published theme"}
                      </Text>
                    </List.Item>
                    <List.Item>
                      <Text as="span" variant="bodyMd">
                        {isEs
                          ? 'Selecciona "App Embeds" en la barra lateral'
                          : 'Select "App Embeds" in the sidebar'}
                      </Text>
                    </List.Item>
                    <List.Item>
                      <Text as="span" variant="bodyMd">
                        {isEs
                          ? 'Activa "AI Chat Widget" y guarda'
                          : 'Enable "AI Chat Widget" and save'}
                      </Text>
                    </List.Item>
                  </List>
                  {themeEditorUrl && (
                    <Link url={themeEditorUrl} target="_blank">
                      {isEs ? "Ir al Editor de Temas →" : "Go to Theme Editor →"}
                    </Link>
                  )}
                </BlockStack>

                {/* Step 3 */}
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    {isEs ? "Paso 3 — Confirmar activación" : "Step 3 — Confirm activation"}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {isEs
                      ? 'Tras activar el widget en el editor, haz clic en "Marcar como activo" para registrar el estado.'
                      : 'After enabling the widget in the editor, click "Mark as Live" to record the status.'}
                  </Text>
                </BlockStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
