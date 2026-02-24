import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  FormLayout,
  Text,
  BlockStack,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useActionData, useSubmit, useNavigation } from "@remix-run/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "test_api") {
    const message = formData.get("test_message") as string;
    // Aquí llamarías a tu servicio externo
    return json({ response: `Respuesta simulada para: ${message}` });
  }

  return json({ success: true });
};

export default function Index() {
  const [botName, setBotName] = useState("FluxBot");
  const [welcomeMessage, setWelcomeMessage] = useState("¡Hola! ¿En qué puedo ayudarte?");
  const [testMessage, setTestMessage] = useState("");
  
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const nav = useNavigation();

  const handleTest = () => {
    submit({ action: "test_api", test_message: testMessage }, { method: "POST" });
  };

  return (
    <Page title="Configuración de FluxBot IA">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <Text as="h2" variant="headingMd">
                Personalización del Chatbot
              </Text>
              <FormLayout>
                <TextField
                  label="Nombre del Chatbot"
                  value={botName}
                  onChange={setBotName}
                  autoComplete="off"
                />
                <TextField
                  label="Mensaje de Bienvenida"
                  value={welcomeMessage}
                  onChange={setWelcomeMessage}
                  multiline={3}
                  autoComplete="off"
                />
                <Button variant="primary" onClick={() => submit({ botName, welcomeMessage }, { method: "POST" })}>
                  Guardar Configuración
                </Button>
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="500">
              <Text as="h2" variant="headingMd">
                Probar Conexión API
              </Text>
              <FormLayout>
                <TextField
                  label="Mensaje de prueba"
                  value={testMessage}
                  onChange={setTestMessage}
                  autoComplete="off"
                />
                <Button loading={nav.state === "submitting"} onClick={handleTest}>
                  Enviar a API externa
                </Button>
                {actionData?.response && (
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <Text as="p">Respuesta de la API:</Text>
                    <Text as="p" fontWeight="bold">{actionData.response}</Text>
                  </Box>
                )}
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
