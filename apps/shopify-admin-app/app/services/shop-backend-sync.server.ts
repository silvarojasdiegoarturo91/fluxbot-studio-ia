import { iaClient } from './ia-backend.server';

export interface ShopReference {
  id: string;
  domain: string;
  name?: string;
}

const SHOP_SYNC_THROTTLE_MS = 5 * 60 * 1000;
const lastSyncedByDomain = new Map<string, number>();

function isIABackendShopSyncEnabled(): boolean {
  if (process.env.NODE_ENV === 'test' && process.env.IA_BACKEND_SYNC_IN_TEST !== 'true') {
    return false;
  }

  if (process.env.IA_EXECUTION_MODE === 'local') {
    return false;
  }

  return Boolean(process.env.IA_BACKEND_URL && process.env.IA_BACKEND_API_KEY);
}

function normalizeShopReference(shop: ShopReference): ShopReference | null {
  const domain = shop.domain.trim().toLowerCase();
  if (!domain) {
    return null;
  }

  const normalizedName = typeof shop.name === 'string' ? shop.name.trim() : '';

  return {
    id: shop.id,
    domain,
    ...(normalizedName ? { name: normalizedName } : {}),
  };
}

export async function syncShopReferenceToIABackend(
  shop: ShopReference,
  options?: { force?: boolean },
): Promise<boolean> {
  if (!isIABackendShopSyncEnabled()) {
    return false;
  }

  const normalizedShop = normalizeShopReference(shop);
  if (!normalizedShop) {
    return false;
  }

  const now = Date.now();
  const lastSyncedAt = lastSyncedByDomain.get(normalizedShop.domain) || 0;

  if (!options?.force && now - lastSyncedAt < SHOP_SYNC_THROTTLE_MS) {
    return false;
  }

  try {
    await iaClient.shops.sync({ shop: normalizedShop }, normalizedShop.domain);
    lastSyncedByDomain.set(normalizedShop.domain, now);
    return true;
  } catch (error) {
    lastSyncedByDomain.delete(normalizedShop.domain);
    console.warn(`[ShopSync] Failed to sync ${normalizedShop.domain} to IA backend:`, error);
    return false;
  }
}

export function _resetShopSyncThrottle(): void {
  lastSyncedByDomain.clear();
}