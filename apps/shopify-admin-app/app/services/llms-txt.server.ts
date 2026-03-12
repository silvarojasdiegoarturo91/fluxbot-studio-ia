import { iaClient } from "./ia-backend.server";
import prisma from "../db.server";

export interface LlmsTxtOptions {
  shopDomain: string;
  includePolicies?: boolean;
  includeProducts?: boolean;
  maxProducts?: number;
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

function resolveCacheTtlMs(): number {
  const ttlMinutes = Number(process.env.LLMS_TXT_CACHE_TTL_MINUTES || "360");
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    return 6 * 60 * 60 * 1000;
  }
  return Math.floor(ttlMinutes) * 60 * 1000;
}

async function resolveShopId(shopDomain: string): Promise<string | null> {
  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
    select: { id: true },
  });

  return shop?.id ?? null;
}

function canUseCanonicalCache(params: {
  includePolicies: boolean;
  includeProducts: boolean;
  maxProducts: number;
}) {
  return params.includePolicies && params.includeProducts && params.maxProducts === 12;
}

export class LlmsTxtService {
  static async generate(options: LlmsTxtOptions & { forceRefresh?: boolean }): Promise<string> {
    const includePolicies = options.includePolicies !== false;
    const includeProducts = options.includeProducts !== false;
    const maxProducts = Math.min(Math.max(options.maxProducts || 12, 1), 50);
    const forceRefresh = options.forceRefresh === true;

    const shopDomain = normalizeDomain(options.shopDomain);
    const shopId = await resolveShopId(shopDomain);

    // Cache only canonical llms.txt shape to keep model simple and deterministic.
    if (shopId && !forceRefresh && canUseCanonicalCache({ includePolicies, includeProducts, maxProducts })) {
      const cached = await prisma.llmsTxtCache.findUnique({
        where: { shopId },
      });

      if (cached && cached.expiresAt > new Date()) {
        return cached.content;
      }
    }

    const content = await iaClient.llms.generate(
      {
        shopDomain,
        includePolicies,
        includeProducts,
        maxProducts,
      },
      shopDomain,
    );

    if (shopId && canUseCanonicalCache({ includePolicies, includeProducts, maxProducts })) {
      const ttlMs = resolveCacheTtlMs();
      const now = new Date();
      await prisma.llmsTxtCache.upsert({
        where: { shopId },
        create: {
          shopId,
          content,
          generatedAt: now,
          expiresAt: new Date(now.getTime() + ttlMs),
        },
        update: {
          content,
          generatedAt: now,
          expiresAt: new Date(now.getTime() + ttlMs),
        },
      });
    }

    return content;
  }

  static async getCacheStatus(shopDomain: string): Promise<{
    shopDomain: string;
    hasCache: boolean;
    generatedAt: Date | null;
    expiresAt: Date | null;
    isExpired: boolean;
  }> {
    const normalizedDomain = normalizeDomain(shopDomain);
    const shopId = await resolveShopId(normalizedDomain);
    if (!shopId) {
      return {
        shopDomain: normalizedDomain,
        hasCache: false,
        generatedAt: null,
        expiresAt: null,
        isExpired: false,
      };
    }

    const cached = await prisma.llmsTxtCache.findUnique({ where: { shopId } });
    const now = new Date();

    return {
      shopDomain: normalizedDomain,
      hasCache: !!cached,
      generatedAt: cached?.generatedAt ?? null,
      expiresAt: cached?.expiresAt ?? null,
      isExpired: !!cached && cached.expiresAt <= now,
    };
  }

  static async invalidate(shopDomain: string): Promise<void> {
    const normalizedDomain = normalizeDomain(shopDomain);
    const shopId = await resolveShopId(normalizedDomain);
    if (!shopId) return;

    await prisma.llmsTxtCache.deleteMany({ where: { shopId } });
  }
}
