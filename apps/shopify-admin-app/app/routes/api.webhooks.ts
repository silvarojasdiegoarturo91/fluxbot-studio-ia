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
import type { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { WebhookHandlers } from "../services/sync-service.server";
import { AnalyticsService } from "../services/analytics.server";
import { iaClient, type PrivacyOperation } from "../services/ia-backend.server";
import {
  completeDeletionJob,
  executeDataDeletion,
  initiateDataDeletion,
  initiateDataExport,
} from "../services/consent-management.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractCustomerId(payload: unknown): string | undefined {
  const customer = asRecord(asRecord(payload).customer);
  const customerId = customer.id;

  return typeof customerId === "string" || typeof customerId === "number"
    ? String(customerId)
    : undefined;
}

const COMPLIANCE_WEBHOOK_TOPICS = new Set([
  "customers/data_request",
  "customers/redact",
  "shop/redact",
  "CUSTOMERS_DATA_REQUEST",
  "CUSTOMERS_REDACT",
  "SHOP_REDACT",
]);

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

async function handleAppUninstalled(shopId: string, shopDomain: string): Promise<void> {
  // An uninstall starts a fresh tenant lifecycle. Redact the IA backend first so
  // a retry remains safe if local deletion is interrupted; SHOP_REDACT is
  // idempotent when the backend shop has already been removed.
  await iaClient.privacy.register({ operation: "SHOP_REDACT" }, shopDomain);

  // All tenant-owned records have cascade constraints from Shop. Sessions are
  // keyed by domain rather than shopId, so they must be explicitly removed.
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { shop: shopDomain } }),
    prisma.shop.delete({ where: { id: shopId } }),
  ]);

  console.log("[Webhooks] Shop " + shopId + " uninstalled — all tenant data redacted");
}

async function handleAppSubscriptionUpdate(shopId: string, payload: unknown): Promise<void> {
  const shopRecord = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { metadata: true, plan: true },
  });

  const existingMetadata = asRecord(shopRecord?.metadata);
  const nextMetadata = {
    ...existingMetadata,
    billing: {
      ...(asRecord(existingMetadata.billing) || {}),
      subscription: payload,
      updatedAt: new Date().toISOString(),
    },
  };
  const payloadRecord = asRecord(payload);
  const nextPlan = typeof payloadRecord.name === "string"
    ? payloadRecord.name
    : shopRecord?.plan;

  await prisma.shop.update({
    where: { id: shopId },
    data: {
      plan: typeof nextPlan === "string" ? nextPlan : shopRecord?.plan,
      metadata: nextMetadata as Prisma.InputJsonValue,
    },
  });
}

function getPrivacyOperation(topic: string): PrivacyOperation | null {
  switch (topic) {
    case "customers/data_request":
    case "CUSTOMERS_DATA_REQUEST":
      return "CUSTOMER_DATA_REQUEST";
    case "customers/redact":
    case "CUSTOMERS_REDACT":
      return "CUSTOMER_REDACT";
    case "shop/redact":
    case "SHOP_REDACT":
      return "SHOP_REDACT";
    default:
      return null;
  }
}

async function registerBackendPrivacyRequest(topic: string, shopDomain: string, payload: unknown): Promise<void> {
  const operation = getPrivacyOperation(topic);
  if (!operation) return;

  if (operation === "SHOP_REDACT") {
    await iaClient.privacy.register({ operation }, shopDomain);
    return;
  }

  const customerId = extractCustomerId(payload);
  if (!customerId) {
    throw new Error(`${operation} webhook is missing customer.id`);
  }

  await iaClient.privacy.register({ operation, customerId }, shopDomain);
}

async function handleCustomerDataRequest(shopId: string, shopDomain: string, payload: unknown): Promise<void> {
  await registerBackendPrivacyRequest("CUSTOMERS_DATA_REQUEST", shopDomain, payload);
  await initiateDataExport(shopId);
}

async function handleCustomerRedact(shopId: string, shopDomain: string, payload: unknown): Promise<void> {
  const customerId = extractCustomerId(payload);
  if (!customerId) {
    throw new Error("Customer redact webhook is missing customer.id");
  }

  await registerBackendPrivacyRequest("CUSTOMERS_REDACT", shopDomain, payload);
  const job = await initiateDataDeletion(shopId, customerId);
  const deletedCount = await executeDataDeletion(shopId, customerId);
  await completeDeletionJob(job.id, deletedCount);
}

async function handleShopRedact(shopId: string, shopDomain: string): Promise<void> {
  await registerBackendPrivacyRequest("SHOP_REDACT", shopDomain, {});
  const job = await initiateDataDeletion(shopId);
  const deletedCount = await executeDataDeletion(shopId);
  await completeDeletionJob(job.id, deletedCount);
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { topic, shop: shopDomain, payload } = await authenticate.webhook(request);

    if (!topic || !shopDomain) {
      return json({ error: "Missing required webhook context" }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) {
      // Shopify can validate mandatory privacy webhooks with a shop that has no
      // local record. A verified compliance request is idempotent: no record
      // means there is no local customer or shop data left to process.
      if (COMPLIANCE_WEBHOOK_TOPICS.has(topic)) {
        await registerBackendPrivacyRequest(topic, shopDomain, payload);
        console.info("[Webhooks] Compliance request received for unknown shop", {
          topic,
          shopDomain,
        });
        return json({ success: true });
      }

      return json({ error: "Shop not found" }, { status: 404 });
    }

    await prisma.webhookEvent.create({
      data: { shopId: shop.id, topic, payload, processed: false },
    });

    switch (topic) {
      case "products/create":
      case "products/update":
      case "PRODUCTS_CREATE":
      case "PRODUCTS_UPDATE":
        await WebhookHandlers.handleProductUpdate(shop.id, payload);
        break;
      case "products/delete":
      case "PRODUCTS_DELETE":
        await WebhookHandlers.handleProductDelete(shop.id, payload);
        break;
      case "collections/create":
      case "collections/update":
      case "COLLECTIONS_CREATE":
      case "COLLECTIONS_UPDATE":
        await WebhookHandlers.handleCollectionUpdate(shop.id, payload);
        break;
      case "pages/create":
      case "pages/update":
      case "PAGES_CREATE":
      case "PAGES_UPDATE":
        await WebhookHandlers.handlePageUpdate(shop.id, payload);
        break;
      case "orders/paid":
      case "orders/fulfilled":
      case "ORDERS_PAID":
      case "ORDERS_FULFILLED":
        await handleOrderPaid(shop.id, payload);
        break;
      case "app_subscriptions/update":
      case "APP_SUBSCRIPTIONS_UPDATE":
        await handleAppSubscriptionUpdate(shop.id, payload);
        break;
      case "APP_UNINSTALLED":
      case "app/uninstalled":
        await handleAppUninstalled(shop.id, shopDomain);
        break;
      case "customers/data_request":
      case "CUSTOMERS_DATA_REQUEST":
        await handleCustomerDataRequest(shop.id, shopDomain, payload);
        break;
      case "customers/redact":
      case "CUSTOMERS_REDACT":
        await handleCustomerRedact(shop.id, shopDomain, payload);
        break;
      case "shop/redact":
      case "SHOP_REDACT":
        await handleShopRedact(shop.id, shopDomain);
        break;
      case "shop/update":
      case "SHOP_UPDATE":
        if (payload.name) {
          const shopRecord = await prisma.shop.findUnique({
            where: { id: shop.id },
            select: { metadata: true },
          });
          const existingMetadata = asRecord(shopRecord?.metadata);
          const preservedAdminSetup = existingMetadata.adminSetup;
          const preservedWidgetPublishedAt = existingMetadata.widgetPublishedAt;
          const nextMetadata = {
            ...payload,
            ...(preservedAdminSetup ? { adminSetup: preservedAdminSetup } : {}),
            ...(typeof preservedWidgetPublishedAt === "string"
              ? { widgetPublishedAt: preservedWidgetPublishedAt }
              : {}),
          };

          await prisma.shop.update({
            where: { id: shop.id },
            data: { metadata: nextMetadata as Prisma.InputJsonValue },
          });
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
    if (error instanceof Response) {
      return error;
    }
    console.error("[Webhooks] Processing error:", error);
    return json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
