import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deliverMessagesBatch,
  getDeliveryStatus,
} from "../../app/services/delivery.server";
import prisma from "../../app/db.server";
import { ProactiveMessagingService } from "../../app/services/proactive-messaging.server";
import {
  dispatchOmnichannelMessage,
  getOmnichannelBridgeStatus,
} from "../../app/services/omnichannel-bridge.server";

vi.mock("../../app/db.server", () => ({
  default: {
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

vi.mock("../../app/services/omnichannel-bridge.server", () => ({
  dispatchOmnichannelMessage: vi.fn(),
  getOmnichannelBridgeStatus: vi.fn(() => ({
    configured: true,
    baseUrl: "https://bridge.example.com",
    timeoutMs: 8000,
    supportedChannels: ["WHATSAPP", "INSTAGRAM", "SMS", "EMAIL"],
  })),
}));

describe("DeliveryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delivers WHATSAPP messages when recipient is available", async () => {
    vi.mocked(ProactiveMessagingService.markAsSent).mockResolvedValue(undefined);
    vi.mocked(ProactiveMessagingService.markAsDelivered).mockResolvedValue(undefined);
    vi.mocked(dispatchOmnichannelMessage).mockResolvedValue({
      success: true,
      status: "DELIVERED",
      providerMessageId: "wa-123",
      retryable: false,
    });

    const result = await deliverMessagesBatch([
      {
        id: "msg-wa-1",
        shopId: "shop-1",
        sessionId: "sess-1",
        recipientId: "customer-123",
        channel: "WHATSAPP",
        renderedMessage: "Need help choosing?",
      },
    ]);

    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);
    expect(ProactiveMessagingService.markAsSent).toHaveBeenCalledWith("msg-wa-1");
    expect(ProactiveMessagingService.markAsDelivered).toHaveBeenCalledWith("msg-wa-1");
    expect(dispatchOmnichannelMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "WHATSAPP",
        recipientId: "customer-123",
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("delivers INSTAGRAM messages with metadata recipient fallback", async () => {
    vi.mocked(ProactiveMessagingService.markAsSent).mockResolvedValue(undefined);
    vi.mocked(ProactiveMessagingService.markAsDelivered).mockResolvedValue(undefined);
    vi.mocked(dispatchOmnichannelMessage).mockResolvedValue({
      success: true,
      status: "DELIVERED",
      providerMessageId: "ig-123",
      retryable: false,
    });

    const result = await deliverMessagesBatch([
      {
        id: "msg-ig-1",
        shopId: "shop-1",
        sessionId: "sess-2",
        channel: "INSTAGRAM",
        renderedMessage: "We can suggest alternatives.",
        messageMetadata: {
          recipientId: "ig-user-555",
        },
      },
    ]);

    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);
    expect(ProactiveMessagingService.markAsSent).toHaveBeenCalledWith("msg-ig-1");
    expect(ProactiveMessagingService.markAsDelivered).toHaveBeenCalledWith("msg-ig-1");
    expect(dispatchOmnichannelMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "INSTAGRAM",
        recipientId: "ig-user-555",
      })
    );
  });

  it("delivers SMS messages through bridge", async () => {
    vi.mocked(ProactiveMessagingService.markAsSent).mockResolvedValue(undefined);
    vi.mocked(dispatchOmnichannelMessage).mockResolvedValue({
      success: true,
      status: "SENT",
      providerMessageId: "sms-123",
      retryable: false,
    });

    const result = await deliverMessagesBatch([
      {
        id: "msg-sms-1",
        shopId: "shop-1",
        sessionId: "sess-sms-1",
        recipientId: "+15551234567",
        channel: "SMS",
        renderedMessage: "You left items in your cart",
      },
    ]);

    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);
    expect(ProactiveMessagingService.markAsSent).toHaveBeenCalledWith("msg-sms-1");
    expect(dispatchOmnichannelMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "SMS",
        recipientId: "+15551234567",
      })
    );
  });

  it("delivers EMAIL messages through bridge", async () => {
    vi.mocked(ProactiveMessagingService.markAsSent).mockResolvedValue(undefined);
    vi.mocked(dispatchOmnichannelMessage).mockResolvedValue({
      success: true,
      status: "SENT",
      providerMessageId: "email-123",
      retryable: false,
    });

    const result = await deliverMessagesBatch([
      {
        id: "msg-email-1",
        shopId: "shop-1",
        sessionId: "sess-email-1",
        recipientId: "customer@example.com",
        channel: "EMAIL",
        renderedMessage: "You still have items waiting in your cart.",
      },
    ]);

    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);
    expect(ProactiveMessagingService.markAsSent).toHaveBeenCalledWith("msg-email-1");
    expect(dispatchOmnichannelMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "EMAIL",
        recipientId: "customer@example.com",
      })
    );
  });

  it("fails WHATSAPP messages without recipient", async () => {
    vi.mocked(ProactiveMessagingService.markAsFailed).mockResolvedValue({
      shouldRetry: true,
      nextRetryAt: new Date(),
    });

    const result = await deliverMessagesBatch([
      {
        id: "msg-wa-2",
        shopId: "shop-1",
        sessionId: "sess-3",
        channel: "WHATSAPP",
        renderedMessage: "Can I help with this product?",
      },
    ]);

    expect(result.delivered).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors["msg-wa-2"]).toContain("recipientId");
    expect(ProactiveMessagingService.markAsFailed).toHaveBeenCalledWith(
      "msg-wa-2",
      expect.stringContaining("recipientId")
    );
    expect(dispatchOmnichannelMessage).not.toHaveBeenCalled();
  });

  it("fails unsupported channels and records failure by message id", async () => {
    vi.mocked(ProactiveMessagingService.markAsFailed).mockResolvedValue({
      shouldRetry: false,
    });

    const result = await deliverMessagesBatch([
      {
        id: "msg-unk-1",
        shopId: "shop-1",
        sessionId: "sess-4",
        channel: "FAX",
        renderedMessage: "Legacy channel message",
      },
    ]);

    expect(result.delivered).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors["msg-unk-1"]).toContain("Unsupported channel");
    expect(ProactiveMessagingService.markAsFailed).toHaveBeenCalledWith(
      "msg-unk-1",
      expect.stringContaining("Unsupported channel")
    );
  });

  it("reports omnichannel integration status", () => {
    const status = getDeliveryStatus();

    expect(status.integratedChannels).toContain("WEB_CHAT");
    expect(status.integratedChannels).toContain("WHATSAPP");
    expect(status.integratedChannels).toContain("INSTAGRAM");
    expect(status.integratedChannels).toContain("SMS");
    expect(status.integratedChannels).toContain("EMAIL");
    expect(status.pendingChannels).toContain("PUSH");
    expect(getOmnichannelBridgeStatus).toHaveBeenCalled();
    expect(status.omnichannelBridge.configured).toBe(true);
  });

  it("marks only as sent when bridge returns queued status", async () => {
    vi.mocked(ProactiveMessagingService.markAsSent).mockResolvedValue(undefined);
    vi.mocked(dispatchOmnichannelMessage).mockResolvedValue({
      success: true,
      status: "QUEUED",
      providerMessageId: "wa-queued-1",
      retryable: false,
    });

    const result = await deliverMessagesBatch([
      {
        id: "msg-wa-queued",
        shopId: "shop-1",
        sessionId: "sess-10",
        recipientId: "customer-queued",
        channel: "WHATSAPP",
        renderedMessage: "Queued outbound message",
      },
    ]);

    expect(result.delivered).toBe(1);
    expect(ProactiveMessagingService.markAsSent).toHaveBeenCalledWith("msg-wa-queued");
    expect(ProactiveMessagingService.markAsDelivered).not.toHaveBeenCalled();
  });
});
