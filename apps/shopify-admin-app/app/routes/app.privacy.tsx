import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Badge,
  InlineGrid,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  AuditReportService,
  BreachNotificationService,
  DataResidencyService,
  ProcessingRecordService,
  SupportAgentAccessService,
} from "../services/enterprise-compliance.server";
import { getDeliveryStatus } from "../services/delivery.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
    select: { id: true, domain: true },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  if (ProcessingRecordService.getActivities(shop.id).length === 0) {
    ProcessingRecordService.seedDefaultActivities(shop.id);
  }

  const [report, residencyConfig, breaches] = await Promise.all([
    AuditReportService.generateReport(shop.id, 365),
    Promise.resolve(DataResidencyService.getConfig(shop.id)),
    Promise.resolve(BreachNotificationService.getBreaches(shop.id)),
  ]);

  return {
    shop,
    report,
    residencyConfig,
    breaches,
    processingActivities: ProcessingRecordService.getActivities(shop.id),
    activeSupportTokens: SupportAgentAccessService.getActiveTokenCount(shop.id),
    deliveryStatus: getDeliveryStatus(),
  };
}

export default function PrivacyPage() {
  const location = useLocation();
  const {
    shop,
    report,
    residencyConfig,
    breaches,
    processingActivities,
    activeSupportTokens,
    deliveryStatus,
  } = useLoaderData<typeof loader>();

  const backToDashboardUrl = `/app${location.search || ""}`;

  return (
    <Page
      title="Privacy & Compliance"
      subtitle={shop.domain}
      backAction={{ content: "Dashboard", url: backToDashboardUrl }}
    >
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  Consent Events (365d)
                </Text>
                <Text as="p" variant="headingLg">
                  {report.totalConsentEvents}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  Audit Log Entries
                </Text>
                <Text as="p" variant="headingLg">
                  {report.auditLogEntries}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  Data Subject Requests
                </Text>
                <Text as="p" variant="headingLg">
                  {report.dataExportRequests + report.dataDeletionRequests}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Export: {report.dataExportRequests} | Delete: {report.dataDeletionRequests}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  Active Support Tokens
                </Text>
                <Text as="p" variant="headingLg">
                  {activeSupportTokens}
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Data Residency
              </Text>
              <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Region
                  </Text>
                  <Text as="p" variant="headingMd">
                    {residencyConfig.region}
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Enforcement
                  </Text>
                  <Badge tone={residencyConfig.enforced ? "success" : "attention"}>
                    {residencyConfig.enforced ? "ENFORCED" : "NOT ENFORCED"}
                  </Badge>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Countries
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {residencyConfig.enforcedCountries.length > 0
                      ? residencyConfig.enforcedCountries.join(", ")
                      : "No country-level restrictions"}
                  </Text>
                </BlockStack>
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Omnichannel Compliance Readiness
              </Text>
              <DataTable
                columnContentTypes={["text", "text"]}
                headings={["Category", "Value"]}
                rows={[
                  ["Bridge Status", deliveryStatus.omnichannelBridge.configured ? "Configured" : "Not configured"],
                  ["Integrated Channels", deliveryStatus.integratedChannels.join(", ")],
                  ["Pending Channels", deliveryStatus.pendingChannels.join(", ") || "None"],
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Processing Activities (Article 30)
              </Text>
              {processingActivities.length === 0 ? (
                <EmptyState heading="No processing activities" image="">
                  <Text as="p" variant="bodySm">
                    Seed default activities to establish your GDPR processing register.
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "numeric"]}
                  headings={["Activity", "Purpose", "Legal Basis", "Retention (days)"]}
                  rows={processingActivities.map((activity) => [
                    activity.activityName,
                    activity.purpose,
                    activity.legalBasis,
                    String(activity.retentionDays),
                  ])}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Breach Registry
              </Text>
              {breaches.length === 0 ? (
                <EmptyState heading="No breaches registered" image="">
                  <Text as="p" variant="bodySm">
                    Great news. No active breach notifications are currently recorded.
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "text", "text"]}
                  headings={["Detected At", "Severity", "Affected Users", "Reported", "72h SLA"]}
                  rows={breaches.map((breach) => [
                    new Date(breach.detectedAt).toLocaleString(),
                    breach.severity,
                    String(breach.affectedDataSubjects),
                    breach.reportedToAuthority ? "Yes" : "No",
                    breach.reportedAt72h ? "Met" : "Missed",
                  ])}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
