import type { Prisma } from "@prisma/client";
import { getConfig } from "../config.server";
import prisma from "../db.server";

export type OrderLookupVerificationMethod = "email" | "customerId" | "verifiedConversationIdentity";

export interface OrderLookupVerification {
  email?: string;
  customerId?: string;
}

export interface LookupOrderByShopDomainInput {
  shopDomain: string;
  orderRef: string;
  conversationId?: string;
  verification?: OrderLookupVerification;
}

export interface LookupOrderByShopIdInput {
  shopId: string;
  orderRef: string;
  conversationId?: string;
  verification?: OrderLookupVerification;
}

export interface OrderLookupResult {
  orderId: string;
  orderNumber: string;
  financialStatus?: string | null;
  fulfillmentStatus?: string | null;
  totalPrice?: string | null;
  lineItems?: unknown;
  syncedAt: Date;
  verifiedBy: OrderLookupVerificationMethod;
}

type OrderLookupErrorCode =
  | "FEATURE_DISABLED"
  | "SHOP_NOT_FOUND"
  | "ORDER_NOT_FOUND"
  | "CONVERSATION_NOT_FOUND"
  | "VERIFICATION_REQUIRED"
  | "VERIFICATION_FAILED";

export class OrderLookupError extends Error {
  constructor(
    public code: OrderLookupErrorCode,
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "OrderLookupError";
  }
}

interface ResolvedVerification {
  email?: string;
  customerId?: string;
  method?: OrderLookupVerificationMethod;
}

function normalizeShopDomain(shopDomain: string): string {
  return shopDomain.trim().toLowerCase();
}

function normalizeEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;

  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeCustomerId(customerId: string | undefined): string | undefined {
  if (!customerId) return undefined;

  const normalized = customerId.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOrderRef(orderRef: string): { raw: string; normalized: string } {
  const raw = orderRef.trim();
  const normalized = raw.replace(/^#/, "").trim();

  if (!normalized) {
    throw new OrderLookupError("ORDER_NOT_FOUND", "orderRef is required", 400);
  }

  return { raw, normalized };
}

function matchesOrderByEmail(orderEmail: string | null, email: string | undefined): boolean {
  if (!orderEmail || !email) return false;
  return orderEmail.trim().toLowerCase() === email;
}

function matchesOrderByCustomerId(
  orderCustomerId: string | null,
  customerId: string | undefined,
): boolean {
  if (!orderCustomerId || !customerId) return false;
  return orderCustomerId.trim() === customerId;
}

async function writeAuditLog(params: {
  shopId: string;
  action: string;
  entityId?: string;
  details: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        shopId: params.shopId,
        action: params.action,
        entityType: "ORDER_LOOKUP",
        entityId: params.entityId,
        changes: params.details as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Best-effort audit trail. Order lookup should still work if logging fails.
  }
}

async function resolveConversationVerification(params: {
  shopId: string;
  conversationId: string;
}): Promise<ResolvedVerification> {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: params.conversationId,
      shopId: params.shopId,
    },
    include: {
      customerIdentity: true,
    },
  });

  if (!conversation) {
    throw new OrderLookupError(
      "CONVERSATION_NOT_FOUND",
      "Conversation not found for order lookup",
      404,
    );
  }

  if (!conversation.customerIdentity?.verified) {
    return {};
  }

  return {
    email: normalizeEmail(conversation.customerIdentity.email || undefined),
    customerId: normalizeCustomerId(conversation.customerIdentity.customerId || undefined),
    method: "verifiedConversationIdentity",
  };
}

function resolveDirectVerification(
  verification: OrderLookupVerification | undefined,
): ResolvedVerification {
  const email = normalizeEmail(verification?.email);
  if (email) {
    return {
      email,
      method: "email",
    };
  }

  const customerId = normalizeCustomerId(verification?.customerId);
  if (customerId) {
    return {
      customerId,
      method: "customerId",
    };
  }

  return {};
}

async function persistVerifiedConversationIdentity(params: {
  conversationId?: string;
  verification: ResolvedVerification;
}) {
  if (!params.conversationId) return;
  if (!params.verification.method || params.verification.method === "verifiedConversationIdentity") return;

  try {
    await prisma.customerIdentity.upsert({
      where: { conversationId: params.conversationId },
      update: {
        email: params.verification.email,
        customerId: params.verification.customerId,
        verified: true,
        verificationMethod: params.verification.method,
      },
      create: {
        conversationId: params.conversationId,
        email: params.verification.email,
        customerId: params.verification.customerId,
        verified: true,
        verificationMethod: params.verification.method,
      },
    });
  } catch {
    // The lookup result is still valid even if we fail to persist the verified identity.
  }
}

export class OrderLookupService {
  static isEnabled(): boolean {
    return getConfig().features.orderLookup;
  }

  static async lookupByShopDomain(input: LookupOrderByShopDomainInput): Promise<OrderLookupResult> {
    if (!this.isEnabled()) {
      throw new OrderLookupError(
        "FEATURE_DISABLED",
        "Order lookup feature is disabled",
        403,
      );
    }

    const shop = await prisma.shop.findUnique({
      where: {
        domain: normalizeShopDomain(input.shopDomain),
      },
      select: {
        id: true,
      },
    });

    if (!shop) {
      throw new OrderLookupError("SHOP_NOT_FOUND", "Shop not found", 404);
    }

    return this.lookupByShopId({
      shopId: shop.id,
      orderRef: input.orderRef,
      conversationId: input.conversationId,
      verification: input.verification,
    });
  }

  static async lookupByShopId(input: LookupOrderByShopIdInput): Promise<OrderLookupResult> {
    if (!this.isEnabled()) {
      throw new OrderLookupError(
        "FEATURE_DISABLED",
        "Order lookup feature is disabled",
        403,
      );
    }

    const orderRef = normalizeOrderRef(input.orderRef);

    const order = await prisma.orderProjection.findFirst({
      where: {
        shopId: input.shopId,
        OR: [
          { orderId: orderRef.raw },
          { orderId: orderRef.normalized },
          { orderNumber: orderRef.raw },
          { orderNumber: orderRef.normalized },
        ],
      },
    });

    if (!order) {
      throw new OrderLookupError("ORDER_NOT_FOUND", "Order not found", 404);
    }

    const directVerification = resolveDirectVerification(input.verification);
    const conversationVerification = input.conversationId
      ? await resolveConversationVerification({
          shopId: input.shopId,
          conversationId: input.conversationId,
        })
      : {};

    const verification =
      conversationVerification.method === "verifiedConversationIdentity"
        ? conversationVerification
        : directVerification.method
          ? directVerification
          : conversationVerification;

    if (!verification.email && !verification.customerId) {
      await writeAuditLog({
        shopId: input.shopId,
        action: "ORDER_LOOKUP_DENIED",
        entityId: order.id,
        details: {
          reason: "verification_required",
          orderRef: orderRef.raw,
          conversationId: input.conversationId || null,
        },
      });

      throw new OrderLookupError(
        "VERIFICATION_REQUIRED",
        "Order lookup requires verified email or customer identity",
        400,
      );
    }

    const matches =
      matchesOrderByEmail(order.email || null, verification.email) ||
      matchesOrderByCustomerId(order.customerId || null, verification.customerId);

    if (!matches || !verification.method) {
      await writeAuditLog({
        shopId: input.shopId,
        action: "ORDER_LOOKUP_DENIED",
        entityId: order.id,
        details: {
          reason: "verification_failed",
          orderRef: orderRef.raw,
          conversationId: input.conversationId || null,
          verificationMethod: verification.method || null,
        },
      });

      throw new OrderLookupError(
        "VERIFICATION_FAILED",
        "Provided verification does not match this order",
        403,
      );
    }

    await persistVerifiedConversationIdentity({
      conversationId: input.conversationId,
      verification,
    });

    await writeAuditLog({
      shopId: input.shopId,
      action: "ORDER_LOOKUP_SUCCEEDED",
      entityId: order.id,
      details: {
        orderRef: orderRef.raw,
        orderNumber: order.orderNumber,
        conversationId: input.conversationId || null,
        verificationMethod: verification.method,
      },
    });

    return {
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      totalPrice: order.totalPrice,
      lineItems: order.lineItems,
      syncedAt: order.syncedAt,
      verifiedBy: verification.method,
    };
  }
}