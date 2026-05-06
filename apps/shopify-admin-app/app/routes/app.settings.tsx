import {
  Page,
  Layout,
  BlockStack,
  Text,
  TextField,
  Select,
  InlineGrid,
  Button,
  Banner,
  FormLayout,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { useEffect, useState } from "react";
import prisma from "../db.server";
import { SUPPORTED_LOCALES } from "../services/localization.server";
import { saveMerchantAdminConfig, type AdminLanguage } from "../services/admin-config.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { useIsSpanish } from "../hooks/use-admin-language";
import { AdminInfoCallout, AdminPageHeader, AdminSectionCard, AdminStatCard, AdminStatusBadge } from "../components/admin-ui";

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

function getCreativitySummary(value: number, isEs: boolean) {
  if (value <= 0.4) {
    return isEs ? "Muy precisa y predecible" : "Very precise and predictable";
  }

  if (value <= 0.8) {
    return isEs ? "Equilibrada para la mayoria de tiendas" : "Balanced for most stores";
  }

  if (value <= 1.2) {
    return isEs ? "Mas expresiva y flexible" : "More expressive and flexible";
  }

  return isEs ? "Muy creativa, con mas variacion" : "Very creative with more variation";
}

function getResponseLengthSummary(value: number, isEs: boolean) {
  if (value <= 300) {
    return isEs ? "Breve y directa" : "Short and direct";
  }

  if (value <= 700) {
    return isEs ? "Equilibrada y facil de leer" : "Balanced and easy to read";
  }

  return isEs ? "Mas detallada y explicativa" : "More detailed and explanatory";
}

function getConfidenceSummary(value: number, isEs: boolean) {
  if (value >= 0.8) {
    return isEs ? "Muy prudente antes de responder" : "Very cautious before replying";
  }

  if (value >= 0.6) {
    return isEs ? "Equilibrio entre agilidad y seguridad" : "Balanced between speed and safety";
  }

  return isEs ? "Mas agil, con menos filtro" : "More agile with less filtering";
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticateAdminRequest(request);
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

  const { session } = await authenticateAdminRequest(request);
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
  const temperatureNumber = clampNumber(Number(temperature || 0.7), 0, 2, 0.7);
  const maxTokensNumber = Math.round(clampNumber(Number(maxTokens || 500), 50, 4000, 500));
  const confidenceThresholdNumber = clampNumber(Number(confidenceThreshold || 0.6), 0, 1, 0.6);

  return (
    <Page fullWidth>
      <AdminPageHeader
        eyebrow={isEs ? "Configuracion central" : "Core configuration"}
        title={isEs ? "Configuracion del asistente" : "Assistant settings"}
        description={
          isEs
            ? "Configura la forma de hablar, el nivel de detalle y la prudencia del asistente con terminos mas faciles de entender."
            : "Configure the assistant voice, level of detail, and caution using language that is easier to understand."
        }
        backUrl={backToDashboardUrl}
        backLabel={isEs ? "Panel" : "Dashboard"}
        badge={
          <AdminStatusBadge tone={isActive === "true" ? "success" : "attention"}>
            {isActive === "true" ? (isEs ? "Activo" : "Active") : (isEs ? "Pausado" : "Paused")}
          </AdminStatusBadge>
        }
      />
      <Form method="post">
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
              <AdminStatCard
                label={isEs ? "Estado del asistente" : "Assistant status"}
                value={isActive === "true" ? (isEs ? "Activo" : "Active") : (isEs ? "Pausado" : "Paused")}
                badge={<AdminStatusBadge tone={isActive === "true" ? "success" : "critical"}>{isActive === "true" ? (isEs ? "Operativo" : "Live") : (isEs ? "Pausa" : "Paused")}</AdminStatusBadge>}
              />
              <AdminStatCard
                label={isEs ? "Estilo de respuesta" : "Response style"}
                value={getCreativitySummary(temperatureNumber, isEs)}
                meta={isEs ? `Valor interno: ${temperatureNumber.toFixed(1)} de creatividad` : `Internal value: ${temperatureNumber.toFixed(1)} creativity score`}
              />
              <AdminStatCard
                label={isEs ? "Nivel de detalle" : "Level of detail"}
                value={getResponseLengthSummary(maxTokensNumber, isEs)}
                meta={isEs ? `Prudencia actual: ${getConfidenceSummary(confidenceThresholdNumber, isEs)}` : `Current caution: ${getConfidenceSummary(confidenceThresholdNumber, isEs)}`}
              />
            </InlineGrid>
          </Layout.Section>

          <Layout.Section>
            <AdminSectionCard
              title={isEs ? "Identidad y voz del asistente" : "Assistant identity and voice"}
              description={
                isEs
                  ? "Empieza por lo que el merchant reconoce enseguida: nombre, idioma y tono con el que hablara el asistente."
                  : "Start with what merchants recognize instantly: name, language, and the tone the assistant will use."
              }
            >
              <BlockStack gap="400">
                <AdminInfoCallout
                  title={isEs ? "Configuracion recomendada para arrancar" : "Recommended setup to get started"}
                  tone="highlight"
                >
                  <p>
                    {isEs
                      ? "Si no estas seguro, deja un tono profesional y un solo idioma principal. Luego podras afinar el resto con datos reales."
                      : "If you are unsure, keep a professional tone and one primary language. You can refine the rest later with real usage data."}
                  </p>
                </AdminInfoCallout>

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
                </FormLayout>
              </BlockStack>
            </AdminSectionCard>
          </Layout.Section>

          <Layout.Section>
            <InlineGrid columns={{ xs: 1, lg: 2 }} gap="400">
              <AdminSectionCard
                title={isEs ? "Como responde el asistente" : "How the assistant responds"}
                description={
                  isEs
                    ? "Mantiene la misma potencia tecnica, pero explicada con terminos mas faciles de entender para negocio y soporte."
                    : "It keeps the same technical power, but explained in language that is easier for business and support teams to understand."
                }
              >
                <BlockStack gap="400">
                  <AdminInfoCallout title={isEs ? "Sin jerga innecesaria" : "No unnecessary jargon"}>
                    <p>
                      {isEs
                        ? "En lugar de pedirte temperature o max tokens, te explicamos el efecto real sobre creatividad, extension y prudencia."
                        : "Instead of asking for temperature or max tokens, we explain the real effect on creativity, length, and caution."}
                    </p>
                  </AdminInfoCallout>

                  <FormLayout>
                    <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                      <TextField
                        label={isEs ? "Creatividad de respuestas" : "Response creativity"}
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={temperature}
                        onChange={setTemperature}
                        autoComplete="off"
                        helpText={
                          isEs
                            ? `Control interno: temperature. Mas bajo = respuestas mas predecibles. Mas alto = respuestas mas variadas. Ahora: ${getCreativitySummary(temperatureNumber, true)}.`
                            : `Internal control: temperature. Lower = more predictable replies. Higher = more varied replies. Now: ${getCreativitySummary(temperatureNumber, false)}.`
                        }
                      />
                      <input type="hidden" name="temperature" value={temperature} />

                      <TextField
                        label={isEs ? "Longitud maxima de respuesta" : "Maximum response length"}
                        type="number"
                        min={50}
                        max={4000}
                        step={50}
                        value={maxTokens}
                        onChange={setMaxTokens}
                        autoComplete="off"
                        helpText={
                          isEs
                            ? `Control interno: maxTokens. Define cuanto puede extenderse el asistente. Ahora: ${getResponseLengthSummary(maxTokensNumber, true)}.`
                            : `Internal control: maxTokens. Defines how long the assistant can go. Now: ${getResponseLengthSummary(maxTokensNumber, false)}.`
                        }
                      />
                      <input type="hidden" name="maxTokens" value={maxTokens} />

                      <TextField
                        label={isEs ? "Nivel de prudencia antes de responder" : "Caution level before replying"}
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={confidenceThreshold}
                        onChange={setConfidenceThreshold}
                        autoComplete="off"
                        helpText={
                          isEs
                            ? `Control interno: confidenceThreshold. Mas alto = el asistente se lo piensa mas antes de contestar. Ahora: ${getConfidenceSummary(confidenceThresholdNumber, true)}.`
                            : `Internal control: confidenceThreshold. Higher = the assistant is more careful before answering. Now: ${getConfidenceSummary(confidenceThresholdNumber, false)}.`
                        }
                      />
                      <input type="hidden" name="confidenceThreshold" value={confidenceThreshold} />
                    </InlineGrid>
                  </FormLayout>
                </BlockStack>
              </AdminSectionCard>

              <AdminSectionCard
                title={isEs ? "Automatizacion y escalado" : "Automation and escalation"}
                description={
                  isEs
                    ? "Define si el asistente esta activo, si inicia conversaciones por su cuenta y cuando debe pasar a una persona."
                    : "Decide whether the assistant is live, whether it starts conversations on its own, and when it should hand off to a person."
                }
              >
                <BlockStack gap="400">
                  <AdminInfoCallout title={isEs ? "Piensa en operaciones, no en IA" : "Think operations, not AI"}>
                    <p>
                      {isEs
                        ? "Estos controles cambian la experiencia del cliente y del equipo de soporte. Lo ideal es activarlos de forma progresiva."
                        : "These controls change both the customer and support team experience. It is usually best to enable them progressively."}
                    </p>
                  </AdminInfoCallout>

                  <FormLayout>
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
                        label={isEs ? "Iniciar conversaciones proactivas" : "Start proactive conversations"}
                        options={[
                          { label: isEs ? "Activado" : "Enabled", value: "true" },
                          { label: isEs ? "Desactivado" : "Disabled", value: "false" },
                        ]}
                        value={enableProactive}
                        onChange={setEnableProactive}
                      />
                      <input type="hidden" name="enableProactive" value={enableProactive} />

                      <Select
                        label={isEs ? "Pasar a una persona cuando haga falta" : "Hand off to a person when needed"}
                        options={[
                          { label: isEs ? "Activado" : "Enabled", value: "true" },
                          { label: isEs ? "Desactivado" : "Disabled", value: "false" },
                        ]}
                        value={enableHandoff}
                        onChange={setEnableHandoff}
                      />
                      <input type="hidden" name="enableHandoff" value={enableHandoff} />
                    </InlineGrid>
                  </FormLayout>
                </BlockStack>
              </AdminSectionCard>
            </InlineGrid>
          </Layout.Section>

          <Layout.Section>
            <AdminSectionCard
              title={isEs ? "Guia avanzada y contexto extra" : "Advanced guidance and extra context"}
              description={
                isEs
                  ? "Deja estos campos para casos donde necesites marcar reglas o contexto fijo que el asistente deba respetar siempre."
                  : "Use these fields when you need to set fixed rules or persistent context that the assistant should always respect."
              }
            >
              <BlockStack gap="400">
                <AdminInfoCallout title={isEs ? "Opcional para equipos avanzados" : "Optional for advanced teams"}>
                  <p>
                    {isEs
                      ? "No hace falta rellenarlo para empezar. Utilizalo cuando quieras afinar instrucciones globales o contexto adicional por mensaje."
                      : "You do not need to fill this to get started. Use it when you want to refine global instructions or add extra context per message."}
                  </p>
                </AdminInfoCallout>

                <FormLayout>
                  <TextField
                    label={isEs ? "Guia interna del asistente (opcional)" : "Internal assistant guide (optional)"}
                    value={systemPrompt}
                    onChange={setSystemPrompt}
                    autoComplete="off"
                    multiline={4}
                    helpText={
                      isEs
                        ? "Control interno: systemPrompt. Escribe instrucciones base para definir como debe comportarse siempre."
                        : "Internal control: systemPrompt. Write baseline instructions that define how it should behave at all times."
                    }
                  />
                  <input type="hidden" name="systemPrompt" value={systemPrompt} />

                  <TextField
                    label={isEs ? "Contexto adicional por mensaje (opcional)" : "Extra context per message (optional)"}
                    value={userPrompt}
                    onChange={setUserPrompt}
                    autoComplete="off"
                    multiline={3}
                    helpText={
                      isEs
                        ? "Control interno: userPrompt. Sirve para anadir contexto fijo a cada mensaje del usuario."
                        : "Internal control: userPrompt. Adds a fixed layer of context to each user message."
                    }
                  />
                  <input type="hidden" name="userPrompt" value={userPrompt} />
                </FormLayout>
              </BlockStack>
            </AdminSectionCard>
          </Layout.Section>

          <Layout.Section>
            <AdminSectionCard
              title={isEs ? "Guardar y revisar cambios" : "Save and review changes"}
              description={
                isEs
                  ? "Revisa la ultima actualizacion y guarda esta configuracion cuando estes conforme."
                  : "Review the latest update and save this configuration when you are ready."
              }
            >
              <div className="fb-admin-form-footer">
                <Text as="p" variant="bodySm" tone="subdued">
                  {config.updatedAt
                    ? `${isEs ? "Ultima actualizacion" : "Last updated"}: ${new Date(config.updatedAt).toLocaleString()}`
                    : isEs ? "Aun no hay configuraciones guardadas." : "No saved settings yet."}
                </Text>
                <Button submit variant="primary" loading={isSubmitting}>
                  {isEs ? "Guardar configuracion" : "Save settings"}
                </Button>
              </div>
            </AdminSectionCard>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}
