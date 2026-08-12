/**
 * Unit Tests — app.assistant-config.tsx (loader + action)
 *
 * Covers the server-side contract of the assistant config page:
 *  - loader: shop resolution, backend config fetch + availability flag
 *  - action: catalog_sync intent (success/warnings/errors)
 *  - action: save intent (validation, upsert, errors)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthenticateAdminRequest = vi.fn();
const mockEnsureShopForSession = vi.fn();
const mockAssistantConfigGet = vi.fn();
const mockAssistantConfigUpsert = vi.fn();
const mockCatalogSync = vi.fn();

vi.mock("../../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: mockAuthenticateAdminRequest,
}));

vi.mock("../../../app/services/shop-context.server", () => ({
  ensureShopForSession: mockEnsureShopForSession,
}));

vi.mock("../../../app/services/ia-backend.server", () => ({
  iaClient: {
    assistantConfig: {
      get: mockAssistantConfigGet,
      upsert: mockAssistantConfigUpsert,
    },
    catalog: {
      sync: mockCatalogSync,
    },
  },
}));

const SESSION = { shop: "store.myshopify.com" };
const SHOP = { id: "shop-1", domain: "store.myshopify.com" };

function makeRequest(intent: string, fields: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("_intent", intent);
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return new Request("http://localhost/app/assistant-config", {
    method: "POST",
    body: formData,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthenticateAdminRequest.mockResolvedValue({ session: SESSION });
  mockEnsureShopForSession.mockResolvedValue(SHOP);
  mockAssistantConfigGet.mockResolvedValue({
    shopId: "shop-1",
    assistantName: "Flux Advisor",
    persona: "FRIENDLY",
    tone: "cercano",
    systemInstructions: "Always help",
    welcomeMessage: "¡Hola!",
    language: "es",
    productCategories: ["deporte"],
  });
  mockAssistantConfigUpsert.mockResolvedValue({ shopId: "shop-1", assistantName: "Flux Advisor" });
  mockCatalogSync.mockResolvedValue({
    chunksIndexed: 120,
    productsProcessed: 60,
    durationMs: 1500,
    errors: [],
  });
});

// ============================================================================
// loader
// ============================================================================

describe("app.assistant-config loader", () => {
  it("returns the shop, backend config and availability flag", async () => {
    const { loader } = await import("../../../app/routes/app.assistant-config");
    const request = new Request("http://localhost/app/assistant-config");

    const result = await loader({ request, params: {}, context: {} } as never);

    expect(mockAuthenticateAdminRequest).toHaveBeenCalledWith(request);
    expect(mockEnsureShopForSession).toHaveBeenCalledWith(SESSION);
    expect(mockAssistantConfigGet).toHaveBeenCalledWith("store.myshopify.com");
    expect(result).toEqual({
      shop: SHOP,
      config: expect.objectContaining({
        shopId: "shop-1",
        assistantName: "Flux Advisor",
        persona: "FRIENDLY",
        language: "es",
      }),
      backendAvailable: true,
    });
  });

  it("returns default config and backendAvailable=false when the backend is unreachable", async () => {
    mockAssistantConfigGet.mockRejectedValue(new Error("ECONNREFUSED"));
    const { loader } = await import("../../../app/routes/app.assistant-config");
    const request = new Request("http://localhost/app/assistant-config");

    const result = await loader({ request, params: {}, context: {} } as never);

    expect(result.backendAvailable).toBe(false);
    expect(result.config).toMatchObject({
      shopId: "shop-1",
      assistantName: "Asistente",
      persona: "FRIENDLY",
      tone: "amigable y profesional",
      language: "es",
      productCategories: [],
    });
  });

  it("throws a 404 response when the shop cannot be resolved", async () => {
    mockEnsureShopForSession.mockResolvedValue(null);
    const { loader } = await import("../../../app/routes/app.assistant-config");
    const request = new Request("http://localhost/app/assistant-config");

    await expect(
      loader({ request, params: {}, context: {} } as never),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ============================================================================
// action — catalog_sync
// ============================================================================

describe("app.assistant-config action — catalog_sync", () => {
  it("returns ok when the sync completes without errors", async () => {
    const { action } = await import("../../../app/routes/app.assistant-config");

    const result = await action({
      request: makeRequest("catalog_sync"),
      params: {},
      context: {},
    } as never);

    expect(mockCatalogSync).toHaveBeenCalledWith(
      { shopId: "shop-1", fullSync: true },
      "store.myshopify.com",
    );
    expect(result.ok).toBe(true);
    expect(result.message).toContain("120 fragmentos indexados en 1.5s");
    expect(result.syncResult).toEqual(expect.objectContaining({ chunksIndexed: 120 }));
  });

  it("returns ok=false with a warning when the sync reports partial errors", async () => {
    mockCatalogSync.mockResolvedValue({
      chunksIndexed: 80,
      productsProcessed: 40,
      durationMs: 900,
      errors: ["product 3 failed", "product 7 failed"],
    });
    const { action } = await import("../../../app/routes/app.assistant-config");

    const result = await action({
      request: makeRequest("catalog_sync"),
      params: {},
      context: {},
    } as never);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Sincronización completada con advertencias");
    expect(result.message).toContain("product 3 failed | product 7 failed");
    expect(result.error).toBeDefined();
  });

  it("returns ok=false when the sync throws", async () => {
    mockCatalogSync.mockRejectedValue(new Error("backend unavailable"));
    const { action } = await import("../../../app/routes/app.assistant-config");

    const result = await action({
      request: makeRequest("catalog_sync"),
      params: {},
      context: {},
    } as never);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Error al sincronizar catálogo: backend unavailable");
  });
});

// ============================================================================
// action — save config
// ============================================================================

describe("app.assistant-config action — save", () => {
  it("upserts the assistant config with trimmed form values", async () => {
    const { action } = await import("../../../app/routes/app.assistant-config");

    const result = await action({
      request: makeRequest("save", {
        assistantName: "  Flux Pro  ",
        persona: "PROFESSIONAL",
        tone: "   claro y directo  ",
        systemInstructions: "  Siempre ofrece envío gratis  ",
        welcomeMessage: "  Hola, ¿en qué te ayudo?  ",
        language: "en",
      }),
      params: {},
      context: {},
    } as never);

    expect(mockAssistantConfigUpsert).toHaveBeenCalledWith(
      {
        shopId: "shop-1",
        assistantName: "Flux Pro",
        persona: "PROFESSIONAL",
        tone: "claro y directo",
        systemInstructions: "Siempre ofrece envío gratis",
        welcomeMessage: "Hola, ¿en qué te ayudo?",
        language: "en",
      },
      "store.myshopify.com",
    );
    expect(result).toEqual({ ok: true, message: "Configuración del asistente guardada" });
  });

  it("falls back to defaults for empty required fields", async () => {
    const { action } = await import("../../../app/routes/app.assistant-config");

    const result = await action({
      request: makeRequest("save", {}),
      params: {},
      context: {},
    } as never);

    expect(mockAssistantConfigUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantName: "Asistente",
        persona: "FRIENDLY",
        tone: "amigable y profesional",
        systemInstructions: null,
        welcomeMessage: null,
        language: "es",
      }),
      "store.myshopify.com",
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an invalid persona", async () => {
    const { action } = await import("../../../app/routes/app.assistant-config");

    const result = await action({
      request: makeRequest("save", { persona: "EVIL" }),
      params: {},
      context: {},
    } as never);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Personalidad inválida");
    expect(mockAssistantConfigUpsert).not.toHaveBeenCalled();
  });

  it("returns ok=false when the upsert throws", async () => {
    mockAssistantConfigUpsert.mockRejectedValue(new Error("upsert failed"));
    const { action } = await import("../../../app/routes/app.assistant-config");

    const result = await action({
      request: makeRequest("save", { assistantName: "Bot" }),
      params: {},
      context: {},
    } as never);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Error al guardar: upsert failed");
  });
});

describe("app.assistant-config action — auth guard", () => {
  it("returns ok=false when the shop is not resolved", async () => {
    mockEnsureShopForSession.mockResolvedValue(null);
    const { action } = await import("../../../app/routes/app.assistant-config");

    const result = await action({
      request: makeRequest("save", {}),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({ ok: false, error: "Shop no encontrada" });
    expect(mockAssistantConfigUpsert).not.toHaveBeenCalled();
  });
});
