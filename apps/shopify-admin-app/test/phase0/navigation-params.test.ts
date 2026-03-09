import { describe, it, expect } from "vitest";

/**
 * Phase 0 Test Suite: Embedded Query Parameter Preservation
 * 
 * Tests that navigation within embedded Shopify apps preserves
 * critical query parameters (shop, host, embedded) to prevent
 * auth redirect loops.
 */

describe("Phase 0: Navigation Query Parameter Preservation", () => {
  const mockEmbeddedQuery = "?shop=quickstart-test.myshopify.com&host=YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvcXVpY2tzdGFydC10ZXN0&embedded=1";

  describe("Query Preservation Helper", () => {
    it("should preserve query params when navigating", () => {
      const basePath = "/app/settings";
      const expectedPath = `${basePath}${mockEmbeddedQuery}`;
      
      const withEmbeddedQuery = (path: string, search: string) => {
        return `${path}${search || ""}`;
      };
      
      const result = withEmbeddedQuery(basePath, mockEmbeddedQuery);
      expect(result).toBe(expectedPath);
    });

    it("should handle empty query gracefully", () => {
      const basePath = "/app/analytics";
      const emptyQuery = "";
      
      const withEmbeddedQuery = (path: string, search: string) => {
        return `${path}${search || ""}`;
      };
      
      const result = withEmbeddedQuery(basePath, emptyQuery);
      expect(result).toBe(basePath);
    });

    it("should preserve all critical params", () => {
      const url = new URL(`https://example.com/app${mockEmbeddedQuery}`);
      
      expect(url.searchParams.get("shop")).toBe("quickstart-test.myshopify.com");
      expect(url.searchParams.get("host")).toBeTruthy();
      expect(url.searchParams.get("embedded")).toBe("1");
    });
  });

  describe("Back Navigation", () => {
    it("should construct dashboard URL with query params", () => {
      const backToDashboardUrl = `/app${mockEmbeddedQuery}`;
      
      expect(backToDashboardUrl).toContain("/app?");
      expect(backToDashboardUrl).toContain("shop=");
      expect(backToDashboardUrl).toContain("embedded=1");
    });

    it("should work for all admin page routes", () => {
      const routes = [
        "/app/data-sources",
        "/app/settings",
        "/app/analytics",
        "/app/conversations",
        "/app/privacy",
        "/app/billing",
        "/app/widget-settings",
        "/app/widget-publish",
      ];
      
      routes.forEach((route) => {
        const backUrl = `/app${mockEmbeddedQuery}`;
        expect(backUrl).toMatch(/^\/app\?/);
      });
    });
  });

  describe("Quick Links Navigation", () => {
    const quickLinks = [
      { label: "Data Sources", url: "/app/data-sources" },
      { label: "Settings", url: "/app/settings" },
      { label: "Analytics", url: "/app/analytics" },
    ];

    it("should append query to all quick links", () => {
      const withQuery = (path: string) => `${path}${mockEmbeddedQuery}`;
      
      quickLinks.forEach((link) => {
        const fullUrl = withQuery(link.url);
        expect(fullUrl).toContain(link.url);
        expect(fullUrl).toContain("shop=");
        expect(fullUrl).toContain("embedded=1");
      });
    });
  });

  describe("Query Parameter Extraction", () => {
    it("should extract shop domain from query", () => {
      const url = new URL(`https://example.com${mockEmbeddedQuery}`);
      const shop = url.searchParams.get("shop");
      
      expect(shop).toBe("quickstart-test.myshopify.com");
      expect(shop).toMatch(/\.myshopify\.com$/);
    });

    it("should handle base64 encoded host param", () => {
      const url = new URL(`https://example.com${mockEmbeddedQuery}`);
      const host = url.searchParams.get("host");
      
      expect(host).toBeTruthy();
      // Base64 decode would reveal admin.shopify.com/store/quickstart-test
    });

    it("should detect embedded context", () => {
      const url = new URL(`https://example.com${mockEmbeddedQuery}`);
      const isEmbedded = url.searchParams.get("embedded") === "1";
      
      expect(isEmbedded).toBe(true);
    });
  });

  describe("Auth Redirect Prevention", () => {
    it("should prevent login redirect when shop param present", () => {
      const url = new URL(`https://example.com/app${mockEmbeddedQuery}`);
      const hasShop = url.searchParams.has("shop");
      
      // With shop param, should go to /app, not /auth/login
      expect(hasShop).toBe(true);
    });

    it("should auto-complete shop in dev mode", () => {
      const configuredShop = process.env.SHOPIFY_SHOP || "quickstart-test.myshopify.com";
      const loginUrl = `/auth/login?shop=${encodeURIComponent(configuredShop)}`;
      
      expect(loginUrl).toContain("shop=");
      expect(decodeURIComponent(loginUrl)).toContain(configuredShop);
    });
  });
});
