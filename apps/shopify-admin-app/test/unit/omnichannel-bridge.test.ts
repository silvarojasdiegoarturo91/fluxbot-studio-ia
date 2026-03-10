import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchOmnichannelMessage,
  getOmnichannelBridgeStatus,
} from "../../app/services/omnichannel-bridge.server";

describe("OmnichannelBridgeService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns not configured status when bridge URL is missing", () => {
    delete process.env.OMNICHANNEL_BRIDGE_URL;

    const status = getOmnichannelBridgeStatus();

    expect(status.configured).toBe(false);
    expect(status.baseUrl).toBeNull();
    expect(status.supportedChannels).toEqual(["WHATSAPP", "INSTAGRAM", "SMS", "EMAIL"]);
  });

  it("fails dispatch when bridge URL is not configured", async () => {
    delete process.env.OMNICHANNEL_BRIDGE_URL;

    const result = await dispatchOmnichannelMessage({
      messageId: "msg-1",
      shopId: "shop-1",
      sessionId: "sess-1",
      recipientId: "customer-1",
      channel: "WHATSAPP",
      content: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("OMNICHANNEL_BRIDGE_URL");
    expect(result.retryable).toBe(false);
  });

  it("dispatches successfully and normalizes delivered response", async () => {
    process.env.OMNICHANNEL_BRIDGE_URL = "https://bridge.example.com";
    process.env.OMNICHANNEL_BRIDGE_TOKEN = "bridge-token";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "delivered",
        providerMessageId: "provider-123",
      }),
    } as any);

    const result = await dispatchOmnichannelMessage({
      messageId: "msg-2",
      shopId: "shop-2",
      sessionId: "sess-2",
      recipientId: "customer-2",
      channel: "INSTAGRAM",
      content: "Hi there",
      metadata: { locale: "es" },
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        status: "DELIVERED",
        providerMessageId: "provider-123",
      })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://bridge.example.com/messages/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer bridge-token",
        }),
      })
    );
  });

  it("returns retryable failure when bridge responds with 503", async () => {
    process.env.OMNICHANNEL_BRIDGE_URL = "https://bridge.example.com";

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: "Temporary outage",
      }),
    } as any);

    const result = await dispatchOmnichannelMessage({
      messageId: "msg-3",
      shopId: "shop-3",
      sessionId: "sess-3",
      recipientId: "customer-3",
      channel: "WHATSAPP",
      content: "Retry later",
    });

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toContain("Temporary outage");
  });
});
