import { Page, Layout, Card, BlockStack, Text, Badge } from "@shopify/polaris";
import { useLocation } from "react-router";

export default function WidgetSettingsPage() {
  const location = useLocation();
  const backToDashboardUrl = `/app${location.search || ""}`;

  return (
    <Page
      title="Widget Settings"
      backAction={{ content: "Dashboard", url: backToDashboardUrl }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Badge>Coming Soon</Badge>
              <Text as="h2" variant="headingMd">
                Storefront Widget Customization
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Configure launcher position, colors, greeting, and behavior.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
