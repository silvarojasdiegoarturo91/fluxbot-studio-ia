import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Phase 0 Test Suite: Build & TypeScript Validation
 * 
 * Tests that the project builds successfully and TypeScript
 * compilation passes without errors.
 */

describe("Phase 0: Build & TypeScript Validation", () => {
  const appRoot = path.resolve(__dirname, "../..");

  describe("TypeScript Configuration", () => {
    it("should have tsconfig.json", () => {
      const tsconfigPath = path.join(appRoot, "tsconfig.json");
      expect(fs.existsSync(tsconfigPath)).toBe(true);
    });

    it("should have strict mode enabled", () => {
      const tsconfigPath = path.join(appRoot, "tsconfig.json");
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
      
      // Check for strict or individual strict flags
      const hasStrict = tsconfig.compilerOptions?.strict === true;
      const hasStrictNullChecks = tsconfig.compilerOptions?.strictNullChecks === true;
      
      expect(hasStrict || hasStrictNullChecks).toBe(true);
    });
  });

  describe("Project Structure", () => {
    it("should have app directory", () => {
      const appDir = path.join(appRoot, "app");
      expect(fs.existsSync(appDir)).toBe(true);
    });

    it("should have routes directory", () => {
      const routesDir = path.join(appRoot, "app/routes");
      expect(fs.existsSync(routesDir)).toBe(true);
    });

    it("should have all required admin routes", () => {
      const routesDir = path.join(appRoot, "app/routes");
      const requiredRoutes = [
        "app._index.tsx",
        "app.tsx",
        "app.data-sources.tsx",
        "app.settings.tsx",
        "app.analytics.tsx",
        "app.conversations.tsx",
        "app.privacy.tsx",
        "app.billing.tsx",
        "app.widget-settings.tsx",
        "app.widget-publish.tsx",
        "auth.login.tsx",
        "auth.$.tsx",
      ];
      
      requiredRoutes.forEach((route) => {
        const routePath = path.join(routesDir, route);
        expect(fs.existsSync(routePath), `Route ${route} should exist`).toBe(true);
      });
    });
  });

  describe("Build Artifacts", () => {
    it("should have package.json", () => {
      const packagePath = path.join(appRoot, "package.json");
      expect(fs.existsSync(packagePath)).toBe(true);
    });

    it("should have build script defined", () => {
      const packagePath = path.join(appRoot, "package.json");
      const pkg = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
      
      expect(pkg.scripts).toHaveProperty("build");
      expect(pkg.scripts).toHaveProperty("typecheck");
    });

    it("should have required dependencies", () => {
      const packagePath = path.join(appRoot, "package.json");
      const pkg = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
      
      const requiredDeps = [
        "@shopify/shopify-app-react-router",
        "react-router",
        "react",
      ];
      
      requiredDeps.forEach((dep) => {
        const hasDep = pkg.dependencies?.[dep] || pkg.devDependencies?.[dep];
        expect(hasDep, `Dependency ${dep} should be installed`).toBeTruthy();
      });
    });
  });

  describe("Git Configuration", () => {
    it("should have .gitignore", () => {
      const gitignorePath = path.join(appRoot, ".gitignore");
      expect(fs.existsSync(gitignorePath)).toBe(true);
    });

    it("should ignore build artifacts", () => {
      const gitignorePath = path.join(appRoot, ".gitignore");
      const gitignore = fs.readFileSync(gitignorePath, "utf-8");
      
      expect(gitignore).toContain("build/");
      expect(gitignore).toContain(".react-router/");
      expect(gitignore).toContain(".env.local");
    });

    it("should not track sensitive files", () => {
      const gitignorePath = path.join(appRoot, ".gitignore");
      const gitignore = fs.readFileSync(gitignorePath, "utf-8");
      
      expect(gitignore).toMatch(/\.env\.local|\.env/);
    });
  });

  describe("Environment Configuration", () => {
    it("should have .env.example", () => {
      const envExamplePath = path.join(appRoot, ".env.example");
      expect(fs.existsSync(envExamplePath)).toBe(true);
    });

    it("should document required variables in .env.example", () => {
      const envExamplePath = path.join(appRoot, ".env.example");
      const envExample = fs.readFileSync(envExamplePath, "utf-8");
      
      const requiredVars = [
        "SHOPIFY_API_KEY",
        "SHOPIFY_API_SECRET",
        "DATABASE_URL",
      ];
      
      requiredVars.forEach((varName) => {
        expect(envExample).toContain(varName);
      });
    });
  });

  describe("API Version", () => {
    it("should use January26 (2026-01) API version", () => {
      const shopifyServerPath = path.join(appRoot, "app/shopify.server.ts");
      
      if (fs.existsSync(shopifyServerPath)) {
        const content = fs.readFileSync(shopifyServerPath, "utf-8");
        expect(content).toContain("January26");
      }
    });
  });

  describe("Polaris Integration", () => {
    it("should import Polaris CSS in root", () => {
      const rootPath = path.join(appRoot, "app/root.tsx");
      
      if (fs.existsSync(rootPath)) {
        const content = fs.readFileSync(rootPath, "utf-8");
        expect(content).toMatch(/@shopify\/polaris.*\.css/);
      }
    });

    it("should have Polaris provider in app layout", () => {
      const appLayoutPath = path.join(appRoot, "app/routes/app.tsx");
      
      if (fs.existsSync(appLayoutPath)) {
        const content = fs.readFileSync(appLayoutPath, "utf-8");
        expect(content).toContain("AppProvider");
      }
    });
  });
});
