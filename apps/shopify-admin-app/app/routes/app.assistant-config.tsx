/**
 * /app/assistant-config
 *
 * Configures the AI assistant persona for the backend IA service.
 * - Name, persona, tone, system instructions, welcome message, language
 * - Trigger catalog sync from Shopify (builds knowledge chunks + embeddings)
 *
 * Writes to `fluxbot-studio-back-ia` via iaClient.assistantConfig and iaClient.catalog.
 * The backend holds the authoritative AssistantConfig model that drives the system prompt.
 */

import {
  Page,
  Layout,
  BlockStack,
  Text,
  TextField,
  Select,
  Button,
  Banner,
  FormLayout,
  InlineStack,
  Badge,
  Box,
  Divider,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect, useState } from "react";
import { iaClient, type AssistantPersona } from "../services/ia-backend.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { useIsSpanish } from "../hooks/use-admin-language";
import { AdminPageHeader, AdminSectionCard } from "../components/admin-ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionData {
  ok: boolean;
  message?: string;
  error?: string;
  syncResult?: { chunksIndexed: number; productsProcessed?: number; durationMs: number; errors?: string[] };
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticateAdminRequest(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  let config = null;
  let backendAvailable = true;

  try {
    config = await iaClient.assistantConfig.get(shop.domain);
  } catch {
    backendAvailable = false;
  }

  return {
    shop,
    config: config ?? {
      shopId: shop.id,
      assistantName: "Asistente",
      persona: "FRIENDLY" as AssistantPersona,
      tone: "amigable y profesional",
      systemInstructions: null,
      welcomeMessage: null,
      language: "es",
      productCategories: [] as string[],
    },
    backendAvailable,
  };
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action({ request }: ActionFunctionArgs): Promise<ActionData> {
  const { session } = await authenticateAdminRequest(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    return { ok: false, error: "Shop no encontrada" };
  }

  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "save");

  if (intent === "catalog_sync") {
    try {
      const result = await iaClient.catalog.sync({ shopId: shop.id, fullSync: true }, shop.domain);
      const hasErrors = Array.isArray(result.errors) && result.errors.length > 0;
      const durationSeconds = (result.durationMs / 1000).toFixed(1);
      return {
        ok: !hasErrors,
        message: hasErrors
          ? `Sincronización completada con advertencias: ${result.chunksIndexed} fragmentos indexados en ${durationSeconds}s. Revisa: ${result.errors?.slice(0, 2).join(" | ")}`
          : `Sincronización completada: ${result.chunksIndexed} fragmentos indexados en ${durationSeconds}s`,
        error: hasErrors
          ? `La sincronización terminó con advertencias: ${result.errors?.slice(0, 2).join(" | ")}`
          : undefined,
        syncResult: result,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Error al sincronizar catálogo: ${msg}` };
    }
  }

  // Default: save config
  const assistantName = String(formData.get("assistantName") ?? "").trim() || "Asistente";
  const persona = (String(formData.get("persona") ?? "FRIENDLY")) as AssistantPersona;
  const tone = String(formData.get("tone") ?? "").trim() || "amigable y profesional";
  const systemInstructions = String(formData.get("systemInstructions") ?? "").trim() || null;
  const welcomeMessage = String(formData.get("welcomeMessage") ?? "").trim() || null;
  const language = String(formData.get("language") ?? "es").trim() || "es";

  const validPersonas: AssistantPersona[] = ["FRIENDLY", "PROFESSIONAL", "EXPERT", "CASUAL"];
  if (!validPersonas.includes(persona)) {
    return { ok: false, error: "Personalidad inválida" };
  }

  try {
    await iaClient.assistantConfig.upsert(
      { shopId: shop.id, assistantName, persona, tone, systemInstructions, welcomeMessage, language },
      shop.domain,
    );
    return { ok: true, message: "Configuración del asistente guardada" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Error al guardar: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PERSONA_OPTIONS_ES = [
  { label: "Amigable y cercana", value: "FRIENDLY" },
  { label: "Profesional y formal", value: "PROFESSIONAL" },
  { label: "Experta y técnica", value: "EXPERT" },
  { label: "Relajada y casual", value: "CASUAL" },
];

const PERSONA_OPTIONS_EN = [
  { label: "Friendly and approachable", value: "FRIENDLY" },
  { label: "Professional and formal", value: "PROFESSIONAL" },
  { label: "Expert and technical", value: "EXPERT" },
  { label: "Relaxed and casual", value: "CASUAL" },
];

const LANGUAGE_OPTIONS = [
  { label: "Español", value: "es" },
  { label: "English", value: "en" },
];

export default function AssistantConfigPage() {
  const { config, backendAvailable } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isEs = useIsSpanish();

  const isSaving = navigation.state === "submitting" && navigation.formData?.get("_intent") !== "catalog_sync";
  const isSyncing = navigation.state === "submitting" && navigation.formData?.get("_intent") === "catalog_sync";

  const [assistantName, setAssistantName] = useState(config.assistantName ?? "Asistente");
  const [persona, setPersona] = useState(config.persona ?? "FRIENDLY");
  const [tone, setTone] = useState(config.tone ?? "");
  const [systemInstructions, setSystemInstructions] = useState(config.systemInstructions ?? "");
  const [welcomeMessage, setWelcomeMessage] = useState(config.welcomeMessage ?? "");
  const [language, setLanguage] = useState(config.language ?? "es");

  // Reset form when loader data changes
  useEffect(() => {
    setAssistantName(config.assistantName ?? "Asistente");
    setPersona(config.persona ?? "FRIENDLY");
    setTone(config.tone ?? "");
    setSystemInstructions(config.systemInstructions ?? "");
    setWelcomeMessage(config.welcomeMessage ?? "");
    setLanguage(config.language ?? "es");
  }, [config]);

  const personaOptions = isEs ? PERSONA_OPTIONS_ES : PERSONA_OPTIONS_EN;

  const personaDescriptions: Record<string, { es: string; en: string }> = {
    FRIENDLY: {
      es: "Usa un tono cálido, empático y cercano. Ideal para moda, belleza y lifestyle.",
      en: "Uses a warm, empathetic, and approachable tone. Great for fashion, beauty and lifestyle.",
    },
    PROFESSIONAL: {
      es: "Respuestas formales y directas. Ideal para B2B, tecnología o servicios financieros.",
      en: "Formal and direct responses. Great for B2B, technology or financial services.",
    },
    EXPERT: {
      es: "Comunica con autoridad técnica y detalle. Ideal para electrónica, salud o industria.",
      en: "Communicates with technical authority and detail. Great for electronics, health or industry.",
    },
    CASUAL: {
      es: "Tono relajado, coloquial y desenfadado. Ideal para marcas jóvenes o streetwear.",
      en: "Relaxed, colloquial, and laid-back tone. Great for youth brands or streetwear.",
    },
  };

  const currentPersonaDesc = personaDescriptions[persona]?.[isEs ? "es" : "en"] ?? "";

  return (
    <Page
      title={isEs ? "Personalidad IA" : "AI Persona"}
      subtitle={
        isEs
          ? "Configura cómo se presenta y comunica tu asistente de ventas"
          : "Configure how your sales assistant presents and communicates"
      }
    >
      <AdminPageHeader title={isEs ? "Personalidad IA" : "AI Persona"} />

      <Layout>
        {!backendAvailable && (
          <Layout.Section>
            <Banner
              tone="warning"
              title={isEs ? "Backend IA no disponible" : "IA backend unavailable"}
            >
              <Text as="p" variant="bodyMd">
                {isEs
                  ? "No se pudo conectar con el backend de IA. Verifica que fluxbot-studio-back-ia esté en ejecución en el puerto 3001."
                  : "Could not connect to the IA backend. Make sure fluxbot-studio-back-ia is running on port 3001."}
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {actionData?.ok && actionData.message && (
          <Layout.Section>
            <Banner tone="success" title={actionData.message} />
          </Layout.Section>
        )}

        {actionData?.ok === false && actionData.error && (
          <Layout.Section>
            <Banner tone="critical" title={actionData.error} />
          </Layout.Section>
        )}

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Identidad del asistente" : "Assistant identity"}
            description={
              isEs
                ? "Define el nombre y la personalidad del asistente. Esto afecta el tono de todas las respuestas."
                : "Define the assistant's name and personality. This affects the tone of all responses."
            }
          >
            <Form method="post">
              <input type="hidden" name="_intent" value="save" />
              <FormLayout>
                <TextField
                  label={isEs ? "Nombre del asistente" : "Assistant name"}
                  name="assistantName"
                  value={assistantName}
                  onChange={setAssistantName}
                  helpText={
                    isEs
                      ? "Este nombre se usa en el saludo inicial y en el system prompt."
                      : "This name is used in the initial greeting and system prompt."
                  }
                  autoComplete="off"
                  maxLength={100}
                />

                <Select
                  label={isEs ? "Idioma principal" : "Primary language"}
                  name="language"
                  value={language}
                  onChange={setLanguage}
                  options={LANGUAGE_OPTIONS}
                  helpText={
                    isEs
                      ? "Idioma por defecto de las respuestas del asistente."
                      : "Default language for assistant responses."
                  }
                />

                <Select
                  label={isEs ? "Personalidad" : "Persona"}
                  name="persona"
                  value={persona}
                  onChange={(value) => setPersona(value as AssistantPersona)}
                  options={personaOptions}
                />

                {currentPersonaDesc && (
                  <Box paddingBlockStart="200">
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {currentPersonaDesc}
                    </Text>
                  </Box>
                )}

                <TextField
                  label={isEs ? "Tono de comunicación" : "Communication tone"}
                  name="tone"
                  value={tone}
                  onChange={setTone}
                  helpText={
                    isEs
                      ? "Describe el tono en pocas palabras. Ej: \"cercano, optimista y orientado a soluciones\""
                      : "Describe the tone in a few words. E.g. \"friendly, optimistic, and solution-oriented\""
                  }
                  autoComplete="off"
                  maxLength={200}
                />

                <Divider />

                <TextField
                  label={isEs ? "Instrucciones de ventas (opcional)" : "Sales instructions (optional)"}
                  name="systemInstructions"
                  value={systemInstructions}
                  onChange={setSystemInstructions}
                  multiline={4}
                  helpText={
                    isEs
                      ? "Instrucciones adicionales que guiarán el comportamiento del asistente. Ej: \"Siempre ofrece envío gratis en pedidos superiores a 50€\""
                      : "Additional instructions to guide the assistant's behavior. E.g. \"Always mention free shipping on orders over $50\""
                  }
                  autoComplete="off"
                  maxLength={2000}
                />

                <TextField
                  label={isEs ? "Mensaje de bienvenida (opcional)" : "Welcome message (optional)"}
                  name="welcomeMessage"
                  value={welcomeMessage}
                  onChange={setWelcomeMessage}
                  helpText={
                    isEs
                      ? "Primer mensaje que verá el usuario al abrir el chat. Si está vacío se usa el mensaje predeterminado."
                      : "First message the user sees when opening the chat. If empty, the default greeting is used."
                  }
                  autoComplete="off"
                  maxLength={500}
                />

                <InlineStack align="end">
                  <Button variant="primary" submit loading={isSaving}>
                    {isEs ? "Guardar configuración" : "Save configuration"}
                  </Button>
                </InlineStack>
              </FormLayout>
            </Form>
          </AdminSectionCard>
        </Layout.Section>

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Sincronización de catálogo" : "Catalog synchronization"}
            description={
              isEs
                ? "Importa todos los productos de Shopify al motor de IA para que el asistente pueda responder preguntas sobre el catálogo."
                : "Import all Shopify products into the AI engine so the assistant can answer catalog questions."
            }
          >
            <BlockStack gap="400">
              <Text as="p" variant="bodyMd">
                {isEs
                  ? "La sincronización completa lee todos los productos activos de tu tienda y genera fragmentos de conocimiento que el asistente usará en sus respuestas. Tarda entre 10 segundos y varios minutos según el tamaño del catálogo."
                  : "A full sync reads all active products from your store and generates knowledge chunks the assistant will use in responses. It takes from 10 seconds to several minutes depending on catalog size."}
              </Text>

              {actionData?.syncResult && (
                <InlineStack gap="200" align="start">
                  <Badge tone="success">
                    {isEs
                      ? `${actionData.syncResult.chunksIndexed} productos indexados`
                      : `${actionData.syncResult.chunksIndexed} products indexed`}
                  </Badge>
                  <Badge>
                    {`${(actionData.syncResult.durationMs / 1000).toFixed(1)}s`}
                  </Badge>
                </InlineStack>
              )}

              <Form method="post">
                <input type="hidden" name="_intent" value="catalog_sync" />
                <Button
                  variant="primary"
                  submit
                  loading={isSyncing}
                  disabled={!backendAvailable}
                >
                  {isEs ? "Sincronizar catálogo" : "Sync catalog"}
                </Button>
              </Form>
            </BlockStack>
          </AdminSectionCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
