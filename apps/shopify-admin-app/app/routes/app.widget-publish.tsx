import { Page, Layout, Card, BlockStack, Text, Badge } from "@shopify/polaris";
import { useLocation } from "react-router";

export default function WidgetPublishPage() {
  const location = useLocation();
  const backToDashboardUrl = `/app${location.search || ""}`;

  return (
    <Page
      title="Widget Publish"
      backAction={{ content: "Dashboard", url: backToDashboardUrl }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Badge>Coming Soon</Badge>
              <Text as="h2" variant="headingMd">
                Theme App Extension Deployment
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Install and publish the chat widget from the theme editor.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
