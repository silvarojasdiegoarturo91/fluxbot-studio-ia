import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: vi.fn(),
}));

vi.mock("../../app/services/shop-context.server", () => ({
  ensureShopForSession: vi.fn(),
}));

vi.mock("../../app/services/admin-config.server", () => ({
  saveMerchantAdminConfig: vi.fn(),
}));

vi.mock("../../app/db.server", () => ({
  default: {
    chatbotConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { authenticateAdminRequest } from "../../app/utils/authenticate-admin.server";
import { ensureShopForSession } from "../../app/services/shop-context.server";
import { saveMerchantAdminConfig } from "../../app/services/admin-config.server";
import prisma from "../../app/db.server";

const mockAuthenticateAdminRequest = vi.mocked(authenticateAdminRequest);
const mockEnsureShopForSession = vi.mocked(ensureShopForSession);
const mockSaveMerchantAdminConfig = vi.mocked(saveMerchantAdminConfig);
const mockFindUnique = vi.mocked(prisma.chatbotConfig.findUnique);
const mockUpsert = vi.mocked(prisma.chatbotConfig.upsert);

const SESSION = { shop: "shop.example.myshopify.com" };
const SHOP = { id: "shop-1", domain: "shop.example.myshopify.com" };

const CONFIG_ROW = {
  name: "Fluxy",
  tone: "professional",
  language: "es",
  temperature: 0.8,
  maxTokens: 700,
  systemPrompt: "Be helpful",
  userPrompt: "Context",
  enableProactive: true,
  enableHandoff: true,
  confidenceThreshold: 0.65,
  isActive: true,
  updatedAt: new Date("2026-01-15T00:00:00.000Z"),
};

function buildRequest(query = "", method = "GET", body?: FormData) {
  return new Request(`http://localhost/app/settings${query}`, {
    method,
    body: method === "POST" ? body : undefined,
  });
}

function makeForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("name", "Fluxy");
  formData.set("tone", "professional");
  formData.set("language", "es");
  formData.set("temperature", "0.8");
  formData.set("maxTokens", "700");
  formData.set("confidenceThreshold", "0.65");
  formData.set("enableProactive", "true");
  formData.set("enableHandoff", "true");
  formData.set("isActive", "true");
  formData.set("systemPrompt", "Be helpful");
  formData.set("userPrompt", "Context");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

describe("app.settings loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthenticateAdminRequest.mockResolvedValue({ session: SESSION } as any);
    mockEnsureShopForSession.mockResolvedValue(SHOP as any);
    mockFindUnique.mockResolvedValue(CONFIG_ROW as any);
  });

  it("loads the saved assistant config with defaults applied", async () => {
    const { loader } = await import("../../app/routes/app.settings");

    const data = await loader({ request: buildRequest() } as any);

    expect(data.shop.id).toBe("shop-1");
    expect(data.config.name).toBe("Fluxy");
    expect(data.config.temperature).toBe(0.8);
    expect(data.config.updatedAt).toBe("2026-01-15T00:00:00.000Z");
    expect(data.localeOptions.map((option: { value: string }) => option.value)).toEqual(["en", "es"]);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { shopId: "shop-1" },
      select: expect.objectContaining({ name: true, tone: true }),
    });
  });

  it("returns safe defaults when no config row exists", async () => {
    mockFindUnique.mockResolvedValue(null);

    const { loader } = await import("../../app/routes/app.settings");

    const data = await loader({ request: buildRequest() } as any);

    expect(data.config.name).toBe("AI Assistant");
    expect(data.config.tone).toBe("professional");
    expect(data.config.language).toBe("en");
    expect(data.config.temperature).toBe(0.7);
    expect(data.config.maxTokens).toBe(500);
    expect(data.config.systemPrompt).toBe("");
    expect(data.config.enableHandoff).toBe(true);
    expect(data.config.confidenceThreshold).toBe(0.6);
    expect(data.config.isActive).toBe(true);
    expect(data.config.updatedAt).toBeNull();
  });

  it("falls back to English when the stored language is unsupported", async () => {
    mockFindUnique.mockResolvedValue({ ...CONFIG_ROW, language: "fr" } as any);

    const { loader } = await import("../../app/routes/app.settings");

    const data = await loader({ request: buildRequest() } as any);

    expect(data.config.language).toBe("en");
  });

  it("throws a 404 when the shop has no local record", async () => {
    mockEnsureShopForSession.mockResolvedValueOnce(null);

    const { loader } = await import("../../app/routes/app.settings");

    await expect(loader({ request: buildRequest() } as any)).rejects.toMatchObject({ status: 404 });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});

describe("app.settings action", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthenticateAdminRequest.mockResolvedValue({ session: SESSION } as any);
    mockEnsureShopForSession.mockResolvedValue(SHOP as any);
    mockUpsert.mockResolvedValue({ id: "config-1" } as any);
    mockSaveMerchantAdminConfig.mockResolvedValue(undefined as any);
  });

  it("rejects non-POST requests", async () => {
    const { action } = await import("../../app/routes/app.settings");

    const result = await action({ request: buildRequest() } as any);

    expect(result).toEqual({ ok: false, error: "Method not allowed" });
  });

  it("returns a controlled error when the shop is missing", async () => {
    mockEnsureShopForSession.mockResolvedValueOnce(null);

    const { action } = await import("../../app/routes/app.settings");

    const result = await action({ request: buildRequest("", "POST", makeForm()) } as any);

    expect(result).toEqual({ ok: false, error: "Shop not found" });
  });

  it("upserts the assistant config and persists admin language", async () => {
    const { action } = await import("../../app/routes/app.settings");

    const result = await action({ request: buildRequest("", "POST", makeForm()) } as any);

    expect(result).toEqual({ ok: true, message: "Configuración del asistente guardada." });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: "shop-1" },
        create: expect.objectContaining({
          shopId: "shop-1",
          name: "Fluxy",
          tone: "professional",
          language: "es",
          temperature: 0.8,
          maxTokens: 700,
          confidenceThreshold: 0.65,
          enableProactive: true,
          enableHandoff: true,
          isActive: true,
          systemPrompt: "Be helpful",
          userPrompt: "Context",
        }),
        update: expect.objectContaining({
          name: "Fluxy",
          language: "es",
        }),
      }),
    );
    expect(mockSaveMerchantAdminConfig).toHaveBeenCalledWith("shop-1", {
      adminLanguage: "es",
      primaryBotLanguage: "es",
      supportedLanguages: ["es"],
    });
  });

  it("returns an English message when the language is English", async () => {
    const { action } = await import("../../app/routes/app.settings");

    const result = await action({
      request: buildRequest("", "POST", makeForm({ language: "en" })),
    } as any);

    expect(result).toEqual({ ok: true, message: "Assistant settings saved." });
    expect(mockSaveMerchantAdminConfig).toHaveBeenCalledWith("shop-1", {
      adminLanguage: "en",
      primaryBotLanguage: "en",
      supportedLanguages: ["en"],
    });
  });

  it("rejects an empty assistant name", async () => {
    const { action } = await import("../../app/routes/app.settings");

    const es = await action({
      request: buildRequest("", "POST", makeForm({ name: "   " })),
    } as any);
    expect(es).toEqual({ ok: false, error: "El nombre del asistente es obligatorio" });
    expect(mockUpsert).not.toHaveBeenCalled();

    const en = await action({
      request: buildRequest("", "POST", makeForm({ name: "   ", language: "en" })),
    } as any);
    expect(en).toEqual({ ok: false, error: "Assistant name is required" });
  });

  it("clamps numeric values to their valid ranges", async () => {
    const { action } = await import("../../app/routes/app.settings");

    await action({
      request: buildRequest(
        "",
        "POST",
        makeForm({ temperature: "99", maxTokens: "1", confidenceThreshold: "-5" }),
      ),
    } as any);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          temperature: 2,
          maxTokens: 50,
          confidenceThreshold: 0,
        }),
      }),
    );
  });

  it("parses booleans from text values and falls back on garbage", async () => {
    const { action } = await import("../../app/routes/app.settings");

    await action({
      request: buildRequest(
        "",
        "POST",
        makeForm({
          enableProactive: "yes",
          enableHandoff: "0",
          isActive: "garbage",
          temperature: "not-a-number",
        }),
      ),
    } as any);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          enableProactive: true,
          enableHandoff: false,
          isActive: true,
          temperature: 0.7,
        }),
      }),
    );
  });

  it("normalizes the global language to a supported value", async () => {
    const { action } = await import("../../app/routes/app.settings");

    await action({
      request: buildRequest("", "POST", makeForm({ language: "FR" })),
    } as any);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ language: "en" }),
      }),
    );
    expect(mockSaveMerchantAdminConfig).toHaveBeenCalledWith("shop-1", {
      adminLanguage: "en",
      primaryBotLanguage: "en",
      supportedLanguages: ["en"],
    });
  });
});
