export interface ShopConnectionData {
  connected: boolean;
  name: string | null;
  myshopifyDomain: string | null;
  primaryDomainHost: string | null;
  planName: string | null;
  error: string | null;
  source: "live" | "cache";
}

interface CachedShopConnectionEntry {
  value: ShopConnectionData;
  cachedAt: number;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CachedShopConnectionEntry>();

function getTtlMs(): number {
  const configured = Number(process.env.SHOP_CONNECTION_CACHE_TTL_MS || DEFAULT_TTL_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TTL_MS;
}

export function getCachedShopConnection(shopId: string): { value: ShopConnectionData; ageMs: number } | null {
  const entry = cache.get(shopId);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(shopId);
    return null;
  }

  return {
    value: {
      ...entry.value,
      source: "cache",
    },
    ageMs: Date.now() - entry.cachedAt,
  };
}

export function setCachedShopConnection(shopId: string, value: ShopConnectionData): void {
  const cachedAt = Date.now();
  cache.set(shopId, {
    value,
    cachedAt,
    expiresAt: cachedAt + getTtlMs(),
  });
}

export function clearShopConnectionCache(): void {
  cache.clear();
}

export function getShopConnectionCacheSnapshot() {
  return Array.from(cache.entries()).map(([shopId, entry]) => ({
    shopId,
    cachedAt: new Date(entry.cachedAt).toISOString(),
    expiresAt: new Date(entry.expiresAt).toISOString(),
  }));
}

