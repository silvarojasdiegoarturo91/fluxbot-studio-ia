import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: vi.fn(),
}));

vi.mock("../../app/services/shop-context.server", () => ({
  ensureShopForSession: vi.fn(),
}));

vi.mock("../../app/services/admin-config.server", () => ({
  getMerchantAdminConfig: vi.fn(),
  saveMerchantAdminConfig: vi.fn(),
}));

import { authenticateAdminRequest } from "../../app/utils/authenticate-admin.server";
import { ensureShopForSession } from "../../app/services/shop-context.server";
import { getMerchantAdminConfig, saveMerchantAdminConfig } from "../../app/services/admin-config.server";

const mockAuthenticateAdminRequest = vi.mocked(authenticateAdminRequest);
const mockEnsureShopForSession = vi.mocked(ensureShopForSession);
const mockGetMerchantAdminConfig = vi.mocked(getMerchantAdminConfig);
const mockSaveMerchantAdminConfig = vi.mocked(saveMerchantAdminConfig);

function makePostRequest(fields: Record<string, string>) {
  return new Request("http://localhost/app/widget-settings", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("app.widget-settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthenticateAdminRequest.mockResolvedValue({
      session: { shop: "shop.example.myshopify.com" },
    } as any);
    mockEnsureShopForSession.mockResolvedValue({
      id: "shop-1",
      domain: "shop.example.myshopify.com",
    } as any);
    mockGetMerchantAdminConfig.mockResolvedValue({
      welcomeMessage: "Hello",
      widgetBranding: {
        primaryColor: "#008060",
        launcherPosition: "bottom-right",
        launcherLabel: "Assistant",
      },
    } as any);
  });

  it("loads the current widget configuration", async () => {
    const { loader } = await import("../../app/routes/app.widget-settings");
    const data = await loader({ request: new Request("http://localhost/app/widget-settings") } as any);

    expect(data.shop.id).toBe("shop-1");
    expect(data.config.widgetBranding.primaryColor).toBe("#008060");
  });

  it("updates widget settings through the canonical admin config", async () => {
    const { action } = await import("../../app/routes/app.widget-settings");
    const result = await action({
      request: makePostRequest({
        intent: "save_widget_settings",
        launcherPosition: "bottom-left",
        primaryColor: "#112233",
        launcherLabel: "FluxBot",
        welcomeMessage: "  Hola  ",
      }),
    } as any);

    expect(result).toEqual({
      ok: true,
      message: "Widget settings updated.",
    });
    expect(mockSaveMerchantAdminConfig).toHaveBeenCalledWith("shop-1", {
      welcomeMessage: "Hola",
      widgetBranding: {
        primaryColor: "#112233",
        launcherPosition: "bottom-left",
        launcherLabel: "FluxBot",
      },
    });
  });

  it("rejects invalid widget settings input", async () => {
    const { action } = await import("../../app/routes/app.widget-settings");

    const invalidPosition = await action({
      request: makePostRequest({
        intent: "save_widget_settings",
        launcherPosition: "center",
        primaryColor: "#112233",
      }),
    } as any);
    expect(invalidPosition).toEqual({ ok: false, error: "Invalid launcher position" });

    const invalidColor = await action({
      request: makePostRequest({
        intent: "save_widget_settings",
        launcherPosition: "bottom-right",
        primaryColor: "blue",
      }),
    } as any);
    expect(invalidColor).toEqual({
      ok: false,
      error: "Primary color must be a valid hex value (e.g. #008060)",
    });
  });

  it("rejects unsupported methods, intents and missing shops", async () => {
    const { action } = await import("../../app/routes/app.widget-settings");

    const methodNotAllowed = await action({
      request: new Request("http://localhost/app/widget-settings", { method: "GET" }),
    } as any);
    expect(methodNotAllowed).toEqual({ ok: false, error: "Method not allowed" });

    const unsupportedIntent = await action({
      request: makePostRequest({
        intent: "unsupported",
        launcherPosition: "bottom-right",
        primaryColor: "#112233",
      }),
    } as any);
    expect(unsupportedIntent).toEqual({ ok: false, error: "Unsupported action" });

    mockEnsureShopForSession.mockResolvedValueOnce(null);
    const missingShop = await action({
      request: makePostRequest({
        intent: "save_widget_settings",
        launcherPosition: "bottom-right",
        primaryColor: "#112233",
      }),
    } as any);
    expect(missingShop).toEqual({ ok: false, error: "Shop not found" });
  });
});
