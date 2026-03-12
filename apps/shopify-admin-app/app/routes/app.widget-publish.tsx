import { Page, Layout, Card, BlockStack, Text, Badge } from "@shopify/polaris";
import { useLocation } from "react-router";
import { useIsSpanish } from "../hooks/use-admin-language";

export default function WidgetPublishPage() {
  const location = useLocation();
  const isEs = useIsSpanish();
  const backToDashboardUrl = `/app${location.search || ""}`;

  return (
    <Page
      title={isEs ? "Publicacion del widget" : "Widget Publish"}
      backAction={{ content: isEs ? "Panel" : "Dashboard", url: backToDashboardUrl }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Badge tone="success">{isEs ? "Base Fase 1" : "Phase 1 Foundation"}</Badge>
              <Text as="h2" variant="headingMd">
                {isEs ? "Despliegue de Theme App Extension" : "Theme App Extension Deployment"}
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                {isEs
                  ? "Instala y publica el chat de storefront mediante Theme App Extension y App Embed."
                  : "Install and publish the storefront chat via Theme App Extension and App Embed."}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
