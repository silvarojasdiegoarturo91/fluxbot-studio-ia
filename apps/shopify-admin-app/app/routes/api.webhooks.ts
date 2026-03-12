/**
 * Webhook Handler — central route for all Shopify webhook topics.
 *
 * Covered topics:
 *   products/create, products/update, products/delete  — catalog sync
 *   collections/create, collections/update             — catalog sync
 *   pages/create, pages/update                         — knowledge ingestion
 *   orders/paid, orders/fulfilled                      — conversion attribution + OrderProjection (C4)
 *   app/uninstalled                                    — shop lifecycle
 *   shop/update                                        — shop metadata
 */

import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { WebhookHandlers } from "../services/sync-service.server";
import { AnalyticsService } from "../services/analytics.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

function isSignedRequest(request: Request): boolean {
  return !!request.headers.get("X-Shopify-Hmac-Sha256");
}

async function handleOrderPaid(shopId: string, payload: any): Promise<void> {
  const orderId = String(payload.id ?? "");
  const totalPrice = parseFloat(payload.total_price ?? "0");
  const customerId = payload.customer?.id ? String(payload.customer.id) : undefined;
  if (!orderId || totalPrice <= 0) return;

  await AnalyticsService.attributeOrder(shopId, customerId, orderId, totalPrice);

  // Upsert into OrderProjection so order lookup can find the order (C4)
  const orderNumber = String(payload.order_number ?? payload.name ?? orderId);
  const lineItems = Array.isArray(payload.line_items)
    ? payload.line_items.map((li: any) => ({
        id: String(li.id),
        title: li.title,
        quantity: li.quantity,
        price: li.price,
        variantId: li.variant_id ? String(li.variant_id) : null,
        productId: li.product_id ? String(li.product_id) : null,
      }))
    : [];

  await prisma.orderProjection.upsert({
    where: { shopId_orderId: { shopId, orderId } },
    create: {
      shopId,
      orderId,
      orderNumber,
      customerId,
      email: payload.email ?? null,
      financialStatus: payload.financial_status ?? null,
      fulfillmentStatus: payload.fulfillment_status ?? null,
      totalPrice: String(payload.total_price ?? ""),
      lineItems,
      data: payload,
    },
    update: {
      orderNumber,
      customerId,
      email: payload.email ?? null,
      financialStatus: payload.financial_status ?? null,
      fulfillmentStatus: payload.fulfillment_status ?? null,
      totalPrice: String(payload.total_price ?? ""),
      lineItems,
      data: payload,
      syncedAt: new Date(),
    },
  });
}

async function handleAppUninstalled(shopId: string): Promise<void> {
  await prisma.shop
    .update({ where: { id: shopId }, data: { status: "CANCELLED" } })
    .catch(() => {});
  console.log("[Webhooks] Shop " + shopId + " uninstalled — marked CANCELLED");
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    if (!isSignedRequest(request)) {
      return json({ error: "Invalid signature" }, { status: 401 });
    }

    const topic = request.headers.get("X-Shopify-Topic");
    const shopDomain = request.headers.get("X-Shopify-Shop-Domain");

    if (!topic || !shopDomain) {
      return json({ error: "Missing required headers" }, { status: 400 });
    }

    const payload = await request.json();

    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) {
      return json({ error: "Shop not found" }, { status: 404 });
    }

    await prisma.webhookEvent.create({
      data: { shopId: shop.id, topic, payload, processed: false },
    });

    switch (topic) {
      case "products/create":
      case "products/update":
        await WebhookHandlers.handleProductUpdate(shop.id, payload);
        break;
      case "products/delete":
        await WebhookHandlers.handleProductDelete(shop.id, payload);
        break;
      case "collections/create":
      case "collections/update":
        await WebhookHandlers.handleCollectionUpdate(shop.id, payload);
        break;
      case "pages/create":
      case "pages/update":
        await WebhookHandlers.handlePageUpdate(shop.id, payload);
        break;
      case "orders/paid":
      case "orders/fulfilled":
        await handleOrderPaid(shop.id, payload);
        break;
      case "app/uninstalled":
        await handleAppUninstalled(shop.id);
        break;
      case "shop/update":
        if (payload.name) {
          await prisma.shop
            .update({ where: { id: shop.id }, data: { metadata: payload } })
            .catch(() => {});
        }
        break;
      default:
        console.log("[Webhooks] Unhandled topic: " + topic);
    }

    await prisma.webhookEvent.updateMany({
      where: { shopId: shop.id, topic, processed: false },
      data: { processed: true, processedAt: new Date() },
    });

    return json({ success: true });
  } catch (error) {
    console.error("[Webhooks] Processing error:", error);
    return json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
