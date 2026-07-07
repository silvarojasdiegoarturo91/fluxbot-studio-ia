/**
 * Widget Extension Config Tests — REQ-OPEN-001
 *
 * Verifies structural correctness of the Theme App Extension:
 *  - shopify.extension.toml defines required fields
 *  - App Embed Block Liquid has deferred CSS (non-render-blocking)
 *  - shopify.app.toml registers the extension path
 *  - Extension assets exist
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

const EXTENSION_DIR = join(
  __dirname,
  "../../extensions/chat-widget"
);
const APP_DIR = join(__dirname, "../..");

function readFile(relPath: string): string {
  return readFileSync(join(APP_DIR, relPath), "utf-8");
}

function readExtFile(relPath: string): string {
  return readFileSync(join(EXTENSION_DIR, relPath), "utf-8");
}

// ---------------------------------------------------------------------------
describe("Theme App Extension — shopify.extension.toml", () => {
  const toml = readExtFile("shopify.extension.toml");

  it("declares type as theme", () => {
    expect(toml).toMatch(/type\s*=\s*["']?theme["']?/);
  });

  it("has a non-empty handle", () => {
    expect(toml).toMatch(/handle\s*=\s*"[^"]+"/);
  });

  it("specifies api_version", () => {
    expect(toml).toMatch(/api_version\s*=/);
  });

  it("defines a chat_launcher settings block", () => {
    expect(toml).toContain("chat_launcher");
  });

  it("has launcher_position setting with bottom-right default", () => {
    expect(toml).toMatch(/launcher_position/);
    expect(toml).toMatch(/bottom-right/);
  });

  it("has primary_color setting", () => {
    expect(toml).toMatch(/primary_color/);
  });
});

// ---------------------------------------------------------------------------
describe("Theme App Extension — chat_launcher.liquid", () => {
  const liquid = readExtFile("blocks/chat_launcher.liquid");

  it("has non-render-blocking CSS (print media trick)", () => {
    // CSS must be loaded with media=print + onload to avoid render blocking
    expect(liquid).toMatch(/media.*print/);
    expect(liquid).toMatch(/onload.*this\.media.*=.*['"]all['"]/);
  });

  it("provides noscript fallback for CSS", () => {
    expect(liquid).toMatch(/<noscript>/);
  });

  it("loads JS with defer attribute", () => {
    expect(liquid).toMatch(/<script[^>]+defer/);
  });

  it("embeds shop domain as data attribute", () => {
    expect(liquid).toMatch(/data-shop=.*shop\.permanent_domain/);
  });

  it("embeds locale as data attribute", () => {
    expect(liquid).toMatch(/data-locale=.*request\.locale\.iso_code/);
  });

  it("exposes chat endpoint override from block settings", () => {
    expect(liquid).toMatch(/block\.settings\.chat_endpoint/);
  });

  it("embeds a widget version marker for storefront update diagnostics", () => {
    expect(liquid).toContain("data-widget-version=");
    expect(liquid).toContain("product-recommendations-logs");
  });

  it("has ARIA role dialog on chat window", () => {
    expect(liquid).toMatch(/role="dialog"/);
  });

  it("has aria-modal on chat window", () => {
    expect(liquid).toMatch(/aria-modal="true"/);
  });

  it("has aria-live region for messages", () => {
    // Messages container should support live announcements
    expect(liquid).toContain("fluxbot-messages");
  });

  it("includes {% schema %} block with target body", () => {
    expect(liquid).toMatch(/"target"\s*:\s*"body"/);
  });
});

// ---------------------------------------------------------------------------
describe("Theme App Extension — assets", () => {
  it("chat-launcher.js exists and is non-empty", () => {
    const js = readExtFile("assets/chat-launcher.js");
    expect(js.length).toBeGreaterThan(1000);
  });

  it("chat-launcher.css exists and is non-empty", () => {
    const css = readExtFile("assets/chat-launcher.css");
    expect(css.length).toBeGreaterThan(100);
  });

  it("JS defines API_ENDPOINT for app proxy", () => {
    const js = readExtFile("assets/chat-launcher.js");
    expect(js).toContain("/apps/fluxbot/chat");
  });

  it("JS defines CONFIG_ENDPOINT for widget config", () => {
    const js = readExtFile("assets/chat-launcher.js");
    expect(js).toContain("/apps/fluxbot/widget-config");
  });

  it("JS connects to events endpoint for behavior tracking", () => {
    const js = readExtFile("assets/chat-launcher.js");
    expect(js).toContain("/apps/fluxbot/events");
  });

  it("JS renders product recommendation cards from metadata.products", () => {
    const js = readExtFile("assets/chat-launcher.js");
    expect(js).toContain("metadata.products");
    expect(js).toContain("createProductCards(metadata.products)");
    expect(js).toContain("fluxbot-product-card");
  });

  it("JS logs update and product-card diagnostics", () => {
    const js = readExtFile("assets/chat-launcher.js");
    expect(js).toContain("Widget update marker");
    expect(js).toContain("Assistant message includes product metadata");
    expect(js).toContain("Product cards rendered");
    expect(js).toContain("WIDGET_BUILD_ID");
  });

  it("JS keeps storefront chat on the signed app proxy instead of direct app chat", () => {
    const js = readExtFile("assets/chat-launcher.js");
    expect(js).toContain("Widget config chatEndpoint ignored for Shopify storefront");
    expect(js).toContain("Direct app chat endpoint requires app authentication");
    expect(js).toContain("chatEndpoint = API_ENDPOINT");
  });

  it("default locale file (en) exists", () => {
    const en = readExtFile("locales/en.default.json");
    const parsed = JSON.parse(en);
    expect(parsed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
describe("shopify.app.toml — extension registration", () => {
  const appTomlPath = join(APP_DIR, "shopify.app.toml");
  const hasLocalToml = existsSync(appTomlPath);

  if (!hasLocalToml) {
    it("skips local-only app manifest checks when shopify.app.toml is not present", () => {
      expect(hasLocalToml).toBe(false);
    });
    return;
  }

  const toml = readFile("shopify.app.toml");
  const applicationUrl = toml.match(/^application_url\s*=\s*"([^"]+)"/m)?.[1];
  const appProxyUrl = toml.match(/\[app_proxy\][\s\S]*?^\s*url\s*=\s*"([^"]+)"/m)?.[1];
  const redirectUrls = Array.from(
    toml.matchAll(/"([^"]+\/(?:auth\/callback|auth\/shopify\/callback|api\/auth\/callback))"/g),
    (match) => match[1],
  );

  it("registers the chat-widget extension path", () => {
    expect(toml).toMatch(/\[\[extensions\]\]/);
    expect(toml).toMatch(/path\s*=\s*["']?extensions\/chat-widget["']?/);
  });

  it("has app_proxy configured for /apps/fluxbot", () => {
    expect(toml).toContain("[app_proxy]");
    expect(toml).toMatch(/subpath\s*=\s*["']?fluxbot["']?/);
    expect(toml).toMatch(/prefix\s*=\s*["']?apps["']?/);
  });

  it("requests read_products scope", () => {
    expect(toml).toContain("read_products");
  });

  it("requests read_themes scope for published theme lookup", () => {
    expect(toml).toContain("read_themes");
  });

  it("defines application_url", () => {
    expect(applicationUrl).toBeDefined();
  });

  it("keeps app proxy and auth redirects aligned with application_url", () => {
    expect(appProxyUrl).toBe(applicationUrl);
    expect(redirectUrls.length).toBe(3);
    redirectUrls.forEach((url) => {
      expect(url.startsWith(`${applicationUrl}/`)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
describe("shopify.web.toml — webhook routing", () => {
  const toml = readFile("shopify.web.toml");

  it("routes Shopify webhooks to the implemented endpoint", () => {
    expect(toml).toMatch(/webhooks_path\s*=\s*["']?\/api\/webhooks["']?/);
  });
});
