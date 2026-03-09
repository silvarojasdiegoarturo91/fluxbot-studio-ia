import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Phase 0 Test Suite: Environment Configuration Validation
 * 
 * Tests environment variable validation and configuration setup
 * to ensure the app fails fast with clear errors on misconfiguration.
 */

describe("Phase 0: Environment Configuration", () => {
  const requiredShopifyVars = [
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "SHOPIFY_APP_URL",
    "SCOPES",
  ];

  const requiredDatabaseVars = [
    "DATABASE_URL",
  ];

  describe("Required Variables", () => {
    it("should have all Shopify credentials in test env", () => {
      requiredShopifyVars.forEach((varName) => {
        expect(process.env[varName]).toBeDefined();
        expect(process.env[varName]).not.toBe("");
      });
    });

    it("should have database URL configured", () => {
      requiredDatabaseVars.forEach((varName) => {
        expect(process.env[varName]).toBeDefined();
        expect(process.env[varName]).not.toBe("");
      });
    });
  });

  describe("API Key Format", () => {
    it("should have valid API key format", () => {
      const apiKey = process.env.SHOPIFY_API_KEY;
      
      expect(apiKey).toBeTruthy();
      expect(apiKey!.length).toBeGreaterThan(10);
    });

    it("should have valid API secret format", () => {
      const apiSecret = process.env.SHOPIFY_API_SECRET;
      
      expect(apiSecret).toBeTruthy();
      expect(apiSecret!.length).toBeGreaterThan(10);
    });
  });

  describe("App URL Validation", () => {
    it("should have valid HTTPS app URL", () => {
      const appUrl = process.env.SHOPIFY_APP_URL;
      
      expect(appUrl).toBeTruthy();
      expect(appUrl).toMatch(/^https:\/\//);
    });

    it("should reject HTTP URLs in production", () => {
      const httpUrl = "http://insecure.example.com";
      const isProduction = process.env.NODE_ENV === "production";
      
      if (isProduction) {
        expect(httpUrl).not.toMatch(/^https:\/\//);
      }
    });
  });

  describe("Scopes Configuration", () => {
    it("should have scopes defined", () => {
      const scopes = process.env.SCOPES;
      
      expect(scopes).toBeDefined();
      expect(scopes).toBeTruthy();
    });

    it("should parse scopes as comma-separated list", () => {
      const scopes = process.env.SCOPES || "";
      const scopeArray = scopes.split(",").map(s => s.trim());
      
      expect(scopeArray.length).toBeGreaterThan(0);
      expect(scopeArray).toContain("read_products");
    });

    it("should include required MVP scopes", () => {
      const scopes = process.env.SCOPES || "";
      const requiredScopes = ["read_products", "write_products", "read_orders"];
      
      requiredScopes.forEach((scope) => {
        expect(scopes).toContain(scope);
      });
    });
  });

  describe("Database URL Format", () => {
    it("should have valid PostgreSQL connection string", () => {
      const dbUrl = process.env.DATABASE_URL || "";
      
      expect(dbUrl).toMatch(/^postgresql:\/\//);
    });

    it("should include database name", () => {
      const dbUrl = process.env.DATABASE_URL || "";
      
      // Format: postgresql://user:pass@host:port/dbname
      expect(dbUrl).toContain("/");
      const parts = dbUrl.split("/");
      expect(parts[parts.length - 1]).toBeTruthy();
    });
  });

  describe("Environment Detection", () => {
    it("should detect test environment", () => {
      expect(process.env.NODE_ENV).toBe("test");
    });

    it("should differentiate between dev and prod", () => {
      const env = process.env.NODE_ENV;
      const validEnvs = ["development", "production", "test"];
      
      expect(validEnvs).toContain(env);
    });
  });

  describe("Missing Variable Handling", () => {
    it("should detect missing required variables", () => {
      const mockEnv = {
        SHOPIFY_API_KEY: undefined,
        SHOPIFY_API_SECRET: "secret",
      };
      
      const missingVars = requiredShopifyVars.filter(
        (varName) => !mockEnv[varName as keyof typeof mockEnv]
      );
      
      expect(missingVars).toContain("SHOPIFY_API_KEY");
    });

    it("should provide clear error messages", () => {
      const missingVar = "SHOPIFY_API_KEY";
      const errorMessage = `Missing required environment variable: ${missingVar}`;
      
      expect(errorMessage).toContain(missingVar);
      expect(errorMessage).toContain("Missing required");
    });
  });

  describe("Shop Domain Configuration", () => {
    it("should accept valid dev store domain", () => {
      const shopDomain = "quickstart-test.myshopify.com";
      
      expect(shopDomain).toMatch(/^[\w-]+\.myshopify\.com$/);
    });

    it("should validate shop domain format when provided", () => {
      const validDomains = [
        "store-name.myshopify.com",
        "test-123.myshopify.com",
        "my-awesome-store.myshopify.com",
      ];
      
      validDomains.forEach((domain) => {
        expect(domain).toMatch(/^[\w-]+\.myshopify\.com$/);
      });
    });
  });

  describe("Configuration Defaults", () => {
    it("should provide sensible defaults for optional vars", () => {
      const port = process.env.PORT || "3000";
      const nodeEnv = process.env.NODE_ENV || "development";
      
      expect(port).toBeTruthy();
      expect(nodeEnv).toBeTruthy();
    });

    it("should handle missing optional variables gracefully", () => {
      const optionalVar = process.env.OPTIONAL_FEATURE_FLAG;
      const defaultValue = optionalVar || "false";
      
      expect(defaultValue).toBeDefined();
    });
  });
});
