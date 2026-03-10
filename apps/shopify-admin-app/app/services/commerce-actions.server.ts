import prisma from "../db.server";
import type { Prisma } from "@prisma/client";

export interface AddToCartRequest {
  shopDomain: string;
  productRef?: string;
  variantId?: string;
  quantity?: number;
  conversationId?: string;
  sessionId?: string;
  source?: "chat" | "widget" | "api";
}

export interface AddToCartResolution {
  shopId: string;
  shopDomain: string;
  productRef?: string;
  productHandle?: string;
  variantId: string;
  quantity: number;
  cartUrl: string;
  checkoutUrl: string;
  addEndpoint: string;
}

export interface AddToCartExecutionResult extends AddToCartResolution {
  committed: boolean;
  lineItem?: Record<string, unknown>;
}

const ADMIN_API_VERSION = "2026-01";
const MAX_QUANTITY = 20;

function normalizeQuantity(quantity: number | undefined): number {
  if (!quantity || !Number.isFinite(quantity)) return 1;
  const rounded = Math.floor(quantity);
  if (rounded < 1) return 1;
  if (rounded > MAX_QUANTITY) return MAX_QUANTITY;
  return rounded;
}

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractNumericId(rawId: string | null | undefined): string | null {
  if (!rawId) return null;
  const trimmed = rawId.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;

  const gidMatch = trimmed.match(/\/(\d+)$/);
  if (gidMatch?.[1]) return gidMatch[1];

  const fallbackMatch = trimmed.match(/(\d+)(?!.*\d)/);
  return fallbackMatch?.[1] || null;
}

function normalizeShopDomain(shopDomain: string): string {
  return shopDomain.trim().toLowerCase();
}

function buildProductGid(productRef: string): string | null {
  if (productRef.startsWith("gid://shopify/Product/")) {
    return productRef;
  }

  const numeric = extractNumericId(productRef);
  if (!numeric) return null;

  return `gid://shopify/Product/${numeric}`;
}

function parseVariantCandidates(rawVariants: unknown): string[] {
  if (!rawVariants) return [];

  const entries = Array.isArray(rawVariants)
    ? rawVariants
    : Array.isArray((rawVariants as Record<string, unknown>)?.nodes)
      ? ((rawVariants as Record<string, unknown>).nodes as unknown[])
      : [];

  const variantIds: string[] = [];

  for (const entry of entries) {
    const objectEntry = toObject(entry);
    const idCandidate =
      (typeof objectEntry.id === "string" ? objectEntry.id : undefined) ||
      (typeof objectEntry.variantId === "string" ? objectEntry.variantId : undefined) ||
      (typeof objectEntry.admin_graphql_api_id === "string"
        ? objectEntry.admin_graphql_api_id
        : undefined);

    const numericId = extractNumericId(idCandidate);
    if (numericId) {
      variantIds.push(numericId);
    }
  }

  return variantIds;
}

async function fetchFirstVariantFromAdmin(params: {
  shopDomain: string;
  accessToken: string;
  productRef: string;
}): Promise<{ variantId: string; productHandle?: string } | null> {
  const { shopDomain, accessToken, productRef } = params;
  const productGid = buildProductGid(productRef);

  const queryById = `#graphql
    query ProductVariantForCart($id: ID!) {
      product(id: $id) {
        handle
        variants(first: 1) {
          nodes {
            id
            legacyResourceId
          }
        }
      }
    }
  `;

  const queryByHandle = `#graphql
    query ProductVariantByHandle($query: String!) {
      products(first: 1, query: $query) {
        nodes {
          handle
          variants(first: 1) {
            nodes {
              id
              legacyResourceId
            }
          }
        }
      }
    }
  `;

  const endpoint = `https://${shopDomain}/admin/api/${ADMIN_API_VERSION}/graphql.json`;

  const runGraphql = async (query: string, variables: Record<string, unknown>) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      data?: Record<string, unknown>;
      errors?: Array<{ message?: string }>;
    };

    if (payload.errors?.length) {
      return null;
    }

    return payload.data || null;
  };

  if (productGid) {
    const data = await runGraphql(queryById, { id: productGid });
    const product = toObject(data?.product);
    const variantsContainer = toObject(product.variants);
    const nodes = Array.isArray(variantsContainer.nodes)
      ? (variantsContainer.nodes as unknown[])
      : [];

    if (nodes.length > 0) {
      const variant = toObject(nodes[0]);
      const legacyId = extractNumericId(String(variant.legacyResourceId || ""));
      const variantId = legacyId || extractNumericId(String(variant.id || ""));
      if (variantId) {
        return {
          variantId,
          productHandle: typeof product.handle === "string" ? product.handle : undefined,
        };
      }
    }
  }

  const data = await runGraphql(queryByHandle, { query: `handle:${productRef}` });
  const productsContainer = toObject(data?.products);
  const nodes = Array.isArray(productsContainer.nodes)
    ? (productsContainer.nodes as unknown[])
    : [];

  if (nodes.length === 0) return null;

  const product = toObject(nodes[0]);
  const variantsContainer = toObject(product.variants);
  const variantNodes = Array.isArray(variantsContainer.nodes)
    ? (variantsContainer.nodes as unknown[])
    : [];

  if (variantNodes.length === 0) return null;

  const variant = toObject(variantNodes[0]);
  const legacyId = extractNumericId(String(variant.legacyResourceId || ""));
  const variantId = legacyId || extractNumericId(String(variant.id || ""));

  if (!variantId) return null;

  return {
    variantId,
    productHandle: typeof product.handle === "string" ? product.handle : undefined,
  };
}

async function resolveVariantFromProjection(params: {
  shopId: string;
  productRef: string;
}): Promise<{ variantId: string; productHandle?: string } | null> {
  const numericProductRef = extractNumericId(params.productRef);

  const projection = await prisma.productProjection.findFirst({
    where: {
      shopId: params.shopId,
      OR: [
        { productId: params.productRef },
        numericProductRef ? { productId: numericProductRef } : undefined,
        { handle: params.productRef.toLowerCase() },
      ].filter(Boolean) as Prisma.ProductProjectionWhereInput[],
    },
    select: {
      productId: true,
      handle: true,
      variants: true,
    },
  });

  if (!projection) return null;

  const variantIds = parseVariantCandidates(projection.variants);
  if (variantIds.length === 0) return null;

  return {
    variantId: variantIds[0],
    productHandle: projection.handle || undefined,
  };
}

async function resolveVariant(params: {
  shopId: string;
  shopDomain: string;
  accessToken: string;
  productRef?: string;
  explicitVariantId?: string;
}): Promise<{ variantId: string; productHandle?: string; productRef?: string } | null> {
  const explicitVariantId = extractNumericId(params.explicitVariantId || null);
  if (explicitVariantId) {
    return {
      variantId: explicitVariantId,
      productRef: params.productRef,
    };
  }

  if (!params.productRef) return null;

  const fromProjection = await resolveVariantFromProjection({
    shopId: params.shopId,
    productRef: params.productRef,
  });

  if (fromProjection) {
    return {
      ...fromProjection,
      productRef: params.productRef,
    };
  }

  const fromAdmin = await fetchFirstVariantFromAdmin({
    shopDomain: params.shopDomain,
    accessToken: params.accessToken,
    productRef: params.productRef,
  });

  if (!fromAdmin) return null;

  return {
    ...fromAdmin,
    productRef: params.productRef,
  };
}

async function recordAuditLog(params: {
  shopId: string;
  action: string;
  entityId?: string;
  details: Record<string, unknown>;
}) {
  await prisma.auditLog
    .create({
      data: {
        shopId: params.shopId,
        action: params.action,
        entityType: "COMMERCE_ACTION",
        entityId: params.entityId,
        changes: params.details as Prisma.InputJsonValue,
      },
    })
    .catch(() => {});
}

export class CommerceActionsService {
  static async prepareAddToCart(request: AddToCartRequest): Promise<AddToCartResolution> {
    const shopDomain = normalizeShopDomain(request.shopDomain);

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      select: { id: true, domain: true, accessToken: true },
    });

    if (!shop) {
      throw new Error("Shop not found");
    }

    const quantity = normalizeQuantity(request.quantity);

    const resolution = await resolveVariant({
      shopId: shop.id,
      shopDomain: shop.domain,
      accessToken: shop.accessToken,
      productRef: request.productRef,
      explicitVariantId: request.variantId,
    });

    if (!resolution) {
      throw new Error("Could not resolve product variant for add-to-cart");
    }

    const cartPath = `/cart/${resolution.variantId}:${quantity}`;
    const cartUrl = `https://${shop.domain}${cartPath}`;
    const checkoutUrl = `${cartUrl}?checkout`;

    const result: AddToCartResolution = {
      shopId: shop.id,
      shopDomain: shop.domain,
      productRef: resolution.productRef,
      productHandle: resolution.productHandle,
      variantId: resolution.variantId,
      quantity,
      cartUrl,
      checkoutUrl,
      addEndpoint: `https://${shop.domain}/cart/add.js`,
    };

    await recordAuditLog({
      shopId: shop.id,
      action: "CHAT_ADD_TO_CART_LINK_GENERATED",
      entityId: resolution.variantId,
      details: {
        source: request.source || "api",
        conversationId: request.conversationId || null,
        sessionId: request.sessionId || null,
        productRef: resolution.productRef || null,
        productHandle: resolution.productHandle || null,
        variantId: resolution.variantId,
        quantity,
      },
    });

    return result;
  }

  static async commitAddToCart(request: AddToCartRequest): Promise<AddToCartExecutionResult> {
    const prepared = await this.prepareAddToCart(request);

    const response = await fetch(prepared.addEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        id: prepared.variantId,
        quantity: prepared.quantity,
      }),
    });

    if (!response.ok) {
      throw new Error(`Cart API request failed with status ${response.status}`);
    }

    let lineItem: Record<string, unknown> | undefined;
    try {
      lineItem = (await response.json()) as Record<string, unknown>;
    } catch {
      lineItem = undefined;
    }

    await recordAuditLog({
      shopId: prepared.shopId,
      action: "CHAT_ADD_TO_CART_EXECUTED",
      entityId: prepared.variantId,
      details: {
        source: request.source || "api",
        conversationId: request.conversationId || null,
        sessionId: request.sessionId || null,
        variantId: prepared.variantId,
        quantity: prepared.quantity,
      },
    });

    return {
      ...prepared,
      committed: true,
      lineItem,
    };
  }

  static async prepareAddToCartByShopId(params: {
    shopId: string;
    productRef?: string;
    variantId?: string;
    quantity?: number;
    conversationId?: string;
    sessionId?: string;
    source?: "chat" | "widget" | "api";
  }): Promise<AddToCartResolution> {
    const shop = await prisma.shop.findUnique({
      where: { id: params.shopId },
      select: { domain: true },
    });

    if (!shop?.domain) {
      throw new Error("Shop domain not found");
    }

    return this.prepareAddToCart({
      shopDomain: shop.domain,
      productRef: params.productRef,
      variantId: params.variantId,
      quantity: params.quantity,
      conversationId: params.conversationId,
      sessionId: params.sessionId,
      source: params.source,
    });
  }
}
