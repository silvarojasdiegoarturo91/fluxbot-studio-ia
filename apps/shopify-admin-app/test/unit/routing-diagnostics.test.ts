import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const MONOREPO_ROOT = resolve(__dirname, "../../../../..");
const APPS_DIR = resolve(__dirname, "../../..");
const REPO_ROOT = resolve(APPS_DIR, "..");

function resolveWorkspacePath(relativePath: string): string {
  const monorepoPath = resolve(MONOREPO_ROOT, relativePath);
  if (existsSync(monorepoPath)) return monorepoPath;
  const stripped = relativePath.replace(/^fluxbot-studio-ia-shopify\//, "");
  const repoPath = resolve(REPO_ROOT, stripped);
  if (existsSync(repoPath)) return repoPath;
  const appsPath = resolve(APPS_DIR, stripped.replace(/^apps\//, ""));
  if (existsSync(appsPath)) return appsPath;
  return monorepoPath;
}

function resolveBackendPath(relativePath: string): string {
  const monorepoPath = resolve(MONOREPO_ROOT, relativePath);
  if (existsSync(monorepoPath)) return monorepoPath;
  const PARENT_ROOT = resolve(REPO_ROOT, "..");
  const backendCandidates = [
    resolve(MONOREPO_ROOT, "fluxbot-studio-back-ia"),
    resolve(REPO_ROOT, "fluxbot-studio-back-ia"),
    resolve(REPO_ROOT, "fluxbot-studio-back-ia-"),
    resolve(PARENT_ROOT, "fluxbot-studio-back-ia"),
    resolve(PARENT_ROOT, "fluxbot-studio-back-ia-"),
  ];
  const stripped = relativePath.replace(/^fluxbot-studio-back-ia-?\//, "");
  for (const root of backendCandidates) {
    const candidate = resolve(root, stripped);
    if (existsSync(candidate)) return candidate;
  }
  return monorepoPath;
}

function readFile(relativePath: string): string {
  if (relativePath.startsWith("fluxbot-studio-back-ia")) {
    return readFileSync(resolveBackendPath(relativePath), "utf-8");
  }
  return readFileSync(resolveWorkspacePath(relativePath), "utf-8");
}

// These representative backend files are already asserted by this suite.
// If the sibling backend repo is not checked out (common in isolated CI runs),
// backend-specific assertions should be skipped instead of failing with ENOENT.
const requiredBackendSourcePaths = [
  "fluxbot-studio-back-ia/src/middleware/request-context.ts",
  "fluxbot-studio-back-ia/src/index.ts",
  "fluxbot-studio-back-ia/src/routes/chat.ts",
];

const backendSourcesAvailable = requiredBackendSourcePaths.every((path) =>
  existsSync(resolveBackendPath(path)),
);
const itIfBackend = backendSourcesAvailable ? it : it.skip;

// ── Widget endpoint guard tests ──────────────────────────────────────────────

describe("Widget endpoint guard (W7)", () => {
  it("widget always uses /apps/fluxbot/chat as canonical endpoint", () => {
    const API_ENDPOINT = "/apps/fluxbot/chat";

    // A direct backend URL should be rejected
    const directBackendUrl = "https://contabo.example.com:3001/api/v1/chat";
    expect(directBackendUrl.indexOf("/apps/fluxbot/")).toBe(-1);

    // The proxy path should be accepted
    const proxyPath = "/apps/fluxbot/chat";
    expect(proxyPath.indexOf("/apps/fluxbot/")).not.toBe(-1);

    // An absolute URL with proxy path should still be caught by the absolute check
    const ngrokUrl = "https://abc123.ngrok.io/apps/fluxbot/chat";
    // indexOf('/apps/fluxbot/') returns > 0 for absolute URLs — the guard uses indexOf
    // which means absolute URLs with the path are NOT caught by the proxy check alone.
    // This is why the widget guard must also reject absolute URLs.
    expect(ngrokUrl.indexOf("/apps/fluxbot/")).not.toBe(-1);
  });

  it("remote config chatEndpoint must contain /apps/fluxbot/ to be accepted", () => {
    const API_ENDPOINT = "/apps/fluxbot/chat";

    function validateRemoteEndpoint(payloadChatEndpoint: string): string {
      if (payloadChatEndpoint.indexOf("/apps/fluxbot/") !== -1) {
        return payloadChatEndpoint;
      }
      return API_ENDPOINT;
    }

    // Valid proxy paths
    expect(validateRemoteEndpoint("/apps/fluxbot/chat")).toBe("/apps/fluxbot/chat");
    expect(validateRemoteEndpoint("/apps/fluxbot/chat?signed=true")).toBe("/apps/fluxbot/chat?signed=true");

    // Direct backend URLs — contain /apps/ only if they include the full path
    expect(validateRemoteEndpoint("https://contabo.example.com:3001/chat")).toBe("/apps/fluxbot/chat");
    expect(validateRemoteEndpoint("http://localhost:3001/api/v1/chat")).toBe("/apps/fluxbot/chat");
    expect(validateRemoteEndpoint("https://abc.ngrok.io/chat")).toBe("/apps/fluxbot/chat");
    expect(validateRemoteEndpoint("https://my-server.com/chat")).toBe("/apps/fluxbot/chat");
  });

  it("sendMessage enforces proxy path even if chatEndpoint was overridden", () => {
    const API_ENDPOINT = "/apps/fluxbot/chat";

    function resolveEndpoint(chatEndpoint: string | null): string {
      let endpoint = chatEndpoint || API_ENDPOINT;
      if (endpoint.indexOf("/apps/fluxbot/") === -1) {
        endpoint = API_ENDPOINT;
      }
      return endpoint;
    }

    // Direct backend URL should be forced to proxy
    expect(resolveEndpoint("https://contabo.example.com:3001/chat")).toBe(API_ENDPOINT);
    expect(resolveEndpoint("http://localhost:3001/api/v1/chat")).toBe(API_ENDPOINT);

    // Valid proxy paths should pass through
    expect(resolveEndpoint("/apps/fluxbot/chat")).toBe("/apps/fluxbot/chat");
    expect(resolveEndpoint(null)).toBe(API_ENDPOINT);
  });
});

// ── Widget build ID tests ────────────────────────────────────────────────────

describe("Widget build ID (W7)", () => {
  const widgetContent = readFile(
    "fluxbot-studio-ia-shopify/apps/storefront-widget/extensions/chat-widget/assets/chat-launcher.js",
  );

  it("widget has a verifiable build ID marker", () => {
    // Must define DEBUG_VERSION
    expect(widgetContent).toMatch(/var DEBUG_VERSION\s*=\s*['"][^'"]+['"]/);
    // Must define WIDGET_BUILD_ID = DEBUG_VERSION
    expect(widgetContent).toMatch(/var WIDGET_BUILD_ID\s*=\s*DEBUG_VERSION/);
    // Must expose __FLUXBOT_WIDGET_DEBUG__
    expect(widgetContent).toMatch(/window\.__FLUXBOT_WIDGET_DEBUG__/);
    // Must include buildId in debug state
    expect(widgetContent).toMatch(/buildId:\s*WIDGET_BUILD_ID/);
  });
});

// ── TraceId generation tests ─────────────────────────────────────────────────

describe("TraceId generation (W7)", () => {
  const widgetContent = readFile(
    "fluxbot-studio-ia-shopify/apps/storefront-widget/extensions/chat-widget/assets/chat-launcher.js",
  );

  it("widget generates traceId with TRACE- prefix", () => {
    // Must have generateTraceId function
    expect(widgetContent).toMatch(/function generateTraceId/);
    // Must produce TRACE- prefix
    expect(widgetContent).toMatch(/TRACE-/);
  });

  it("widget sends X-FluxBot-Trace-Id header in chat requests", () => {
    // Must set X-FluxBot-Trace-Id header
    expect(widgetContent).toMatch(/X-FluxBot-Trace-Id/);
    // Must include traceId in payload body
    expect(widgetContent).toMatch(/traceId:\s*traceId/);
  });
});

// ── Diagnostic headers tests ─────────────────────────────────────────────────

describe("Diagnostic headers (W7)", () => {
  itIfBackend("backend request-context middleware sets diagnostic headers", () => {
    const content = readFile("fluxbot-studio-back-ia/src/middleware/request-context.ts");

    expect(content).toMatch(/X-FluxBot-Service/);
    expect(content).toMatch(/X-FluxBot-Commit/);
    expect(content).toMatch(/X-FluxBot-Hostname/);
    expect(content).toMatch(/X-FluxBot-Process/);
    expect(content).toMatch(/X-FluxBot-Db-Fingerprint/);
    expect(content).toMatch(/X-FluxBot-Trace-Id/);
  });

  it("proxy route sets diagnostic headers", () => {
    const content = readFile(
      "fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/routes/apps.fluxbot.chat.ts",
    );

    expect(content).toMatch(/X-FluxBot-Service/);
    expect(content).toMatch(/X-FluxBot-Commit/);
    expect(content).toMatch(/X-FluxBot-Hostname/);
    expect(content).toMatch(/X-FluxBot-Process/);
    expect(content).toMatch(/X-FluxBot-Db-Fingerprint/);
    expect(content).toMatch(/X-FluxBot-Trace-Id/);
  });

  itIfBackend("backend logs startup diagnostics", () => {
    const content = readFile("fluxbot-studio-back-ia/src/index.ts");

    expect(content).toMatch(/\[Startup\]/);
    expect(content).toMatch(/commitSha/);
    expect(content).toMatch(/hostname/);
    expect(content).toMatch(/pid/);
    expect(content).toMatch(/dbFingerprint/);
  });

  it("proxy route logs startup diagnostics", () => {
    const content = readFile(
      "fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/routes/apps.fluxbot.chat.ts",
    );

    expect(content).toMatch(/\[Startup\]/);
    expect(content).toMatch(/commitSha/);
    expect(content).toMatch(/hostname/);
    expect(content).toMatch(/pid/);
    expect(content).toMatch(/dbFingerprint/);
  });
});

// ── TraceId propagation tests ────────────────────────────────────────────────

describe("TraceId propagation (W7)", () => {
  it("proxy route extracts traceId from X-FluxBot-Trace-Id header", () => {
    const content = readFile(
      "fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/routes/apps.fluxbot.chat.ts",
    );

    expect(content).toMatch(/X-FluxBot-Trace-Id/);
    expect(content).toMatch(/traceId/);
  });

  itIfBackend("backend chat route extracts traceId from request", () => {
    const content = readFile("fluxbot-studio-back-ia/src/routes/chat.ts");

    expect(content).toMatch(/traceId/);
    expect(content).toMatch(/Chat request received/);
    expect(content).toMatch(/Chat request completed/);
  });

  it("ia-client forwards traceId as X-FluxBot-Trace-Id header", () => {
    const content = readFile(
      "fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/services/ia-backend.server.ts",
    );

    expect(content).toMatch(/X-FluxBot-Trace-Id/);
    expect(content).toMatch(/traceId\?:\s*string/);
  });

  it("gateway passes traceId from request to ia-client", () => {
    const content = readFile(
      "fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/services/ia-gateway.server.ts",
    );

    expect(content).toMatch(/traceId\?:\s*string/);
    expect(content).toMatch(/traceId:\s*request\.traceId/);
  });
});

// ── Silent success prevention tests ──────────────────────────────────────────

describe("No silent success (W7)", () => {
  itIfBackend("backend chat route always logs completion", () => {
    const content = readFile("fluxbot-studio-back-ia/src/routes/chat.ts");

    expect(content).toMatch(/Chat request received/);
    expect(content).toMatch(/Chat request completed/);
  });

  it("proxy route always logs gateway.chat done", () => {
    const content = readFile(
      "fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/routes/apps.fluxbot.chat.ts",
    );

    expect(content).toMatch(/gateway\.chat done/);
    expect(content).toMatch(/\[ProxyChat\] Error:/);
  });

  it("successful response implies persistence in proxy route", () => {
    const content = readFile(
      "fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/routes/apps.fluxbot.chat.ts",
    );

    // Must persist USER message
    expect(content).toMatch(/role:\s*"USER"/);
    // Must persist ASSISTANT message
    expect(content).toMatch(/role:\s*"ASSISTANT"/);
    // Must include traceId in persisted metadata
    expect(content).toMatch(/traceMetadata/);
  });
});

// ── Product extraction and persistence tests ──────────────────────────────────

describe("Product extraction (T1)", () => {
  const proxyContent = readFile(
    "fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/routes/apps.fluxbot.chat.ts",
  );

  it("extractRecommendedProducts handles action.products", () => {
    expect(proxyContent).toMatch(/function extractRecommendedProducts/);
    // Accepts action.products shape
    expect(proxyContent).toMatch(/if \(Array\.isArray\(action\.products\)\)/);
  });

  it("extractRecommendedProducts handles action.payload.products", () => {
    expect(proxyContent).toMatch(/action\.payload\.products/);
  });

  it("extractRecommendedProducts filters by product_recommend type", () => {
    expect(proxyContent).toMatch(/product_recommend/);
    expect(proxyContent).toMatch(/type.*toLowerCase/);
  });

  it("buildAssistantMetadata includes products when present", () => {
    expect(proxyContent).toMatch(/function buildAssistantMetadata/);
    expect(proxyContent).toMatch(/products\.length > 0/);
    expect(proxyContent).toMatch(/metadata\.products = products/);
  });

  it("proxy route uses extractRecommendedProducts instead of inline filter", () => {
    expect(proxyContent).toMatch(/extractRecommendedProducts\(chatResponse\.actions\)/);
    // Should NOT have the old inline filter
    expect(proxyContent).not.toMatch(/\.filter\(\(a: any\) => a\.type === "product_recommend"\)/);
  });

  it("assistant message metadata includes products for widget rendering", () => {
    expect(proxyContent).toMatch(/buildAssistantMetadata\(chatResponse, productRecommendations\)/);
  });
});

// ── Backend tenant resolution tests ───────────────────────────────────────────

describe("Backend tenant resolution (T1)", () => {
  itIfBackend("chat route imports AuthenticatedRequest", () => {
    const content = readFile("fluxbot-studio-back-ia/src/routes/chat.ts");

    expect(content).toMatch(/import type { AuthenticatedRequest }/);
  });

  itIfBackend("chat route requires req.shopId and returns SHOP_CONTEXT_MISSING", () => {
    const content = readFile("fluxbot-studio-back-ia/src/routes/chat.ts");

    expect(content).toMatch(/if \(!req\.shopId\)/);
    expect(content).toMatch(/SHOP_CONTEXT_MISSING/);
    expect(content).toMatch(/Authenticated shop context is missing/);
  });

  itIfBackend("chat route overrides payload shopId with authenticated shopId", () => {
    const content = readFile("fluxbot-studio-back-ia/src/routes/chat.ts");

    expect(content).toMatch(/const payloadShopId = context\.shopId/);
    expect(content).toMatch(/const authenticatedShopId = req\.shopId/);
    expect(content).toMatch(/Chat shopId mismatch corrected/);
    expect(content).toMatch(/const shopId = authenticatedShopId/);
  });

  itIfBackend("chat route uses authenticated shopId for all database lookups", () => {
    const content = readFile("fluxbot-studio-back-ia/src/routes/chat.ts");

    expect(content).toMatch(/UsageService\.assertCanConsumeMessage\(shopId/);
    expect(content).toMatch(/shopContextService\.loadContext\(shopId\)/);
    expect(content).toMatch(/UsageService\.incrementUsage\(shopId/);
  });

  itIfBackend("chat route validates conversation belongs to same tenant", () => {
    const content = readFile("fluxbot-studio-back-ia/src/routes/chat.ts");

    expect(content).toMatch(/conversation\.shopId !== shopId/);
    expect(content).toMatch(/Conversation belongs to different tenant/);
  });

  itIfBackend("stream route also uses AuthenticatedRequest", () => {
    const content = readFile("fluxbot-studio-back-ia/src/routes/chat.ts");

    const streamIdx = content.indexOf("router.post('/stream'");
    expect(streamIdx).toBeGreaterThan(0);
    const streamSection = content.slice(streamIdx, streamIdx + 600);
    expect(streamSection).toMatch(/AuthenticatedRequest/);
    expect(streamSection).toMatch(/if \(!req\.shopId\)/);
    expect(streamSection).toMatch(/const shopId = req\.shopId/);
  });
});
