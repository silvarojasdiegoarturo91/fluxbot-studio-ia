/**
 * Unit Tests: Campaign Service — Phase 3
 *
 * Covers:
 *  - resolveLocaleTemplate (locale fallback chain)
 *  - interpolateTemplate (variable substitution + sanitization)
 *  - dispatchCampaign (status checks, date windows, frequency cap, happy path)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
// Use vi.hoisted so variables are available in the factory (Vitest hoists vi.mock calls)
const { mockCampaignFindFirst, mockDispatchEventCount, mockDispatchEventCreate, mockCampaignUpdate } =
  vi.hoisted(() => ({
    mockCampaignFindFirst: vi.fn(),
    mockDispatchEventCount: vi.fn(),
    mockDispatchEventCreate: vi.fn(),
    mockCampaignUpdate: vi.fn(),
  }));

vi.mock("../../app/db.server", () => ({
  default: {
    marketingCampaign: {
      findFirst: mockCampaignFindFirst,
      findMany: vi.fn(),
      create: vi.fn(),
      update: mockCampaignUpdate,
      delete: vi.fn(),
    },
    campaignDispatchEvent: {
      count: mockDispatchEventCount,
      create: mockDispatchEventCreate,
    },
  },
}));

vi.mock("../../app/services/localization.server", () => ({
  SUPPORTED_LOCALES: [
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "pt-BR", name: "Portuguese (Brazil)" },
  ],
}));

import {
  resolveLocaleTemplate,
  interpolateTemplate,
  dispatchCampaign,
} from "../../app/services/campaign.server";

// ─── resolveLocaleTemplate ────────────────────────────────────────────────────

describe("resolveLocaleTemplate", () => {
  it("returns null when templates is empty", () => {
    expect(resolveLocaleTemplate({}, "en")).toBeNull();
  });

  it("exact locale match", () => {
    const result = resolveLocaleTemplate({ "es-MX": "hola {{name}}" }, "es-MX");
    expect(result).toEqual({ template: "hola {{name}}", resolvedLocale: "es-MX" });
  });

  it("language prefix fallback: es-MX → es", () => {
    const result = resolveLocaleTemplate({ es: "hola", en: "hello" }, "es-MX");
    expect(result).toEqual({ template: "hola", resolvedLocale: "es" });
  });

  it("supported locale prefix fallback: pt-BR via 'pt' prefix", () => {
    const result = resolveLocaleTemplate({ "pt-BR": "olá" }, "pt-PT");
    expect(result).toEqual({ template: "olá", resolvedLocale: "pt-BR" });
  });

  it("English fallback when no locale match", () => {
    const result = resolveLocaleTemplate({ en: "hello", fr: "bonjour" }, "ja");
    expect(result).toEqual({ template: "hello", resolvedLocale: "en" });
  });

  it("first available when no English and no language match", () => {
    const result = resolveLocaleTemplate({ fr: "bonjour" }, "ja");
    expect(result).toEqual({ template: "bonjour", resolvedLocale: "fr" });
  });
});

// ─── interpolateTemplate ──────────────────────────────────────────────────────

describe("interpolateTemplate", () => {
  it("replaces known variables", () => {
    const out = interpolateTemplate("Hi {{name}}, check {{product}}!", {
      name: "Alice",
      product: "Blue Coat",
    });
    expect(out).toBe("Hi Alice, check Blue Coat!");
  });

  it("leaves unknown variables unchanged", () => {
    const out = interpolateTemplate("Hi {{name}} check {{unknown}}", { name: "Bob" });
    expect(out).toBe("Hi Bob check {{unknown}}");
  });

  it("strips < and > from variable values (XSS prevention)", () => {
    const out = interpolateTemplate("Hi {{name}}", { name: "<script>alert(1)</script>" });
    expect(out).toBe("Hi scriptalert(1)/script");
  });

  it("leaves template unchanged when variables is empty", () => {
    expect(interpolateTemplate("Hello world")).toBe("Hello world");
  });
});

// ─── dispatchCampaign ────────────────────────────────────────────────────────

describe("dispatchCampaign", () => {
  const BASE_CAMPAIGN = {
    id: "camp-1",
    shopId: "shop-1",
    status: "ACTIVE",
    startAt: null,
    endAt: null,
    frequencyCap: 1,
    campaignWindowMs: 86400000, // 24h
    localeTemplates: { en: "Hello {{name}}!" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns dispatched:false when campaign not found", async () => {
    mockCampaignFindFirst.mockResolvedValue(null);
    const result = await dispatchCampaign("shop-1", "camp-1", { sessionId: "sess-1" });
    expect(result.dispatched).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });

  it("returns dispatched:false when campaign is not ACTIVE (DRAFT)", async () => {
    mockCampaignFindFirst.mockResolvedValue({ ...BASE_CAMPAIGN, status: "DRAFT" });
    const result = await dispatchCampaign("shop-1", "camp-1", { sessionId: "sess-1" });
    expect(result.dispatched).toBe(false);
    expect(result.reason).toMatch(/draft/i);
  });

  it("returns dispatched:false when startAt is in the future", async () => {
    const future = new Date(Date.now() + 86400000);
    mockCampaignFindFirst.mockResolvedValue({ ...BASE_CAMPAIGN, startAt: future });
    const result = await dispatchCampaign("shop-1", "camp-1", { sessionId: "sess-1" });
    expect(result.dispatched).toBe(false);
    expect(result.reason).toMatch(/not started/i);
  });

  it("returns dispatched:false when endAt is in the past", async () => {
    const past = new Date(Date.now() - 86400000);
    mockCampaignFindFirst.mockResolvedValue({ ...BASE_CAMPAIGN, endAt: past });
    const result = await dispatchCampaign("shop-1", "camp-1", { sessionId: "sess-1" });
    expect(result.dispatched).toBe(false);
    expect(result.reason).toMatch(/ended/i);
  });

  it("returns dispatched:false when frequency cap exceeded", async () => {
    mockCampaignFindFirst.mockResolvedValue({ ...BASE_CAMPAIGN });
    mockDispatchEventCount.mockResolvedValue(1); // already dispatched once, cap = 1
    const result = await dispatchCampaign("shop-1", "camp-1", { sessionId: "sess-1" });
    expect(result.dispatched).toBe(false);
    expect(result.reason).toMatch(/frequency cap/i);
  });

  it("returns dispatched:false when no locale template available", async () => {
    mockCampaignFindFirst.mockResolvedValue({ ...BASE_CAMPAIGN, localeTemplates: {} });
    mockDispatchEventCount.mockResolvedValue(0);
    const result = await dispatchCampaign("shop-1", "camp-1", { sessionId: "sess-1" });
    expect(result.dispatched).toBe(false);
    expect(result.reason).toMatch(/no locale template/i);
  });

  it("dispatches successfully and returns rendered message", async () => {
    mockCampaignFindFirst.mockResolvedValue({ ...BASE_CAMPAIGN });
    mockDispatchEventCount.mockResolvedValue(0);
    mockDispatchEventCreate.mockResolvedValue({ id: "event-1" });
    mockCampaignUpdate.mockResolvedValue({});

    const result = await dispatchCampaign("shop-1", "camp-1", {
      sessionId: "sess-1",
      locale: "en",
      variables: { name: "Alice" },
    });

    expect(result.dispatched).toBe(true);
    expect(result.renderedMessage).toBe("Hello Alice!");
    expect(result.locale).toBe("en");
    expect(result.dispatchEventId).toBe("event-1");
    expect(mockDispatchEventCreate).toHaveBeenCalledOnce();
    expect(mockCampaignUpdate).toHaveBeenCalledOnce();
  });

  it("uses locale fallback when exact locale not in templates", async () => {
    mockCampaignFindFirst.mockResolvedValue({
      ...BASE_CAMPAIGN,
      localeTemplates: { en: "Hello {{name}}!", es: "Hola {{name}}!" },
    });
    mockDispatchEventCount.mockResolvedValue(0);
    mockDispatchEventCreate.mockResolvedValue({ id: "event-2" });
    mockCampaignUpdate.mockResolvedValue({});

    const result = await dispatchCampaign("shop-1", "camp-1", {
      sessionId: "sess-2",
      locale: "es-AR",
      variables: { name: "Carlos" },
    });

    expect(result.dispatched).toBe(true);
    expect(result.renderedMessage).toBe("Hola Carlos!");
    expect(result.locale).toBe("es");
  });

  it("skips frequency cap check when frequencyCap = 0", async () => {
    mockCampaignFindFirst.mockResolvedValue({ ...BASE_CAMPAIGN, frequencyCap: 0 });
    mockDispatchEventCreate.mockResolvedValue({ id: "event-3" });
    mockCampaignUpdate.mockResolvedValue({});

    const result = await dispatchCampaign("shop-1", "camp-1", { sessionId: "sess-3" });
    expect(result.dispatched).toBe(true);
    expect(mockDispatchEventCount).not.toHaveBeenCalled();
  });
});
