/**
 * App Proxy — Chat endpoint
 * Route: /apps/fluxbot/chat  (proxied by Shopify via app_proxy config)
 *
 * Shopify signs every proxy request with HMAC-SHA256.
 * We verify the signature, then delegate to the same logic used by api.chat.ts.
 *
 * W7 — Routing diagnostics:
 *   - Accepts traceId from widget (X-FluxBot-Trace-Id header or body.traceId)
 *   - Returns traceId in X-FluxBot-Trace-Id response header
 *   - Emits diagnostic headers: X-FluxBot-Service, X-FluxBot-Commit, X-FluxBot-Hostname
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { getIAGateway } from "../services/ia-gateway.server";
import { getMerchantAdminConfig } from "../services/admin-config.server";
import { getCatalogFallbackMessage, resolveEffectiveLocale } from "../services/chat-locale.server";
import { verifyShopifyProxyRequest } from "../services/shopify-proxy-auth.server";

// ── W7 — Startup diagnostics ─────────────────────────────────────────────────

const SERVICE_NAME = "shopify-proxy";
const COMMIT_SHA = process.env.SOURCE_VERSION || process.env.COMMIT_SHA || "unknown";
const HOSTNAME = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("os").hostname();
  } catch {
    return "unknown";
  }
})();
const PROCESS_PID = process.pid;
const NODE_ENV = process.env.NODE_ENV || "development";
function hashFingerprint(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

const DB_FINGERPRINT = (() => {
  const url = process.env.DATABASE_URL || "";
  if (!url) return "no-db";
  try {
    // Extract host/database from postgres://user:pass@host:port/dbname?params
    const match = url.match(/@([^:/]+)(?::\d+)?\/([^?]+)/);
    if (!match) return hashFingerprint(url).slice(0, 16);
    return hashFingerprint(`${match[1]}/${match[2]}`).slice(0, 16);
  } catch {
    return "fingerprint-error";
  }
})();

console.info(`[Startup] ${SERVICE_NAME} process started`, {
  service: SERVICE_NAME,
  commitSha: COMMIT_SHA,
  hostname: HOSTNAME,
  pid: PROCESS_PID,
  nodeEnv: NODE_ENV,
  dbFingerprint: DB_FINGERPRINT,
  iaExecutionMode: process.env.IA_EXECUTION_MODE || "remote",
  iaBackendUrl: process.env.IA_BACKEND_URL || "(not set)",
  port: process.env.PORT || "(not set)",
});

// ── helpers ──────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, X-Shopify-Shop-Domain, ngrok-skip-browser-warning, X-FluxBot-Trace-Id",
};

type ProxyProductRecommendation = {
  title: string;
  price?: string;
  url: string;
  image?: string;
  handle: string;
  productId: string;
  variantId?: string;
};

function extractRecommendedProducts(
  actions: Array<Record<string, unknown>> | undefined,
): ProxyProductRecommendation[] {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions
    .filter((action) => {
      const type = String(action?.type ?? "").toLowerCase();
      return type === "product_recommend";
    })
    .flatMap((action: any) => {
      if (Array.isArray(action.products)) {
        return action.products;
      }

      if (
        action.payload &&
        typeof action.payload === "object" &&
        Array.isArray(action.payload.products)
      ) {
        return action.payload.products;
      }

      return [];
    });
}

function buildAssistantMetadata(
  chatResponse: {
    toolsUsed?: unknown;
    sourceReferences?: unknown;
  },
  products: ProxyProductRecommendation[],
): Prisma.InputJsonValue | undefined {
  const metadata: Record<string, unknown> = {};

  if (Array.isArray(chatResponse.toolsUsed) && chatResponse.toolsUsed.length > 0) {
    metadata.toolsUsed = chatResponse.toolsUsed;
  }

  if (
    Array.isArray(chatResponse.sourceReferences) &&
    chatResponse.sourceReferences.length > 0
  ) {
    metadata.sourceReferences = chatResponse.sourceReferences;
  }

  if (products.length > 0) {
    metadata.products = products;
  }

  if (Object.keys(metadata).length === 0) {
    return undefined;
  }

  // Strip undefined values recursively to keep Prisma JSON input valid.
  return JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue;
}

function json(data: unknown, init?: ResponseInit, traceId?: string) {
  return new Response(JSON.stringify(data), {
    status: 200,
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "X-FluxBot-Service": SERVICE_NAME,
      "X-FluxBot-Commit": COMMIT_SHA,
      "X-FluxBot-Hostname": HOSTNAME,
      "X-FluxBot-Process": String(PROCESS_PID),
      "X-FluxBot-Db-Fingerprint": DB_FINGERPRINT,
      ...(traceId ? { "X-FluxBot-Trace-Id": traceId } : {}),
      ...CORS_HEADERS,
      ...init?.headers,
    },
  });
}

function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function expandProductQuery(query: string): string[] {
  const normalized = normalizeSearchText(query);
  const terms = new Set(
    normalized
      .split(/[^a-z0-9]+/i)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3),
  );

  const synonymGroups = [
    ["snowboarding", "snowboard", "snow", "nieve", "ski", "esqui", "deportes de nieve"],
    ["deporte", "deportes", "extremo", "extremos", "skate", "snowboard", "proteccion", "casco", "rodilleras", "accesorios"],
    ["skateboarding", "skate", "skateboard", "tabla"],
    ["proteccion", "casco", "rodilleras", "coderas", "guantes"],
  ];

  for (const group of synonymGroups) {
    if (group.some((term) => normalized.includes(term))) {
      group.forEach((term) => terms.add(term));
    }
  }

  return Array.from(terms);
}

function isProductSeekingProxyMessage(message: string, history: Array<{ role: string; content: string }>): boolean {
  const terms = [
    "producto",
    "productos",
    "catalogo",
    "venden",
    "vendes",
    "tienen",
    "tienes",
    "deporte",
    "deportes",
    "extremo",
    "extremos",
    "snowboard",
    "snowboarding",
    "snow",
    "nieve",
    "ski",
    "esqui",
    "skate",
    "skateboard",
    "proteccion",
    "casco",
    "rodilleras",
    "coderas",
    "guantes",
    "accesorios",
  ];
  const current = normalizeSearchText(message);
  if (terms.some((term) => current.includes(term))) return true;

  return history.slice(-4).some((item) => {
    if (item.role !== "USER" && item.role !== "user") return false;
    const content = normalizeSearchText(item.content);
    return terms.some((term) => content.includes(term));
  });
}

function asArray(value: unknown): Array<Record<string, any>> {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Array<Record<string, any>> : [];
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function productSearchText(product: {
  title: string;
  handle: string;
  description: string | null;
  vendor: string | null;
  productType: string | null;
  metadata: unknown;
}): string {
  const metadata = product.metadata && typeof product.metadata === "object" ? product.metadata as Record<string, unknown> : {};
  return normalizeSearchText([
    product.title,
    product.handle,
    product.description,
    product.vendor,
    product.productType,
    metadata.title,
    metadata.productType,
    metadata.tags,
    metadata.collections,
  ].flat().join(" "));
}

function scoreProduct(product: Parameters<typeof productSearchText>[0], terms: string[]): number {
  const text = productSearchText(product);
  const title = normalizeSearchText(product.title);
  const handle = normalizeSearchText(product.handle);
  const productType = normalizeSearchText(product.productType);

  return terms.reduce((score, term) => {
    if (!term) return score;
    if (title.includes(term)) return score + 6;
    if (handle.includes(term)) return score + 5;
    if (productType.includes(term)) return score + 4;
    if (text.includes(term)) return score + 2;
    return score;
  }, 0);
}

function isVariantPurchasable(variant: Record<string, any>): boolean {
  const availableForSale = asBoolean(variant.availableForSale);
  if (availableForSale === false) return false;
  if (availableForSale === true) return true;

  const inventoryPolicy = firstString(variant.inventoryPolicy, variant.inventory_policy)?.toUpperCase();
  if (inventoryPolicy === "CONTINUE") return true;

  const inventoryManaged = firstString(variant.inventoryManagement, variant.inventory_management);
  if (!inventoryManaged || inventoryManaged === "null") return true;

  const inventoryQuantity = asNumber(variant.inventoryQuantity ?? variant.inventory_quantity);
  if (typeof inventoryQuantity === "number") return inventoryQuantity > 0;

  return false;
}

function selectFirstPurchasableVariant(variants: Array<Record<string, any>>): Record<string, any> | null {
  if (!variants.length) return null;
  return variants.find((variant) => isVariantPurchasable(variant)) ?? null;
}

function isProductPublishable(product: {
  metadata: unknown;
  variants: unknown;
}): boolean {
  const metadata =
    product.metadata && typeof product.metadata === "object"
      ? (product.metadata as Record<string, unknown>)
      : {};

  const status = firstString(metadata.status)?.toUpperCase();
  if (status === "ARCHIVED" || status === "DRAFT") return false;

  const published = asBoolean(metadata.published ?? metadata.publishedOnCurrentPublication);
  if (published === false) return false;

  const variants = asArray(product.variants);
  if (!variants.length) return false;
  return selectFirstPurchasableVariant(variants) !== null;
}

function toProxyProduct(product: {
  productId: string;
  handle: string;
  title: string;
  variants: unknown;
  images: unknown;
  metadata: unknown;
}): ProxyProductRecommendation {
  const variants = asArray(product.variants);
  const images = asArray(product.images);
  const firstVariant = selectFirstPurchasableVariant(variants) ?? {};
  const firstImage = images[0] ?? {};
  const price = firstString(
    firstVariant.price,
    firstVariant.displayPrice,
    firstVariant.compareAtPrice,
  );

  return {
    title: product.title,
    price,
    url: `/products/${product.handle}`,
    image: firstString(firstImage.url, firstImage.src, firstImage.originalSrc, firstImage.transformedSrc),
    handle: product.handle,
    productId: product.productId,
    variantId: firstString(firstVariant.id, firstVariant.admin_graphql_api_id, firstVariant.variantId),
  };
}

async function searchProxyCatalogProducts(params: {
  shopId: string;
  message: string;
  history: Array<{ role: string; content: string }>;
}): Promise<ProxyProductRecommendation[]> {
  if (!isProductSeekingProxyMessage(params.message, params.history)) return [];

  const contextualQuery = [
    ...params.history
      .filter((item) => item.role === "USER" || item.role === "user")
      .slice(-3)
      .map((item) => item.content),
    params.message,
  ].join(" ");
  const terms = expandProductQuery(contextualQuery);

  const products = await prisma.productProjection.findMany({
    where: {
      shopId: params.shopId,
      deletedAt: null,
    },
    orderBy: { syncedAt: "desc" },
    take: 250,
    select: {
      productId: true,
      handle: true,
      title: true,
      description: true,
      vendor: true,
      productType: true,
      variants: true,
      images: true,
      metadata: true,
    },
  });

  return products
    .map((product) => ({ product, score: scoreProduct(product, terms) }))
    .filter(({ product, score }) => score > 0 && isProductPublishable(product))
    .sort((a, b) => b.score - a.score || a.product.title.localeCompare(b.product.title))
    .slice(0, 3)
    .map(({ product }) => toProxyProduct(product));
}

// ── loader (GET — not used, but needs a response) ────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyShopifyProxyRequest(request, { allowUnsignedInDevelopment: true })) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  return json({ ok: true });
}

// ── action (POST — chat message from storefront widget) ──────────────────────

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return preflight();
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!verifyShopifyProxyRequest(request, { allowUnsignedInDevelopment: true })) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // W7 — Extract traceId from widget header or body
    const traceId =
      request.headers.get("X-FluxBot-Trace-Id") ||
      (body && typeof body.traceId === "string" ? body.traceId : "") ||
      `PROXY-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    console.info("[ProxyChat] action start", {
      traceId,
      url: request.url,
      method: request.method,
    });
    const {
      message,
      conversationId,
      visitorId,
      customerId,
      sessionId,
      locale,
      context = {},
    } = body as Record<string, any>;

    const url = new URL(request.url);
    // Shopify injects the shop domain as a query param on proxied requests.
    // Only trust proxy-authenticated sources — never the request body.
    const shopDomain =
      url.searchParams.get("shop") ||
      request.headers.get("X-Shopify-Shop-Domain") ||
      "";

    if (!shopDomain) {
      return json({ success: false, error: "Missing shop identifier" }, { status: 400 }, traceId);
    }

    console.info("[ProxyChat] shopDomain resuelto", { traceId, shopDomain });

    if (!message?.trim()) {
      return json({ success: false, error: "Message is required" }, { status: 400 }, traceId);
    }

    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) {
      return json({ success: false, error: "Shop not found" }, { status: 404 }, traceId);
    }
    const adminConfig = await getMerchantAdminConfig(shop.id);

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!conversation || conversation.shopId !== shop.id) {
        return json({ success: false, error: "Conversation not found" }, { status: 404 }, traceId);
      }
    } else {
      const initialLocale = resolveEffectiveLocale({
        primaryBotLanguage: adminConfig.primaryBotLanguage,
        supportedLanguages: adminConfig.supportedLanguages,
        requestLocale: locale,
        storefrontLocale: context.locale,
      });
      conversation = await prisma.conversation.create({
        data: {
          shopId: shop.id,
          channel: "WEB_CHAT",
          visitorId: visitorId ?? context.visitorId,
          customerId: customerId ?? context.customerId,
          sessionId: sessionId ?? context.sessionId,
          locale: initialLocale,
          status: "ACTIVE",
        },
        include: { messages: true },
      });
    }

    const effectiveLocale = resolveEffectiveLocale({
      primaryBotLanguage: adminConfig.primaryBotLanguage,
      supportedLanguages: adminConfig.supportedLanguages,
      requestLocale: locale,
      storefrontLocale: context.locale,
      conversationLocale: conversation.locale,
    });

    if (conversation.locale !== effectiveLocale) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { locale: effectiveLocale },
      });
    }

    const gateway = getIAGateway();
    console.info("[ProxyChat] llamando backend IA", {
      traceId,
      shopDomain,
      conversationId: conversationId || conversation.id,
      gatewayType: gateway.constructor.name,
    });
    const chatResponse = await gateway.chat(
      {
        message,
        conversationId: conversationId || conversation.id,
        shopId: shop.id,
        locale: effectiveLocale,
        channel: "SHOPIFY_PROXY",
        traceId,
      },
      shopDomain,
    );

    console.info("[ProxyChat] gateway.chat done", {
      traceId,
      shopDomain,
      conversationId: conversationId || conversation.id,
      confidence: chatResponse.confidence,
      requiresEscalation: chatResponse.requiresEscalation,
    });

    const backendProducts = extractRecommendedProducts(chatResponse.actions);
    const proxyFallbackProducts = backendProducts.length > 0
      ? []
      : await searchProxyCatalogProducts({
          shopId: shop.id,
          message,
          history: (conversation.messages ?? []).map((item: any) => ({
            role: item.role,
            content: item.content,
          })),
        });
    const productRecommendations = backendProducts.length > 0 ? backendProducts : proxyFallbackProducts;
    const resolvedMessage = proxyFallbackProducts.length > 0
      ? getCatalogFallbackMessage(effectiveLocale, proxyFallbackProducts.length)
      : chatResponse.message;
    const actions = productRecommendations.length > 0 && backendProducts.length === 0
      ? [
          ...(chatResponse.actions ?? []),
          {
            type: "product_recommend",
            products: productRecommendations,
            source: "shopify_proxy_catalog_fallback",
          },
        ]
      : chatResponse.actions;

    console.info("[ProxyChat] product recommendations resolved", {
      traceId,
      shopDomain,
      backendProductCount: backendProducts.length,
      proxyFallbackProductCount: proxyFallbackProducts.length,
      returnedProductCount: productRecommendations.length,
    });

    // Persist messages
    await prisma.conversationMessage.create({
      data: { conversationId: conversation.id, role: "USER", content: message },
    });
    if (resolvedMessage) {
      const assistantMetadata = buildAssistantMetadata(chatResponse, productRecommendations);
      const traceMetadata = assistantMetadata
        ? { ...(assistantMetadata as Record<string, unknown>), traceId }
        : { traceId };
      await prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: resolvedMessage,
          confidence: chatResponse.confidence,
          metadata: JSON.parse(JSON.stringify(traceMetadata)) as Prisma.InputJsonValue,
        },
      });
    }

    return json({
      success: true,
      conversationId: conversation.id,
      message: resolvedMessage,
      confidence: chatResponse.confidence,
      requiresEscalation: chatResponse.requiresEscalation,
      actions,
      // Products surfaced via metadata so the widget's existing metadata.products handler works
      metadata: {
        products: productRecommendations,
        catalogSource:
          backendProducts.length > 0
            ? "ia_backend"
            : proxyFallbackProducts.length > 0
              ? "shopify_proxy_catalog_fallback"
              : "none",
      },
      sourceReferences: chatResponse.sourceReferences,
      traceId,
    }, undefined, traceId);
  } catch (error) {
    console.error("[ProxyChat] Error:", error);
    return json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
