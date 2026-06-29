import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

import { authenticateAdminRequest } from "../../app/utils/authenticate-admin.server";
import { authenticate } from "../../app/shopify.server";

describe("authenticateAdminRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SHOPIFY_APP_URL;
  });

  it("returns the admin auth result when authentication succeeds", async () => {
    const authResult = { session: { shop: "test-shop.myshopify.com" } };
    vi.mocked(authenticate.admin).mockResolvedValue(authResult as never);

    const request = new Request("http://localhost/app/onboarding?shop=test-shop.myshopify.com");

    await expect(authenticateAdminRequest(request)).resolves.toBe(authResult);
  });

  it("redirects document requests with expired session auth to the session token bounce path", async () => {
    process.env.SHOPIFY_APP_URL = "https://app.example.com";

    const authError = new Response("Unauthorized", {
      status: 401,
      headers: {
        "X-Shopify-Retry-Invalid-Session-Request": "1",
      },
    });
    vi.mocked(authenticate.admin).mockRejectedValue(authError);

    const request = new Request(
      "http://localhost/app/onboarding?shop=test-shop.myshopify.com&host=encoded-host&embedded=1&id_token=stale-token",
      {
        headers: {
          accept: "text/html",
        },
      },
    );

    try {
      await authenticateAdminRequest(request);
      throw new Error("Expected authenticateAdminRequest to redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);

      const response = error as Response;
      expect(response.status).toBe(302);

      const location = response.headers.get("Location");
      expect(location).toBeTruthy();

      const redirectUrl = new URL(location!, "https://app.example.com");
      expect(redirectUrl.pathname).toBe("/auth/session-token");
      expect(redirectUrl.searchParams.get("shop")).toBe("test-shop.myshopify.com");
      expect(redirectUrl.searchParams.get("host")).toBe("encoded-host");
      expect(redirectUrl.searchParams.get("embedded")).toBe("1");
      expect(redirectUrl.searchParams.get("id_token")).toBeNull();
      expect(redirectUrl.searchParams.get("shopify-reload")).toBe(
        "https://app.example.com/app/onboarding?shop=test-shop.myshopify.com&host=encoded-host&embedded=1",
      );
    }
  });

  it("rebuilds shopify-reload without nesting stale bounce params", async () => {
    process.env.SHOPIFY_APP_URL = "https://app.example.com";

    const authError = new Response("Unauthorized", {
      status: 401,
      headers: {
        "X-Shopify-Retry-Invalid-Session-Request": "1",
      },
    });
    vi.mocked(authenticate.admin).mockRejectedValue(authError);

    const request = new Request(
      "http://localhost/app?shop=test-shop.myshopify.com&host=encoded-host&embedded=1&shopify-reload=https%3A%2F%2Fapp.example.com%2Fapp%3Fshop%3Dtest-shop.myshopify.com",
      {
        headers: {
          accept: "text/html",
        },
      },
    );

    try {
      await authenticateAdminRequest(request);
      throw new Error("Expected authenticateAdminRequest to redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      const location = response.headers.get("Location");
      expect(location).toBeTruthy();

      const redirectUrl = new URL(location!, "https://app.example.com");
      const bounceReload = redirectUrl.searchParams.get("shopify-reload");

      expect(bounceReload).toBe(
        "https://app.example.com/app?shop=test-shop.myshopify.com&host=encoded-host&embedded=1",
      );
      expect(bounceReload).not.toContain("shopify-reload=");
    }
  });

  it("redirects document requests with gone Shopify auth to the session token bounce path", async () => {
    process.env.SHOPIFY_APP_URL = "https://app.example.com";

    const authError = new Response("Gone", {
      status: 410,
      statusText: "Gone",
    });
    vi.mocked(authenticate.admin).mockRejectedValue(authError);

    const request = new Request(
      "http://localhost/app?shop=test-shop.myshopify.com&host=encoded-host&embedded=1",
      {
        headers: {
          accept: "text/html",
        },
      },
    );

    try {
      await authenticateAdminRequest(request);
      throw new Error("Expected authenticateAdminRequest to redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);

      const response = error as Response;
      expect(response.status).toBe(302);

      const location = response.headers.get("Location");
      expect(location).toBeTruthy();

      const redirectUrl = new URL(location!, "https://app.example.com");
      expect(redirectUrl.pathname).toBe("/auth/session-token");
      expect(redirectUrl.searchParams.get("shop")).toBe("test-shop.myshopify.com");
      expect(redirectUrl.searchParams.get("host")).toBe("encoded-host");
      expect(redirectUrl.searchParams.get("embedded")).toBe("1");
      expect(redirectUrl.searchParams.get("shopify-reload")).toBe(
        "https://app.example.com/app?shop=test-shop.myshopify.com&host=encoded-host&embedded=1",
      );
    }
  });

  it("preserves Shopify retry responses for non-document requests", async () => {
    const authError = new Response("Unauthorized", {
      status: 401,
      headers: {
        "X-Shopify-Retry-Invalid-Session-Request": "1",
      },
    });
    vi.mocked(authenticate.admin).mockRejectedValue(authError);

    const request = new Request("http://localhost/api/campaigns", {
      headers: {
        accept: "application/json",
        authorization: "Bearer current-session-token",
      },
    });

    await expect(authenticateAdminRequest(request)).rejects.toBe(authError);
  });
});
