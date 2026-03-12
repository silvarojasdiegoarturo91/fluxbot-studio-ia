/**
 * Integration Tests: Campaign Routes — Phase 3
 *
 * Covers:
 *   api.campaigns.ts        — GET (list), POST (create)
 *   api.campaigns.$id.ts    — GET, PUT, DELETE
 *   api.campaigns.$id.dispatch.ts — POST dispatch (widget-facing)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks (must come before dynamic imports) ─────────────────────────────────

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    admin: vi.fn().mockResolvedValue({ session: { shop: "mystore.myshopify.com" } }),
  },
}));

vi.mock("../../app/services/campaign.server", () => ({
  listCampaigns: vi.fn(),
  getCampaign: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  dispatchCampaign: vi.fn(),
}));

vi.mock("../../app/db.server", () => ({
  default: {
    shop: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("remix-utils/cors", () => ({
  cors: vi.fn(async (_req: Request, res: Response) => res),
}));

import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  dispatchCampaign,
} from "../../app/services/campaign.server";
import prismaDefault from "../../app/db.server";

const mockShopFindFirst = prismaDefault.shop.findFirst as ReturnType<typeof vi.fn>;

// ─── api.campaigns.ts ─────────────────────────────────────────────────────────

describe("api.campaigns — list (GET)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when shop is not found", async () => {
    mockShopFindFirst.mockResolvedValue(null);
    const { loader } = await import("../../app/routes/api.campaigns");
    const request = new Request("http://localhost/api/campaigns");
    const response = await loader({ request, params: {}, context: {} } as any);
    expect(response.status).toBe(404);
  });

  it("returns campaign list when shop exists", async () => {
    mockShopFindFirst.mockResolvedValue({ id: "shop-1" });
    vi.mocked(listCampaigns).mockResolvedValue([
      {
        id: "camp-1",
        name: "Black Friday",
        description: null,
        status: "ACTIVE",
        scheduleType: "IMMEDIATE",
        scheduledAt: null,
        startAt: null,
        endAt: null,
        targetLocales: ["en"],
        triggerIds: [],
        frequencyCap: 1,
        totalDispatched: 0,
        totalConverted: 0,
        lastDispatchedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any);

    const { loader } = await import("../../app/routes/api.campaigns");
    const request = new Request("http://localhost/api/campaigns");
    const response = await loader({ request, params: {}, context: {} } as any);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.campaigns).toHaveLength(1);
    expect(body.campaigns[0].name).toBe("Black Friday");
  });
});

describe("api.campaigns — create (POST)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 422 when name is missing", async () => {
    const { action } = await import("../../app/routes/api.campaigns");
    const request = new Request("http://localhost/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "No name provided" }),
    });
    const response = await action({ request, params: {}, context: {} } as any);
    expect(response.status).toBe(422);
  });

  it("returns 404 when shop is not found", async () => {
    mockShopFindFirst.mockResolvedValue(null);
    const { action } = await import("../../app/routes/api.campaigns");
    const request = new Request("http://localhost/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    const response = await action({ request, params: {}, context: {} } as any);
    expect(response.status).toBe(404);
  });

  it("creates and returns the campaign", async () => {
    mockShopFindFirst.mockResolvedValue({ id: "shop-1" });
    vi.mocked(createCampaign).mockResolvedValue({
      id: "camp-new",
      name: "Summer Sale",
      status: "DRAFT",
    } as any);

    const { action } = await import("../../app/routes/api.campaigns");
    const request = new Request("http://localhost/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Summer Sale", scheduleType: "IMMEDIATE" }),
    });
    const response = await action({ request, params: {}, context: {} } as any);
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.campaign.name).toBe("Summer Sale");
  });
});

// ─── api.campaigns.$id.ts ────────────────────────────────────────────────────

describe("api.campaigns.$id — GET single", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when campaign is not found", async () => {
    mockShopFindFirst.mockResolvedValue({ id: "shop-1" });
    vi.mocked(getCampaign).mockResolvedValue(null);

    const { loader } = await import("../../app/routes/api.campaigns.$id");
    const request = new Request("http://localhost/api/campaigns/camp-99");
    const response = await loader({ request, params: { id: "camp-99" }, context: {} } as any);
    expect(response.status).toBe(404);
  });

  it("returns campaign data when found", async () => {
    mockShopFindFirst.mockResolvedValue({ id: "shop-1" });
    vi.mocked(getCampaign).mockResolvedValue({ id: "camp-1", name: "Flash Sale" } as any);

    const { loader } = await import("../../app/routes/api.campaigns.$id");
    const request = new Request("http://localhost/api/campaigns/camp-1");
    const response = await loader({ request, params: { id: "camp-1" }, context: {} } as any);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.campaign.name).toBe("Flash Sale");
  });
});

describe("api.campaigns.$id — PUT update", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when campaign not found on update", async () => {
    mockShopFindFirst.mockResolvedValue({ id: "shop-1" });
    vi.mocked(updateCampaign).mockResolvedValue(null);

    const { action } = await import("../../app/routes/api.campaigns.$id");
    const request = new Request("http://localhost/api/campaigns/camp-99", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    const response = await action({ request, params: { id: "camp-99" }, context: {} } as any);
    expect(response.status).toBe(404);
  });

  it("updates and returns the campaign", async () => {
    mockShopFindFirst.mockResolvedValue({ id: "shop-1" });
    vi.mocked(updateCampaign).mockResolvedValue({ id: "camp-1", status: "ACTIVE" } as any);

    const { action } = await import("../../app/routes/api.campaigns.$id");
    const request = new Request("http://localhost/api/campaigns/camp-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    const response = await action({ request, params: { id: "camp-1" }, context: {} } as any);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.campaign.status).toBe("ACTIVE");
  });
});

describe("api.campaigns.$id — DELETE", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when campaign not found on delete", async () => {
    mockShopFindFirst.mockResolvedValue({ id: "shop-1" });
    vi.mocked(deleteCampaign).mockResolvedValue(null);

    const { action } = await import("../../app/routes/api.campaigns.$id");
    const request = new Request("http://localhost/api/campaigns/camp-99", {
      method: "DELETE",
    });
    const response = await action({ request, params: { id: "camp-99" }, context: {} } as any);
    expect(response.status).toBe(404);
  });

  it("deletes and returns 200", async () => {
    mockShopFindFirst.mockResolvedValue({ id: "shop-1" });
    vi.mocked(deleteCampaign).mockResolvedValue({ id: "camp-1" } as any);

    const { action } = await import("../../app/routes/api.campaigns.$id");
    const request = new Request("http://localhost/api/campaigns/camp-1", {
      method: "DELETE",
    });
    const response = await action({ request, params: { id: "camp-1" }, context: {} } as any);
    expect(response.status).toBe(200);
  });
});

// ─── api.campaigns.$id.dispatch.ts ───────────────────────────────────────────

describe("api.campaigns.$id.dispatch — POST", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when X-Shop-Domain header is missing", async () => {
    const { action } = await import("../../app/routes/api.campaigns.$id.dispatch");
    const request = new Request("http://localhost/api/campaigns/camp-1/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "sess-1" }),
    });
    const response = await action({ request, params: { id: "camp-1" }, context: {} } as any);
    expect(response.status).toBe(400);
  });

  it("returns 404 when shop is not found", async () => {
    mockShopFindFirst.mockResolvedValue(null);
    const { action } = await import("../../app/routes/api.campaigns.$id.dispatch");
    const request = new Request("http://localhost/api/campaigns/camp-1/dispatch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shop-Domain": "unknown.myshopify.com",
      },
      body: JSON.stringify({ sessionId: "sess-1" }),
    });
    const response = await action({ request, params: { id: "camp-1" }, context: {} } as any);
    expect(response.status).toBe(404);
  });

  it("returns 422 when sessionId is missing", async () => {
    mockShopFindFirst.mockResolvedValue({ id: "shop-1" });
    const { action } = await import("../../app/routes/api.campaigns.$id.dispatch");
    const request = new Request("http://localhost/api/campaigns/camp-1/dispatch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shop-Domain": "mystore.myshopify.com",
      },
      body: JSON.stringify({}),
    });
    const response = await action({ request, params: { id: "camp-1" }, context: {} } as any);
    expect(response.status).toBe(422);
  });

  it("returns dispatch result when campaign is dispatched", async () => {
    mockShopFindFirst.mockResolvedValue({ id: "shop-1" });
    vi.mocked(dispatchCampaign).mockResolvedValue({
      dispatched: true,
      renderedMessage: "Hello Alice!",
      locale: "en",
      dispatchEventId: "event-1",
    });

    const { action } = await import("../../app/routes/api.campaigns.$id.dispatch");
    const request = new Request("http://localhost/api/campaigns/camp-1/dispatch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shop-Domain": "mystore.myshopify.com",
      },
      body: JSON.stringify({ sessionId: "sess-1", locale: "en", variables: { name: "Alice" } }),
    });
    const response = await action({ request, params: { id: "camp-1" }, context: {} } as any);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.dispatched).toBe(true);
    expect(body.renderedMessage).toBe("Hello Alice!");
  });

  it("returns 422 with dispatched:false when campaign frequency cap exceeded", async () => {
    mockShopFindFirst.mockResolvedValue({ id: "shop-1" });
    vi.mocked(dispatchCampaign).mockResolvedValue({
      dispatched: false,
      reason: "Frequency cap reached (1 per 86400s window).",
    });

    const { action } = await import("../../app/routes/api.campaigns.$id.dispatch");
    const request = new Request("http://localhost/api/campaigns/camp-1/dispatch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shop-Domain": "mystore.myshopify.com",
      },
      body: JSON.stringify({ sessionId: "sess-1" }),
    });
    const response = await action({ request, params: { id: "camp-1" }, context: {} } as any);
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.dispatched).toBe(false);
    expect(body.reason).toMatch(/frequency cap/i);
  });
});
