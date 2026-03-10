import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/db.server", () => ({
  default: {
    proactiveMessage: {
      findUnique: vi.fn(),
    },
    omnichannelCallbackReceipt: {
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../../app/services/proactive-messaging.server", () => ({
  ProactiveMessagingService: {
    markAsSent: vi.fn(),
    markAsDelivered: vi.fn(),
    markAsFailed: vi.fn(),
  },
}));

import prisma from "../../app/db.server";
import { ProactiveMessagingService } from "../../app/services/proactive-messaging.server";
import { action } from "../../app/routes/api.omnichannel.delivery-callback";

const originalEnv = process.env;
const callbackSecret = "test-bridge-secret";
const shopDomain = "shop-1.myshopify.com";

function buildSignedHeaders(payload: string, timestamp: string): Record<string, string> {
  const signature = crypto
    .createHmac("sha256", callbackSecret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return {
    "Content-Type": "application/json",
    "X-Omnichannel-Timestamp": timestamp,
    "X-Omnichannel-Signature": `sha256=${signature}`,
  };
}

function createSignedRequest(
  body: Record<string, unknown>,
  origin?: { channel?: string; shopDomain?: string; extraHeaders?: Record<string, string> }
): Request {
  const payload = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = buildSignedHeaders(payload, timestamp);

  headers["X-Omnichannel-Shop-Domain"] = origin?.shopDomain || shopDomain;
  headers["X-Omnichannel-Channel"] = origin?.channel || "WHATSAPP";

  if (origin?.extraHeaders) {
    for (const [key, value] of Object.entries(origin.extraHeaders)) {
      headers[key] = value;
    }
  }

  return new Request("http://localhost/api/omnichannel/delivery-callback", {
    method: "POST",
    headers,
    body: payload,
  });
}

describe("Omnichannel Delivery Callback Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.OMNICHANNEL_BRIDGE_WEBHOOK_SECRET = callbackSecret;

    vi.mocked(prisma.omnichannelCallbackReceipt.create).mockResolvedValue({
      id: "receipt-1",
    } as any);
    vi.mocked(prisma.omnichannelCallbackReceipt.update).mockResolvedValue({
      id: "receipt-1",
      applied: true,
    } as any);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("processes delivered callback successfully", async () => {
    vi.mocked(prisma.proactiveMessage.findUnique).mockResolvedValue({
      id: "msg-1",
      shopId: "shop-1",
      channel: "WHATSAPP",
      status: "SENT",
      shop: {
        domain: shopDomain,
      },
    } as any);

    const request = createSignedRequest({
      messageId: "msg-1",
      status: "delivered",
      providerMessageId: "provider-1",
    }, { channel: "WHATSAPP" });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe("DELIVERED");
    expect(data.applied).toBe(true);
    expect(ProactiveMessagingService.markAsDelivered).toHaveBeenCalledWith("msg-1");
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("processes failed callback and marks message as failed", async () => {
    vi.mocked(prisma.proactiveMessage.findUnique).mockResolvedValue({
      id: "msg-2",
      shopId: "shop-1",
      channel: "INSTAGRAM",
      status: "SENT",
      shop: {
        domain: shopDomain,
      },
    } as any);

    const request = createSignedRequest({
      messageId: "msg-2",
      status: "failed",
      error: "provider rejected message",
    }, { channel: "INSTAGRAM" });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe("FAILED");
    expect(data.applied).toBe(true);
    expect(ProactiveMessagingService.markAsFailed).toHaveBeenCalledWith(
      "msg-2",
      "provider rejected message"
    );
  });

  it("returns 400 when messageId or status is missing", async () => {
    const request = createSignedRequest({
      messageId: "msg-3",
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("returns 404 when message is not found", async () => {
    vi.mocked(prisma.proactiveMessage.findUnique).mockResolvedValue(null);

    const request = createSignedRequest({
      messageId: "missing-msg",
      status: "sent",
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it("returns 405 for non-POST methods", async () => {
    const request = new Request("http://localhost/api/omnichannel/delivery-callback", {
      method: "GET",
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(405);
    expect(data.success).toBe(false);
  });

  it("returns 401 when signature headers are missing", async () => {
    const request = new Request("http://localhost/api/omnichannel/delivery-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: "msg-1",
        status: "delivered",
      }),
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toContain("signature");
  });

  it("returns 401 when signature is invalid", async () => {
    const payload = JSON.stringify({
      messageId: "msg-1",
      status: "delivered",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));

    const request = new Request("http://localhost/api/omnichannel/delivery-callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Omnichannel-Timestamp": timestamp,
        "X-Omnichannel-Signature": "sha256=invalid",
      },
      body: payload,
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Invalid callback signature");
  });

  it("returns 503 when callback secret is not configured", async () => {
    delete process.env.OMNICHANNEL_BRIDGE_WEBHOOK_SECRET;
    delete process.env.OMNICHANNEL_BRIDGE_TOKEN;

    const request = createSignedRequest({
      messageId: "msg-1",
      status: "delivered",
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.success).toBe(false);
    expect(data.error).toContain("not configured");
  });

  it("returns 401 when timestamp is outside accepted window", async () => {
    process.env.OMNICHANNEL_CALLBACK_MAX_AGE_SECONDS = "60";

    const payload = JSON.stringify({
      messageId: "msg-1",
      status: "delivered",
    });
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 3600);

    const request = new Request("http://localhost/api/omnichannel/delivery-callback", {
      method: "POST",
      headers: buildSignedHeaders(payload, staleTimestamp),
      body: payload,
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toContain("timestamp");
  });

  it("returns 403 when callback shop domain does not match message shop", async () => {
    vi.mocked(prisma.proactiveMessage.findUnique).mockResolvedValue({
      id: "msg-4",
      shopId: "shop-1",
      channel: "WHATSAPP",
      status: "SENT",
      shop: {
        domain: shopDomain,
      },
    } as any);

    const request = createSignedRequest(
      {
        messageId: "msg-4",
        status: "delivered",
      },
      {
        shopDomain: "other-shop.myshopify.com",
        channel: "WHATSAPP",
      }
    );

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.error).toContain("shop domain mismatch");
  });

  it("returns 403 when callback channel does not match message channel", async () => {
    vi.mocked(prisma.proactiveMessage.findUnique).mockResolvedValue({
      id: "msg-5",
      shopId: "shop-1",
      channel: "INSTAGRAM",
      status: "SENT",
      shop: {
        domain: shopDomain,
      },
    } as any);

    const request = createSignedRequest(
      {
        messageId: "msg-5",
        status: "delivered",
      },
      {
        channel: "WHATSAPP",
      }
    );

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.error).toContain("channel mismatch");
  });

  it("returns duplicate marker when callback event key already exists", async () => {
    vi.mocked(prisma.proactiveMessage.findUnique).mockResolvedValue({
      id: "msg-6",
      shopId: "shop-1",
      channel: "WHATSAPP",
      status: "SENT",
      shop: {
        domain: shopDomain,
      },
    } as any);

    vi.mocked(prisma.omnichannelCallbackReceipt.create).mockRejectedValue({
      code: "P2002",
    });

    const request = createSignedRequest(
      {
        messageId: "msg-6",
        status: "sent",
        providerMessageId: "provider-duplicate",
      },
      {
        channel: "WHATSAPP",
      }
    );

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.applied).toBe(false);
    expect(data.duplicate).toBe(true);
    expect(ProactiveMessagingService.markAsSent).not.toHaveBeenCalled();
    expect(ProactiveMessagingService.markAsDelivered).not.toHaveBeenCalled();
    expect(ProactiveMessagingService.markAsFailed).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("ignores stale SENT callback when message is already DELIVERED", async () => {
    vi.mocked(prisma.proactiveMessage.findUnique).mockResolvedValue({
      id: "msg-3",
      shopId: "shop-1",
      channel: "WHATSAPP",
      status: "DELIVERED",
      shop: {
        domain: shopDomain,
      },
    } as any);

    const request = createSignedRequest({
      messageId: "msg-3",
      status: "sent",
      providerMessageId: "provider-older-event",
    }, { channel: "WHATSAPP" });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.applied).toBe(false);
    expect(data.status).toBe("DELIVERED");
    expect(data.requestedStatus).toBe("SENT");
    expect(ProactiveMessagingService.markAsSent).not.toHaveBeenCalled();
    expect(ProactiveMessagingService.markAsDelivered).not.toHaveBeenCalled();
    expect(ProactiveMessagingService.markAsFailed).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});
