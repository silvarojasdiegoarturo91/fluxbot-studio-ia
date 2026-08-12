/**
 * Unit Tests — localization.server.ts
 *
 * Covers locale detection heuristics, Accept-Language parsing, translation
 * lookup with fallback chains and interpolation, prompt localization,
 * locale-aware formatting (including the Intl failure fallbacks) and the
 * supported-locale helpers.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectLanguageFromHeaders,
  detectLanguageFromText,
  formatDate,
  formatPrice,
  getErrorMessage,
  getShoppingPrompt,
  getSupportedLocales,
  getSupportPrompt,
  getTranslation,
  isSupportedLocale,
  SUPPORTED_LOCALES,
} from "../../../app/services/localization.server";

describe("detectLanguageFromText", () => {
  it("falls back to the default for empty or short text", () => {
    expect(detectLanguageFromText("", "en")).toBe("en");
    expect(detectLanguageFromText("hola", "en")).toBe("en");
  });

  it("detects script-based languages", () => {
    expect(detectLanguageFromText("你好，世界")).toBe("zh");
    expect(detectLanguageFromText("こんにちは、ありがとう")).toBe("ja");
    expect(detectLanguageFromText("مرحبا بالعالم")).toBe("ar");
    expect(detectLanguageFromText("Привет мир")).toBe("ru");
  });

  it("detects Portuguese before Spanish when overlapping", () => {
    expect(detectLanguageFromText("Você está preparado?")).toBe("pt");
    expect(detectLanguageFromText("¿Estás listo?")).toBe("es");
  });

  it("detects accented Spanish text", () => {
    expect(detectLanguageFromText("¿Dónde está mi pedido?")).toBe("es");
    expect(detectLanguageFromText("La niña juega en el jardín")).toBe("es");
  });

  it("detects German, French and Italian by function words", () => {
    expect(detectLanguageFromText("Der Hund und die Katze")).toBe("de");
    expect(detectLanguageFromText("Le chat est sur la table")).toBe("fr");
    expect(detectLanguageFromText("Il gatto è sul tavolo")).toBe("it");
  });

  it("falls back to the provided locale for unrecognized text", () => {
    expect(detectLanguageFromText("the quick brown fox jumps over the lazy dog", "en")).toBe("en");
  });
});

describe("detectLanguageFromHeaders", () => {
  it("returns the default when the header is missing", () => {
    expect(detectLanguageFromHeaders(undefined, "es")).toBe("es");
    expect(detectLanguageFromHeaders("", "es")).toBe("es");
  });

  it("picks the first supported language from a weighted list", () => {
    expect(detectLanguageFromHeaders("en-US,en;q=0.9,es;q=0.8")).toBe("en");
    expect(detectLanguageFromHeaders("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(detectLanguageFromHeaders("fr-FR,fr;q=0.9,pt;q=0.8")).toBe("fr");
  });

  it("ignores unsupported languages and falls back to the default", () => {
    expect(detectLanguageFromHeaders("ko-KR,ko;q=0.9,th;q=0.8", "en")).toBe("en");
  });
});

describe("getTranslation", () => {
  it("returns the English string when no locale is provided", () => {
    expect(getTranslation("chat.welcome")).toContain("Hi");
  });

  it("falls back through es-MX -> es -> en", () => {
    expect(getTranslation("chat.welcome", "es-MX")).toBe(
      "Hola 👋 Estoy aquí para ayudarte. ¿Qué necesitas?",
    );
    expect(getTranslation("prompts.support", "es-MX")).toContain("servicio al cliente");
  });

  it("falls back to English when the requested locale lacks a key", () => {
    // es has no cart.total override
    expect(getTranslation("cart.total", "es", { price: "$10.00" })).toBe("Total: $10.00");
  });

  it("interpolates variables into the template", () => {
    expect(getTranslation("error.outOfStock", "en", { product: "Snowboard", alternatives: "Skis" })).toBe(
      "Unfortunately, Snowboard is out of stock. Similar options: Skis",
    );
  });

  it("returns the key itself for unknown keys and warns", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(getTranslation("does.not.exist", "en")).toBe("does.not.exist");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Missing translation for key: does.not.exist"),
    );
    warnSpy.mockRestore();
  });

  it("localizes every supported locale's welcome message", () => {
    const locales = ["en", "es", "fr", "de", "it", "pt", "ja", "zh-CN", "ar", "ru"];
    for (const locale of locales) {
      const translated = getTranslation("chat.welcome", locale);
      expect(translated.length).toBeGreaterThan(0);
      expect(translated).not.toBe("chat.welcome");
    }
  });
});

describe("prompt localization", () => {
  it("appends a locale context to the shopping prompt for non-English locales", () => {
    const prompt = getShoppingPrompt("My Shop", "es");
    expect(prompt).toContain("My Shop");
    expect(prompt).toContain("**IMPORTANT:** Respond in Español language only");
    expect(prompt).toContain("Spain");
  });

  it("omits the locale context for English", () => {
    expect(getShoppingPrompt("My Shop", "en")).not.toContain("**IMPORTANT:**");
    expect(getSupportPrompt("My Shop", "en")).not.toContain("**IMPORTANT:**");
  });

  it("appends a locale context to the support prompt for non-English locales", () => {
    const prompt = getSupportPrompt("My Shop", "fr");
    expect(prompt).toContain("Respond in Français language only");
  });

  it("localizes error messages through the getErrorMessage helper", () => {
    expect(getErrorMessage("notFound", "es")).toContain("No pude encontrar ese producto");
    expect(getErrorMessage("searchFailed", "en")).toContain("Search is temporarily unavailable");
  });
});

describe("locale-aware formatting", () => {
  it("formats prices for supported locales", () => {
    expect(formatPrice(19.9, "en", "USD")).toContain("19.90");
    expect(formatPrice(19.9, "es", "EUR")).toContain("19,90");
    expect(formatPrice(100, "ja", "JPY")).toContain("100");
  });

  it("falls back to a plain dollar string when Intl fails", () => {
    const original = Intl.NumberFormat;
    (Intl as any).NumberFormat = class {
      constructor() {
        throw new Error("intl unavailable");
      }
    };
    try {
      expect(formatPrice(12.34, "en", "USD")).toBe("$12.34");
    } finally {
      (Intl as any).NumberFormat = original;
    }
  });

  it("formats dates in short and long styles", () => {
    const date = new Date("2026-03-01T10:00:00Z");
    expect(typeof formatDate(date, "en", "short")).toBe("string");
    expect(formatDate(date, "es", "long")).not.toBe("");
  });

  it("falls back to the default date string when Intl fails", () => {
    const original = Intl.DateTimeFormat;
    (Intl as any).DateTimeFormat = class {
      constructor() {
        throw new Error("intl unavailable");
      }
    };
    try {
      const date = new Date("2026-03-01T10:00:00Z");
      expect(formatDate(date, "en", "short")).toBe(date.toLocaleDateString());
    } finally {
      (Intl as any).DateTimeFormat = original;
    }
  });
});

describe("supported locale helpers", () => {
  it("checks support for a locale code", () => {
    expect(isSupportedLocale("es")).toBe(true);
    expect(isSupportedLocale("ko")).toBe(false);
  });

  it("returns the full supported locale list", () => {
    expect(getSupportedLocales()).toEqual(SUPPORTED_LOCALES);
    expect(getSupportedLocales()).toHaveLength(10);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
