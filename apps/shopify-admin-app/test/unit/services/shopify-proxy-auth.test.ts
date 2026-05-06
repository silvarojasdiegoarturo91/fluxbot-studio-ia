import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "crypto";

// Must stub SHOPIFY_API_SECRET before importing the module
const TEST_SECRET = "test_proxy_secret_abc123";

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = TEST_SECRET;
});

import { verifyShopifyProxyRequest } from "../../../app/services/shopify-proxy-auth.server";

// ---------------------------------------------------------------------------
// Helper: build a signed URL the same way Shopify does
// ---------------------------------------------------------------------------
function buildSignedUrl(baseUrl: string, params: Record<string, string>): string {
  const urlObj = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (key !== "signature") {
      urlObj.searchParams.set(key, value);
    }
  }

  // Build canonical message (alphabetically sorted, hmac/signature excluded)
  const entries = [...urlObj.searchParams.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b));
  const canonical = entries.map(([k, v]) => `${k}=${v}`).join("");

  const signature = createHmac("sha256", TEST_SECRET).update(canonical).digest("hex");
  urlObj.searchParams.set("signature", signature);
  return urlObj.toString();
}

describe("verifyShopifyProxyRequest", () => {
  it("returns true for a correctly signed request", () => {
    const signed = buildSignedUrl("https://app.example.com/apps/fluxbot/chat", {
      shop: "test-shop.myshopify.com",
      path_prefix: "/apps/fluxbot",
      timestamp: "1700000000",
    });
    const request = new Request(signed);
    expect(verifyShopifyProxyRequest(request)).toBe(true);
  });

  it("returns false when the signature is tampered", () => {
    const signed = buildSignedUrl("https://app.example.com/apps/fluxbot/chat", {
      shop: "test-shop.myshopify.com",
      timestamp: "1700000000",
    });
    // Replace last two hex chars to corrupt the signature
    const tampered = signed.replace(/signature=[0-9a-f]+/, (match) => {
      const value = match.slice("signature=".length);
      const corrupted = value.slice(0, -2) + "00";
      return `signature=${corrupted}`;
    });
    const request = new Request(tampered);
    expect(verifyShopifyProxyRequest(request)).toBe(false);
  });

  it("returns false when there is no signature or hmac parameter", () => {
    const request = new Request(
      "https://app.example.com/apps/fluxbot/chat?shop=test-shop.myshopify.com",
    );
    expect(verifyShopifyProxyRequest(request)).toBe(false);
  });

  it("allows unsigned requests in development when allowUnsignedInDevelopment is set", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const request = new Request(
      "https://app.example.com/apps/fluxbot/chat?shop=test-shop.myshopify.com",
    );
    expect(verifyShopifyProxyRequest(request, { allowUnsignedInDevelopment: true })).toBe(true);
    process.env.NODE_ENV = originalEnv;
  });

  it("rejects unsigned requests in production even with allowUnsignedInDevelopment", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const request = new Request(
      "https://app.example.com/apps/fluxbot/chat?shop=test-shop.myshopify.com",
    );
    expect(verifyShopifyProxyRequest(request, { allowUnsignedInDevelopment: true })).toBe(false);
    process.env.NODE_ENV = originalEnv;
  });

  it("returns false when the api secret is absent", () => {
    delete process.env.SHOPIFY_API_SECRET;
    const signed = buildSignedUrl("https://app.example.com/apps/fluxbot/chat", {
      shop: "test-shop.myshopify.com",
      timestamp: "1700000000",
    });
    const request = new Request(signed);
    expect(verifyShopifyProxyRequest(request)).toBe(false);
    process.env.SHOPIFY_API_SECRET = TEST_SECRET;
  });

  it("returns false when the signature is not valid hex", () => {
    const request = new Request(
      "https://app.example.com/apps/fluxbot/chat?shop=test&signature=not-hex!",
    );
    expect(verifyShopifyProxyRequest(request)).toBe(false);
  });

  it("verifies hmac parameter as an alternative to signature", () => {
    const urlObj = new URL("https://app.example.com/apps/fluxbot/chat");
    urlObj.searchParams.set("shop", "test-shop.myshopify.com");
    urlObj.searchParams.set("timestamp", "1700000000");

    const canonical = "shop=test-shop.myshopifytimestamp=1700000000"
      .split("")
      .join(""); // keep as-is; build properly below

    const entries = [
      ["shop", "test-shop.myshopify.com"],
      ["timestamp", "1700000000"],
    ].sort(([a], [b]) => a.localeCompare(b));
    const canonicalMsg = entries.map(([k, v]) => `${k}=${v}`).join("");
    const hmac = createHmac("sha256", TEST_SECRET).update(canonicalMsg).digest("hex");
    urlObj.searchParams.set("hmac", hmac);

    const request = new Request(urlObj.toString());
    expect(verifyShopifyProxyRequest(request)).toBe(true);
  });

  it("excludes the hmac parameter from the canonical message when computing the signature", () => {
    // Build with 'hmac' key — it must be excluded from the canonical message
    const urlObj = new URL("https://app.example.com/apps/fluxbot/chat");
    urlObj.searchParams.set("shop", "myshop.myshopify.com");
    urlObj.searchParams.set("timestamp", "1234567890");
    urlObj.searchParams.set("hmac", "dummy"); // will be replaced

    const entries = [
      ["shop", "myshop.myshopify.com"],
      ["timestamp", "1234567890"],
    ].sort(([a], [b]) => a.localeCompare(b));
    const canonical = entries.map(([k, v]) => `${k}=${v}`).join("");
    const correctHmac = createHmac("sha256", TEST_SECRET).update(canonical).digest("hex");
    urlObj.searchParams.set("hmac", correctHmac);

    expect(verifyShopifyProxyRequest(new Request(urlObj.toString()))).toBe(true);
  });

  it("handles multiple query parameters sorted alphabetically", () => {
    // Parameters: z_param, a_param, m_param — canonical must sort them
    const urlObj = new URL("https://app.example.com/apps/fluxbot/chat");
    urlObj.searchParams.set("z_param", "last");
    urlObj.searchParams.set("a_param", "first");
    urlObj.searchParams.set("m_param", "middle");

    const entries = [
      ["a_param", "first"],
      ["m_param", "middle"],
      ["z_param", "last"],
    ];
    const canonical = entries.map(([k, v]) => `${k}=${v}`).join("");
    const sig = createHmac("sha256", TEST_SECRET).update(canonical).digest("hex");
    urlObj.searchParams.set("signature", sig);

    expect(verifyShopifyProxyRequest(new Request(urlObj.toString()))).toBe(true);
  });
});
