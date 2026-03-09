import { Page, Layout, Card, BlockStack, Text, Badge } from "@shopify/polaris";
import { useLocation } from "react-router";

export default function PrivacyPage() {
  const location = useLocation();
  const backToDashboardUrl = `/app${location.search || ""}`;

  return (
    <Page
      title="Privacy & Compliance"
      backAction={{ content: "Dashboard", url: backToDashboardUrl }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Badge>Coming Soon</Badge>
              <Text as="h2" variant="headingMd">
                GDPR and Consent Controls
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Manage consent, retention policies, data export, and deletion.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
