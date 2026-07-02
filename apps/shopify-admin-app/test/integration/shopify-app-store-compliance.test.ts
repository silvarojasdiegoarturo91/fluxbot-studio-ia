import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APP_DIR = resolve(__dirname, "../..");
const WORKSPACE_ROOT = resolve(APP_DIR, "..", "..", "..");

function readText(relativePath: string) {
  return readFileSync(join(WORKSPACE_ROOT, relativePath), "utf8");
}

describe("Shopify App Store compliance baseline", () => {
  it("keeps the app manifest embedded, scoped and redirect-safe", () => {
    const manifest = readText("fluxbot-studio-ia-shopify/apps/shopify-admin-app/shopify.app.toml");

    expect(manifest).toContain("embedded = true");
    expect(manifest).toContain('application_url = "https://fluxbot-local-dev.invalid"');
    expect(manifest).toContain('redirect_urls = [');
    expect(manifest).toContain('https://fluxbot-local-dev.invalid/auth/callback');
    expect(manifest).toContain('https://fluxbot-local-dev.invalid/auth/shopify/callback');
    expect(manifest).toContain('https://fluxbot-local-dev.invalid/api/auth/callback');
    expect(manifest).toContain('scopes = "read_products,write_products,read_orders,read_customers,read_content,read_locales,read_online_store_pages,read_themes"');
    expect(manifest).toContain('[[extensions]]');
    expect(manifest).toContain('path = "extensions/chat-widget"');
  });

  it("mounts the embedded Shopify shell and navigation menu in the app route", () => {
    const appRoute = readText("fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/routes/app.tsx");

    expect(appRoute).toContain('AppProvider as ShopifyEmbeddedAppProvider');
    expect(appRoute).toContain('embedded apiKey={apiKey}');
    expect(appRoute).toContain("<NavMenu>");
    expect(appRoute).toContain("onboardingCompleted &&");
    expect(appRoute).toContain('buildSessionTokenBounceRedirectPath');
  });

  it("registers session storage and webhook handling in the Shopify server", () => {
    const server = readText("fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/shopify.server.ts");

    expect(server).toContain("PrismaSessionStorage");
    expect(server).toContain("APP_UNINSTALLED");
    expect(server).toContain('callbackUrl: "/api/webhooks"');
    expect(server).toContain("afterAuth");
    expect(server).toContain("registerWebhooks({ session })");
  });

  it("routes billing through Shopify Billing API and App Subscription creation", () => {
    const billingService = readText("fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/services/billing.server.ts");
    const billingRoute = readText("fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/routes/app.billing.tsx");

    expect(billingService).toContain("appSubscriptionCreate");
    expect(billingService).toContain("Shopify billing request failed");
    expect(billingService).toContain("currentAppInstallation");
    expect(billingRoute).toContain("BillingService.createSubscription");
    expect(billingRoute).toContain("Continue with Shopify Billing");
  });

  it("reads shop connection data through GraphQL Admin API on the dashboard", () => {
    const dashboard = readText("fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/routes/app._index.tsx");

    expect(dashboard).toContain("SHOP_CONNECTION_QUERY");
    expect(dashboard).toContain("admin.graphql(SHOP_CONNECTION_QUERY)");
    expect(dashboard).toContain("myshopifyDomain");
    expect(dashboard).toContain("primaryDomain");
  });

  it("declares the storefront widget as a theme app extension", () => {
    const extension = readText(
      "fluxbot-studio-ia-shopify/apps/storefront-widget/extensions/chat-widget/shopify.extension.toml",
    );

    expect(extension).toContain('type = "theme"');
    expect(extension).toContain('handle = "ai-chat-widget"');
    expect(extension).toContain('type = "checkbox"');
    expect(extension).toContain('id = "launcher_position"');
    expect(extension).toContain('id = "primary_color"');
    expect(extension).toContain('id = "welcome_message"');
  });

  it("publishes the widget through the Theme Editor deep link and read_themes scope", () => {
    const publishRoute = readText("fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/routes/app.widget-publish.tsx");

    expect(publishRoute).toContain("read_themes");
    expect(publishRoute).toContain("buildThemeEditorUrl");
    expect(publishRoute).toContain("/admin/themes/");
    expect(publishRoute).toContain("?context=apps");
    expect(publishRoute).toContain('EXTENSION_HANDLE = "ai-chat-widget"');
  });

  it("keeps storefront widget settings canonical in Admin", () => {
    const settingsRoute = readText("fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/routes/app.widget-settings.tsx");

    expect(settingsRoute).toContain("launcherPosition");
    expect(settingsRoute).toContain("primaryColor");
    expect(settingsRoute).toContain("launcherLabel");
    expect(settingsRoute).toContain("welcomeMessage");
    expect(settingsRoute).toContain("saveMerchantAdminConfig");
    expect(settingsRoute).toContain("^#[0-9A-Fa-f]{6}$");
  });

  it("documents privacy, retention and legal hold flows in the app", () => {
    const privacyRoute = readText("fluxbot-studio-ia-shopify/apps/shopify-admin-app/app/routes/app.privacy.tsx");

    expect(privacyRoute).toContain("AuditReportService");
    expect(privacyRoute).toContain("BreachNotificationService");
    expect(privacyRoute).toContain("ComplianceSIEMExportService");
    expect(privacyRoute).toContain("DataResidencyService");
    expect(privacyRoute).toContain("LegalHoldService");
    expect(privacyRoute).toContain("ProcessingRecordService");
    expect(privacyRoute).toContain("RegionalDeploymentControlService");
    expect(privacyRoute).toContain("RetentionEnforcementService");
    expect(privacyRoute).toContain("SupportAgentAccessService");
    expect(privacyRoute).toContain('intent === "export_siem"');
    expect(privacyRoute).toContain('intent === "set_retention_policy"');
    expect(privacyRoute).toContain('intent === "create_legal_hold"');
  });

  it("tracks the Shopify App Store compliance feature in OpenSpec and SpecKit", () => {
    const openSpec = readText("fluxbot-studio-ia-shopify/.openspec.json");
    const featureReadme = readText("fluxbot-studio-ia-shopify/specs/features/shopify-app-store-compliance/README.md");
    const requirements = readText("fluxbot-studio-ia-shopify/specs/features/shopify-app-store-compliance/requirements.md");
    const testCases = readText("fluxbot-studio-ia-shopify/specs/features/shopify-app-store-compliance/test-cases.md");
    const manualEvidence = readText("fluxbot-studio-ia-shopify/specs/features/shopify-app-store-compliance/manual-evidence.md");
    const spec = readText("fluxbot-studio-ia-shopify/specs/010-shopify-app-store-compliance/spec.md");
    const plan = readText("fluxbot-studio-ia-shopify/specs/010-shopify-app-store-compliance/plan.md");
    const tasks = readText("fluxbot-studio-ia-shopify/specs/010-shopify-app-store-compliance/tasks.md");
    const checklist = readText("fluxbot-studio-ia-shopify/specs/010-shopify-app-store-compliance/checklists/requirements.md");

    expect(openSpec).toContain("REQ-IA-SHOPIFY-003");
    expect(featureReadme).toContain("Shopify App Store Compliance");
    expect(requirements).toContain("Unsupported Shopify families");
    expect(testCases).toContain("theme app extension");
    expect(manualEvidence).toContain("Support contact email");
    expect(spec).toContain("Shopify App Store Compliance");
    expect(plan).toContain("payments/purchase-option/POS flows");
    expect(tasks).toContain("Phase 3: Repo-wide documentation alignment");
    expect(checklist).toContain("CHK-005");
  });

  it("explicitly documents the excluded Shopify families", () => {
    const featureReadme = readText("fluxbot-studio-ia-shopify/specs/features/shopify-app-store-compliance/README.md");
    const manualEvidence = readText("fluxbot-studio-ia-shopify/specs/features/shopify-app-store-compliance/manual-evidence.md");

    expect(featureReadme).toContain("Payments apps");
    expect(featureReadme).toContain("Purchase-option apps");
    expect(featureReadme).toContain("Payment facilitator apps");
    expect(featureReadme).toContain("POS integrations");
    expect(manualEvidence).toContain(
      "Payments app, purchase option, payment facilitator and POS review families do not apply to this repo.",
    );
  });

  it("keeps the compliance command available from package.json", () => {
    const packageJson = JSON.parse(
      readText("fluxbot-studio-ia-shopify/apps/shopify-admin-app/package.json"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["test:app-store-compliance"]).toBe(
      "vitest run test/integration/shopify-app-store-compliance.test.ts",
    );
  });

  it("ships the expected compliance files on disk", () => {
    const files = [
      "fluxbot-studio-ia-shopify/specs/features/shopify-app-store-compliance/README.md",
      "fluxbot-studio-ia-shopify/specs/features/shopify-app-store-compliance/requirements.md",
      "fluxbot-studio-ia-shopify/specs/features/shopify-app-store-compliance/test-cases.md",
      "fluxbot-studio-ia-shopify/specs/features/shopify-app-store-compliance/manual-evidence.md",
      "fluxbot-studio-ia-shopify/specs/010-shopify-app-store-compliance/spec.md",
      "fluxbot-studio-ia-shopify/specs/010-shopify-app-store-compliance/plan.md",
      "fluxbot-studio-ia-shopify/specs/010-shopify-app-store-compliance/tasks.md",
      "fluxbot-studio-ia-shopify/specs/010-shopify-app-store-compliance/checklists/requirements.md",
    ];

    for (const relativePath of files) {
      expect(existsSync(join(WORKSPACE_ROOT, relativePath))).toBe(true);
    }
  });
});
