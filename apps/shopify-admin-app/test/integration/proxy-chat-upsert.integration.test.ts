/**
 * Integration tests — proxy-chat-upsert (REQ-CONV-001 + REQ-CONV-002)
 *
 * Validates that the apps.fluxbot.chat action:
 *   1. Auto-upserts the shop when it doesn't exist (REQ-CONV-002)
 *   2. Creates a conversation on a valid POST (REQ-CONV-001)
 *   3. Reuses an existing shop without duplication (REQ-CONV-002)
 *   4. Returns 400 when message is missing
 *   5. Returns 404 for a non-existent conversationId
 *
 * Auth strategy: NO `signature` param in URL + NODE_ENV=test (set in setup.ts)
 *   → verifyShopifyProxyRequest returns true via allowUnsignedInDevelopment bypass.
 *   The real auth function is NOT mocked — this is intentional and matches the design.
 *
 * DB strategy: uses the REAL `fluxbot_dev` PostgreSQL via the actual Prisma client
 *   (REQ-CONV-001: "Prisma MUST NOT be mocked"). Each test cleans up its own rows.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../app/db.server";

// IA gateway mock — avoid real backend calls, only the gateway is mocked.
const mockGatewayChat = vi.fn();

vi.mock("../../app/services/ia-gateway.server", () => ({
  getIAGateway: () => ({
    chat: mockGatewayChat,
  }),
}));

// Admin config mock — avoid real config reads.
const mockGetMerchantAdminConfig = vi.fn();

vi.mock("../../app/services/admin-config.server", () => ({
  getMerchantAdminConfig: (...args: unknown[]) => mockGetMerchantAdminConfig(...args),
}));

// NOTE: db.server is intentionally NOT mocked — the spec requires the real DB.
// shopify-proxy-auth.server is NOT mocked either — the real auth function runs.

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const TEST_SHOP_DOMAIN = "itest-proxy-upsert.myshopify.com";
const TEST_SHOP_DOMAIN_2 = "itest-proxy-reuse.myshopify.com";
const TEST_CONVERSATION_ID = `itest-conv-${Date.now()}`;

/**
 * Build a proxy POST request with no `signature` param so the HMAC bypass
 * triggers under NODE_ENV=test with allowUnsignedInDevelopment=true.
 */
function makeProxyRequest(body: unknown, shopDomain: string = TEST_SHOP_DOMAIN): Request {
  const url = `http://localhost/apps/fluxbot/chat?shop=${encodeURIComponent(shopDomain)}`;
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  mockGetMerchantAdminConfig.mockResolvedValue({
    botName: "Test Bot",
    botGoal: "SALES_SUPPORT",
    welcomeMessage: "Hola",
    primaryBotLanguage: "es",
    supportedLanguages: ["es"],
    widgetBranding: {
      launcherLabel: "Asistente",
      launcherPosition: "bottom-right",
      primaryColor: "#008060",
    },
  });

  mockGatewayChat.mockResolvedValue({
    message: "Respuesta del bot",
    confidence: 0.92,
    requiresEscalation: false,
    actions: [],
    toolsUsed: undefined,
    sourceReferences: undefined,
  });
});

afterEach(async () => {
  // Cleanup: delete rows created by these tests against the real DB.
  try {
    await prisma.conversationMessage.deleteMany({
      where: { conversation: { shop: { domain: { in: [TEST_SHOP_DOMAIN, TEST_SHOP_DOMAIN_2] } } } },
    });
    await prisma.conversation.deleteMany({
      where: { shop: { domain: { in: [TEST_SHOP_DOMAIN, TEST_SHOP_DOMAIN_2] } } },
    });
    await prisma.shop.deleteMany({
      where: { domain: { in: [TEST_SHOP_DOMAIN, TEST_SHOP_DOMAIN_2] } },
    });
  } catch {
    // Ignore cleanup errors — rows may not exist.
  }
});

// ---------------------------------------------------------------------------
// Tests — REQ-CONV-001 + REQ-CONV-002 (real DB)
// ---------------------------------------------------------------------------

describe("proxy chat upsert — REQ-CONV-001 + REQ-CONV-002 (real DB)", () => {
  it("creates conversation and auto-upserts shop when shop is new", async () => {
    const { action } = await import("../../app/routes/apps.fluxbot.chat");

    const request = makeProxyRequest({ message: "Hola, ¿tienen envío a Córdoba?" });
    const response = await action({ request, params: {}, context: {} } as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).not.toBe(false);
    expect(body.conversationId).toBeDefined();

    // Verify the row really landed in fluxbot_dev
    const conv = await prisma.conversation.findUnique({
      where: { id: body.conversationId },
      include: { shop: true, messages: true },
    });
    expect(conv).not.toBeNull();
    expect(conv?.shop.domain).toBe(TEST_SHOP_DOMAIN);
    expect(conv?.messages.length).toBeGreaterThan(0);
  });

  it("reuses existing shop without creating a duplicate", async () => {
    // Pre-create the shop row so upsert must reuse it
    const shop = await prisma.shop.create({
      data: {
        domain: TEST_SHOP_DOMAIN_2,
        accessToken: "shpat_preserve_me",
        status: "ACTIVE",
      },
    });

    const { action } = await import("../../app/routes/apps.fluxbot.chat");

    const request = makeProxyRequest({ message: "¿Tienen talle M?" }, TEST_SHOP_DOMAIN_2);
    const response = await action({ request, params: {}, context: {} } as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conversationId).toBeDefined();

    // The original token must NOT be overwritten by the upsert
    const after = await prisma.shop.findUnique({ where: { id: shop.id } });
    expect(after?.accessToken).toBe("shpat_preserve_me");

    // No duplicate shop rows
    const count = await prisma.shop.count({ where: { domain: TEST_SHOP_DOMAIN_2 } });
    expect(count).toBe(1);
  });

  it("returns 400 when message is missing", async () => {
    const { action } = await import("../../app/routes/apps.fluxbot.chat");

    const request = makeProxyRequest({ conversationId: "whatever" }); // no `message`
    const response = await action({ request, params: {}, context: {} } as any);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it("returns 404 when conversationId does not exist for the shop", async () => {
    const { action } = await import("../../app/routes/apps.fluxbot.chat");

    const request = makeProxyRequest(
      { message: "Hola", conversationId: "conv-nonexistent-itest" },
      TEST_SHOP_DOMAIN_2,
    );
    const response = await action({ request, params: {}, context: {} } as any);

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Tests — Threat Matrix (TASK-CONV-005 + TASK-CONV-006)
// ---------------------------------------------------------------------------

describe("proxy chat security guards", () => {
  it("returns 401 when NODE_ENV=production and no signature is provided (CONV-005)", async () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const { action } = await import("../../app/routes/apps.fluxbot.chat");

      const request = makeProxyRequest({ message: "Hola" }); // no signature
      const response = await action({ request, params: {}, context: {} } as any);

      expect(response.status).toBe(401);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it("does not overwrite accessToken of an existing shop on upsert (CONV-006)", async () => {
    // Pre-create the shop with a real token
    await prisma.shop.create({
      data: {
        domain: TEST_SHOP_DOMAIN_2,
        accessToken: "shpat_real_token_must_not_be_erased",
        status: "ACTIVE",
      },
    });

    const { action } = await import("../../app/routes/apps.fluxbot.chat");

    const request = makeProxyRequest({ message: "¿Tienen stock?" }, TEST_SHOP_DOMAIN_2);
    await action({ request, params: {}, context: {} } as any);

    const after = await prisma.shop.findUnique({ where: { domain: TEST_SHOP_DOMAIN_2 } });
    expect(after?.accessToken).toBe("shpat_real_token_must_not_be_erased");
  });
});
