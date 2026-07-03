import prisma from "../db.server";

const ADMIN_API_VERSION = "2026-01";

export type BillingPlanId = "starter" | "growth" | "pro";

export interface BillingPlan {
  id: BillingPlanId;
  name: string;
  amountUsd: number;
  interval: "EVERY_30_DAYS";
  description: string;
  includedMessages: number;
  extraBlockSize: number;
  extraBlockPrice: number;
  cappedAmountUsd: number;
}

export interface ActiveSubscription {
  id: string;
  name: string;
  status: string;
  test: boolean;
  priceAmount: string;
  priceCurrency: string;
  interval: string;
  usageLineItemId?: string;
  cappedAmount?: string;
  balanceUsed?: string;
}

export interface BillingStatus {
  hasActiveSubscription: boolean;
  subscriptions: ActiveSubscription[];
}

export interface UsageStatus {
  currentUsage: number;
  includedUsage: number;
  billedBlocks: number;
  cappedAmount: number;
  status: string;
}

const BILLING_PLANS: BillingPlan[] = [
  {
    id: "starter",
    name: "FluxBot Starter",
    amountUsd: 19,
    interval: "EVERY_30_DAYS",
    description: "Core chatbot, catalog sync and basic analytics",
    includedMessages: 500,
    extraBlockSize: 500,
    extraBlockPrice: 10,
    cappedAmountUsd: 100,
  },
  {
    id: "growth",
    name: "FluxBot Growth",
    amountUsd: 49,
    interval: "EVERY_30_DAYS",
    description: "Proactive campaigns, advanced analytics and handoff",
    includedMessages: 2000,
    extraBlockSize: 1000,
    extraBlockPrice: 8,
    cappedAmountUsd: 100,
  },
  {
    id: "pro",
    name: "FluxBot Pro",
    amountUsd: 99,
    interval: "EVERY_30_DAYS",
    description: "Enterprise compliance and omnichannel-ready controls",
    includedMessages: 10000,
    extraBlockSize: 2000,
    extraBlockPrice: 5,
    cappedAmountUsd: 100,
  },
];

function toObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function normalizeShopDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

async function getShopCredentials(shopId: string): Promise<{ domain: string; accessToken: string }> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { domain: true, accessToken: true },
  });

  if (!shop) {
    throw new Error("Shop not found");
  }

  if (!shop.accessToken || shop.accessToken === "__pending_access_token__") {
    throw new Error("Shop missing offline access token");
  }

  return {
    domain: normalizeShopDomain(shop.domain),
    accessToken: shop.accessToken,
  };
}

async function runShopifyGraphql<T>(params: {
  shopDomain: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const endpoint = `https://${params.shopDomain}/admin/api/${ADMIN_API_VERSION}/graphql.json`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": params.accessToken,
    },
    body: JSON.stringify({ query: params.query, variables: params.variables || {} }),
  });

  if (!response.ok) {
    throw new Error(`Shopify billing request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || "Unknown Shopify billing error");
  }

  if (!payload.data) {
    throw new Error("No billing data returned from Shopify");
  }

  return payload.data;
}

export class BillingService {
  static listPlans(): BillingPlan[] {
    return BILLING_PLANS;
  }

  static getPlan(planId: string): BillingPlan | null {
    return BILLING_PLANS.find((plan) => plan.id === planId) || null;
  }

  static async getStatus(shopId: string): Promise<BillingStatus> {
    const { domain, accessToken } = await getShopCredentials(shopId);

    const query = `#graphql
      query ActiveSubscriptions {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            test
            status
            lineItems {
              plan {
                pricingDetails {
                  __typename
                  ... on AppRecurringPricing {
                    price {
                      amount
                      currencyCode
                    }
                    interval
                  }
                }
              }
            }
          }
        }
      }
    `;

    const data = await runShopifyGraphql<{
      currentAppInstallation?: {
        activeSubscriptions?: Array<Record<string, any>>;
      };
    }>({
      shopDomain: domain,
      accessToken,
      query,
    });

    const root = toObject(data.currentAppInstallation);
    const subscriptionsRaw = Array.isArray(root.activeSubscriptions)
      ? root.activeSubscriptions
      : [];

    const subscriptions: ActiveSubscription[] = subscriptionsRaw.map((raw) => {
      const sub = toObject(raw);
      const lineItems = Array.isArray(sub.lineItems) ? sub.lineItems : [];
      const firstLine = toObject(lineItems[0]);
      const plan = toObject(firstLine.plan);
      const pricingDetails = toObject(plan.pricingDetails);
      const price = toObject(pricingDetails.price);

      return {
        id: String(sub.id || ""),
        name: String(sub.name || ""),
        status: String(sub.status || ""),
        test: Boolean(sub.test),
        priceAmount: String(price.amount || ""),
        priceCurrency: String(price.currencyCode || "USD"),
        interval: String(pricingDetails.interval || ""),
      };
    });

    return {
      hasActiveSubscription: subscriptions.length > 0,
      subscriptions,
    };
  }

  static async createSubscription(params: {
    shopId: string;
    planId: BillingPlanId;
    returnUrl: string;
    test?: boolean;
  }): Promise<{ confirmationUrl: string; subscriptionId?: string; usageLineItemId?: string }> {
    const plan = this.getPlan(params.planId);
    if (!plan) {
      throw new Error("Invalid billing plan");
    }

    const { domain, accessToken } = await getShopCredentials(params.shopId);

    const mutation = `#graphql
      mutation CreateAppSubscription(
        $name: String!
        $returnUrl: URL!
        $price: Decimal!
        $test: Boolean!
        $cappedAmount: Decimal!
        $usageTerms: String!
      ) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          test: $test
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: { amount: $price, currencyCode: USD }
                  interval: EVERY_30_DAYS
                }
              }
            },
            {
              plan: {
                appUsagePricingDetails: {
                  cappedAmount: { amount: $cappedAmount, currencyCode: USD }
                  terms: $usageTerms
                }
              }
            }
          ]
        ) {
          appSubscription {
            id
            status
            lineItems {
              id
              plan {
                pricingDetails {
                  __typename
                  ... on AppUsagePricing {
                    cappedAmount { amount currencyCode }
                    balanceUsed { amount }
                  }
                }
              }
            }
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `;

    const usageTerms = `$${plan.extraBlockPrice} per additional block of ${plan.extraBlockSize} messages above the ${plan.includedMessages} included in your base plan.`;

    const data = await runShopifyGraphql<{
      appSubscriptionCreate?: {
        confirmationUrl?: string;
        appSubscription?: {
          id?: string;
          lineItems?: Array<Record<string, unknown>>;
        };
        userErrors?: Array<{ message?: string }>;
      };
    }>({
      shopDomain: domain,
      accessToken,
      query: mutation,
      variables: {
        name: plan.name,
        returnUrl: params.returnUrl,
        price: String(plan.amountUsd),
        test: params.test !== false,
        cappedAmount: String(plan.cappedAmountUsd),
        usageTerms,
      },
    });

    const createResult = toObject(data.appSubscriptionCreate);
    const userErrors = Array.isArray(createResult.userErrors)
      ? createResult.userErrors
      : [];

    if (userErrors.length > 0) {
      const first = toObject(userErrors[0]);
      throw new Error(String(first.message || "Unable to create subscription"));
    }

    const confirmationUrl = String(createResult.confirmationUrl || "");
    if (!confirmationUrl) {
      throw new Error("Shopify did not return confirmation URL");
    }

    const appSubscription = toObject(createResult.appSubscription);

    // Extract usage line item ID so we can charge usage records later
    const lineItems = Array.isArray(appSubscription.lineItems) ? appSubscription.lineItems : [];
    const usageLineItem = lineItems.find((li) => {
      const plan = toObject(toObject(li).plan);
      const details = toObject(plan.pricingDetails);
      return details.__typename === "AppUsagePricing";
    });
    const usageLineItemId = usageLineItem
      ? String(toObject(usageLineItem).id || "")
      : undefined;

    return {
      confirmationUrl,
      subscriptionId: appSubscription.id ? String(appSubscription.id) : undefined,
      usageLineItemId,
    };
  }

  /**
   * Creates a usage record in Shopify to charge a usage tranche.
   * Must be called after the merchant has consumed a full extra block of messages.
   */
  static async createUsageRecord(params: {
    shopId: string;
    subscriptionLineItemId: string;
    amountUsd: number;
    description: string;
    idempotencyKey: string;
  }): Promise<{ usageRecordId: string }> {
    const { domain, accessToken } = await getShopCredentials(params.shopId);

    const mutation = `#graphql
      mutation CreateUsageRecord(
        $subscriptionLineItemId: ID!
        $price: Decimal!
        $description: String!
        $idempotencyKey: String!
      ) {
        appUsageRecordCreate(
          subscriptionLineItemId: $subscriptionLineItemId
          price: { amount: $price, currencyCode: USD }
          description: $description
          idempotencyKey: $idempotencyKey
        ) {
          appUsageRecord {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await runShopifyGraphql<{
      appUsageRecordCreate?: {
        appUsageRecord?: { id?: string };
        userErrors?: Array<{ message?: string }>;
      };
    }>({
      shopDomain: domain,
      accessToken,
      query: mutation,
      variables: {
        subscriptionLineItemId: params.subscriptionLineItemId,
        price: String(params.amountUsd),
        description: params.description,
        idempotencyKey: params.idempotencyKey,
      },
    });

    const result = toObject(data.appUsageRecordCreate);
    const userErrors = Array.isArray(result.userErrors) ? result.userErrors : [];

    if (userErrors.length > 0) {
      const first = toObject(userErrors[0]);
      throw new Error(String(first.message || "Unable to create usage record"));
    }

    const usageRecord = toObject(result.appUsageRecord);
    return { usageRecordId: String(usageRecord.id || "") };
  }

  /**
   * Fetches current usage status from the backend IA service.
   * Falls back to zero-state if the backend is unavailable.
   */
  static async getUsageStatus(shopId: string): Promise<UsageStatus> {
    try {
      const shop = await prisma.shop.findUnique({
        where: { id: shopId },
        select: { domain: true, accessToken: true },
      });

      const backendUrl = process.env.IA_BACKEND_URL || "http://localhost:3001";
      const apiKey = process.env.IA_BACKEND_API_KEY || process.env.MASTER_API_KEY || "dev_master_key";

      const res = await fetch(`${backendUrl}/api/v1/billing/status`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Shop-Domain": shop?.domain ?? "",
        },
      });

      if (!res.ok) throw new Error(`Backend status ${res.status}`);

      return (await res.json()) as UsageStatus;
    } catch {
      return {
        currentUsage: 0,
        includedUsage: 500,
        billedBlocks: 0,
        cappedAmount: 100,
        status: "active",
      };
    }
  }
}
