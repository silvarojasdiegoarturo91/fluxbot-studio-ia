/**
 * Unit Tests — api.omnichannel.delivery-callback.ts
 *
 * Complements test/integration/omnichannel-callback-route.test.ts by covering
 * the transition branches and error paths not exercised there:
 *  - QUEUED -> SENT callback applies markAsSent
 *  - FAILED callback already-finalized -> ignored
 *  - unknown status normalization -> FAILED with default error
 *  - base64 HMAC signatures accepted
 *  - invalid JSON payload / missing shop domain / missing channel
 *  - non-P2002 receipt failure -> 500
 */

import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockProactiveMessageFindUnique,
  mockReceiptCreate,
  mockReceiptUpdate,
  mockAuditLogCreate,
} = vi.hoisted(() => ({
  mockProactiveMessageFindUnique: vi.fn(),
  mockReceiptCreate: vi.fn(),
  mockReceiptUpdate: vi.fn(),
  mockAuditLogCreate: vi.fn(),
}));

vi.mock("../../../app/db.server", () => ({
  default: {
    proactiveMessage: { findUnique: mockProactiveMessageFindUnique },
    omnichannelCallbackReceipt: { create: mockReceiptCreate, update: mockReceiptUpdate },
    auditLog: { create: mockAuditLogCreate },
  },
}));

vi.mock("../../../app/services/proactive-messaging.server", () => ({
  ProactiveMessagingService: {
    markAsSent: vi.fn(),
    markAsDelivered: vi.fn(),
    markAsFailed: vi.fn(),
  },
}));

import { ProactiveMessagingService } from "../../../app/services/proactive-messaging.server";
import { action } from "../../../app/routes/api.omnichannel.delivery-callback";

const originalEnv = process.env;
const callbackSecret = "unit-test-bridge-secret";
const shopDomain = "shop-1.myshopify.com";

function buildSignedHeaders(payload: string, timestamp: string, encoding: "hex" | "base64" = "hex") {
  const digest = crypto
    .createHmac("sha256", callbackSecret)
    .update(`${timestamp}.${payload}`)
    .digest(encoding);

  return {
    "Content-Type": "application/json",
    "X-Omnichannel-Timestamp": timestamp,
    "X-Omnichannel-Signature": `sha256=${digest}`,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    shopId: "shop-1",
    channel: "WHATSAPP",
    status: "SENT",
    shop: { domain: shopDomain },
    ...overrides,
  };
}

function buildRequest({
  body,
  rawBody,
  headers = {},
}: {
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
}): Request {
  const payload = rawBody ?? (body !== undefined ? JSON.stringify(body) : "");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signed = buildSignedHeaders(payload, timestamp);

  return new Request("http://localhost/api/omnichannel/delivery-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...signed,
      "X-Omnichannel-Shop-Domain": shopDomain,
      "X-Omnichannel-Channel": "WHATSAPP",
      ...headers,
    },
    body: payload,
  });
}

function signedBase64Request(body: Record<string, unknown>): Request {
  const payload = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signed = buildSignedHeaders(payload, timestamp, "base64");

  return new Request("http://localhost/api/omnichannel/delivery-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...signed,
      "X-Omnichannel-Shop-Domain": shopDomain,
      "X-Omnichannel-Channel": "WHATSAPP",
    },
    body: payload,
  });
}

describe("api.omnichannel.delivery-callback — transition and error branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.OMNICHANNEL_BRIDGE_WEBHOOK_SECRET = callbackSecret;

    mockProactiveMessageFindUnique.mockResolvedValue(makeMessage());
    mockReceiptCreate.mockResolvedValue({ id: "receipt-1" });
    mockReceiptUpdate.mockResolvedValue({ id: "receipt-1", applied: true });
    mockAuditLogCreate.mockResolvedValue({ id: "log-1" });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("applies a QUEUED -> SENT callback and marks the message as sent", async () => {
    mockProactiveMessageFindUnique.mockResolvedValue(
      makeMessage({ status: "QUEUED" }),
    );

    const response = await action({
      request: buildRequest({ body: { messageId: "msg-1", status: "sent" } }),
      params: {},
      context: {},
    } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe("SENT");
    expect(data.applied).toBe(true);
    expect(ProactiveMessagingService.markAsSent).toHaveBeenCalledWith("msg-1");
    expect(mockReceiptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "receipt-1" },
        data: { applied: true },
      }),
    );
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PROACTIVE_DELIVERY_CALLBACK_APPLIED",
        }),
      }),
    );
  });

  it("ignores a FAILED callback once the message is already delivered", async () => {
    mockProactiveMessageFindUnique.mockResolvedValue(
      makeMessage({ status: "DELIVERED" }),
    );

    const response = await action({
      request: buildRequest({ body: { messageId: "msg-1", status: "failed", error: "late failure" } }),
      params: {},
      context: {},
    } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.applied).toBe(false);
    expect(data.status).toBe("DELIVERED");
    expect(ProactiveMessagingService.markAsFailed).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PROACTIVE_DELIVERY_CALLBACK_IGNORED",
        }),
      }),
    );
  });

  it("normalizes an unknown status to FAILED and uses the default error reason", async () => {
    const response = await action({
      request: buildRequest({ body: { messageId: "msg-1", status: "weird-status" } }),
      params: {},
      context: {},
    } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("FAILED");
    expect(data.requestedStatus).toBe("FAILED");
    expect(data.applied).toBe(true);
    expect(ProactiveMessagingService.markAsFailed).toHaveBeenCalledWith(
      "msg-1",
      "Delivery failed via callback",
    );
  });

  it("accepts a base64-encoded HMAC signature", async () => {
    const response = await action({
      request: signedBase64Request({ messageId: "msg-1", status: "delivered" }),
      params: {},
      context: {},
    } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(ProactiveMessagingService.markAsDelivered).toHaveBeenCalledWith("shop-1", "msg-1");
  });

  it("returns 400 for an invalid JSON payload", async () => {
    const response = await action({
      request: buildRequest({ rawBody: "not-json{{{" }),
      params: {},
      context: {},
    } as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe("Invalid JSON payload");
  });

  it("returns 400 when the callback shop domain is missing", async () => {
    const response = await action({
      request: buildRequest({
        body: { messageId: "msg-1", status: "delivered", metadata: { other: 1 } },
        headers: {
          "X-Omnichannel-Shop-Domain": "",
          "X-Omnichannel-Channel": "WHATSAPP",
        },
      }),
      params: {},
      context: {},
    } as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing callback shop domain");
    expect(ProactiveMessagingService.markAsDelivered).not.toHaveBeenCalled();
  });

  it("falls back to the metadata shop domain when the header is missing", async () => {
    mockProactiveMessageFindUnique.mockResolvedValue(makeMessage());

    const response = await action({
      request: buildRequest({
        body: { messageId: "msg-1", status: "delivered", metadata: { shopDomain } },
        headers: { "X-Omnichannel-Shop-Domain": "" },
      }),
      params: {},
      context: {},
    } as any);

    expect(response.status).toBe(200);
    expect(ProactiveMessagingService.markAsDelivered).toHaveBeenCalledWith("shop-1", "msg-1");
  });

  it("returns 400 when the callback channel is missing", async () => {
    const response = await action({
      request: buildRequest({
        body: { messageId: "msg-1", status: "delivered", metadata: { shopDomain } },
        headers: { "X-Omnichannel-Channel": "" },
      }),
      params: {},
      context: {},
    } as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing callback channel");
    expect(ProactiveMessagingService.markAsDelivered).not.toHaveBeenCalled();
  });

  it("falls back to the metadata channel when the header is missing", async () => {
    const response = await action({
      request: buildRequest({
        body: { messageId: "msg-1", status: "delivered", metadata: { shopDomain, channel: "whatsapp" } },
        headers: {
          "X-Omnichannel-Shop-Domain": "",
          "X-Omnichannel-Channel": "",
        },
      }),
      params: {},
      context: {},
    } as any);

    expect(response.status).toBe(200);
    expect(ProactiveMessagingService.markAsDelivered).toHaveBeenCalledWith("shop-1", "msg-1");
  });

  it("returns 500 when the receipt write fails with a non-unique error", async () => {
    mockReceiptCreate.mockRejectedValue(new Error("database unreachable"));

    const response = await action({
      request: buildRequest({ body: { messageId: "msg-1", status: "delivered" } }),
      params: {},
      context: {},
    } as any);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe("database unreachable");
    expect(ProactiveMessagingService.markAsDelivered).not.toHaveBeenCalled();
  });

  it("returns 401 when the timestamp header is missing", async () => {
    const payload = JSON.stringify({ messageId: "msg-1", status: "delivered" });
    const signature = crypto
      .createHmac("sha256", callbackSecret)
      .update(`123.${payload}`)
      .digest("hex");

    const request = new Request("http://localhost/api/omnichannel/delivery-callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Omnichannel-Signature": `sha256=${signature}`,
      },
      body: payload,
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain("Missing callback signature headers");
  });
});
