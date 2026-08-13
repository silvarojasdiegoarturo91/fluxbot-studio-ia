import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockAdminAuthenticate } = vi.hoisted(() => ({
  mockAdminAuthenticate: vi.fn(),
}));

vi.mock("../../../app/shopify.server", () => ({
  authenticate: { admin: mockAdminAuthenticate },
}));

vi.mock("react-router", () => ({
  redirect: (url: string) => new Response(null, { status: 302, headers: { Location: url } }),
}));

import {
  pickAuthDebugHeaders,
  isDocumentRequest,
  isShopifyReauthResponse,
  buildSessionTokenBounceRedirectPath,
  authenticateAdminRequest,
} from "../../../app/utils/authenticate-admin.server";

describe("authenticate-admin.server", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.E2E_TEST_MODE;
    delete process.env.SHOPIFY_SHOP;
    delete process.env.SHOPIFY_DEV_STORE_URL;
    delete process.env.SHOPIFY_APP_URL;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("pickAuthDebugHeaders", () => {
    it("collects only the present debug headers", () => {
      const headers = new Headers({
        "x-shopify-api-request-failure-reauthorize": "yes",
        "www-authenticate": "Bearer realm=shopify",
        "x-ignored": "nope",
      });

      const result = pickAuthDebugHeaders(headers);

      expect(result).toEqual({
        "x-shopify-api-request-failure-reauthorize": "yes",
        "www-authenticate": "Bearer realm=shopify",
      });
    });

    it("returns an empty object when no debug headers are present", () => {
      expect(pickAuthDebugHeaders(new Headers())).toEqual({});
    });
  });

  describe("isDocumentRequest", () => {
    it("detects sec-fetch-dest document", () => {
      const request = new Request("http://localhost/", {
        headers: { "sec-fetch-dest": "document" },
      });
      expect(isDocumentRequest(request)).toBe(true);
    });

    it("detects sec-fetch-mode navigate", () => {
      const request = new Request("http://localhost/", {
        headers: { "sec-fetch-mode": "navigate" },
      });
      expect(isDocumentRequest(request)).toBe(true);
    });

    it("detects accept text/html", () => {
      const request = new Request("http://localhost/", {
        headers: { accept: "text/html,application/xhtml+xml" },
      });
      expect(isDocumentRequest(request)).toBe(true);
    });

    it("returns false for API-like requests", () => {
      const request = new Request("http://localhost/", {
        headers: { accept: "application/json" },
      });
      expect(isDocumentRequest(request)).toBe(false);
    });
  });

  describe("isShopifyReauthResponse", () => {
    it("returns true for 401/403/410 statuses", () => {
      for (const status of [401, 403, 410]) {
        expect(isShopifyReauthResponse(new Response(null, { status }))).toBe(true);
      }
    });

    it("returns true when a reauth header has a truthy value", () => {
      const headers = new Headers({
        "x-shopify-api-request-failure-reauthorize-url": "https://shopify.com/auth",
      });
      expect(isShopifyReauthResponse(new Response(null, { status: 200, headers }))).toBe(true);
    });

    it("returns false when no reauth signals are present", () => {
      expect(isShopifyReauthResponse(new Response(null, { status: 200 }))).toBe(false);
    });
  });

  describe("buildSessionTokenBounceRedirectPath", () => {
    it("preserves search params and appends shopify-reload", () => {
      process.env.SHOPIFY_APP_URL = "https://app.example.com";
      const url = new URL("https://shop.example.com/auth?shop=shop1&id_token=x");

      const path = buildSessionTokenBounceRedirectPath(url);

      expect(path).toContain("/auth/session-token?");
      expect(path).toContain("shop=shop1");
      expect(path).not.toContain("id_token");
      expect(path).toContain(
        "shopify-reload=" +
          encodeURIComponent("https://app.example.com/auth?shop=shop1"),
      );
    });

    it("works without search params", () => {
      process.env.SHOPIFY_APP_URL = "https://app.example.com";
      const url = new URL("https://shop.example.com/auth");

      const path = buildSessionTokenBounceRedirectPath(url);

      expect(path).toBe("/auth/session-token?shopify-reload=" + encodeURIComponent("https://app.example.com/auth"));
    });
  });

  describe("authenticateAdminRequest", () => {
    it("returns a mock result in E2E test mode", async () => {
      process.env.E2E_TEST_MODE = "true";

      const result = await authenticateAdminRequest(new Request("http://localhost/"));

      expect(result.session.shop).toBe("quickstart-c8cc9986.myshopify.com");
      expect(result.admin).toBeDefined();
    });

    it("uses SHOPIFY_SHOP for the E2E mock session", async () => {
      process.env.E2E_TEST_MODE = "true";
      process.env.SHOPIFY_SHOP = "my-store.myshopify.com";

      const result = await authenticateAdminRequest(new Request("http://localhost/"));

      expect(result.session.shop).toBe("my-store.myshopify.com");
    });

    it("delegates to authenticate.admin otherwise", async () => {
      const expected = { session: { id: "s" }, admin: {} };
      mockAdminAuthenticate.mockResolvedValue(expected);

      const result = await authenticateAdminRequest(new Request("http://localhost/"));

      expect(result).toBe(expected);
      expect(mockAdminAuthenticate).toHaveBeenCalledWith(expect.any(Request));
    });

    it("redirects to the session token bounce for reauth responses on document requests", async () => {
      process.env.SHOPIFY_APP_URL = "https://app.example.com";
      mockAdminAuthenticate.mockRejectedValue(new Response(null, { status: 401 }));

      const request = new Request("https://shop.example.com/app?shop=shop1", {
        headers: { "sec-fetch-dest": "document" },
      });

      await expect(authenticateAdminRequest(request)).rejects.toMatchObject({ status: 302 });
      expect(mockAdminAuthenticate).toHaveBeenCalled();
    });

    it("re-throws non-reauth errors", async () => {
      mockAdminAuthenticate.mockRejectedValue(new Error("network"));

      await expect(authenticateAdminRequest(new Request("http://localhost/"))).rejects.toThrow(
        "network",
      );
    });
  });
});
