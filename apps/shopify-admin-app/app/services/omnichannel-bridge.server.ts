/**
 * Omnichannel Bridge Service - Phase 3
 *
 * Provider-agnostic adapter for external messaging channels (WhatsApp/Instagram).
 * Dispatches outbound proactive messages to a bridge endpoint and normalizes responses.
 */

const DEFAULT_TIMEOUT_MS = 8000;

export type OmnichannelChannel = "WHATSAPP" | "INSTAGRAM" | "SMS" | "EMAIL";

export interface OmnichannelDispatchRequest {
  messageId: string;
  shopId: string;
  sessionId: string;
  recipientId: string;
  channel: OmnichannelChannel;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface OmnichannelDispatchResult {
  success: boolean;
  status: "QUEUED" | "SENT" | "DELIVERED";
  providerMessageId?: string;
  error?: string;
  retryable?: boolean;
}

export interface OmnichannelBridgeStatus {
  configured: boolean;
  baseUrl: string | null;
  timeoutMs: number;
  supportedChannels: OmnichannelChannel[];
}

function getBridgeBaseUrl(): string | null {
  const value = process.env.OMNICHANNEL_BRIDGE_URL;
  if (!value) return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getBridgeTimeoutMs(): number {
  const raw = process.env.OMNICHANNEL_BRIDGE_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return parsed;
}

function normalizeStatus(value: unknown): "QUEUED" | "SENT" | "DELIVERED" {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "DELIVERED") return "DELIVERED";
  if (normalized === "SENT") return "SENT";
  return "QUEUED";
}

function isRetryableStatus(httpStatus: number): boolean {
  return httpStatus === 429 || httpStatus >= 500;
}

function buildBridgeUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/messages/send`;
}

export function getOmnichannelBridgeStatus(): OmnichannelBridgeStatus {
  const baseUrl = getBridgeBaseUrl();

  return {
    configured: baseUrl !== null,
    baseUrl,
    timeoutMs: getBridgeTimeoutMs(),
    supportedChannels: ["WHATSAPP", "INSTAGRAM", "SMS", "EMAIL"],
  };
}

export async function dispatchOmnichannelMessage(
  request: OmnichannelDispatchRequest
): Promise<OmnichannelDispatchResult> {
  const baseUrl = getBridgeBaseUrl();
  const timeoutMs = getBridgeTimeoutMs();

  if (!baseUrl) {
    return {
      success: false,
      status: "QUEUED",
      error: "OMNICHANNEL_BRIDGE_URL is not configured",
      retryable: false,
    };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const bridgeToken = process.env.OMNICHANNEL_BRIDGE_TOKEN;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (bridgeToken && bridgeToken.trim().length > 0) {
      headers.Authorization = `Bearer ${bridgeToken.trim()}`;
    }

    const response = await fetch(buildBridgeUrl(baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({
        externalMessageId: request.messageId,
        shopId: request.shopId,
        sessionId: request.sessionId,
        recipientId: request.recipientId,
        channel: request.channel,
        content: request.content,
        metadata: request.metadata || {},
      }),
      signal: controller.signal,
    });

    let payload: Record<string, unknown> = {};
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : `Bridge request failed with status ${response.status}`;

      return {
        success: false,
        status: "QUEUED",
        error: errorMessage,
        retryable: isRetryableStatus(response.status),
      };
    }

    return {
      success: true,
      status: normalizeStatus(payload.status),
      providerMessageId:
        typeof payload.providerMessageId === "string"
          ? payload.providerMessageId
          : typeof payload.messageId === "string"
            ? payload.messageId
            : undefined,
      retryable: false,
    };
  } catch (error) {
    const isAbortError =
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError";

    return {
      success: false,
      status: "QUEUED",
      error: isAbortError
        ? `Bridge request timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : "Bridge request failed",
      retryable: true,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
