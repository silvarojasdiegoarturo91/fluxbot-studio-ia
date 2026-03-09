import { Page, Layout, Card, BlockStack, Text, Badge } from "@shopify/polaris";
import { useLocation } from "react-router";

export default function DataSourcesPage() {
  const location = useLocation();
  const backToDashboardUrl = `/app${location.search || ""}`;

  return (
    <Page title="Data Sources" backAction={{ content: "Dashboard", url: backToDashboardUrl }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Badge>Coming Soon</Badge>
              <Text as="h2" variant="headingMd">
                Knowledge Source Management
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Configure catalog sync, pages, and policies for RAG ingestion.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
