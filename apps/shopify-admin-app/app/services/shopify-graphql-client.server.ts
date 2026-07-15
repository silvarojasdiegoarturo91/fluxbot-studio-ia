const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [500, 1_000, 2_000];
const RETRYABLE_HTTP_STATUSES = new Set([500, 502, 503, 504]);

export interface ShopifyGraphqlRequestContext {
  shopId: string;
  queryName: string;
  requestId: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface ShopifyGraphqlRequestResult {
  response: Response;
  attempts: number;
  elapsedMs: number;
}

export type ShopifyGraphqlExecutor = (
  query: string,
  init?: { signal?: AbortSignal }
) => Promise<Response>;

export type ShopifyGraphqlFailureType =
  | "NETWORK_ERROR"
  | "TIMEOUT_ERROR"
  | "HTTP_ERROR";

export interface ShopifyGraphqlFailure {
  type: ShopifyGraphqlFailureType;
  message: string;
  retryable: boolean;
  status?: number;
}

function getTimeoutMs(timeoutMs?: number): number {
  const configured = Number(process.env.SHOPIFY_GRAPHQL_TIMEOUT_MS || timeoutMs || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

function getMaxRetries(maxRetries?: number): number {
  const configured = Number(process.env.SHOPIFY_GRAPHQL_MAX_RETRIES || maxRetries || DEFAULT_MAX_RETRIES);
  return Number.isFinite(configured) && configured > 0 ? Math.min(5, Math.floor(configured)) : DEFAULT_MAX_RETRIES;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeMessage(value: string): string {
  const normalized = value
    .replace(/^Http request error,\s*no response available:\s*/i, "")
    .replace(/^GraphQL Client:\s*/i, "")
    .replace(/\bfetch failed\b/gi, "")
    .trim();

  return normalized || "Request failed";
}

function classifyThrownError(error: unknown): ShopifyGraphqlFailure {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  const normalized = message.toLowerCase();

  if (normalized.includes("timeout") || normalized.includes("aborted")) {
    return {
      type: "TIMEOUT_ERROR",
      message: "No pudimos conectar con Shopify. Verifica tu conexión a internet.",
      retryable: true,
    };
  }

  if (
    normalized.includes("fetch failed") ||
    normalized.includes("network error") ||
    normalized.includes("econnreset") ||
    normalized.includes("etimedout") ||
    normalized.includes("eai_again") ||
    normalized.includes("socket hang up")
  ) {
    return {
      type: "NETWORK_ERROR",
      message: "No pudimos conectar con Shopify. Verifica tu conexión a internet.",
      retryable: true,
    };
  }

  return {
    type: "NETWORK_ERROR",
    message: sanitizeMessage(message),
    retryable: true,
  };
}

function classifyHttpStatus(status: number): ShopifyGraphqlFailure {
  if (status === 401 || status === 403 || status === 410) {
    return {
      type: "HTTP_ERROR",
      message: "La sesión con Shopify expiró. Recarga la página.",
      retryable: false,
      status,
    };
  }

  if (RETRYABLE_HTTP_STATUSES.has(status)) {
    return {
      type: "HTTP_ERROR",
      message: "No pudimos conectar con Shopify.",
      retryable: true,
      status,
    };
  }

  return {
    type: "HTTP_ERROR",
    message: `Shopify respondió con estado HTTP ${status}.`,
    retryable: false,
    status,
  };
}

function logAttempt(level: "warn" | "error", payload: Record<string, unknown>) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...payload,
  });

  if (level === "warn") {
    console.warn(entry);
    return;
  }

  console.error(entry);
}

async function executeWithTimeout(
  executor: ShopifyGraphqlExecutor,
  query: string,
  timeoutMs: number,
): Promise<Response> {
  return await new Promise<Response>((resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("Request timed out"));
    }, timeoutMs);

    executor(query, { signal: controller.signal })
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeout));
  });
}

export async function runShopifyGraphqlRequest(
  executor: ShopifyGraphqlExecutor,
  query: string,
  context: ShopifyGraphqlRequestContext,
): Promise<ShopifyGraphqlRequestResult> {
  const timeoutMs = getTimeoutMs(context.timeoutMs);
  const maxRetries = getMaxRetries(context.maxRetries);
  const startedAt = Date.now();

  let lastFailure: ShopifyGraphqlFailure | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const attemptStartedAt = Date.now();

    try {
      const response = await executeWithTimeout(executor, query, timeoutMs);
      const latencyMs = Date.now() - attemptStartedAt;

      if (RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < maxRetries) {
        lastFailure = classifyHttpStatus(response.status);
        logAttempt("warn", {
          event: "shopify_graphql_retry",
          shopId: context.shopId,
          requestId: context.requestId,
          queryName: context.queryName,
          attempt,
          maxAttempts: maxRetries,
          errorType: lastFailure.type,
          status: response.status,
          latencyMs,
        });

        await sleep(RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)]);
        continue;
      }

      return {
        response,
        attempts: attempt,
        elapsedMs: Date.now() - startedAt,
      };
    } catch (error) {
      const failure = classifyThrownError(error);
      lastFailure = failure;
      const latencyMs = Date.now() - attemptStartedAt;

      logAttempt("error", {
        event: "shopify_graphql_attempt_failed",
        shopId: context.shopId,
        requestId: context.requestId,
        queryName: context.queryName,
        attempt,
        maxAttempts: maxRetries,
        errorType: failure.type,
        latencyMs,
        message: failure.message,
      });

      if (!failure.retryable || attempt >= maxRetries) {
        break;
      }

      await sleep(RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)]);
    }
  }

  const message = lastFailure?.message || "No pudimos conectar con Shopify.";
  const error = new Error(message);
  (error as Error & { cause?: ShopifyGraphqlFailure }).cause = lastFailure ?? undefined;
  throw error;
}
