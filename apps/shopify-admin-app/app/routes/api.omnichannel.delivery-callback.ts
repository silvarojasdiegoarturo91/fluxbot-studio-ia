/**
 * Omnichannel Delivery Callback API - Phase 3
 *
 * Receives delivery status callbacks from omnichannel bridge providers.
 */

import type { ActionFunctionArgs } from "react-router";
import type { Prisma } from "@prisma/client";
import crypto from "crypto";
import prisma from "../db.server";
import { ProactiveMessagingService } from "../services/proactive-messaging.server";

interface DeliveryCallbackBody {
  messageId?: string;
  status?: string;
  providerMessageId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface SignatureVerificationSuccess {
  ok: true;
  timestamp: number;
  normalizedSignature: string;
}

interface SignatureVerificationFailure {
  ok: false;
  error: string;
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

function normalizeCallbackStatus(status: string): "SENT" | "DELIVERED" | "FAILED" {
  const normalized = status.toUpperCase();
  if (normalized === "DELIVERED") return "DELIVERED";
  if (normalized === "SENT" || normalized === "QUEUED") return "SENT";
  return "FAILED";
}

type CallbackControlledStatus = "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "CONVERTED";

function normalizeCurrentStatus(status: string): CallbackControlledStatus {
  const normalized = status.toUpperCase();
  if (normalized === "QUEUED") return "QUEUED";
  if (normalized === "SENT") return "SENT";
  if (normalized === "DELIVERED") return "DELIVERED";
  if (normalized === "FAILED") return "FAILED";
  if (normalized === "CONVERTED") return "CONVERTED";
  return "FAILED";
}

function resolveStatusTransition(params: {
  currentStatus: CallbackControlledStatus;
  requestedStatus: "SENT" | "DELIVERED" | "FAILED";
}): { shouldApply: boolean; nextStatus: CallbackControlledStatus; reason: string } {
  const { currentStatus, requestedStatus } = params;

  if (requestedStatus === "DELIVERED") {
    if (currentStatus === "DELIVERED" || currentStatus === "CONVERTED") {
      return {
        shouldApply: false,
        nextStatus: currentStatus,
        reason: "Duplicate or stale delivered callback",
      };
    }

    return {
      shouldApply: true,
      nextStatus: "DELIVERED",
      reason: "Delivery confirmation accepted",
    };
  }

  if (requestedStatus === "SENT") {
    if (currentStatus === "QUEUED") {
      return {
        shouldApply: true,
        nextStatus: "SENT",
        reason: "Send acknowledgement accepted",
      };
    }

    return {
      shouldApply: false,
      nextStatus: currentStatus,
      reason: "Send callback ignored due to current status",
    };
  }

  if (currentStatus === "QUEUED" || currentStatus === "SENT") {
    return {
      shouldApply: true,
      nextStatus: "FAILED",
      reason: "Failure callback accepted",
    };
  }

  return {
    shouldApply: false,
    nextStatus: currentStatus,
    reason: "Failure callback ignored because message already finalized",
  };
}

function getCallbackSecret(): string | null {
  const secret =
    process.env.OMNICHANNEL_BRIDGE_WEBHOOK_SECRET ||
    process.env.OMNICHANNEL_BRIDGE_TOKEN ||
    null;

  if (!secret) return null;
  const trimmed = secret.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getMaxSkewSeconds(): number {
  const raw = process.env.OMNICHANNEL_CALLBACK_MAX_AGE_SECONDS;
  if (!raw) return 300;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 300;
  }

  return Math.floor(parsed);
}

function stripSignaturePrefix(signature: string): string {
  if (signature.startsWith("sha256=")) {
    return signature.slice("sha256=".length);
  }

  return signature;
}

function safeEquals(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeChannel(value: string): string {
  return value.trim().toUpperCase();
}

function getMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | null {
  if (!metadata) return null;

  const value = metadata[key];
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildCallbackEventKey(params: {
  messageId: string;
  requestedStatus: "SENT" | "DELIVERED" | "FAILED";
  providerMessageId: string | null;
  callbackTimestamp: number;
  signatureDigest: string;
  originChannel: string;
}): string {
  const payload = [
    params.messageId,
    params.requestedStatus,
    params.providerMessageId || "",
    String(params.callbackTimestamp),
    params.signatureDigest,
    params.originChannel,
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: string };
  return candidate.code === "P2002";
}

function verifyCallbackSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  secret: string;
}): SignatureVerificationSuccess | SignatureVerificationFailure {
  const { rawBody, signatureHeader, timestampHeader, secret } = params;

  if (!signatureHeader || !timestampHeader) {
    return { ok: false, error: "Missing callback signature headers" };
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, error: "Invalid callback timestamp" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const maxSkewSeconds = getMaxSkewSeconds();
  if (Math.abs(nowSeconds - timestamp) > maxSkewSeconds) {
    return { ok: false, error: "Callback timestamp outside accepted window" };
  }

  const payloadToSign = `${timestampHeader}.${rawBody}`;
  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(payloadToSign)
    .digest("hex");

  const expectedBase64 = crypto
    .createHmac("sha256", secret)
    .update(payloadToSign)
    .digest("base64");

  const received = stripSignaturePrefix(signatureHeader.trim());
  if (safeEquals(received, expectedHex) || safeEquals(received, expectedBase64)) {
    return {
      ok: true,
      timestamp,
      normalizedSignature: received,
    };
  }

  return { ok: false, error: "Invalid callback signature" };
}

/**
 * POST /api/omnichannel/delivery-callback
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const callbackSecret = getCallbackSecret();
    if (!callbackSecret) {
      return json(
        {
          success: false,
          error: "Callback verification secret is not configured",
        },
        { status: 503 }
      );
    }

    const rawBody = await request.text();
    const signatureVerification = verifyCallbackSignature({
      rawBody,
      signatureHeader: request.headers.get("X-Omnichannel-Signature"),
      timestampHeader: request.headers.get("X-Omnichannel-Timestamp"),
      secret: callbackSecret,
    });

    if (!signatureVerification.ok) {
      return json(
        {
          success: false,
          error: signatureVerification.error,
        },
        { status: 401 }
      );
    }

    let body: DeliveryCallbackBody;
    try {
      body = JSON.parse(rawBody) as DeliveryCallbackBody;
    } catch {
      return json(
        {
          success: false,
          error: "Invalid JSON payload",
        },
        { status: 400 }
      );
    }

    const messageId = body.messageId;
    const status = body.status;

    if (!messageId || !status) {
      return json(
        {
          success: false,
          error: "messageId and status are required",
        },
        { status: 400 }
      );
    }

    const proactiveMessage = await prisma.proactiveMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        shopId: true,
        channel: true,
        status: true,
        shop: {
          select: {
            domain: true,
          },
        },
      },
    });

    if (!proactiveMessage) {
      return json({ success: false, error: "message not found" }, { status: 404 });
    }

    const normalizedStatus = normalizeCallbackStatus(status);

    const metadata = body.metadata;
    const originShopDomain =
      request.headers.get("X-Omnichannel-Shop-Domain") ||
      getMetadataString(metadata, "shopDomain") ||
      getMetadataString(metadata, "shop") ||
      null;

    if (!originShopDomain) {
      return json(
        {
          success: false,
          error: "Missing callback shop domain",
        },
        { status: 400 }
      );
    }

    if (normalizeDomain(originShopDomain) !== normalizeDomain(proactiveMessage.shop.domain)) {
      return json(
        {
          success: false,
          error: "Callback shop domain mismatch",
        },
        { status: 403 }
      );
    }

    const originChannel =
      request.headers.get("X-Omnichannel-Channel") ||
      getMetadataString(metadata, "channel") ||
      null;

    if (!originChannel) {
      return json(
        {
          success: false,
          error: "Missing callback channel",
        },
        { status: 400 }
      );
    }

    if (normalizeChannel(originChannel) !== normalizeChannel(proactiveMessage.channel)) {
      return json(
        {
          success: false,
          error: "Callback channel mismatch",
        },
        { status: 403 }
      );
    }

    const signatureDigest = crypto
      .createHash("sha256")
      .update(signatureVerification.normalizedSignature)
      .digest("hex");

    const eventKey = buildCallbackEventKey({
      messageId,
      requestedStatus: normalizedStatus,
      providerMessageId: body.providerMessageId || null,
      callbackTimestamp: signatureVerification.timestamp,
      signatureDigest,
      originChannel: normalizeChannel(originChannel),
    });

    let receiptId: string | null = null;
    try {
      const receipt = await prisma.omnichannelCallbackReceipt.create({
        data: {
          shopId: proactiveMessage.shopId,
          messageId,
          eventKey,
          providerMessageId: body.providerMessageId || null,
          requestedStatus: normalizedStatus,
          callbackTimestamp: signatureVerification.timestamp,
          signatureDigest,
          applied: false,
        },
      });

      receiptId = receipt.id;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        await prisma.auditLog.create({
          data: {
            shopId: proactiveMessage.shopId,
            action: "PROACTIVE_DELIVERY_CALLBACK_IGNORED",
            entityType: "PROACTIVE_MESSAGE",
            entityId: proactiveMessage.id,
            changes: {
              requestedStatus: normalizedStatus,
              previousStatus: normalizeCurrentStatus(proactiveMessage.status),
              resultingStatus: normalizeCurrentStatus(proactiveMessage.status),
              applied: false,
              duplicate: true,
              reason: "Duplicate callback event key",
              eventKey,
              providerMessageId: body.providerMessageId || null,
              channel: proactiveMessage.channel,
            } as Prisma.InputJsonValue,
          },
        });

        return json({
          success: true,
          messageId,
          status: normalizeCurrentStatus(proactiveMessage.status),
          requestedStatus: normalizedStatus,
          applied: false,
          duplicate: true,
        });
      }

      throw error;
    }

    const currentStatus = normalizeCurrentStatus(proactiveMessage.status);
    const transition = resolveStatusTransition({
      currentStatus,
      requestedStatus: normalizedStatus,
    });

    if (transition.shouldApply) {
      if (normalizedStatus === "DELIVERED") {
        await ProactiveMessagingService.markAsDelivered(messageId);
      } else if (normalizedStatus === "SENT") {
        await ProactiveMessagingService.markAsSent(messageId);
      } else {
        await ProactiveMessagingService.markAsFailed(
          messageId,
          body.error || "Delivery failed via callback"
        );
      }
    }

    if (receiptId) {
      await prisma.omnichannelCallbackReceipt.update({
        where: { id: receiptId },
        data: {
          applied: transition.shouldApply,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        shopId: proactiveMessage.shopId,
        action: transition.shouldApply
          ? "PROACTIVE_DELIVERY_CALLBACK_APPLIED"
          : "PROACTIVE_DELIVERY_CALLBACK_IGNORED",
        entityType: "PROACTIVE_MESSAGE",
        entityId: proactiveMessage.id,
        changes: {
          requestedStatus: normalizedStatus,
          previousStatus: currentStatus,
          resultingStatus: transition.nextStatus,
          applied: transition.shouldApply,
          reason: transition.reason,
          eventKey,
          receiptId,
          originShopDomain: normalizeDomain(originShopDomain),
          originChannel: normalizeChannel(originChannel),
          channel: proactiveMessage.channel,
          providerMessageId: body.providerMessageId || null,
          error: body.error || null,
          metadata: body.metadata || {},
        } as Prisma.InputJsonValue,
      },
    });

    return json({
      success: true,
      messageId,
      status: transition.nextStatus,
      requestedStatus: normalizedStatus,
      applied: transition.shouldApply,
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process callback",
      },
      { status: 500 }
    );
  }
}
