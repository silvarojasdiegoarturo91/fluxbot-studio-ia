/**
 * App Proxy — Chat endpoint
 * Route: /apps/fluxbot/chat  (proxied by Shopify via app_proxy config)
 *
 * Shopify signs every proxy request with HMAC-SHA256.
 * We verify the signature, then delegate to the same logic used by api.chat.ts.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { getIAGateway } from "../services/ia-gateway.server";
import { verifyShopifyProxyRequest } from "../services/shopify-proxy-auth.server";

// ── helpers ──────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, X-Shopify-Shop-Domain, ngrok-skip-browser-warning",
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

function buildAssistantMetadata(chatResponse: {
  toolsUsed?: unknown;
  sourceReferences?: unknown;
}): Prisma.InputJsonValue | undefined {
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

  if (Object.keys(metadata).length === 0) {
    return undefined;
  }

  // Strip undefined values recursively to keep Prisma JSON input valid.
  return JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue;
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
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

function toProxyProduct(product: {
  productId: string;
  handle: string;
  title: string;
  variants: unknown;
  images: unknown;
}): ProxyProductRecommendation {
  const variants = asArray(product.variants);
  const images = asArray(product.images);
  const firstVariant = variants[0] ?? {};
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
    .filter(({ score }) => score > 0)
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
    console.info("[ProxyChat] action start", {
      url: request.url,
      method: request.method,
    });

    const body = await request.json();
    const {
      message,
      conversationId,
      visitorId,
      customerId,
      sessionId,
      locale = "en",
      context = {},
    } = body as Record<string, any>;

    const url = new URL(request.url);
    // Shopify injects the shop domain as a query param on proxied requests
    const shopDomain =
      url.searchParams.get("shop") ||
      request.headers.get("X-Shopify-Shop-Domain") ||
      context.shop ||
      context.shopDomain ||
      (typeof body.shop === "string" ? body.shop : "") ||
      (typeof body.shopDomain === "string" ? body.shopDomain : "") ||
      "";

    if (!shopDomain) {
      return json({ success: false, error: "Missing shop identifier" }, { status: 400 });
    }

    if (!message?.trim()) {
      return json({ success: false, error: "Message is required" }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) {
      return json({ success: false, error: "Shop not found" }, { status: 404 });
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!conversation || conversation.shopId !== shop.id) {
        return json({ success: false, error: "Conversation not found" }, { status: 404 });
      }
    } else {
      conversation = await prisma.conversation.create({
        data: {
          shopId: shop.id,
          channel: "WEB_CHAT",
          visitorId: visitorId ?? context.visitorId,
          customerId: customerId ?? context.customerId,
          sessionId: sessionId ?? context.sessionId,
          locale,
          status: "ACTIVE",
        },
        include: { messages: true },
      });
    }

    const gateway = getIAGateway();
    console.info("[ProxyChat] gateway.chat start", {
      shopDomain,
      conversationId: conversationId || conversation.id,
    });
    const chatResponse = await gateway.chat(
      {
        message,
        conversationId: conversationId || conversation.id,
        shopId: shop.id,
        locale,
        channel: "SHOPIFY_PROXY",
      },
      shopDomain,
    );

    console.info("[ProxyChat] gateway.chat done", {
      shopDomain,
      conversationId: conversationId || conversation.id,
      confidence: chatResponse.confidence,
      requiresEscalation: chatResponse.requiresEscalation,
    });

    const backendProducts = chatResponse.actions
      ?.filter((a: any) => a.type === "product_recommend")
      .flatMap((a: any) => a.products ?? []) ?? [];
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
      shopDomain,
      backendProductCount: backendProducts.length,
      proxyFallbackProductCount: proxyFallbackProducts.length,
      returnedProductCount: productRecommendations.length,
    });

    // Persist messages
    await prisma.conversationMessage.create({
      data: { conversationId: conversation.id, role: "USER", content: message },
    });
    if (chatResponse.message) {
      const assistantMetadata = buildAssistantMetadata(chatResponse);
      await prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: chatResponse.message,
          confidence: chatResponse.confidence,
          ...(assistantMetadata ? { metadata: assistantMetadata } : {}),
        },
      });
    }

    return json({
      success: true,
      conversationId: conversation.id,
      message: chatResponse.message,
      confidence: chatResponse.confidence,
      requiresEscalation: chatResponse.requiresEscalation,
      actions,
      // Products surfaced via metadata so the widget's existing metadata.products handler works
      metadata: {
        products: productRecommendations,
      },
      sourceReferences: chatResponse.sourceReferences,
    });
  } catch (error) {
    console.error("[ProxyChat] Error:", error);
    return json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
