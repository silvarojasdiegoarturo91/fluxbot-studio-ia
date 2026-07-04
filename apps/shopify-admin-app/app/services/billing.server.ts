import prisma from '../db.server';
import { iaClient } from './ia-backend.server';

const ADMIN_API_VERSION = '2026-01';
const DEFAULT_BILLING_ERROR_MESSAGE =
  'No se pudo iniciar la suscripción en Shopify. Inténtalo nuevamente en unos segundos.';

const BILLING_PLANS = [
  {
    id: 'starter',
    name: 'FluxBot Starter',
    amountUsd: 19,
    interval: 'EVERY_30_DAYS' as const,
    description: 'Core chatbot, catalog sync and basic analytics',
    includedMessages: 500,
    extraBlockSize: 500,
    extraBlockPrice: 10,
    cappedAmountUsd: 100,
  },
  {
    id: 'growth',
    name: 'FluxBot Growth',
    amountUsd: 49,
    interval: 'EVERY_30_DAYS' as const,
    description: 'Proactive campaigns, advanced analytics and handoff',
    includedMessages: 2000,
    extraBlockSize: 1000,
    extraBlockPrice: 8,
    cappedAmountUsd: 100,
  },
  {
    id: 'pro',
    name: 'FluxBot Pro',
    amountUsd: 99,
    interval: 'EVERY_30_DAYS' as const,
    description: 'Enterprise compliance and omnichannel-ready controls',
    includedMessages: 10000,
    extraBlockSize: 2000,
    extraBlockPrice: 5,
    cappedAmountUsd: 100,
  },
] as const;

export type BillingPlanId = (typeof BILLING_PLANS)[number]['id'];

export interface BillingPlan {
  id: BillingPlanId;
  name: string;
  amountUsd: number;
  interval: 'EVERY_30_DAYS';
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
  createdAt?: string;
  currentPeriodEnd?: string;
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
  billingCurrency?: string;
  activePlanCode?: string;
  billableBlocks?: number;
  balanceUsed?: number;
  softCapAmount?: number;
  billingCycleStart?: string | Date;
  billingCycleEnd?: string | Date;
  shopId?: string;
}

export interface BillingSubscriptionResult {
  confirmationUrl: string;
  subscriptionId?: string;
  usageLineItemId?: string;
}

export type BillingEnvironmentMode = 'production' | 'development';

export function resolveBillingEnvironmentMode(env: NodeJS.ProcessEnv = process.env): BillingEnvironmentMode {
  const forcedMode = String(env.BILLING_ENV_MODE || '').trim().toLowerCase();
  if (forcedMode === 'production' || forcedMode === 'development') {
    return forcedMode;
  }

  if (env.NODE_ENV !== 'production') {
    return 'development';
  }

  const deploymentTarget = String(env.FLUXBOT_DEPLOY_TARGET || env.DEPLOY_TARGET || '')
    .trim()
    .toLowerCase();
  if (deploymentTarget.includes('dev') || deploymentTarget.includes('staging')) {
    return 'development';
  }

  const appUrl = String(env.SHOPIFY_APP_URL || env.APP_URL || '')
    .trim()
    .toLowerCase();
  const isLocalAppUrl =
    appUrl.includes('localhost') ||
    appUrl.includes('127.0.0.1') ||
    appUrl.includes('fluxbot-local-dev.invalid');

  if (isLocalAppUrl) {
    return 'development';
  }

  return 'production';
}

async function getShopDomain(shopId: string): Promise<string> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { domain: true },
  });

  if (!shop) {
    throw new Error('Shop not found');
  }

  return shop.domain;
}

async function getShopCredentials(shopId: string): Promise<{ domain: string; accessToken: string }> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { domain: true, accessToken: true },
  });

  if (!shop) {
    throw new Error('Shop not found');
  }

  if (!shop.accessToken || shop.accessToken === '__pending_access_token__') {
    throw new Error('Shop missing offline access token');
  }

  return { domain: shop.domain, accessToken: shop.accessToken };
}

async function runShopifyGraphql<T>(params: {
  shopDomain: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const endpoint = `https://${params.shopDomain}/admin/api/${ADMIN_API_VERSION}/graphql.json`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': params.accessToken,
    },
    body: JSON.stringify({
      query: params.query,
      variables: params.variables ?? {},
    }),
  });

  if (!response.ok) {
    throw new Error(`Shopify billing request failed with HTTP ${response.status}`);
  }

  const payload = await response.json() as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'Unknown Shopify billing error');
  }

  if (!payload.data) {
    throw new Error('No billing data returned from Shopify');
  }

  return payload.data;
}

type ActiveSubscriptionSummary = {
  id: string;
  name: string;
  status: string;
};

function normalizeSubscriptionName(name: string): string {
  return name.trim().toLowerCase();
}

function findActivePlanIdBySubscriptionName(subscriptionName: string): BillingPlanId | null {
  const normalized = normalizeSubscriptionName(subscriptionName);
  const matched = BILLING_PLANS.find((plan) =>
    normalizeSubscriptionName(plan.name) === normalized ||
    normalized.includes(plan.id),
  );
  return matched?.id ?? null;
}

function isLiveSubscriptionStatus(status: string): boolean {
  return ["ACTIVE", "PENDING", "ACCEPTED", "FROZEN"].includes(String(status || "").toUpperCase());
}

export class BillingService {
  static async listPlans(shopId?: string): Promise<BillingPlan[]> {
    if (!shopId) {
      return BILLING_PLANS.map((plan) => ({ ...plan }));
    }

    const shopDomain = await getShopDomain(shopId);
    const plans = await iaClient.billing.plans(shopDomain);

    return plans.map((plan) => ({
      id: plan.code as BillingPlanId,
      name: plan.name,
      amountUsd: plan.basePrice ?? 0,
      interval: 'EVERY_30_DAYS',
      description: `${plan.name} plan`,
      includedMessages: plan.includedMessages,
      extraBlockSize: plan.extraBlockSize ?? 0,
      extraBlockPrice: plan.extraBlockPrice ?? 0,
      cappedAmountUsd: plan.cappedAmount ?? 0,
    }));
  }

  static getPlan(planId: string): BillingPlan | null {
    return BILLING_PLANS.find((plan) => plan.id === planId) ? { ...BILLING_PLANS.find((plan) => plan.id === planId)! } : null;
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
            createdAt
            currentPeriodEnd
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

    const subscriptionsRaw = Array.isArray(data.currentAppInstallation?.activeSubscriptions)
      ? data.currentAppInstallation?.activeSubscriptions
      : [];

    const subscriptions: ActiveSubscription[] = subscriptionsRaw.map((raw) => {
      const sub = raw as Record<string, any>;
      const lineItems = Array.isArray(sub.lineItems) ? sub.lineItems : [];
      const firstLine = lineItems[0] && typeof lineItems[0] === 'object' ? (lineItems[0] as Record<string, any>) : {};
      const plan = firstLine.plan && typeof firstLine.plan === 'object' ? (firstLine.plan as Record<string, any>) : {};
      const pricingDetails = plan.pricingDetails && typeof plan.pricingDetails === 'object'
        ? (plan.pricingDetails as Record<string, any>)
        : {};
      const price = pricingDetails.price && typeof pricingDetails.price === 'object'
        ? (pricingDetails.price as Record<string, any>)
        : {};

      return {
        id: String(sub.id || ''),
        name: String(sub.name || ''),
        status: String(sub.status || ''),
        test: Boolean(sub.test),
        createdAt: typeof sub.createdAt === "string" ? sub.createdAt : undefined,
        currentPeriodEnd: typeof sub.currentPeriodEnd === "string" ? sub.currentPeriodEnd : undefined,
        priceAmount: String(price.amount || ''),
        priceCurrency: String(price.currencyCode || 'USD'),
        interval: String(pricingDetails.interval || ''),
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
    /** Pass session credentials directly to avoid DB lookup. */
    shopDomain?: string;
    accessToken?: string;
  }): Promise<BillingSubscriptionResult> {
    const plan = BILLING_PLANS.find((candidate) => candidate.id === params.planId);
    if (!plan) {
      throw new Error('Invalid billing plan');
    }

    let domain: string;
    let accessToken: string;

    if (params.shopDomain && params.accessToken) {
      // Use session credentials directly — avoids a stale-token DB lookup
      domain = params.shopDomain;
      accessToken = params.accessToken;
    } else {
      const creds = await getShopCredentials(params.shopId);
      domain = creds.domain;
      accessToken = creds.accessToken;
    }

    const billingMode = resolveBillingEnvironmentMode(process.env);
    const isTestMode = billingMode === 'development';
    const usageTerms = `${plan.extraBlockSize} messages per block`;

    const activeSubscriptionsQuery = `#graphql
      query ActiveSubscriptionsForPlanGuard {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
          }
        }
      }
    `;

    const activeSubscriptionsData = await runShopifyGraphql<{
      currentAppInstallation?: {
        activeSubscriptions?: Array<Record<string, unknown>>;
      };
    }>({
      shopDomain: domain,
      accessToken,
      query: activeSubscriptionsQuery,
    });

    const activeSubscriptionsRaw = Array.isArray(activeSubscriptionsData.currentAppInstallation?.activeSubscriptions)
      ? activeSubscriptionsData.currentAppInstallation?.activeSubscriptions
      : [];
    const activeSubscriptions: ActiveSubscriptionSummary[] = activeSubscriptionsRaw.map((sub) => ({
      id: String((sub as { id?: unknown }).id || ''),
      name: String((sub as { name?: unknown }).name || ''),
      status: String((sub as { status?: unknown }).status || ''),
    })).filter((sub) => sub.id && isLiveSubscriptionStatus(sub.status));

    const hasSamePlanActive = activeSubscriptions.some((sub) => findActivePlanIdBySubscriptionName(sub.name) === plan.id);
    if (hasSamePlanActive) {
      throw new Error("You are already subscribed to this plan.");
    }

    const replacementBehavior = activeSubscriptions.length > 0
      ? 'APPLY_IMMEDIATELY'
      : 'STANDARD';

    const mutation = `#graphql
      mutation CreateAppSubscription(
        $name: String!
        $returnUrl: URL!
        $test: Boolean!
        $lineItems: [AppSubscriptionLineItemInput!]!
        $replacementBehavior: AppSubscriptionReplacementBehavior
      ) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          test: $test
          lineItems: $lineItems
          replacementBehavior: $replacementBehavior
        ) {
          confirmationUrl
          userErrors {
            field
            message
          }
          appSubscription {
            id
            lineItems {
              id
              plan {
                pricingDetails {
                  __typename
                }
              }
            }
          }
        }
      }
    `;

    let data: {
      appSubscriptionCreate?: {
        confirmationUrl?: string;
        userErrors?: Array<{ message?: string }>;
        appSubscription?: {
          id?: string;
          lineItems?: Array<{
            id?: string;
            plan?: {
              pricingDetails?: {
                __typename?: string;
              };
            };
          }>;
        };
      };
    };
    try {
      data = await runShopifyGraphql<{
        appSubscriptionCreate?: {
          confirmationUrl?: string;
          userErrors?: Array<{ message?: string }>;
          appSubscription?: {
            id?: string;
            lineItems?: Array<{
              id?: string;
              plan?: {
                pricingDetails?: {
                  __typename?: string;
                };
              };
            }>;
          };
        };
      }>({
        shopDomain: domain,
        accessToken,
        query: mutation,
        variables: {
          name: plan.name,
          returnUrl: params.returnUrl,
          test: isTestMode,
          replacementBehavior,
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  interval: plan.interval,
                  price: {
                    amount: String(plan.amountUsd),
                    currencyCode: 'USD',
                  },
                },
              },
            },
            {
              plan: {
                appUsagePricingDetails: {
                  terms: usageTerms,
                  cappedAmount: {
                    amount: String(plan.cappedAmountUsd),
                    currencyCode: 'USD',
                  },
                },
              },
            },
          ],
        },
      });
    } catch (error) {
      console.error('[billing] createSubscription network failure', {
        shopId: params.shopId,
        shopDomain: domain,
        planId: plan.id,
        billingMode,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(DEFAULT_BILLING_ERROR_MESSAGE);
    }

    const payload = data.appSubscriptionCreate;
    if (!payload) {
      console.error('[billing] createSubscription failed', {
        shopId: params.shopId,
        shopDomain: domain,
        planId: plan.id,
        billingMode,
        reason: 'missing appSubscriptionCreate payload',
      });
      throw new Error(DEFAULT_BILLING_ERROR_MESSAGE);
    }

    if (payload.userErrors?.length) {
      const firstError = payload.userErrors[0];
      const shopifyMessage = firstError?.message;
      console.error('[billing] createSubscription userErrors', {
        shopId: params.shopId,
        shopDomain: domain,
        planId: plan.id,
        billingMode,
        userErrors: payload.userErrors,
      });
      throw new Error(shopifyMessage || DEFAULT_BILLING_ERROR_MESSAGE);
    }

    if (!payload.confirmationUrl) {
      console.error('[billing] createSubscription missing confirmationUrl', {
        shopId: params.shopId,
        shopDomain: domain,
        planId: plan.id,
        billingMode,
        backendError: null,
      });
      throw new Error(DEFAULT_BILLING_ERROR_MESSAGE);
    }

    const lineItems = Array.isArray(payload.appSubscription?.lineItems)
      ? payload.appSubscription?.lineItems
      : [];
    const usageLineItem = lineItems.find((item) => item.plan?.pricingDetails?.__typename === 'AppUsagePricing');

    return {
      confirmationUrl: payload.confirmationUrl,
      subscriptionId: payload.appSubscription?.id,
      usageLineItemId: usageLineItem?.id,
    };
  }

  static async getUsageStatus(shopId: string): Promise<UsageStatus> {
    const shopDomain = await getShopDomain(shopId);
    return iaClient.billing.status(shopDomain) as unknown as UsageStatus;
  }
}
