import { Page, Layout, Card, BlockStack, Text, Badge } from "@shopify/polaris";
import { useLocation } from "react-router";

export default function SettingsPage() {
  const location = useLocation();
  const backToDashboardUrl = `/app${location.search || ""}`;

  return (
    <Page title="Settings" backAction={{ content: "Dashboard", url: backToDashboardUrl }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Badge>Coming Soon</Badge>
              <Text as="h2" variant="headingMd">
                Chatbot Configuration
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Configure tone, language, prompts, and behavior guardrails.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
