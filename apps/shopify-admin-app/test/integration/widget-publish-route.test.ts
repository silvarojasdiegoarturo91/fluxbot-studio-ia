/**
 * Integration Tests: app.widget-publish route  (S2)
 *
 * Covers:
 *   loader  — fetches published theme, reads widgetPublishedAt from shop.metadata
 *   action  — confirm_published / reset_status write-back via shop.metadata merge
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks (must precede any dynamic import of route modules) ─────────────────

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

vi.mock("../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../app/services/shop-context.server", () => ({
  ensureShopForSession: vi.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { authenticate } from "../../app/shopify.server";
import prismaDefault from "../../app/db.server";
import { ensureShopForSession } from "../../app/services/shop-context.server";

const mockAuthenticate = authenticate.admin as ReturnType<typeof vi.fn>;
const mockEnsureShop = ensureShopForSession as ReturnType<typeof vi.fn>;
const mockShopFindUnique = prismaDefault.shop.findUnique as ReturnType<typeof vi.fn>;
const mockShopUpdate = prismaDefault.shop.update as ReturnType<typeof vi.fn>;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function makeAdminGraphqlMock(nodesOrError: "error" | Array<{ id: string; name: string; role: string }>) {
  const graphql = vi.fn().mockResolvedValue({
    json: () =>
      nodesOrError === "error"
        ? Promise.resolve({ errors: [{ message: "GQL error" }] })
        : Promise.resolve({ data: { themes: { nodes: nodesOrError } } }),
  });
  return { admin: { graphql }, session: { shop: "mystore.myshopify.com" } };
}

function makeRequest(method = "GET", path = "/app/widget-publish"): Request {
  return new Request(`http://localhost${path}`, { method });
}

function makePostRequest(intent: string): Request {
  const body = new URLSearchParams({ intent });
  return new Request("http://localhost/app/widget-publish", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

// ─── loader ───────────────────────────────────────────────────────────────────

describe("app.widget-publish — loader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns published theme when Shopify returns MAIN theme", async () => {
    const adminMock = makeAdminGraphqlMock([
      { id: "gid://shopify/Theme/123456", name: "Dawn", role: "MAIN" },
      { id: "gid://shopify/Theme/789", name: "Backup", role: "UNPUBLISHED" },
    ]);
    mockAuthenticate.mockResolvedValue(adminMock);
    mockEnsureShop.mockResolvedValue({ id: "shop-1", domain: "mystore.myshopify.com" });
    mockShopFindUnique.mockResolvedValue({ metadata: null });

    const { loader } = await import("../../app/routes/app.widget-publish");
    const data = await loader({ request: makeRequest(), params: {}, context: {} } as any);

    expect(data.publishedTheme).toEqual({ id: "gid://shopify/Theme/123456", name: "Dawn" });
    expect(data.themeEditorUrl).toContain("/admin/themes/123456/editor");
    expect(data.widgetPublishedAt).toBeNull();
    expect(data.extensionHandle).toBe("ai-chat-widget");
    expect(data.themeQueryError).toBeNull();
  });

  it("returns null publishedTheme when no MAIN theme is present", async () => {
    const adminMock = makeAdminGraphqlMock([
      { id: "gid://shopify/Theme/789", name: "Backup", role: "UNPUBLISHED" },
    ]);
    mockAuthenticate.mockResolvedValue(adminMock);
    mockEnsureShop.mockResolvedValue({ id: "shop-1", domain: "mystore.myshopify.com" });
    mockShopFindUnique.mockResolvedValue({ metadata: null });

    const { loader } = await import("../../app/routes/app.widget-publish");
    const data = await loader({ request: makeRequest(), params: {}, context: {} } as any);

    expect(data.publishedTheme).toBeNull();
    expect(data.themeEditorUrl).toBeNull();
    expect(data.themeQueryError).toBeNull();
  });

  it("captures theme query error and still returns data", async () => {
    const adminMock = makeAdminGraphqlMock("error");
    mockAuthenticate.mockResolvedValue(adminMock);
    mockEnsureShop.mockResolvedValue({ id: "shop-1", domain: "mystore.myshopify.com" });
    mockShopFindUnique.mockResolvedValue({ metadata: null });

    const { loader } = await import("../../app/routes/app.widget-publish");
    const data = await loader({ request: makeRequest(), params: {}, context: {} } as any);

    expect(data.publishedTheme).toBeNull();
    expect(data.themeQueryError).toBe("GQL error");
  });

  it("reads widgetPublishedAt from shop metadata", async () => {
    const publishedAt = "2026-03-01T10:00:00.000Z";
    const adminMock = makeAdminGraphqlMock([
      { id: "gid://shopify/Theme/1", name: "Dawn", role: "MAIN" },
    ]);
    mockAuthenticate.mockResolvedValue(adminMock);
    mockEnsureShop.mockResolvedValue({ id: "shop-1", domain: "mystore.myshopify.com" });
    mockShopFindUnique.mockResolvedValue({
      metadata: { widgetPublishedAt: publishedAt, otherKey: "preserved" },
    });

    const { loader } = await import("../../app/routes/app.widget-publish");
    const data = await loader({ request: makeRequest(), params: {}, context: {} } as any);

    expect(data.widgetPublishedAt).toBe(publishedAt);
  });

  it("throws 404 when shop is not found", async () => {
    const adminMock = makeAdminGraphqlMock([]);
    mockAuthenticate.mockResolvedValue(adminMock);
    mockEnsureShop.mockResolvedValue(null);

    const { loader } = await import("../../app/routes/app.widget-publish");

    await expect(
      loader({ request: makeRequest(), params: {}, context: {} } as any)
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ─── action ───────────────────────────────────────────────────────────────────

describe("app.widget-publish — action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("confirm_published sets widgetPublishedAt in metadata", async () => {
    mockAuthenticate.mockResolvedValue({
      session: { shop: "mystore.myshopify.com" },
    });
    mockEnsureShop.mockResolvedValue({ id: "shop-1", domain: "mystore.myshopify.com" });
    mockShopFindUnique.mockResolvedValue({ metadata: { otherKey: "value" } });
    mockShopUpdate.mockResolvedValue({});

    const { action } = await import("../../app/routes/app.widget-publish");
    const result = await action({
      request: makePostRequest("confirm_published"),
      params: {},
      context: {},
    } as any);

    expect(result).toMatchObject({ ok: true });

    const updateCall = mockShopUpdate.mock.calls[0][0];
    expect(updateCall.data.metadata).toMatchObject({ otherKey: "value" });
    expect(typeof updateCall.data.metadata.widgetPublishedAt).toBe("string");
    // verify it's a valid ISO date
    expect(new Date(updateCall.data.metadata.widgetPublishedAt).getTime()).toBeGreaterThan(0);
  });

  it("reset_status removes widgetPublishedAt while preserving other keys", async () => {
    const existingAt = "2026-03-01T10:00:00.000Z";
    mockAuthenticate.mockResolvedValue({
      session: { shop: "mystore.myshopify.com" },
    });
    mockEnsureShop.mockResolvedValue({ id: "shop-1", domain: "mystore.myshopify.com" });
    mockShopFindUnique.mockResolvedValue({
      metadata: { widgetPublishedAt: existingAt, otherKey: "preserved" },
    });
    mockShopUpdate.mockResolvedValue({});

    const { action } = await import("../../app/routes/app.widget-publish");
    const result = await action({
      request: makePostRequest("reset_status"),
      params: {},
      context: {},
    } as any);

    expect(result).toMatchObject({ ok: true });

    const updateCall = mockShopUpdate.mock.calls[0][0];
    expect(updateCall.data.metadata.widgetPublishedAt).toBeUndefined();
    expect(updateCall.data.metadata.otherKey).toBe("preserved");
  });

  it("returns error for unknown intent", async () => {
    mockAuthenticate.mockResolvedValue({
      session: { shop: "mystore.myshopify.com" },
    });
    mockEnsureShop.mockResolvedValue({ id: "shop-1", domain: "mystore.myshopify.com" });
    mockShopFindUnique.mockResolvedValue({ metadata: null });

    const { action } = await import("../../app/routes/app.widget-publish");
    const result = await action({
      request: makePostRequest("bad_intent"),
      params: {},
      context: {},
    } as any);

    expect(result).toMatchObject({ ok: false, error: "Unsupported action" });
    expect(mockShopUpdate).not.toHaveBeenCalled();
  });

  it("returns error when shop is not found", async () => {
    mockAuthenticate.mockResolvedValue({
      session: { shop: "mystore.myshopify.com" },
    });
    mockEnsureShop.mockResolvedValue(null);

    const { action } = await import("../../app/routes/app.widget-publish");
    const result = await action({
      request: makePostRequest("confirm_published"),
      params: {},
      context: {},
    } as any);

    expect(result).toMatchObject({ ok: false, error: "Shop not found" });
    expect(mockShopUpdate).not.toHaveBeenCalled();
  });

  it("rejects non-POST requests", async () => {
    mockAuthenticate.mockResolvedValue({
      session: { shop: "mystore.myshopify.com" },
    });
    mockEnsureShop.mockResolvedValue({ id: "shop-1", domain: "mystore.myshopify.com" });

    const { action } = await import("../../app/routes/app.widget-publish");
    const result = await action({
      request: new Request("http://localhost/app/widget-publish", { method: "GET" }),
      params: {},
      context: {},
    } as any);

    expect(result).toMatchObject({ ok: false, error: "Method not allowed" });
  });
});
