import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Badge,
  TextField,
  Select,
  InlineGrid,
  Button,
  Banner,
  FormLayout,
  InlineStack,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { useEffect, useState } from "react";
import prisma from "../db.server";
import { SUPPORTED_LOCALES } from "../services/localization.server";
import { saveMerchantAdminConfig, type AdminLanguage } from "../services/admin-config.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { authenticate } from "../shopify.server";
import { useIsSpanish } from "../hooks/use-admin-language";

interface SettingsActionData {
  ok: boolean;
  message?: string;
  error?: string;
}

function parseBoolean(raw: FormDataEntryValue | null, fallback = false): boolean {
  if (raw === null || raw === undefined) return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function parseGlobalLanguage(raw: FormDataEntryValue | null, fallback: AdminLanguage): AdminLanguage {
  const value = String(raw || "").trim().toLowerCase();
  return value === "es" || value === "en" ? value : fallback;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const config = await prisma.chatbotConfig.findUnique({
    where: { shopId: shop.id },
    select: {
      name: true,
      tone: true,
      language: true,
      temperature: true,
      maxTokens: true,
      systemPrompt: true,
      userPrompt: true,
      enableProactive: true,
      enableHandoff: true,
      confidenceThreshold: true,
      isActive: true,
      updatedAt: true,
    },
  });

  return {
    shop,
    config: {
      name: config?.name ?? "AI Assistant",
      tone: config?.tone ?? "professional",
      language: config?.language === "es" || config?.language === "en" ? config.language : "en",
      temperature: config?.temperature ?? 0.7,
      maxTokens: config?.maxTokens ?? 500,
      systemPrompt: config?.systemPrompt ?? "",
      userPrompt: config?.userPrompt ?? "",
      enableProactive: config?.enableProactive ?? false,
      enableHandoff: config?.enableHandoff ?? true,
      confidenceThreshold: config?.confidenceThreshold ?? 0.6,
      isActive: config?.isActive ?? true,
      updatedAt: config?.updatedAt?.toISOString() ?? null,
    },
    localeOptions: SUPPORTED_LOCALES
      .filter((locale) => locale.code === "es" || locale.code === "en")
      .map((locale) => ({
      label: `${locale.code.toUpperCase()} - ${locale.name}`,
      value: locale.code,
      })),
  };
}

export async function action({ request }: ActionFunctionArgs): Promise<SettingsActionData> {
  if (request.method !== "POST") {
    return { ok: false, error: "Method not allowed" };
  }

  const { session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    return { ok: false, error: "Shop not found" };
  }

  const formData = await request.formData();

  const language = parseGlobalLanguage(formData.get("language"), "en");
  const name = String(formData.get("name") || (language === "es" ? "Asistente IA" : "AI Assistant")).trim();
  const tone = String(formData.get("tone") || "professional").trim();
  const temperature = clampNumber(Number(formData.get("temperature") || 0.7), 0, 2, 0.7);
  const maxTokens = Math.round(clampNumber(Number(formData.get("maxTokens") || 500), 50, 4000, 500));
  const confidenceThreshold = clampNumber(
    Number(formData.get("confidenceThreshold") || 0.6),
    0,
    1,
    0.6,
  );
  const enableProactive = parseBoolean(formData.get("enableProactive"), false);
  const enableHandoff = parseBoolean(formData.get("enableHandoff"), true);
  const isActive = parseBoolean(formData.get("isActive"), true);
  const systemPrompt = String(formData.get("systemPrompt") || "").trim();
  const userPrompt = String(formData.get("userPrompt") || "").trim();

  if (!name) {
    return { ok: false, error: language === "es" ? "El nombre del asistente es obligatorio" : "Assistant name is required" };
  }

  await prisma.chatbotConfig.upsert({
    where: { shopId: shop.id },
    create: {
      shopId: shop.id,
      name,
      tone,
      language,
      temperature,
      maxTokens,
      confidenceThreshold,
      enableProactive,
      enableHandoff,
      isActive,
      systemPrompt: systemPrompt || null,
      userPrompt: userPrompt || null,
    },
    update: {
      name,
      tone,
      language,
      temperature,
      maxTokens,
      confidenceThreshold,
      enableProactive,
      enableHandoff,
      isActive,
      systemPrompt: systemPrompt || null,
      userPrompt: userPrompt || null,
    },
  });

  await saveMerchantAdminConfig(shop.id, {
    adminLanguage: language,
    primaryBotLanguage: language,
    supportedLanguages: [language],
  });

  return {
    ok: true,
    message: language === "es" ? "Configuracion del asistente guardada." : "Assistant settings saved.",
  };
}

export default function SettingsPage() {
  const location = useLocation();
  const isEs = useIsSpanish();
  const { config, localeOptions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const backToDashboardUrl = `/app${location.search || ""}`;

  const [name, setName] = useState(config.name);
  const [tone, setTone] = useState(config.tone);
  const [language, setLanguage] = useState(config.language);
  const [temperature, setTemperature] = useState(String(config.temperature));
  const [maxTokens, setMaxTokens] = useState(String(config.maxTokens));
  const [confidenceThreshold, setConfidenceThreshold] = useState(String(config.confidenceThreshold));
  const [enableProactive, setEnableProactive] = useState(config.enableProactive ? "true" : "false");
  const [enableHandoff, setEnableHandoff] = useState(config.enableHandoff ? "true" : "false");
  const [isActive, setIsActive] = useState(config.isActive ? "true" : "false");
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt || "");
  const [userPrompt, setUserPrompt] = useState(config.userPrompt || "");

  useEffect(() => {
    setName(config.name);
    setTone(config.tone);
    setLanguage(config.language);
    setTemperature(String(config.temperature));
    setMaxTokens(String(config.maxTokens));
    setConfidenceThreshold(String(config.confidenceThreshold));
    setEnableProactive(config.enableProactive ? "true" : "false");
    setEnableHandoff(config.enableHandoff ? "true" : "false");
    setIsActive(config.isActive ? "true" : "false");
    setSystemPrompt(config.systemPrompt || "");
    setUserPrompt(config.userPrompt || "");
  }, [config]);

  const isSubmitting = navigation.state === "submitting";

  return (
    <Page
      title={isEs ? "Configuracion del asistente" : "Assistant Settings"}
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
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Estado del asistente" : "Assistant status"}</Text>
                <Badge tone={isActive === "true" ? "success" : "critical"}>
                  {isActive === "true" ? (isEs ? "Activo" : "Active") : (isEs ? "Pausado" : "Paused")}
                </Badge>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Ventas proactivas" : "Proactive sales"}</Text>
                <Badge tone={enableProactive === "true" ? "success" : "attention"}>
                  {enableProactive === "true" ? (isEs ? "Activado" : "Enabled") : (isEs ? "Desactivado" : "Disabled")}
                </Badge>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">{isEs ? "Handoff humano" : "Human handoff"}</Text>
                <Badge tone={enableHandoff === "true" ? "success" : "attention"}>
                  {enableHandoff === "true" ? (isEs ? "Activado" : "Enabled") : (isEs ? "Desactivado" : "Disabled")}
                </Badge>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Form method="post">
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">{isEs ? "Controles de comportamiento y respuesta" : "Behavior and response controls"}</Text>

                <FormLayout>
                  <TextField
                    label={isEs ? "Nombre del asistente" : "Assistant name"}
                    value={name}
                    onChange={setName}
                    autoComplete="off"
                    requiredIndicator
                  />
                  <input type="hidden" name="name" value={name} />

                  <Select
                    label={isEs ? "Tono" : "Tone"}
                    options={[
                      { label: isEs ? "Profesional" : "Professional", value: "professional" },
                      { label: isEs ? "Cercano" : "Friendly", value: "friendly" },
                      { label: isEs ? "Conciso" : "Concise", value: "concise" },
                      { label: isEs ? "Orientado a ventas" : "Sales-focused", value: "sales" },
                    ]}
                    value={tone}
                    onChange={setTone}
                  />
                  <input type="hidden" name="tone" value={tone} />

                  <Select
                    label={isEs ? "Idioma global" : "Global language"}
                    options={localeOptions}
                    value={language}
                    onChange={setLanguage}
                  />
                  <input type="hidden" name="language" value={language} />

                  <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                    <TextField
                      label={isEs ? "Temperatura" : "Temperature"}
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={temperature}
                      onChange={setTemperature}
                      autoComplete="off"
                    />
                    <input type="hidden" name="temperature" value={temperature} />

                    <TextField
                      label={isEs ? "Maximo de tokens" : "Max tokens"}
                      type="number"
                      min={50}
                      max={4000}
                      step={50}
                      value={maxTokens}
                      onChange={setMaxTokens}
                      autoComplete="off"
                    />
                    <input type="hidden" name="maxTokens" value={maxTokens} />

                    <TextField
                      label={isEs ? "Umbral de confianza" : "Confidence threshold"}
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={confidenceThreshold}
                      onChange={setConfidenceThreshold}
                      autoComplete="off"
                    />
                    <input type="hidden" name="confidenceThreshold" value={confidenceThreshold} />
                  </InlineGrid>

                  <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                    <Select
                      label={isEs ? "Estado del asistente" : "Assistant status"}
                      options={[
                        { label: isEs ? "Activo" : "Active", value: "true" },
                        { label: isEs ? "Pausado" : "Paused", value: "false" },
                      ]}
                      value={isActive}
                      onChange={setIsActive}
                    />
                    <input type="hidden" name="isActive" value={isActive} />

                    <Select
                      label={isEs ? "Activar mensajeria proactiva" : "Enable proactive messaging"}
                      options={[
                        { label: isEs ? "Activado" : "Enabled", value: "true" },
                        { label: isEs ? "Desactivado" : "Disabled", value: "false" },
                      ]}
                      value={enableProactive}
                      onChange={setEnableProactive}
                    />
                    <input type="hidden" name="enableProactive" value={enableProactive} />

                    <Select
                      label={isEs ? "Activar handoff humano" : "Enable human handoff"}
                      options={[
                        { label: isEs ? "Activado" : "Enabled", value: "true" },
                        { label: isEs ? "Desactivado" : "Disabled", value: "false" },
                      ]}
                      value={enableHandoff}
                      onChange={setEnableHandoff}
                    />
                    <input type="hidden" name="enableHandoff" value={enableHandoff} />
                  </InlineGrid>

                  <TextField
                    label={isEs ? "Prompt de sistema (opcional)" : "System prompt (optional)"}
                    value={systemPrompt}
                    onChange={setSystemPrompt}
                    autoComplete="off"
                    multiline={4}
                    helpText={isEs ? "Controla el comportamiento global del asistente." : "Controls assistant behavior globally."}
                  />
                  <input type="hidden" name="systemPrompt" value={systemPrompt} />

                  <TextField
                    label={isEs ? "Plantilla de prompt de usuario (opcional)" : "User prompt template (optional)"}
                    value={userPrompt}
                    onChange={setUserPrompt}
                    autoComplete="off"
                    multiline={3}
                    helpText={isEs ? "Contexto opcional que se envia con solicitudes del usuario." : "Optional prompt context sent with user requests."}
                  />
                  <input type="hidden" name="userPrompt" value={userPrompt} />
                </FormLayout>

                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {config.updatedAt
                      ? `${isEs ? "Ultima actualizacion" : "Last updated"}: ${new Date(config.updatedAt).toLocaleString()}`
                      : isEs ? "Aun no hay configuraciones guardadas." : "No saved settings yet."}
                  </Text>
                  <Button submit variant="primary" loading={isSubmitting}>
                    {isEs ? "Guardar configuracion" : "Save settings"}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
