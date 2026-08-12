/**
 * Unit Tests — app.campaigns.tsx (marketing campaigns page)
 *
 * Covers loader + action directly with mocked auth / shop context /
 * campaign service, mirroring the billing-route.test.ts pattern:
 *  - loader returns campaign list (and empty list when shop is unresolved)
 *  - action create with locale templates + schedule normalization
 *  - action updateStatus (valid/invalid statuses)
 *  - error paths (missing name, unknown intent, shop not found)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthenticateAdminRequest = vi.fn();
const mockEnsureShopForSession = vi.fn();
const mockListCampaigns = vi.fn();
const mockCreateCampaign = vi.fn();
const mockUpdateCampaign = vi.fn();

vi.mock("../../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: mockAuthenticateAdminRequest,
}));

vi.mock("../../../app/services/shop-context.server", () => ({
  ensureShopForSession: mockEnsureShopForSession,
}));

vi.mock("../../../app/services/campaign.server", () => ({
  listCampaigns: mockListCampaigns,
  createCampaign: mockCreateCampaign,
  updateCampaign: mockUpdateCampaign,
}));

const SESSION = { shop: "shop.example.myshopify.com", accessToken: "mock-access-token" };
const SHOP = { id: "shop-1", domain: "shop.example.myshopify.com" };

const CAMPAIGNS = [
  {
    id: "camp-1",
    name: "Black Friday",
    description: null,
    status: "ACTIVE",
    scheduleType: "IMMEDIATE",
    totalDispatched: 100,
    totalConverted: 25,
  },
  {
    id: "camp-2",
    name: "Welcome",
    status: "DRAFT",
    scheduleType: "RECURRING",
    totalDispatched: 0,
    totalConverted: 0,
  },
];

function makePostRequest(fields: Record<string, string>) {
  return new Request("http://localhost/app/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("app.campaigns loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateAdminRequest.mockResolvedValue({ session: SESSION } as any);
    mockEnsureShopForSession.mockResolvedValue(SHOP);
    mockListCampaigns.mockResolvedValue(CAMPAIGNS);
  });

  it("loads the campaign list for the shop", async () => {
    const { loader } = await import("../../../app/routes/app.campaigns");

    const data = await loader({ request: new Request("http://localhost/app/campaigns") } as any);

    expect(data.campaigns).toHaveLength(2);
    expect(mockListCampaigns).toHaveBeenCalledWith("shop-1");
  });

  it("returns an empty list when the shop cannot be resolved", async () => {
    mockEnsureShopForSession.mockResolvedValue(null);

    const { loader } = await import("../../../app/routes/app.campaigns");

    const data = await loader({ request: new Request("http://localhost/app/campaigns") } as any);

    expect(data).toEqual({ campaigns: [] });
    expect(mockListCampaigns).not.toHaveBeenCalled();
  });
});

describe("app.campaigns action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateAdminRequest.mockResolvedValue({ session: SESSION } as any);
    mockEnsureShopForSession.mockResolvedValue(SHOP);
    mockCreateCampaign.mockResolvedValue({ id: "camp-new" });
    mockUpdateCampaign.mockResolvedValue({ id: "camp-1", status: "PAUSED" });
  });

  it("creates a campaign with locale templates", async () => {
    const { action } = await import("../../../app/routes/app.campaigns");

    const result = await action({
      request: makePostRequest({
        intent: "create",
        name: "  Summer Sale  ",
        description: "  A sale  ",
        scheduleType: "SCHEDULED",
        template_en: "  Grab 20% off {{productName}}!  ",
        template_es: "  ¡Aprovecha 20% en {{productName}}!  ",
      }),
    } as any);

    expect(result).toEqual({ success: true });
    expect(mockCreateCampaign).toHaveBeenCalledWith("shop-1", {
      name: "Summer Sale",
      description: "A sale",
      scheduleType: "SCHEDULED",
      localeTemplates: {
        en: "Grab 20% off {{productName}}!",
        es: "¡Aprovecha 20% en {{productName}}!",
      },
    });
  });

  it("creates a campaign without description or templates", async () => {
    const { action } = await import("../../../app/routes/app.campaigns");

    const result = await action({
      request: makePostRequest({
        intent: "create",
        name: "Plain",
        scheduleType: "IMMEDIATE",
      }),
    } as any);

    expect(result).toEqual({ success: true });
    expect(mockCreateCampaign).toHaveBeenCalledWith("shop-1", {
      name: "Plain",
      description: undefined,
      scheduleType: "IMMEDIATE",
      localeTemplates: {},
    });
  });

  it("rejects a campaign without a name", async () => {
    const { action } = await import("../../../app/routes/app.campaigns");

    const result = await action({
      request: makePostRequest({ intent: "create", name: "   " }),
    } as any);

    expect(result).toEqual({ error: "Campaign name is required." });
    expect(mockCreateCampaign).not.toHaveBeenCalled();
  });

  it("normalizes an invalid schedule type to IMMEDIATE", async () => {
    const { action } = await import("../../../app/routes/app.campaigns");

    const result = await action({
      request: makePostRequest({
        intent: "create",
        name: "Weird schedule",
        scheduleType: "NOPE",
      }),
    } as any);

    expect(result).toEqual({ success: true });
    expect(mockCreateCampaign).toHaveBeenCalledWith(
      "shop-1",
      expect.objectContaining({ scheduleType: "IMMEDIATE" }),
    );
  });

  it("updates a campaign status when valid", async () => {
    const { action } = await import("../../../app/routes/app.campaigns");

    const result = await action({
      request: makePostRequest({ intent: "updateStatus", campaignId: "camp-1", status: "PAUSED" }),
    } as any);

    expect(result).toEqual({ success: true });
    expect(mockUpdateCampaign).toHaveBeenCalledWith("shop-1", "camp-1", { status: "PAUSED" });
  });

  it("skips the update when the status is not recognized", async () => {
    const { action } = await import("../../../app/routes/app.campaigns");

    const result = await action({
      request: makePostRequest({ intent: "updateStatus", campaignId: "camp-1", status: "BOGUS" }),
    } as any);

    expect(result).toEqual({ success: true });
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
  });

  it("returns an error for an unknown intent", async () => {
    const { action } = await import("../../../app/routes/app.campaigns");

    const result = await action({
      request: makePostRequest({ intent: "delete" }),
    } as any);

    expect(result).toEqual({ error: "Unknown intent." });
    expect(mockCreateCampaign).not.toHaveBeenCalled();
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
  });

  it("returns an error when the shop cannot be resolved", async () => {
    mockEnsureShopForSession.mockResolvedValue(null);

    const { action } = await import("../../../app/routes/app.campaigns");

    const result = await action({
      request: makePostRequest({ intent: "create", name: "Ghost" }),
    } as any);

    expect(result).toEqual({ error: "Shop not found" });
    expect(mockCreateCampaign).not.toHaveBeenCalled();
  });
});
