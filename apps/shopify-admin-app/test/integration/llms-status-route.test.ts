/**
 * Integration Tests: app.llms-status route  (S5)
 *
 * Covers:
 *   loader  — calls getCacheStatus and reads cache content size
 *   action  — force_refresh / invalidate
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

vi.mock("../../app/db.server", () => ({
  default: {
    llmsTxtCache: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../app/services/shop-context.server", () => ({
  ensureShopForSession: vi.fn(),
}));

vi.mock("../../app/services/llms-txt.server", () => ({
  LlmsTxtService: {
    getCacheStatus: vi.fn(),
    generate: vi.fn(),
    invalidate: vi.fn(),
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { authenticate } from "../../app/shopify.server";
import prismaDefault from "../../app/db.server";
import { ensureShopForSession } from "../../app/services/shop-context.server";
import { LlmsTxtService } from "../../app/services/llms-txt.server";

const mockAuth = authenticate.admin as ReturnType<typeof vi.fn>;
const mockEnsureShop = ensureShopForSession as ReturnType<typeof vi.fn>;
const mockCacheFindUnique = prismaDefault.llmsTxtCache.findUnique as ReturnType<typeof vi.fn>;
const mockGetCacheStatus = LlmsTxtService.getCacheStatus as ReturnType<typeof vi.fn>;
const mockGenerate = LlmsTxtService.generate as ReturnType<typeof vi.fn>;
const mockInvalidate = LlmsTxtService.invalidate as ReturnType<typeof vi.fn>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(method = "GET"): Request {
  return new Request("http://localhost/app/llms-status", { method });
}

function makePostRequest(intent: string): Request {
  const body = new URLSearchParams({ intent });
  return new Request("http://localhost/app/llms-status", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

const SHOP = "mystore.myshopify.com";
const SHOP_DB = { id: "shop-1", domain: SHOP };

// ─── loader ───────────────────────────────────────────────────────────────────

describe("app.llms-status — loader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns fresh status when cache exists and not expired", async () => {
    const now = new Date();
    const generatedAt = new Date(now.getTime() - 60_000);   // 1 min ago
    const expiresAt = new Date(now.getTime() + 300_000);    // 5 min from now

    mockAuth.mockResolvedValue({ session: { shop: SHOP } });
    mockEnsureShop.mockResolvedValue(SHOP_DB);
    mockGetCacheStatus.mockResolvedValue({
      shopDomain: SHOP,
      hasCache: true,
      generatedAt,
      expiresAt,
      isExpired: false,
    });
    mockCacheFindUnique.mockResolvedValue({ content: "# Store\n## Products\n" });

    const { loader } = await import("../../app/routes/app.llms-status");
    const data = await loader({ request: makeRequest(), params: {}, context: {} } as any);

    expect(data.hasCache).toBe(true);
    expect(data.isFresh).toBe(true);
    expect(data.generatedAt).toBe(generatedAt.toISOString());
    expect(data.expiresAt).toBe(expiresAt.toISOString());
    expect(typeof data.contentBytes).toBe("number");
    expect(data.contentBytes).toBeGreaterThan(0);
  });

  it("returns stale status when cache is expired", async () => {
    const past = new Date(Date.now() - 1000);

    mockAuth.mockResolvedValue({ session: { shop: SHOP } });
    mockEnsureShop.mockResolvedValue(SHOP_DB);
    mockGetCacheStatus.mockResolvedValue({
      shopDomain: SHOP,
      hasCache: true,
      generatedAt: new Date(Date.now() - 400_000),
      expiresAt: past,
      isExpired: true,
    });
    mockCacheFindUnique.mockResolvedValue({ content: "old content" });

    const { loader } = await import("../../app/routes/app.llms-status");
    const data = await loader({ request: makeRequest(), params: {}, context: {} } as any);

    expect(data.hasCache).toBe(true);
    expect(data.isFresh).toBe(false);
  });

  it("returns no-cache status when cache is absent", async () => {
    mockAuth.mockResolvedValue({ session: { shop: SHOP } });
    mockEnsureShop.mockResolvedValue(SHOP_DB);
    mockGetCacheStatus.mockResolvedValue({
      shopDomain: SHOP,
      hasCache: false,
      generatedAt: null,
      expiresAt: null,
      isExpired: false,
    });
    mockCacheFindUnique.mockResolvedValue(null);

    const { loader } = await import("../../app/routes/app.llms-status");
    const data = await loader({ request: makeRequest(), params: {}, context: {} } as any);

    expect(data.hasCache).toBe(false);
    expect(data.isFresh).toBe(false);
    expect(data.generatedAt).toBeNull();
    expect(data.contentBytes).toBeNull();
  });

  it("throws 404 when shop is not found", async () => {
    mockAuth.mockResolvedValue({ session: { shop: SHOP } });
    mockEnsureShop.mockResolvedValue(null);

    const { loader } = await import("../../app/routes/app.llms-status");
    await expect(
      loader({ request: makeRequest(), params: {}, context: {} } as any)
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ─── action ───────────────────────────────────────────────────────────────────

describe("app.llms-status — action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("force_refresh calls LlmsTxtService.generate with forceRefresh", async () => {
    mockAuth.mockResolvedValue({ session: { shop: SHOP } });
    mockEnsureShop.mockResolvedValue(SHOP_DB);
    mockGenerate.mockResolvedValue("# Store\n");

    const { action } = await import("../../app/routes/app.llms-status");
    const result = await action({
      request: makePostRequest("force_refresh"),
      params: {},
      context: {},
    } as any);

    expect(result).toMatchObject({ ok: true });
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ shopDomain: SHOP, forceRefresh: true })
    );
  });

  it("force_refresh returns error when generate throws", async () => {
    mockAuth.mockResolvedValue({ session: { shop: SHOP } });
    mockEnsureShop.mockResolvedValue(SHOP_DB);
    mockGenerate.mockRejectedValue(new Error("IA backend unavailable"));

    const { action } = await import("../../app/routes/app.llms-status");
    const result = await action({
      request: makePostRequest("force_refresh"),
      params: {},
      context: {},
    } as any);

    expect(result).toMatchObject({ ok: false, error: "IA backend unavailable" });
  });

  it("invalidate calls LlmsTxtService.invalidate", async () => {
    mockAuth.mockResolvedValue({ session: { shop: SHOP } });
    mockEnsureShop.mockResolvedValue(SHOP_DB);
    mockInvalidate.mockResolvedValue(undefined);

    const { action } = await import("../../app/routes/app.llms-status");
    const result = await action({
      request: makePostRequest("invalidate"),
      params: {},
      context: {},
    } as any);

    expect(result).toMatchObject({ ok: true });
    expect(mockInvalidate).toHaveBeenCalledWith(SHOP);
  });

  it("returns error for unknown intent", async () => {
    mockAuth.mockResolvedValue({ session: { shop: SHOP } });
    mockEnsureShop.mockResolvedValue(SHOP_DB);

    const { action } = await import("../../app/routes/app.llms-status");
    const result = await action({
      request: makePostRequest("unknown"),
      params: {},
      context: {},
    } as any);

    expect(result).toMatchObject({ ok: false, error: "Unsupported action" });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it("returns error when shop not found", async () => {
    mockAuth.mockResolvedValue({ session: { shop: SHOP } });
    mockEnsureShop.mockResolvedValue(null);

    const { action } = await import("../../app/routes/app.llms-status");
    const result = await action({
      request: makePostRequest("force_refresh"),
      params: {},
      context: {},
    } as any);

    expect(result).toMatchObject({ ok: false, error: "Shop not found" });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("rejects non-POST requests", async () => {
    mockAuth.mockResolvedValue({ session: { shop: SHOP } });
    mockEnsureShop.mockResolvedValue(SHOP_DB);

    const { action } = await import("../../app/routes/app.llms-status");
    const result = await action({
      request: new Request("http://localhost/app/llms-status", { method: "GET" }),
      params: {},
      context: {},
    } as any);

    expect(result).toMatchObject({ ok: false, error: "Method not allowed" });
  });
});
