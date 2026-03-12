import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  FormLayout,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { useEffect, useState } from "react";
import { useIsSpanish } from "../hooks/use-admin-language";
import { authenticate } from "../shopify.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { getMerchantAdminConfig, saveMerchantAdminConfig } from "../services/admin-config.server";

interface WidgetSettingsActionData {
  ok: boolean;
  error?: string;
  message?: string;
}

function isValidHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const config = await getMerchantAdminConfig(shop.id);

  return {
    shop,
    config,
  };
}

export async function action({ request }: ActionFunctionArgs): Promise<WidgetSettingsActionData> {
  if (request.method !== "POST") {
    return { ok: false, error: "Method not allowed" };
  }

  const { session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    return { ok: false, error: "Shop not found" };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent !== "save_widget_settings") {
    return { ok: false, error: "Unsupported action" };
  }

  const launcherPosition = String(formData.get("launcherPosition") || "bottom-right");
  if (launcherPosition !== "bottom-right" && launcherPosition !== "bottom-left") {
    return { ok: false, error: "Invalid launcher position" };
  }

  const primaryColor = String(formData.get("primaryColor") || "#008060").trim();
  if (!isValidHexColor(primaryColor)) {
    return { ok: false, error: "Primary color must be a valid hex value (e.g. #008060)" };
  }

  const launcherLabel = String(formData.get("launcherLabel") || "Assistant").trim();
  const welcomeMessage = String(formData.get("welcomeMessage") || "").trim();

  await saveMerchantAdminConfig(shop.id, {
    welcomeMessage: welcomeMessage || undefined,
    widgetBranding: {
      primaryColor,
      launcherPosition,
      launcherLabel: launcherLabel || "Assistant",
    },
  });

  return {
    ok: true,
    message: "Widget settings updated.",
  };
}

export default function WidgetSettingsPage() {
  const location = useLocation();
  const isEs = useIsSpanish();
  const { config } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const [primaryColor, setPrimaryColor] = useState(config.widgetBranding.primaryColor);
  const [launcherPosition, setLauncherPosition] = useState(config.widgetBranding.launcherPosition);
  const [launcherLabel, setLauncherLabel] = useState(config.widgetBranding.launcherLabel);
  const [welcomeMessage, setWelcomeMessage] = useState(config.welcomeMessage);

  useEffect(() => {
    setPrimaryColor(config.widgetBranding.primaryColor);
    setLauncherPosition(config.widgetBranding.launcherPosition);
    setLauncherLabel(config.widgetBranding.launcherLabel);
    setWelcomeMessage(config.welcomeMessage);
  }, [config]);

  const isSubmitting = navigation.state === "submitting";
  const backToDashboardUrl = `/app${location.search || ""}`;

  return (
    <Page
      title={isEs ? "Configuracion del widget" : "Widget Settings"}
      backAction={{ content: isEs ? "Panel" : "Dashboard", url: backToDashboardUrl }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Badge tone="success">{isEs ? "Configuracion activa" : "Active configuration"}</Badge>
              <Text as="h2" variant="headingMd">
                {isEs ? "Runtime del chat storefront" : "Storefront chat runtime"}
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                {isEs
                  ? "Actualiza color, posicion del launcher, etiqueta y mensaje de bienvenida del widget."
                  : "Update launcher color, position, label and chat welcome message."}
              </Text>

              {actionData?.ok === false && actionData.error ? (
                <Banner tone="critical" title={isEs ? "No se pudo guardar" : "Could not save"}>
                  <p>{actionData.error}</p>
                </Banner>
              ) : null}

              {actionData?.ok && actionData.message ? (
                <Banner tone="success" title={isEs ? "Configuracion guardada" : "Settings saved"}>
                  <p>{isEs ? "Los cambios del widget se han actualizado." : actionData.message}</p>
                </Banner>
              ) : null}

              <Form method="post">
                <FormLayout>
                  <input type="hidden" name="intent" value="save_widget_settings" />

                  <Select
                    label={isEs ? "Posicion del launcher" : "Launcher position"}
                    options={[
                      { label: isEs ? "Inferior derecha" : "Bottom right", value: "bottom-right" },
                      { label: isEs ? "Inferior izquierda" : "Bottom left", value: "bottom-left" },
                    ]}
                    value={launcherPosition}
                    onChange={(value) => setLauncherPosition(value as "bottom-right" | "bottom-left")}
                  />
                  <input type="hidden" name="launcherPosition" value={launcherPosition} />

                  <TextField
                    label={isEs ? "Color principal" : "Primary color"}
                    value={primaryColor}
                    onChange={setPrimaryColor}
                    autoComplete="off"
                    helpText={isEs ? "Formato HEX, por ejemplo #008060" : "HEX format, for example #008060"}
                  />
                  <input type="hidden" name="primaryColor" value={primaryColor} />

                  <TextField
                    label={isEs ? "Etiqueta del launcher" : "Launcher label"}
                    value={launcherLabel}
                    onChange={setLauncherLabel}
                    autoComplete="off"
                    maxLength={32}
                  />
                  <input type="hidden" name="launcherLabel" value={launcherLabel} />

                  <TextField
                    label={isEs ? "Mensaje de bienvenida" : "Welcome message"}
                    value={welcomeMessage}
                    onChange={setWelcomeMessage}
                    autoComplete="off"
                    multiline={3}
                    maxLength={280}
                  />
                  <input type="hidden" name="welcomeMessage" value={welcomeMessage} />

                  <Button submit variant="primary" loading={isSubmitting}>
                    {isEs ? "Guardar configuracion" : "Save settings"}
                  </Button>
                </FormLayout>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
