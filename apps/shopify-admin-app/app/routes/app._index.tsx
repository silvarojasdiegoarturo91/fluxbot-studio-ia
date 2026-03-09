import { Page, Layout, Card, Text, BlockStack, InlineStack, Button, Badge } from "@shopify/polaris";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation } from "react-router";
import { authenticate } from "../shopify.server";

const quickLinks = [
  { label: "Data Sources", url: "/app/data-sources" },
  { label: "Settings", url: "/app/settings" },
  { label: "Analytics", url: "/app/analytics" },
  { label: "Conversations", url: "/app/conversations" },
  { label: "Privacy", url: "/app/privacy" },
  { label: "Billing", url: "/app/billing" },
  { label: "Widget Settings", url: "/app/widget-settings" },
  { label: "Widget Publish", url: "/app/widget-publish" },
];

interface DashboardLoaderData {
  shopConnection: {
    connected: boolean;
    name: string | null;
    myshopifyDomain: string | null;
    primaryDomainHost: string | null;
    planName: string | null;
    error: string | null;
  };
}

const SHOP_CONNECTION_QUERY = `#graphql
  query DashboardShopConnection {
    shop {
      name
      myshopifyDomain
      primaryDomain {
        host
      }
      plan {
        displayName
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs): Promise<DashboardLoaderData> => {
  try {
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(SHOP_CONNECTION_QUERY);

    const payload = (await response.json()) as {
      data?: {
        shop?: {
          name?: string;
          myshopifyDomain?: string;
          primaryDomain?: {
            host?: string;
          };
          plan?: {
            displayName?: string;
          };
        };
      };
      errors?: Array<{
        message?: string;
      }>;
    };

    if (!payload.data?.shop || payload.errors?.length) {
      return {
        shopConnection: {
          connected: false,
          name: null,
          myshopifyDomain: null,
          primaryDomainHost: null,
          planName: null,
          error: payload.errors?.[0]?.message || "No shop data returned by Admin API",
        },
      };
    }

    return {
      shopConnection: {
        connected: true,
        name: payload.data.shop.name || null,
        myshopifyDomain: payload.data.shop.myshopifyDomain || null,
        primaryDomainHost: payload.data.shop.primaryDomain?.host || null,
        planName: payload.data.shop.plan?.displayName || null,
        error: null,
      },
    };
  } catch (error) {
    return {
      shopConnection: {
        connected: false,
        name: null,
        myshopifyDomain: null,
        primaryDomainHost: null,
        planName: null,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
};

export default function DashboardIndex() {
  const { shopConnection } = useLoaderData<typeof loader>();
  const location = useLocation();

  const withEmbeddedQuery = (path: string) => {
    return `${path}${location.search || ""}`;
  };

  return (
    <Page title="FluxBot Dashboard" subtitle="Shopify AI Chatbot control center">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Store Connection
                </Text>
                <Badge>{shopConnection.connected ? "Connected" : "Check required"}</Badge>
              </InlineStack>

              {shopConnection.connected ? (
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    Store: {shopConnection.name || "Unknown"}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    myshopify domain: {shopConnection.myshopifyDomain || "Unknown"}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Primary domain: {shopConnection.primaryDomainHost || "Unknown"}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Plan: {shopConnection.planName || "Unknown"}
                  </Text>
                </BlockStack>
              ) : (
                <Text as="p" variant="bodyMd" tone="critical">
                  Could not fetch shop data from Admin API: {shopConnection.error || "Unknown error"}
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  MVP Status
                </Text>
                <Badge>Architecture Updated</Badge>
              </InlineStack>
              <Text as="p" variant="bodyMd" tone="subdued">
                The project is now aligned to a monorepo architecture with separated
                apps, services, packages, and infrastructure layers.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Quick Navigation
              </Text>
              <InlineStack gap="200" wrap>
                {quickLinks.map((link) => (
                  <Button key={link.url} url={withEmbeddedQuery(link.url)}>
                    {link.label}
                  </Button>
                ))}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
