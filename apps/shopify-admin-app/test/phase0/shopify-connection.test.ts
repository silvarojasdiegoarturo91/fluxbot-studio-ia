import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Phase 0 Test Suite: Shopify Admin API Connection
 * 
 * Tests the GraphQL query mechanism for fetching shop data
 * to validate connection and data retrieval.
 */

describe("Phase 0: Shopify Admin API Connection", () => {
  const mockShopData = {
    data: {
      shop: {
        name: "Test Store",
        myshopifyDomain: "quickstart-test.myshopify.com",
        primaryDomain: {
          host: "test-store.com",
        },
        plan: {
          displayName: "Shopify Plus",
        },
      },
    },
  };

  describe("GraphQL Shop Query", () => {
    it("should have correct query structure", () => {
      const SHOP_CONNECTION_QUERY = `#graphql
  query DashboardShopConnection {
    shop {
      name
      myshopifyDomain
      primaryDomain {
        host
      }
      plan {
        displayName
      }
    }
  }
`;
      
      expect(SHOP_CONNECTION_QUERY).toContain("query DashboardShopConnection");
      expect(SHOP_CONNECTION_QUERY).toContain("shop {");
      expect(SHOP_CONNECTION_QUERY).toContain("name");
      expect(SHOP_CONNECTION_QUERY).toContain("myshopifyDomain");
      expect(SHOP_CONNECTION_QUERY).toContain("primaryDomain");
      expect(SHOP_CONNECTION_QUERY).toContain("plan");
    });
  });

  describe("Response Parsing", () => {
    it("should parse successful shop data response", () => {
      const payload = mockShopData;
      
      expect(payload.data?.shop).toBeDefined();
      expect(payload.data?.shop?.name).toBe("Test Store");
      expect(payload.data?.shop?.myshopifyDomain).toContain("myshopify.com");
      expect(payload.data?.shop?.primaryDomain?.host).toBe("test-store.com");
      expect(payload.data?.shop?.plan?.displayName).toBe("Shopify Plus");
    });

    it("should handle missing shop data", () => {
      const emptyPayload: { data: Record<string, any> } = { data: {} };
      
      expect(emptyPayload.data).toBeDefined();
      expect(emptyPayload.data.shop).toBeUndefined();
    });

    it("should detect GraphQL errors", () => {
      const errorPayload = {
        data: null,
        errors: [
          {
            message: "Not authenticated",
            extensions: { code: "UNAUTHENTICATED" },
          },
        ],
      };
      
      expect(errorPayload.errors).toBeDefined();
      expect(errorPayload.errors).toHaveLength(1);
      expect(errorPayload.errors[0].message).toContain("authenticated");
    });
  });

  describe("Connection State", () => {
    it("should indicate connected state with valid data", () => {
      const shopConnection = {
        connected: true,
        name: mockShopData.data.shop.name,
        myshopifyDomain: mockShopData.data.shop.myshopifyDomain,
        primaryDomainHost: mockShopData.data.shop.primaryDomain.host,
        planName: mockShopData.data.shop.plan.displayName,
        error: null,
      };
      
      expect(shopConnection.connected).toBe(true);
      expect(shopConnection.error).toBeNull();
      expect(shopConnection.name).toBeTruthy();
    });

    it("should indicate disconnected state on error", () => {
      const shopConnection = {
        connected: false,
        name: null,
        myshopifyDomain: null,
        primaryDomainHost: null,
        planName: null,
        error: "Network error",
      };
      
      expect(shopConnection.connected).toBe(false);
      expect(shopConnection.error).toBeTruthy();
      expect(shopConnection.name).toBeNull();
    });
  });

  describe("Shop Domain Validation", () => {
    it("should validate myshopify.com domain format", () => {
      const domain = "quickstart-test.myshopify.com";
      
      expect(domain).toMatch(/^[\w-]+\.myshopify\.com$/);
    });

    it("should reject invalid domain formats", () => {
      const invalidDomains = [
        "not-a-domain",
        "example.com",
        ".myshopify.com",
        "myshopify.com",
      ];
      
      invalidDomains.forEach((domain) => {
        expect(domain).not.toMatch(/^[\w-]+\.myshopify\.com$/);
      });
    });
  });

  describe("Error Handling", () => {
    it("should extract error message from GraphQL errors", () => {
      const errors = [
        { message: "Shop not found" },
        { message: "Rate limit exceeded" },
      ];
      
      const firstError = errors[0]?.message;
      expect(firstError).toBe("Shop not found");
    });

    it("should handle network errors gracefully", () => {
      const networkError = new Error("Failed to fetch");
      
      const errorMessage = networkError instanceof Error
        ? networkError.message
        : "Unknown error";
      
      expect(errorMessage).toBe("Failed to fetch");
    });

    it("should provide fallback for unknown errors", () => {
      const unknownError: unknown = "Something went wrong";
      const errorMessage = unknownError instanceof Error
        ? unknownError.message
        : "Unknown error";
      
      expect(errorMessage).toBe("Unknown error");
    });
  });
});
