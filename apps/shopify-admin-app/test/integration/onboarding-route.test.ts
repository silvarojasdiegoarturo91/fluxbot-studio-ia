import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: vi.fn(),
}));

vi.mock("../../app/services/shop-context.server", () => ({
  ensureShopForSession: vi.fn(),
}));

vi.mock("../../app/services/admin-config.server", () => ({
  getDefaultMerchantAdminConfig: vi.fn(),
  getMerchantAdminConfig: vi.fn(),
  saveMerchantAdminConfig: vi.fn(),
}));

vi.mock("../../app/shopify.server", () => ({
  authenticate: { admin: vi.fn() },
}));

vi.mock("../../app/services/shop-backend-sync.server", () => ({
  syncShopReferenceToIABackend: vi.fn(),
}));

vi.mock("../../app/db.server", () => ({
  default: {
    shop: { update: vi.fn() },
  },
}));

import { authenticateAdminRequest } from "../../app/utils/authenticate-admin.server";
import { ensureShopForSession } from "../../app/services/shop-context.server";
import {
  getDefaultMerchantAdminConfig,
  getMerchantAdminConfig,
  saveMerchantAdminConfig,
} from "../../app/services/admin-config.server";
import { syncShopReferenceToIABackend } from "../../app/services/shop-backend-sync.server";
import prisma from "../../app/db.server";

const mockAuthenticateAdminRequest = vi.mocked(authenticateAdminRequest);
const mockEnsureShopForSession = vi.mocked(ensureShopForSession);
const mockGetDefaultMerchantAdminConfig = vi.mocked(getDefaultMerchantAdminConfig);
const mockGetMerchantAdminConfig = vi.mocked(getMerchantAdminConfig);
const mockSaveMerchantAdminConfig = vi.mocked(saveMerchantAdminConfig);
const mockSyncShopReferenceToIABackend = vi.mocked(syncShopReferenceToIABackend);
const mockShopUpdate = vi.mocked(prisma.shop.update);

const SESSION = { shop: "shop.example.myshopify.com" };
const SHOP = { id: "shop-1", domain: "shop.example.myshopify.com" };

const BASE_CONFIG = {
  adminLanguage: "es",
  primaryBotLanguage: "es",
  supportedLanguages: ["es"],
  botName: "Asistente IA",
  botTone: "professional",
  botGoal: "SALES_SUPPORT",
  responseStyle: "BALANCED",
  welcomeMessage: "Hola, estoy aquí para ayudarte.",
  enabledCapabilities: {
    answerProducts: true,
    answerPolicies: true,
    answerOrders: true,
    recommendProducts: true,
    captureLeads: false,
  },
  widgetBranding: {
    primaryColor: "#008060",
    launcherPosition: "bottom-right",
    avatarStyle: "assistant",
    launcherLabel: "Asistente",
  },
  onboardingCompleted: false,
  onboardingStep: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function buildRequest(query = "", method = "GET", body?: FormData, headers: Record<string, string> = {}) {
  const request = new Request(`http://localhost/app/onboarding${query}`, {
    method,
    headers,
    body: method === "POST" && body ? body : undefined,
  });
  return request;
}

describe("app.onboarding loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.E2E_TEST_MODE;

    mockAuthenticateAdminRequest.mockResolvedValue({ session: SESSION } as any);
    mockEnsureShopForSession.mockResolvedValue(SHOP as any);
    mockGetDefaultMerchantAdminConfig.mockReturnValue({ ...BASE_CONFIG } as any);
    mockGetMerchantAdminConfig.mockResolvedValue({ ...BASE_CONFIG } as any);
  });

  it("loads shop, step and config copy", async () => {
    const { loader } = await import("../../app/routes/app.onboarding");

    const data = await loader({ request: buildRequest("?step=2") } as any);

    expect(data.shop.id).toBe("shop-1");
    expect(data.step).toBe(2);
    expect(data.totalSteps).toBe(4);
    expect(data.config.botName).toBe("Asistente IA");
    expect(data.copy.title).toBe("Activa Fluxbot en 4 pasos");
    expect(mockGetMerchantAdminConfig).toHaveBeenCalledWith("shop-1");
  });

  it("clamps the step query parameter to the valid range", async () => {
    const { loader } = await import("../../app/routes/app.onboarding");

    const data = await loader({ request: buildRequest("?step=99") } as any);
    expect(data.step).toBe(4);

    const low = await loader({ request: buildRequest("?step=0") } as any);
    expect(low.step).toBe(1);

    const bad = await loader({ request: buildRequest("?step=abc") } as any);
    expect(bad.step).toBe(1);
  });

  it("uses English copy when the admin language is English", async () => {
    mockGetMerchantAdminConfig.mockResolvedValue({
      ...BASE_CONFIG,
      adminLanguage: "en",
    } as any);

    const { loader } = await import("../../app/routes/app.onboarding");

    const data = await loader({ request: buildRequest() } as any);

    expect(data.copy.title).toBe("Activate Fluxbot in 4 steps");
  });

  it("falls back to defaults when the admin config cannot be loaded", async () => {
    mockGetMerchantAdminConfig.mockRejectedValue(new Error("db down"));

    const { loader } = await import("../../app/routes/app.onboarding");

    const data = await loader({ request: buildRequest() } as any);

    expect(data.config.onboardingCompleted).toBe(false);
  });

  it("redirects to the app dashboard when onboarding is already completed", async () => {
    mockGetMerchantAdminConfig.mockResolvedValue({
      ...BASE_CONFIG,
      onboardingCompleted: true,
    } as any);

    const { loader } = await import("../../app/routes/app.onboarding");

    const error = await loader({ request: buildRequest() } as any).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(302);
    expect((error as Response).headers.get("Location")).toBe("/app");
  });

  it("keeps embedded query params when redirecting after completion", async () => {
    mockGetMerchantAdminConfig.mockResolvedValue({
      ...BASE_CONFIG,
      onboardingCompleted: true,
    } as any);

    const { loader } = await import("../../app/routes/app.onboarding");

    const error = await loader({
      request: buildRequest("?shop=shop.example.myshopify.com&host=dGVzdA&embedded=1&step=4"),
    } as any).catch((e: unknown) => e);

    const location = (error as Response).headers.get("Location");
    expect(location).toContain("shop=shop.example.myshopify.com");
    expect(location).toContain("host=dGVzdA");
    expect(location).not.toContain("step");
  });

  it("does not redirect in E2E test mode even when completed", async () => {
    process.env.E2E_TEST_MODE = "true";
    mockGetMerchantAdminConfig.mockResolvedValue({
      ...BASE_CONFIG,
      onboardingCompleted: true,
    } as any);

    const { loader } = await import("../../app/routes/app.onboarding");

    const data = await loader({ request: buildRequest() } as any);

    expect(data.config.onboardingCompleted).toBe(true);
  });

  it("throws a 404 when the shop has no local record", async () => {
    mockEnsureShopForSession.mockResolvedValueOnce(null);

    const { loader } = await import("../../app/routes/app.onboarding");

    await expect(
      loader({ request: buildRequest() } as any),
    ).rejects.toMatchObject({ status: 404 });
    expect(mockGetMerchantAdminConfig).not.toHaveBeenCalled();
  });
});

describe("app.onboarding action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.E2E_TEST_MODE;

    mockAuthenticateAdminRequest.mockResolvedValue({ session: SESSION } as any);
    mockEnsureShopForSession.mockResolvedValue(SHOP as any);
    mockGetDefaultMerchantAdminConfig.mockReturnValue({ ...BASE_CONFIG } as any);
    mockGetMerchantAdminConfig.mockResolvedValue({ ...BASE_CONFIG } as any);
    mockSaveMerchantAdminConfig.mockResolvedValue({ ...BASE_CONFIG } as any);
    mockSyncShopReferenceToIABackend.mockResolvedValue({ ok: true } as any);
    mockShopUpdate.mockResolvedValue({ id: SHOP.id } as any);
  });

  function makeForm(overrides: Record<string, string> = {}) {
    const formData = new FormData();
    formData.set("intent", "save_only");
    formData.set("adminLanguage", "es");
    formData.set("botName", "Fluxy");
    formData.set("botTone", "professional");
    formData.set("botGoal", "SALES_SUPPORT");
    formData.set("responseStyle", "BALANCED");
    formData.set("welcomeMessage", "Hola");
    formData.set("answerProducts", "true");
    formData.set("answerPolicies", "true");
    formData.set("answerOrders", "false");
    formData.set("recommendProducts", "true");
    formData.set("captureLeads", "false");
    formData.set("primaryColor", "#123456");
    formData.set("launcherPosition", "bottom-right");
    formData.set("avatarStyle", "assistant");
    formData.set("launcherLabel", "Chat");
    for (const [key, value] of Object.entries(overrides)) {
      formData.set(key, value);
    }
    return formData;
  }

  it("rejects non-POST requests", async () => {
    const { action } = await import("../../app/routes/app.onboarding");

    const result = await action({ request: buildRequest() } as any);

    expect(result).toEqual({ ok: false, error: "Method not allowed" });
  });

  it("returns a controlled error when the shop is missing", async () => {
    mockEnsureShopForSession.mockResolvedValueOnce(null);

    const { action } = await import("../../app/routes/app.onboarding");

    const result = await action({ request: buildRequest("", "POST", makeForm()) } as any);

    expect(result).toEqual({ ok: false, error: "Shop not found" });
  });

  it("saves the config and redirects to the next step for save_continue", async () => {
    const { action } = await import("../../app/routes/app.onboarding");

    const response = await action({
      request: buildRequest("?step=1", "POST", makeForm({ intent: "save_continue" })),
    } as any);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    const location = (response as Response).headers.get("Location");
    expect(location).toContain("/app/onboarding");
    expect(location).toContain("step=2");
    expect(location).toContain("saved=1");

    expect(mockSaveMerchantAdminConfig).toHaveBeenCalledWith(
      "shop-1",
      expect.objectContaining({
        botName: "Fluxy",
        adminLanguage: "es",
        onboardingStep: 2,
        onboardingCompleted: false,
      }),
      expect.objectContaining({ currentConfig: expect.anything() }),
    );
    expect(mockShopUpdate).not.toHaveBeenCalled();
  });

  it("handles the back intent by moving to the previous step", async () => {
    const { action } = await import("../../app/routes/app.onboarding");

    const response = await action({
      request: buildRequest("?step=3", "POST", makeForm({ intent: "back" })),
    } as any);

    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toContain("step=2");
    expect(mockSaveMerchantAdminConfig).toHaveBeenCalledWith(
      "shop-1",
      expect.objectContaining({ onboardingStep: 2, onboardingCompleted: false }),
      expect.anything(),
    );
  });

  it("does not move before step 1 on back intent", async () => {
    const { action } = await import("../../app/routes/app.onboarding");

    const response = await action({
      request: buildRequest("?step=1", "POST", makeForm({ intent: "back" })),
    } as any);

    expect((response as Response).headers.get("Location")).toContain("step=1");
  });

  it("caps next step at the total step count", async () => {
    const { action } = await import("../../app/routes/app.onboarding");

    const response = await action({
      request: buildRequest("?step=4", "POST", makeForm({ intent: "save_continue" })),
    } as any);

    expect((response as Response).headers.get("Location")).toContain("step=4");
  });

  it("completes onboarding, stamps the shop and triggers the backend sync", async () => {
    const { action } = await import("../../app/routes/app.onboarding");

    const response = await action({
      request: buildRequest("?step=4", "POST", makeForm({ intent: "complete" })),
    } as any);

    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toContain("/app");
    expect((response as Response).headers.get("Location")).toContain("onboarding=done");

    expect(mockSaveMerchantAdminConfig).toHaveBeenCalledWith(
      "shop-1",
      expect.objectContaining({ onboardingCompleted: true, onboardingStep: 4 }),
      expect.anything(),
    );
    expect(mockShopUpdate).toHaveBeenCalledWith({
      where: { id: "shop-1" },
      data: { onboardingCompletedAt: expect.any(Date) },
    });
    expect(mockSyncShopReferenceToIABackend).toHaveBeenCalledWith(
      { id: "shop-1", domain: "shop.example.myshopify.com" },
      { force: true },
    );
  });

  it("returns JSON when the client requests an XHR response", async () => {
    const { action } = await import("../../app/routes/app.onboarding");

    const request = buildRequest("?step=1", "POST", makeForm(), {
      "X-Requested-With": "XMLHttpRequest",
    });

    const response = await action({ request } as any);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Content-Type")).toContain("application/json");
    const payload = JSON.parse(await (response as Response).text());
    expect(payload.ok).toBe(true);
    expect(payload.nextStep).toBe(1);
    expect(payload.redirectTo).toContain("/app/onboarding");
  });

  it("returns JSON when the form requests responseMode=json", async () => {
    const { action } = await import("../../app/routes/app.onboarding");

    const response = await action({
      request: buildRequest(
        "?step=1",
        "POST",
        makeForm({ intent: "save_continue", responseMode: "json" }),
      ),
    } as any);

    const payload = JSON.parse(await (response as Response).text());
    expect(payload.ok).toBe(true);
    expect(payload.nextStep).toBe(2);
  });

  it("applies default bot name and welcome message when fields are empty", async () => {
    mockGetMerchantAdminConfig.mockResolvedValue({
      ...BASE_CONFIG,
      botName: "",
      welcomeMessage: "",
      widgetBranding: { ...BASE_CONFIG.widgetBranding, launcherLabel: "" },
    } as any);

    const { action } = await import("../../app/routes/app.onboarding");

    const formData = makeForm({ botName: "", welcomeMessage: "", launcherLabel: "" });

    await action({ request: buildRequest("?step=1", "POST", formData) } as any);

    expect(mockSaveMerchantAdminConfig).toHaveBeenCalledWith(
      "shop-1",
      expect.objectContaining({
        botName: "Asistente virtual",
        welcomeMessage: expect.stringContaining("Hola, soy"),
        widgetBranding: expect.objectContaining({ launcherLabel: "Asistente virtual" }),
      }),
      expect.anything(),
    );
  });

  it("falls back to bottom-right launcher and assistant avatar for invalid values", async () => {
    const { action } = await import("../../app/routes/app.onboarding");

    const formData = makeForm({
      launcherPosition: "top-center",
      avatarStyle: "weird",
      primaryColor: "",
    });

    await action({ request: buildRequest("?step=1", "POST", formData) } as any);

    expect(mockSaveMerchantAdminConfig).toHaveBeenCalledWith(
      "shop-1",
      expect.objectContaining({
        widgetBranding: expect.objectContaining({
          launcherPosition: "bottom-right",
          avatarStyle: "assistant",
          primaryColor: "#008060",
        }),
      }),
      expect.anything(),
    );
  });

  it("parses capabilities as booleans from form values", async () => {
    const { action } = await import("../../app/routes/app.onboarding");

    const formData = makeForm({
      answerProducts: "yes",
      answerPolicies: "0",
      answerOrders: "no",
      recommendProducts: "1",
      captureLeads: "true",
    });

    await action({ request: buildRequest("?step=1", "POST", formData) } as any);

    expect(mockSaveMerchantAdminConfig).toHaveBeenCalledWith(
      "shop-1",
      expect.objectContaining({
        enabledCapabilities: {
          answerProducts: true,
          answerPolicies: false,
          answerOrders: false,
          recommendProducts: true,
          captureLeads: true,
        },
      }),
      expect.anything(),
    );
  });

  it("uses the persisted config as fallback for missing form fields", async () => {
    mockGetMerchantAdminConfig.mockResolvedValue({
      ...BASE_CONFIG,
      botTone: "friendly",
      botGoal: "SUPPORT",
      responseStyle: "DETAILED",
      welcomeMessage: "Persisted greeting",
    } as any);

    const { action } = await import("../../app/routes/app.onboarding");

    const formData = new FormData();
    formData.set("intent", "save_only");
    formData.set("adminLanguage", "en");

    await action({ request: buildRequest("?step=2", "POST", formData) } as any);

    expect(mockSaveMerchantAdminConfig).toHaveBeenCalledWith(
      "shop-1",
      expect.objectContaining({
        botTone: "friendly",
        botGoal: "SUPPORT",
        responseStyle: "DETAILED",
        welcomeMessage: "Persisted greeting",
        adminLanguage: "en",
      }),
      expect.anything(),
    );
  });
});
