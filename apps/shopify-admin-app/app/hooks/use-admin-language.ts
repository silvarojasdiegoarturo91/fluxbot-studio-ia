import { useMatches } from "react-router";

export type AdminUILanguage = "es" | "en";

function normalizeAdminLanguage(value: unknown): AdminUILanguage {
  return value === "es" ? "es" : "en";
}

/**
 * Reads the selected admin language from parent route loader data.
 * Falls back to English when data is unavailable.
 */
export function useAdminLanguage(): AdminUILanguage {
  const matches = useMatches();

  for (let i = matches.length - 1; i >= 0; i--) {
    const data = matches[i]?.data as Record<string, unknown> | undefined;
    if (!data) continue;

    if ("adminLanguage" in data) {
      return normalizeAdminLanguage(data.adminLanguage);
    }
  }

  return "en";
}

export function useIsSpanish(): boolean {
  return useAdminLanguage() === "es";
}
