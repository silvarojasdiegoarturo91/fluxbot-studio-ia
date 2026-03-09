import { Page, Layout, Card, BlockStack, Text, Badge } from "@shopify/polaris";
import { useLocation } from "react-router";

export default function AnalyticsPage() {
  const location = useLocation();
  const backToDashboardUrl = `/app${location.search || ""}`;

  return (
    <Page title="Analytics" backAction={{ content: "Dashboard", url: backToDashboardUrl }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Badge>Coming Soon</Badge>
              <Text as="h2" variant="headingMd">
                Conversation and Revenue Analytics
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                KPIs for conversion assist, handoff rates, and chat performance.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
