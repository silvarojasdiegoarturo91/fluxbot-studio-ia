import { randomUUID } from "node:crypto";
import { runShopifyGraphqlRequest } from "./shopify-graphql-client.server";
import {
  clearShopConnectionCache,
  getCachedShopConnection,
  setCachedShopConnection,
  type ShopConnectionData,
} from "./shop-connection-cache.server";

export const SHOP_CONNECTION_QUERY = `#graphql
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

interface FetchShopConnectionInput {
  admin: {
    graphql: (query: string, init?: { signal?: AbortSignal }) => Promise<Response>;
  };
  shopId: string | null | undefined;
  requestId?: string;
}

interface FetchShopConnectionResult {
  shopConnection: ShopConnectionData;
  alerts: string[];
  cacheHit: boolean;
  cacheAgeMs: number | null;
}

function buildDisconnectedShopConnection(error: string): ShopConnectionData {
  return {
    connected: false,
    name: null,
    myshopifyDomain: null,
    primaryDomainHost: null,
    planName: null,
    error,
    source: "live",
  };
}

function buildConnectedShopConnection(payload: {
  name?: string | null;
  myshopifyDomain?: string | null;
  primaryDomainHost?: string | null;
  planName?: string | null;
}): ShopConnectionData {
  return {
    connected: true,
    name: payload.name ?? null,
    myshopifyDomain: payload.myshopifyDomain ?? null,
    primaryDomainHost: payload.primaryDomainHost ?? null,
    planName: payload.planName ?? null,
    error: null,
    source: "live",
  };
}

function sanitizeGraphqlMessage(message: string): string {
  const normalized = message
    .replace(/^Http request error,\s*no response available:\s*/i, "")
    .replace(/^GraphQL Client:\s*/i, "")
    .trim();

  if (
    !normalized ||
    normalized.toLowerCase().includes("fetch failed") ||
    /^http\s+\d{3}/i.test(normalized)
  ) {
    return "No pudimos conectar con Shopify. Verifica tu conexión a internet.";
  }

  return normalized;
}

function parseGraphqlErrors(errors: Array<{ message?: string }>): string {
  const firstMessage = errors.find((error) => typeof error.message === "string" && error.message.trim());
  return sanitizeGraphqlMessage(firstMessage?.message || "No pudimos obtener datos de Shopify.");
}

export async function fetchShopConnection({
  admin,
  shopId,
  requestId = randomUUID(),
}: FetchShopConnectionInput): Promise<FetchShopConnectionResult> {
  if (!shopId) {
    return {
      shopConnection: buildDisconnectedShopConnection("Shop context unavailable."),
      alerts: ["Unable to resolve shop context."],
      cacheHit: false,
      cacheAgeMs: null,
    };
  }

  try {
    const { response, attempts } = await runShopifyGraphqlRequest(
      admin.graphql,
      SHOP_CONNECTION_QUERY,
      {
        shopId,
        requestId,
        queryName: "DashboardShopConnection",
      },
    );

    if (response.status === 401 || response.status === 403 || response.status === 410) {
      const error = buildDisconnectedShopConnection(
        "La sesión con Shopify expiró. Recarga la página.",
      );

      return {
        shopConnection: error,
        alerts: [error.error || "La sesión con Shopify expiró. Recarga la página."],
        cacheHit: false,
        cacheAgeMs: null,
      };
    }

    if (!response.ok) {
      const cached = getCachedShopConnection(shopId);

      if (cached) {
        return {
          shopConnection: cached.value,
          alerts: [
            `Usando datos en caché de Shopify (${Math.max(1, Math.round(cached.ageMs / 1000))}s de antigüedad).`,
          ],
          cacheHit: true,
          cacheAgeMs: cached.ageMs,
        };
      }

      const errorMessage = response.status >= 500
        ? "No pudimos conectar con Shopify. Verifica tu conexión a internet."
        : sanitizeGraphqlMessage(`HTTP ${response.status}`);

      return {
        shopConnection: buildDisconnectedShopConnection(errorMessage),
        alerts: [errorMessage],
        cacheHit: false,
        cacheAgeMs: null,
      };
    }

    let payload: {
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
      errors?: Array<{ message?: string }>;
    } = {};

    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = {};
    }

    if (payload.errors?.length) {
      const errorMessage = parseGraphqlErrors(payload.errors || []);
      const cached = getCachedShopConnection(shopId);

      if (cached) {
        return {
          shopConnection: cached.value,
          alerts: [
            `Usando datos en caché de Shopify (${Math.max(1, Math.round(cached.ageMs / 1000))}s de antigüedad).`,
          ],
          cacheHit: true,
          cacheAgeMs: cached.ageMs,
        };
      }

      return {
        shopConnection: buildDisconnectedShopConnection(errorMessage),
        alerts: [errorMessage],
        cacheHit: false,
        cacheAgeMs: null,
      };
    }

    const shop = payload.data?.shop;
    if (!shop) {
      const cached = getCachedShopConnection(shopId);

      if (cached) {
        return {
          shopConnection: cached.value,
          alerts: [
            `Usando datos en caché de Shopify (${Math.max(1, Math.round(cached.ageMs / 1000))}s de antigüedad).`,
          ],
          cacheHit: true,
          cacheAgeMs: cached.ageMs,
        };
      }

      return {
        shopConnection: buildDisconnectedShopConnection("No shop data returned by Admin API."),
        alerts: ["No shop data returned by Admin API."],
        cacheHit: false,
        cacheAgeMs: null,
      };
    }

    const shopConnection = buildConnectedShopConnection({
      name: shop.name,
      myshopifyDomain: shop.myshopifyDomain,
      primaryDomainHost: shop.primaryDomain?.host,
      planName: shop.plan?.displayName,
    });

    setCachedShopConnection(shopId, shopConnection);

    return {
      shopConnection,
      alerts: attempts > 1 ? ["Shopify respondió tras reintentos automáticos."] : [],
      cacheHit: false,
      cacheAgeMs: null,
    };
  } catch (error) {
    const cached = getCachedShopConnection(shopId);
    if (cached) {
      return {
        shopConnection: cached.value,
        alerts: [
          `Usando datos en caché de Shopify (${Math.max(1, Math.round(cached.ageMs / 1000))}s de antigüedad).`,
        ],
        cacheHit: true,
        cacheAgeMs: cached.ageMs,
      };
    }

    const message = error instanceof Error ? error.message : "No pudimos conectar con Shopify.";
    return {
      shopConnection: buildDisconnectedShopConnection(sanitizeGraphqlMessage(message)),
      alerts: [sanitizeGraphqlMessage(message)],
      cacheHit: false,
      cacheAgeMs: null,
    };
  }
}

export { clearShopConnectionCache };
