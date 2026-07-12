import { getTranslation } from "./localization.server";

export interface EffectiveLocaleInput {
  primaryBotLanguage: string;
  supportedLanguages?: string[] | null;
  storefrontLocale?: unknown;
  requestLocale?: unknown;
  conversationLocale?: unknown;
}

function normalizeLocale(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return normalized.split("-")[0];
}

function normalizeSupportedLanguages(
  supportedLanguages: string[] | null | undefined,
  primaryBotLanguage: string,
): string[] {
  const primary = normalizeLocale(primaryBotLanguage) ?? "en";
  const normalized = Array.isArray(supportedLanguages)
    ? supportedLanguages
        .map((locale) => normalizeLocale(locale))
        .filter((locale): locale is string => Boolean(locale))
    : [];

  if (!normalized.includes(primary)) {
    normalized.push(primary);
  }

  return Array.from(new Set(normalized));
}

export function resolveEffectiveLocale(input: EffectiveLocaleInput): string {
  const primary = normalizeLocale(input.primaryBotLanguage) ?? "en";
  const supported = normalizeSupportedLanguages(input.supportedLanguages, primary);

  const normalizedConversationLocale = normalizeLocale(input.conversationLocale);
  if (normalizedConversationLocale && supported.includes(normalizedConversationLocale)) {
    return normalizedConversationLocale;
  }

  // Deterministic precedence for request payloads:
  // 1) root locale, 2) context/storefront locale.
  const normalizedRootLocale = normalizeLocale(input.requestLocale);
  if (normalizedRootLocale && supported.includes(normalizedRootLocale)) {
    return normalizedRootLocale;
  }

  const normalizedStorefrontLocale = normalizeLocale(input.storefrontLocale);
  if (normalizedStorefrontLocale && supported.includes(normalizedStorefrontLocale)) {
    return normalizedStorefrontLocale;
  }

  return primary;
}

export function getCatalogFallbackMessage(locale: string, productCount: number): string {
  const key =
    productCount === 1 ? "catalog.relatedOptions.single" : "catalog.relatedOptions.multiple";
  return getTranslation(key, locale);
}

