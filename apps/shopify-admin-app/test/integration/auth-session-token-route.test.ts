import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: vi.fn(),
}));

import { authenticateAdminRequest } from "../../app/utils/authenticate-admin.server";

const mockAuthenticateAdminRequest = vi.mocked(authenticateAdminRequest);

describe("auth.$ route - session token bounce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateAdminRequest.mockResolvedValue({
      session: { shop: "quickstart-c8cc9986.myshopify.com" },
    } as any);
  });

  it("redirects /auth/session-token to shopify-reload preserving billing context", async () => {
    const { loader } = await import("../../app/routes/auth.$");
    const request = new Request(
      "http://localhost/auth/session-token?embedded=1&plan=growth&charge_id=35668427036&shopify-reload=http%3A%2F%2Flocalhost%2Fapp%2Fbilling%2Fthank-you%3Fshop%3Dquickstart-c8cc9986.myshopify.com%26host%3Dencoded-host%26embedded%3D1%26plan%3Dgrowth",
      { headers: { accept: "text/html" } },
    );

    try {
      await loader({ request } as any);
      throw new Error("Expected session-token loader to redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(302);

      const location = response.headers.get("Location");
      expect(location).toBeTruthy();
      const target = new URL(location!, "http://localhost");
      expect(target.pathname).toBe("/app/billing/thank-you");
      expect(target.searchParams.get("shop")).toBe("quickstart-c8cc9986.myshopify.com");
      expect(target.searchParams.get("host")).toBe("encoded-host");
      expect(target.searchParams.get("embedded")).toBe("1");
      expect(target.searchParams.get("plan")).toBe("growth");
      expect(target.searchParams.get("charge_id")).toBe("35668427036");
    }
  });

  it("falls back to /app when shopify-reload is missing", async () => {
    const { loader } = await import("../../app/routes/auth.$");
    const request = new Request(
      "http://localhost/auth/session-token?embedded=1&plan=starter&charge_id=123456",
      { headers: { accept: "text/html" } },
    );

    try {
      await loader({ request } as any);
      throw new Error("Expected session-token loader to redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(302);
      const location = response.headers.get("Location");
      expect(location).toBeTruthy();
      const target = new URL(location!, "http://localhost");
      expect(target.pathname).toBe("/app");
      expect(target.searchParams.get("embedded")).toBe("1");
      expect(target.searchParams.get("plan")).toBe("starter");
      expect(target.searchParams.get("charge_id")).toBe("123456");
    }
  });
});

describe("root route - install entry behavior", () => {
  it("redirects shop-only install entry to OAuth login", async () => {
    const { loader } = await import("../../app/routes/_index");
    const request = new Request("http://localhost/?shop=test-install.myshopify.com", {
      headers: { accept: "text/html" },
    });

    try {
      await loader({ request } as any);
      throw new Error("Expected root loader to redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/app?shop=test-install.myshopify.com");
    }
  });

  it("redirects embedded bootstrap entry to /app preserving context", async () => {
    const { loader } = await import("../../app/routes/_index");
    const request = new Request(
      "http://localhost/?shop=test-install.myshopify.com&host=encoded-host&embedded=1",
      { headers: { accept: "text/html" } },
    );

    try {
      await loader({ request } as any);
      throw new Error("Expected root loader to redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(
        "/app?shop=test-install.myshopify.com&host=encoded-host&embedded=1",
      );
    }
  });
});
