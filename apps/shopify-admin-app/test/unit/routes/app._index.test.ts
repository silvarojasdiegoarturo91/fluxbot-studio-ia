/**
 * Unit Tests — app._index.tsx (dashboard index loader)
 *
 * Covers the loader branches directly with mocked auth / shop context /
 * analytics / prisma, mirroring the billing-route.test.ts pattern:
 *  - happy path aggregates stats and returns business/assistant data
 *  - missing session shop -> fallback with connection alerts
 *  - unresolved shop context -> fallback with alert
 *  - incomplete onboarding -> redirect to /app/onboarding?step=N
 *  - business alerts for paused assistant / no sources / failed syncs / no campaigns
 *  - loader resilience when analytics or prisma throws
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthenticateAdminRequest = vi.fn();
const mockFetchShopConnection = vi.fn();
const mockEnsureShopForSession = vi.fn();
const mockGetMerchantAdminConfig = vi.fn();
const mockGetReport = vi.fn();

const mockChatbotConfigFindUnique = vi.fn();
const mockKnowledgeSourceCount = vi.fn();
const mockMarketingCampaignCount = vi.fn();
const mockSyncJobCount = vi.fn();
const mockSyncJobFindFirst = vi.fn();
const mockHandoffRequestCount = vi.fn();

vi.mock("../../../app/db.server", () => ({
  default: {
    chatbotConfig: { findUnique: mockChatbotConfigFindUnique },
    knowledgeSource: { count: mockKnowledgeSourceCount },
    marketingCampaign: { count: mockMarketingCampaignCount },
    syncJob: { count: mockSyncJobCount, findFirst: mockSyncJobFindFirst },
    handoffRequest: { count: mockHandoffRequestCount },
  },
}));

vi.mock("../../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: mockAuthenticateAdminRequest,
}));

vi.mock("../../../app/services/shop-context.server", () => ({
  ensureShopForSession: mockEnsureShopForSession,
}));

vi.mock("../../../app/services/shop-connection.server", () => ({
  fetchShopConnection: mockFetchShopConnection,
}));

vi.mock("../../../app/services/admin-config.server", () => ({
  getMerchantAdminConfig: mockGetMerchantAdminConfig,
}));

vi.mock("../../../app/services/analytics.server", () => ({
  AnalyticsService: { getReport: mockGetReport },
}));

const SESSION = { shop: "shop.example.myshopify.com", accessToken: "mock-access-token" };
const SHOP = { id: "shop-1", domain: "shop.example.myshopify.com" };

const CONNECTION_OK = {
  shopConnection: {
    connected: true,
    name: "Example",
    myshopifyDomain: "shop.example.myshopify.com",
    primaryDomainHost: "example.com",
    planName: "Basic",
    error: null,
    source: "live",
  },
  alerts: [],
};

const REPORT = {
  conversations: { total: 42 },
  revenue: { totalRevenue: 129.5 },
  proactive: { sent: 7 },
};

const ADMIN_CONFIG_EN = {
  adminLanguage: "en",
  onboardingCompleted: true,
  onboardingStep: 7,
};

function buildRequest(search = "") {
  return new Request(`http://localhost/app${search}`);
}

function mockPrismaBusinessData() {
  mockChatbotConfigFindUnique.mockResolvedValue({
    isActive: true,
    language: "en",
    tone: "professional",
    enableProactive: true,
    enableHandoff: true,
  });
  mockKnowledgeSourceCount
    .mockResolvedValueOnce(3)
    .mockResolvedValueOnce(4);
  mockMarketingCampaignCount.mockResolvedValue(1);
  mockSyncJobCount.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
  mockHandoffRequestCount.mockResolvedValue(1);
  mockSyncJobFindFirst.mockResolvedValue({
    jobType: "FULL_CATALOG",
    completedAt: new Date("2026-07-01T10:00:00Z"),
  });
}

describe("app._index loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthenticateAdminRequest.mockResolvedValue({
      session: SESSION,
      admin: { graphql: vi.fn() },
    } as any);
    mockFetchShopConnection.mockResolvedValue(CONNECTION_OK);
    mockEnsureShopForSession.mockResolvedValue(SHOP);
    mockGetMerchantAdminConfig.mockResolvedValue(ADMIN_CONFIG_EN);
    mockGetReport.mockResolvedValue(REPORT);
    mockPrismaBusinessData();
  });

  it("returns aggregated business metrics, assistant config and alerts", async () => {
    const { loader } = await import("../../../app/routes/app._index");

    const data = await loader({ request: buildRequest() } as any);

    expect(data.business.conversationsLast7d).toBe(42);
    expect(data.business.assistedRevenueLast7d).toBe(129.5);
    expect(data.business.proactiveSentLast7d).toBe(7);
    expect(data.business.openHandoffs).toBe(1);
    expect(data.business.activeCampaigns).toBe(1);
    expect(data.business.activeSources).toBe(3);
    expect(data.business.totalSources).toBe(4);
    expect(data.business.runningSyncJobs).toBe(2);
    expect(data.business.hasCompletedSync).toBe(true);
    expect(data.business.lastSyncLabel).toContain("FULL_CATALOG");
    expect(data.assistant.isActive).toBe(true);
    expect(data.assistant.language).toBe("en");
    expect(data.assistant.enableProactive).toBe(true);
    expect(data.alerts).toEqual([]);
    expect(data.showOnboardingSuccess).toBe(false);
    expect(data.shopConnection.connected).toBe(true);
  });

  it("surfaces the onboarding success flag from the query string", async () => {
    const { loader } = await import("../../../app/routes/app._index");

    const data = await loader({ request: buildRequest("?onboarding=done") } as any);

    expect(data.showOnboardingSuccess).toBe(true);
  });

  it("keeps the loader resilient when the session has no shop", async () => {
    mockAuthenticateAdminRequest.mockResolvedValue({
      session: { accessToken: "mock-access-token" },
      admin: { graphql: vi.fn() },
    } as any);
    mockFetchShopConnection.mockResolvedValue({
      shopConnection: CONNECTION_OK.shopConnection,
      alerts: ["legacy alert"],
    });

    const { loader } = await import("../../../app/routes/app._index");

    const data = await loader({ request: buildRequest() } as any);

    expect(data.shopConnection.connected).toBe(true);
    expect(data.alerts).toEqual(["legacy alert"]);
    expect(data.business.conversationsLast7d).toBe(0);
    expect(mockEnsureShopForSession).not.toHaveBeenCalled();
  });

  it("returns fallback data with a context alert when the shop cannot be resolved", async () => {
    mockEnsureShopForSession.mockResolvedValue(null);

    const { loader } = await import("../../../app/routes/app._index");

    const data = await loader({ request: buildRequest() } as any);

    expect(data.business.conversationsLast7d).toBe(0);
    expect(data.alerts).toContain("Unable to resolve shop context.");
    expect(mockGetMerchantAdminConfig).not.toHaveBeenCalled();
  });

  it("redirects to the onboarding step when onboarding is incomplete", async () => {
    mockGetMerchantAdminConfig.mockResolvedValue({
      ...ADMIN_CONFIG_EN,
      onboardingCompleted: false,
      onboardingStep: 3,
    });

    const { loader } = await import("../../../app/routes/app._index");

    await expect(loader({ request: buildRequest() } as any)).rejects.toMatchObject({
      status: 302,
    });
    const error = await loader({ request: buildRequest() } as any).catch((e) => e);
    expect(error.headers.get("Location")).toBe("/app/onboarding?step=3");
    expect(mockGetReport).not.toHaveBeenCalled();
  });

  it("preserves embedded query params while redirecting to onboarding", async () => {
    mockGetMerchantAdminConfig.mockResolvedValue({
      ...ADMIN_CONFIG_EN,
      onboardingCompleted: false,
      onboardingStep: 1,
    });

    const { loader } = await import("../../../app/routes/app._index");

    const error = await loader({
      request: buildRequest("?shop=shop.example.myshopify.com&host=dGVzdA&saved=1&onboarding=done&step=9"),
    } as any).catch((e) => e);

    const location = error.headers.get("Location");
    expect(location).toContain("shop=shop.example.myshopify.com");
    expect(location).toContain("host=dGVzdA");
    expect(location).toContain("step=1");
    expect(location).not.toContain("saved");
    expect(location).not.toContain("onboarding=done");
  });

  it("emits a paused-assistant alert in Spanish when admin language is es", async () => {
    mockGetMerchantAdminConfig.mockResolvedValue({
      ...ADMIN_CONFIG_EN,
      adminLanguage: "es",
      onboardingCompleted: true,
    });
    mockChatbotConfigFindUnique.mockResolvedValue({
      isActive: false,
      language: "es",
      tone: "friendly",
      enableProactive: false,
      enableHandoff: true,
    });

    const { loader } = await import("../../../app/routes/app._index");

    const data = await loader({ request: buildRequest() } as any);

    expect(data.assistant.isActive).toBe(false);
    expect(data.alerts).toContain("El asistente está en pausa.");
  });

  it("emits alerts for missing sources, failed syncs and no active campaigns", async () => {
    mockKnowledgeSourceCount.mockReset();
    mockSyncJobCount.mockReset();
    mockKnowledgeSourceCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockMarketingCampaignCount.mockResolvedValue(0);
    mockSyncJobCount.mockResolvedValueOnce(3).mockResolvedValueOnce(0);

    const { loader } = await import("../../../app/routes/app._index");

    const data = await loader({ request: buildRequest() } as any);

    expect(data.alerts).toContain("No knowledge source configured. Add at least one source.");
    expect(data.alerts).toContain("3 sync job(s) failed and need review.");
    expect(data.alerts).toContain("No active campaign running for proactive sales.");
  });

  it("falls back to the last sync label when no sync has completed", async () => {
    mockSyncJobFindFirst.mockResolvedValue(null);

    const { loader } = await import("../../../app/routes/app._index");

    const data = await loader({ request: buildRequest() } as any);

    expect(data.business.hasCompletedSync).toBe(false);
    expect(data.business.lastSyncLabel).toBe("No sync yet");
  });

  it("falls back gracefully when the analytics report throws", async () => {
    mockGetReport.mockRejectedValue(new Error("analytics exploded"));

    const { loader } = await import("../../../app/routes/app._index");

    const data = await loader({ request: buildRequest() } as any);

    expect(data.business.conversationsLast7d).toBe(0);
    expect(data.shopConnection.connected).toBe(false);
    expect(data.shopConnection.error).toBe("analytics exploded");
    expect(data.alerts).toContain("Unable to load business metrics. Please refresh.");
  });

  it("re-throws Response errors (redirects) instead of swallowing them", async () => {
    mockGetMerchantAdminConfig.mockResolvedValue({
      ...ADMIN_CONFIG_EN,
      onboardingCompleted: false,
      onboardingStep: 2,
    });

    const { loader } = await import("../../../app/routes/app._index");

    await expect(loader({ request: buildRequest() } as any)).rejects.toBeInstanceOf(Response);
  });
});
