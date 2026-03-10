import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineGrid,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation } from "react-router";
import { authenticate } from "../shopify.server";
import { AnalyticsService } from "../services/analytics.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") ?? "30", 10);
  const report = await AnalyticsService.getReport(session.shop, days);
  return { report, days };
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function currency(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function AnalyticsPage() {
  const { report, days } = useLoaderData<typeof loader>();
  const location = useLocation();
  const backUrl = `/app${location.search || ""}`;
  const { conversations, revenue, proactive, intents, topTriggers } = report;

  return (
    <Page
      title="Analytics"
      subtitle={`Last ${days} days`}
      backAction={{ content: "Dashboard", url: backUrl }}
    >
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Conversations</Text>
                <Text as="p" variant="headingXl">{conversations.total}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Resolution: {pct(conversations.resolutionRate)}
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Assisted Revenue</Text>
                <Text as="p" variant="headingXl">{currency(revenue.totalRevenue)}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {revenue.conversionCount} orders attributed
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Proactive Sent</Text>
                <Text as="p" variant="headingXl">{proactive.sent}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  CVR: {pct(proactive.conversionRate)}
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Handoff Rate</Text>
                <Text as="p" variant="headingXl">{pct(conversations.handoffRate)}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {conversations.escalated} escalated
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Revenue Attribution</Text>
              <DataTable
                columnContentTypes={["text", "numeric"]}
                headings={["Attribution Type", "Revenue"]}
                rows={[
                  ["Direct Recommendation", currency(revenue.directRevenue)],
                  ["Assisted", currency(revenue.assistedRevenue)],
                  ["Cart Recovery", currency(revenue.cartRecoveryRevenue)],
                  ["Proactive Trigger", currency(revenue.proactiveTriggerRevenue)],
                  ["Total", currency(revenue.totalRevenue)],
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Proactive Messaging Funnel</Text>
              <DataTable
                columnContentTypes={["text", "numeric", "text"]}
                headings={["Stage", "Count", "Rate"]}
                rows={[
                  ["Queued", String(proactive.queued), "—"],
                  ["Sent", String(proactive.sent), "—"],
                  ["Delivered", String(proactive.delivered), pct(proactive.deliveryRate)],
                  ["Converted", String(proactive.converted), pct(proactive.conversionRate)],
                  ["Failed", String(proactive.failed), "—"],
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Intent Breakdown</Text>
              {intents.length === 0 ? (
                <EmptyState heading="No intent data yet" image="">
                  <Text as="p" variant="bodySm">
                    Data will appear as visitors interact with the chat.
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "numeric", "text"]}
                  headings={["Intent Type", "Signals", "Avg Confidence"]}
                  rows={intents.map((i) => [i.type, String(i.count), pct(i.avgConfidence)])}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Top Proactive Triggers</Text>
              {topTriggers.length === 0 ? (
                <EmptyState heading="No trigger data yet" image="">
                  <Text as="p" variant="bodySm">
                    Create and enable proactive triggers to see performance here.
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "numeric", "numeric", "text"]}
                  headings={["Trigger", "Sent", "Conversions", "CVR"]}
                  rows={topTriggers.map((t) => [
                    t.triggerName,
                    String(t.messagesSent),
                    String(t.conversions),
                    pct(t.conversionRate),
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
