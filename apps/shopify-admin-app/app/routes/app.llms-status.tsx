import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { LlmsTxtService } from "../services/llms-txt.server";
import { useIsSpanish } from "../hooks/use-admin-language";
import prisma from "../db.server";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LlmsStatusLoaderData {
  shopDomain: string;
  hasCache: boolean;
  generatedAt: string | null;
  expiresAt: string | null;
  isFresh: boolean;
  contentBytes: number | null;
}

interface LlmsStatusActionData {
  ok: boolean;
  error?: string;
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs): Promise<LlmsStatusLoaderData> {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const [status, cacheRow] = await Promise.all([
    LlmsTxtService.getCacheStatus(session.shop),
    prisma.llmsTxtCache.findUnique({
      where: { shopId: shop.id },
      select: { content: true },
    }),
  ]);

  return {
    shopDomain: session.shop,
    hasCache: status.hasCache,
    generatedAt: status.generatedAt?.toISOString() ?? null,
    expiresAt: status.expiresAt?.toISOString() ?? null,
    isFresh: status.hasCache && !status.isExpired,
    contentBytes: cacheRow?.content ? Buffer.byteLength(cacheRow.content, "utf8") : null,
  };
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs): Promise<LlmsStatusActionData> {
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

  if (intent === "force_refresh") {
    try {
      await LlmsTxtService.generate({
        shopDomain: session.shop,
        forceRefresh: true,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Refresh failed",
      };
    }
  }

  if (intent === "invalidate") {
    await LlmsTxtService.invalidate(session.shop);
    return { ok: true };
  }

  return { ok: false, error: "Unsupported action" };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LlmsStatusPage() {
  const {
    shopDomain,
    hasCache,
    generatedAt,
    expiresAt,
    isFresh,
    contentBytes,
  } = useLoaderData<typeof loader>();

  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const location = useLocation();
  const isEs = useIsSpanish();

  const isSubmitting = navigation.state === "submitting";
  const submittingIntent =
    navigation.state === "submitting"
      ? String(
          new URLSearchParams(
            typeof navigation.formData?.get === "function"
              ? navigation.formData?.get("intent")?.toString() ?? ""
              : ""
          )
        )
      : null;

  const backToDashboardUrl = `/app${location.search || ""}`;

  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(isEs ? "es-ES" : "en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  const formatBytes = (bytes: number | null) => {
    if (bytes === null) return "—";
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <Page
      title={isEs ? "Estado de llms.txt" : "llms.txt Cache Status"}
      subtitle={
        isEs
          ? `Visibilidad AEO · ${shopDomain}`
          : `AEO visibility · ${shopDomain}`
      }
      backAction={{ content: isEs ? "Panel" : "Dashboard", url: backToDashboardUrl }}
    >
      <Layout>
        {/* Action feedback */}
        <Layout.Section>
          {actionData && !actionData.ok && (
            <Banner tone="critical">
              <Text as="p" variant="bodyMd">
                {actionData.error ?? (isEs ? "Error al procesar" : "Action failed")}
              </Text>
            </Banner>
          )}
          {actionData?.ok && (
            <Banner tone="success">
              <Text as="p" variant="bodyMd">
                {isEs ? "Operación completada." : "Operation completed."}
              </Text>
            </Banner>
          )}
        </Layout.Section>

        {/* Cache status card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  {isEs ? "Caché de llms.txt" : "llms.txt Cache"}
                </Text>
                {!hasCache ? (
                  <Badge tone="attention">{isEs ? "Sin caché" : "No cache"}</Badge>
                ) : isFresh ? (
                  <Badge tone="success">{isEs ? "Fresco" : "Fresh"}</Badge>
                ) : (
                  <Badge tone="warning">{isEs ? "Expirado" : "Stale"}</Badge>
                )}
              </InlineStack>

              <BlockStack gap="200">
                <InlineStack gap="600">
                  <BlockStack gap="050">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {isEs ? "Generado" : "Generated"}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {formatDate(generatedAt)}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {isEs ? "Expira" : "Expires"}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {formatDate(expiresAt)}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {isEs ? "Tamaño" : "Size"}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {formatBytes(contentBytes)}
                    </Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>

              <InlineStack gap="300">
                <Form method="post">
                  <input type="hidden" name="intent" value="force_refresh" />
                  <Button
                    submit
                    variant="primary"
                    loading={isSubmitting && submittingIntent !== "invalidate"}
                  >
                    {isEs ? "Regenerar ahora" : "Refresh Now"}
                  </Button>
                </Form>

                {hasCache && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="invalidate" />
                    <Button
                      submit
                      variant="secondary"
                      tone="critical"
                      loading={isSubmitting && submittingIntent === "invalidate"}
                    >
                      {isEs ? "Invalidar caché" : "Invalidate Cache"}
                    </Button>
                  </Form>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Info card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {isEs ? "¿Qué es llms.txt?" : "What is llms.txt?"}
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                {isEs
                  ? "llms.txt es un archivo estructurado que permite a buscadores de IA (ChatGPT, Gemini, Perplexity…) entender tu tienda. Incluye catálogo, políticas y contenido clave para mejorar la visibilidad en respuestas generativas."
                  : "llms.txt is a structured file that lets AI search engines (ChatGPT, Gemini, Perplexity…) understand your store. It includes catalog data, policies and key content to improve visibility in generative answers."}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
