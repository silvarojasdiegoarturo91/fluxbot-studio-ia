import { describe, it, expect } from "vitest";
import {
  getAdminRouteMeta,
  getAdminNavGroups,
} from "../../../app/utils/admin-navigation";

describe("getAdminRouteMeta", () => {
  it("returns English metadata for a known route", () => {
    const meta = getAdminRouteMeta("/app", "en");
    expect(meta.title).toBe("Dashboard");
    expect(meta.section).toBe("Overview");
    expect(meta.description).toBeTruthy();
  });

  it("returns Spanish metadata for a known route", () => {
    const meta = getAdminRouteMeta("/app", "es");
    expect(meta.title).toBe("Panel");
    expect(meta.section).toBe("Resumen");
  });

  it("returns metadata for /app/onboarding in English", () => {
    const meta = getAdminRouteMeta("/app/onboarding", "en");
    expect(meta.title).toBe("Activation");
    expect(meta.section).toBe("Activation");
  });

  it("returns metadata for /app/settings in Spanish", () => {
    const meta = getAdminRouteMeta("/app/settings", "es");
    expect(meta.title).toBe("Asistente");
    expect(meta.section).toBe("Configurar");
  });

  it("returns metadata for /app/analytics in English", () => {
    const meta = getAdminRouteMeta("/app/analytics", "en");
    expect(meta.title).toBe("Analytics");
    expect(meta.section).toBe("Insights");
  });

  it("returns metadata for /app/privacy in English", () => {
    const meta = getAdminRouteMeta("/app/privacy", "en");
    expect(meta.title).toBe("Compliance");
    expect(meta.section).toBe("Risk");
  });

  it("returns metadata for /app/billing in Spanish", () => {
    const meta = getAdminRouteMeta("/app/billing", "es");
    expect(meta.title).toBe("Facturacion");
    expect(meta.section).toBe("Cuenta");
  });

  it("returns metadata for /app/campaigns in English", () => {
    const meta = getAdminRouteMeta("/app/campaigns", "en");
    expect(meta.title).toBe("Campaigns");
    expect(meta.section).toBe("Growth");
  });

  it("returns metadata for /app/conversations in Spanish", () => {
    const meta = getAdminRouteMeta("/app/conversations", "es");
    expect(meta.title).toBe("Conversaciones");
  });

  it("returns metadata for /app/widget-settings in English", () => {
    const meta = getAdminRouteMeta("/app/widget-settings", "en");
    expect(meta.title).toBe("Widget");
    expect(meta.section).toBe("Experience");
  });

  it("returns metadata for /app/widget-publish in Spanish", () => {
    const meta = getAdminRouteMeta("/app/widget-publish", "es");
    expect(meta.title).toBe("Publicar widget");
  });

  it("returns metadata for /app/llms-status in English", () => {
    const meta = getAdminRouteMeta("/app/llms-status", "en");
    expect(meta.title).toBe("llms.txt");
    expect(meta.section).toBe("Operations");
  });

  it("falls back to /app defaults for an unknown route", () => {
    const metaEn = getAdminRouteMeta("/app/unknown-route", "en");
    const defaultEn = getAdminRouteMeta("/app", "en");
    expect(metaEn).toEqual(defaultEn);

    const metaEs = getAdminRouteMeta("/app/unknown-route", "es");
    const defaultEs = getAdminRouteMeta("/app", "es");
    expect(metaEs).toEqual(defaultEs);
  });
});

describe("getAdminNavGroups", () => {
  it("returns four navigation groups in English", () => {
    const groups = getAdminNavGroups("en");
    expect(groups).toHaveLength(4);
    expect(groups[0].title).toBe("Overview");
    expect(groups[1].title).toBe("Configure");
    expect(groups[2].title).toBe("Growth");
    expect(groups[3].title).toBe("Operations");
  });

  it("returns four navigation groups in Spanish", () => {
    const groups = getAdminNavGroups("es");
    expect(groups).toHaveLength(4);
    expect(groups[0].title).toBe("Resumen");
    expect(groups[1].title).toBe("Configurar");
    expect(groups[2].title).toBe("Crecimiento");
    expect(groups[3].title).toBe("Operaciones");
  });

  it("each group contains items with label, url and description", () => {
    const groups = getAdminNavGroups("en");
    for (const group of groups) {
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(typeof item.label).toBe("string");
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.url).toMatch(/^\/app/);
        expect(typeof item.description).toBe("string");
        expect(item.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("Overview group includes Dashboard and Onboarding routes", () => {
    const groups = getAdminNavGroups("en", false);
    const overview = groups[0];
    const urls = overview.items.map((i) => i.url);
    expect(urls).toContain("/app");
    expect(urls).toContain("/app/onboarding");
  });

  it("Configure group includes settings, data-sources, widget routes", () => {
    const groups = getAdminNavGroups("en");
    const configure = groups[1];
    const urls = configure.items.map((i) => i.url);
    expect(urls).toContain("/app/settings");
    expect(urls).toContain("/app/data-sources");
    expect(urls).toContain("/app/widget-settings");
    expect(urls).toContain("/app/widget-publish");
  });

  it("Growth group includes campaigns, analytics, conversations", () => {
    const groups = getAdminNavGroups("en");
    const growth = groups[2];
    const urls = growth.items.map((i) => i.url);
    expect(urls).toContain("/app/campaigns");
    expect(urls).toContain("/app/analytics");
    expect(urls).toContain("/app/conversations");
  });

  it("Operations group includes operations, privacy, llms-status, billing", () => {
    const groups = getAdminNavGroups("en");
    const operations = groups[3];
    const urls = operations.items.map((i) => i.url);
    expect(urls).toContain("/app/operations");
    expect(urls).toContain("/app/privacy");
    expect(urls).toContain("/app/llms-status");
    expect(urls).toContain("/app/billing");
  });

  it("Spanish labels match expected translations", () => {
    const groups = getAdminNavGroups("es", false);
    const overviewItems = groups[0].items;
    const dashboard = overviewItems.find((i) => i.url === "/app");
    expect(dashboard?.label).toBe("Panel");
    const onboarding = overviewItems.find((i) => i.url === "/app/onboarding");
    expect(onboarding?.label).toBe("Activación");
  });
});
