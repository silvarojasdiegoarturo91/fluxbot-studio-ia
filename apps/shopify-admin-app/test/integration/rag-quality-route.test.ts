/**
 * Integration tests for api.rag.quality route (Phase 2 completion)
 *
 * Tests the GET and PUT handlers that expose per-shop RAG quality policy
 * (minScore / rerankStrategy) to the embedded admin UI.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/db.server", () => ({
  default: {
    chatbotConfig: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    shop: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

import prisma from "../../app/db.server";
import { authenticate } from "../../app/shopify.server";
import { loader, action } from "../../app/routes/api.rag.quality";

const MOCK_SESSION = { shop: "test-store.myshopify.com" };

function makeRequest(
  method: string,
  body?: unknown,
): Request {
  return new Request("http://localhost/api/rag/quality", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("GET /api/rag/quality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticate.admin).mockResolvedValue({ session: MOCK_SESSION } as any);
  });

  it("returns default policy when no config exists", async () => {
    vi.mocked(prisma.chatbotConfig.findFirst).mockResolvedValue(null);

    const response = await loader({ request: makeRequest("GET"), params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.minScore).toBe(0.6);
    expect(data.rerankStrategy).toBe("cross_encoder");
    expect(data.topK).toBeNull();
  });

  it("returns stored confidenceThreshold as minScore", async () => {
    vi.mocked(prisma.chatbotConfig.findFirst).mockResolvedValue({
      confidenceThreshold: 0.75,
    } as any);

    const response = await loader({ request: makeRequest("GET"), params: {}, context: {} } as any);
    const data = await response.json();

    expect(data.minScore).toBe(0.75);
  });
});

describe("PUT /api/rag/quality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticate.admin).mockResolvedValue({ session: MOCK_SESSION } as any);
    vi.mocked(prisma.shop.findFirst).mockResolvedValue({ id: "shop-uuid-1" } as any);
    vi.mocked(prisma.chatbotConfig.upsert).mockResolvedValue({
      confidenceThreshold: 0.8,
    } as any);
  });

  it("updates minScore and returns updated policy", async () => {
    const response = await action({
      request: makeRequest("PUT", { minScore: 0.8, rerankStrategy: "cross_encoder" }),
      params: {},
      context: {},
    } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.minScore).toBe(0.8);
    expect(data.rerankStrategy).toBe("cross_encoder");
    expect(prisma.chatbotConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ confidenceThreshold: 0.8 }),
      }),
    );
  });

  it("returns 405 for non-PUT methods", async () => {
    const response = await action({
      request: makeRequest("POST", { minScore: 0.5 }),
      params: {},
      context: {},
    } as any);
    expect(response.status).toBe(405);
  });

  it("returns 422 when minScore is out of range", async () => {
    const response = await action({
      request: makeRequest("PUT", { minScore: 1.5 }),
      params: {},
      context: {},
    } as any);
    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toContain("minScore");
  });

  it("returns 422 for invalid rerankStrategy", async () => {
    const response = await action({
      request: makeRequest("PUT", { minScore: 0.5, rerankStrategy: "invalid_strategy" }),
      params: {},
      context: {},
    } as any);
    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toContain("rerankStrategy");
  });

  it("returns 404 when shop is not found", async () => {
    vi.mocked(prisma.shop.findFirst).mockResolvedValue(null);

    const response = await action({
      request: makeRequest("PUT", { minScore: 0.6 }),
      params: {},
      context: {},
    } as any);
    expect(response.status).toBe(404);
  });

  it("accepts topK in response even though not persisted yet", async () => {
    const response = await action({
      request: makeRequest("PUT", { minScore: 0.7, rerankStrategy: "bm25_hybrid", topK: 10 }),
      params: {},
      context: {},
    } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.topK).toBe(10);
    expect(data.rerankStrategy).toBe("bm25_hybrid");
  });
});
