import prisma from '../db.server';
import { iaClient } from './ia-backend.server';

const ADMIN_API_VERSION = '2026-01';

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
    test?: boolean;
  }): Promise<BillingSubscriptionResult> {
    const plan = BILLING_PLANS.find((candidate) => candidate.id === params.planId);
    if (!plan) {
      throw new Error('Invalid billing plan');
    }

    const { domain, accessToken } = await getShopCredentials(params.shopId);
    const backendUrl = process.env.IA_BACKEND_URL || 'http://localhost:3001';
    const apiKey = process.env.IA_BACKEND_API_KEY || process.env.MASTER_API_KEY || 'dev_master_key';

    const response = await fetch(`${backendUrl}/api/v1/billing/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Shop-Domain': domain,
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        planCode: plan.id,
        returnUrl: params.returnUrl,
        test: params.test !== false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Shopify billing request failed with HTTP ${response.status}`);
    }

    const payload = await response.json() as {
      confirmationUrl?: string;
      subscriptionId?: string;
      usageLineItemId?: string;
      error?: string;
    };

    if (!payload.confirmationUrl) {
      throw new Error(payload.error || 'Shopify did not return confirmation URL');
    }

    return {
      confirmationUrl: payload.confirmationUrl,
      subscriptionId: payload.subscriptionId,
      usageLineItemId: payload.usageLineItemId,
    };
  }

  static async getUsageStatus(shopId: string): Promise<UsageStatus> {
    const shopDomain = await getShopDomain(shopId);
    return iaClient.billing.status(shopDomain) as unknown as UsageStatus;
  }
}
