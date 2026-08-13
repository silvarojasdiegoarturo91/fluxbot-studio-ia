import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuditLogCreate } = vi.hoisted(() => ({
  mockAuditLogCreate: vi.fn(),
}));

vi.mock("../../../app/db.server", () => ({
  default: {
    auditLog: {
      create: mockAuditLogCreate,
    },
  },
}));

vi.mock("../../../app/services/proactive-messaging.server", () => ({
  ProactiveMessagingService: {
    markAsSent: vi.fn(),
    markAsDelivered: vi.fn(),
    markAsFailed: vi.fn(),
  },
}));

vi.mock("../../../app/services/omnichannel-bridge.server", () => ({
  dispatchOmnichannelMessage: vi.fn(),
  getOmnichannelBridgeStatus: vi.fn(() => ({
    configured: true,
    baseUrl: "https://bridge.example.com",
    timeoutMs: 8000,
    supportedChannels: ["WHATSAPP", "INSTAGRAM", "SMS", "EMAIL"],
  })),
}));

import {
  deliverMessagesBatch,
  getDeliveryStatus,
} from "../../../app/services/delivery.server";
import { ProactiveMessagingService } from "../../../app/services/proactive-messaging.server";
import { dispatchOmnichannelMessage } from "../../../app/services/omnichannel-bridge.server";

const MESSENGER = ProactiveMessagingService as {
  markAsSent: ReturnType<typeof vi.fn>;
  markAsDelivered: ReturnType<typeof vi.fn>;
  markAsFailed: ReturnType<typeof vi.fn>;
};

function webChatMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-wc-1",
    shopId: "shop-1",
    sessionId: "sess-wc-1",
    channel: "WEB_CHAT",
    renderedMessage: "Hello!",
    ...overrides,
  };
}

function pushMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-push-1",
    shopId: "shop-1",
    sessionId: "sess-push-1",
    channel: "PUSH",
    renderedMessage: "Push me",
    ...overrides,
  };
}

describe("DeliveryService — extended unit coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    MESSENGER.markAsSent.mockResolvedValue(undefined as never);
    MESSENGER.markAsDelivered.mockResolvedValue(undefined as never);
    MESSENGER.markAsFailed.mockResolvedValue({
      shouldRetry: false,
    } as never);
    mockAuditLogCreate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delivers web chat messages and confirms delivery after the async window", async () => {
    const result = await deliverMessagesBatch([webChatMessage()]);

    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);
    expect(MESSENGER.markAsSent).toHaveBeenCalledWith("msg-wc-1");
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PROACTIVE_DELIVERY_SENT_WEB_CHAT",
          entityType: "PROACTIVE_MESSAGE",
        }),
      }),
    );

    await vi.advanceTimersByTimeAsync(500);

    expect(MESSENGER.markAsDelivered).toHaveBeenCalledWith("shop-1", "msg-wc-1");
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PROACTIVE_DELIVERY_CONFIRMED_WEB_CHAT",
        }),
      }),
    );
  });

  it("marks web chat messages as failed when sending throws", async () => {
    MESSENGER.markAsSent.mockRejectedValue(new Error("widget offline"));

    const result = await deliverMessagesBatch([webChatMessage()]);

    expect(result.delivered).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors["msg-wc-1"]).toBe("widget offline");
    expect(MESSENGER.markAsFailed).toHaveBeenCalledWith("msg-wc-1", "widget offline");
  });

  it("tolerates audit log failures on the web chat path", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockAuditLogCreate.mockRejectedValue(new Error("audit db down"));

    const result = await deliverMessagesBatch([webChatMessage()]);

    expect(result.delivered).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[DeliveryService] Failed to write audit log",
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it("fails PUSH messages with the not-integrated error", async () => {
    const result = await deliverMessagesBatch([pushMessage()]);

    expect(result.delivered).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors["msg-push-1"]).toContain("Push notifications not yet integrated");
    expect(MESSENGER.markAsFailed).toHaveBeenCalledWith(
      "msg-push-1",
      expect.stringContaining("Push notifications not yet integrated"),
    );
  });

  it("fails bridge delivery when dispatch reports failure", async () => {
    vi.mocked(dispatchOmnichannelMessage).mockResolvedValue({
      success: false,
      error: "Provider rejected",
      retryable: true,
    } as never);

    const result = await deliverMessagesBatch([
      {
        id: "msg-wa-fail",
        shopId: "shop-1",
        sessionId: "sess-fail",
        recipientId: "customer-1",
        channel: "WHATSAPP",
        renderedMessage: "Hi",
      },
    ]);

    expect(result.delivered).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors["msg-wa-fail"]).toBe("Provider rejected");
    expect(MESSENGER.markAsFailed).toHaveBeenCalledWith("msg-wa-fail", "Provider rejected");
  });

  it("fails bridge delivery when the provider throws", async () => {
    vi.mocked(dispatchOmnichannelMessage).mockRejectedValue(new Error("bridge timeout"));

    const result = await deliverMessagesBatch([
      {
        id: "msg-ig-fail",
        shopId: "shop-1",
        sessionId: "sess-ig",
        recipientId: "ig-user",
        channel: "INSTAGRAM",
        renderedMessage: "Hi",
      },
    ]);

    expect(result.failed).toBe(1);
    expect(result.errors["msg-ig-fail"]).toBe("bridge timeout");
  });

  it("delivers a mixed batch across channels and reports totals", async () => {
    vi.mocked(dispatchOmnichannelMessage).mockResolvedValue({
      success: true,
      status: "DELIVERED",
      providerMessageId: "sms-1",
      retryable: false,
    } as never);

    const result = await deliverMessagesBatch([
      webChatMessage({ id: "msg-wc-a" }),
      pushMessage({ id: "msg-push-a" }),
      {
        id: "msg-sms-a",
        shopId: "shop-1",
        sessionId: "sess-sms",
        recipientId: "+15551234567",
        channel: "SMS",
        renderedMessage: "Reminder",
      },
      { id: "msg-fax-a", channel: "FAX", renderedMessage: "nope" },
    ]);

    expect(result.delivered).toBe(2);
    expect(result.failed).toBe(2);
    expect(result.errors["msg-fax-a"]).toContain("Unsupported channel");
    expect(result.errors["msg-push-a"]).toContain("Push notifications");
  });

  it("reports delivery status with channel integration flags", () => {
    const status = getDeliveryStatus();

    expect(status.status).toBe("ready");
    expect(status.channels).toContain("PUSH");
    expect(status.pendingChannels).toEqual(["PUSH"]);
    expect(status.omnichannelBridge.configured).toBe(true);
  });
});
