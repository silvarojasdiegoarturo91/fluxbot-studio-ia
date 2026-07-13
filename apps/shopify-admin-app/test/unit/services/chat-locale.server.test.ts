import { describe, expect, it } from "vitest";
import { getCatalogFallbackMessage, resolveEffectiveLocale } from "../../../app/services/chat-locale.server";

describe("chat-locale.server", () => {
  it("uses primary bot language as default source of truth", () => {
    expect(
      resolveEffectiveLocale({
        primaryBotLanguage: "es",
        supportedLanguages: ["es"],
      }),
    ).toBe("es");
  });

  it("applies storefront locale only when it is supported", () => {
    expect(
      resolveEffectiveLocale({
        primaryBotLanguage: "en",
        supportedLanguages: ["en", "es"],
        storefrontLocale: "es-MX",
      }),
    ).toBe("es");
  });

  it("falls back to primary bot language when storefront locale is unsupported", () => {
    expect(
      resolveEffectiveLocale({
        primaryBotLanguage: "en",
        supportedLanguages: ["en"],
        storefrontLocale: "es",
      }),
    ).toBe("en");
  });

  it("prefers root locale over context locale when both are present", () => {
    expect(
      resolveEffectiveLocale({
        primaryBotLanguage: "en",
        supportedLanguages: ["en", "es"],
        requestLocale: "es",
        storefrontLocale: "en",
      }),
    ).toBe("es");
  });

  it("preserves existing conversation locale when it is supported", () => {
    expect(
      resolveEffectiveLocale({
        primaryBotLanguage: "en",
        supportedLanguages: ["en", "es"],
        conversationLocale: "es",
        requestLocale: "en",
        storefrontLocale: "en",
      }),
    ).toBe("es");
  });

  it("resolves catalog fallback messages from centralized i18n keys", () => {
    expect(getCatalogFallbackMessage("es", 1)).toContain("Te comparto");
    expect(getCatalogFallbackMessage("en", 2)).toContain("related options");
  });
});
