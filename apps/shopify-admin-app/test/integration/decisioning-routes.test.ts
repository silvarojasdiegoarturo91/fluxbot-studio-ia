import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../app/services/ia-gateway.server", () => ({
  getIAGateway: vi.fn(),
}));

import prisma from "../../app/db.server";
import { IABackendError } from "../../app/services/ia-backend.client";
import { getIAGateway } from "../../app/services/ia-gateway.server";
import {
  action as analyzeIntentAction,
  loader as analyzeIntentLoader,
} from "../../app/routes/api.intent.analyze";
import { action as evaluateTriggersAction } from "../../app/routes/api.triggers.evaluate";

describe("Decisioning Routes", () => {
  const mockAnalyzeIntent = vi.fn();
  const mockGetIntentSignals = vi.fn();
  const mockEvaluateTriggers = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getIAGateway).mockReturnValue({
      analyzeIntent: mockAnalyzeIntent,
      getIntentSignals: mockGetIntentSignals,
      evaluateTriggers: mockEvaluateTriggers,
    } as any);
  });

  it("returns 404 when the intent analysis shop does not exist", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue(null);

    const request = new Request("http://localhost/api/intent/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shopDomain: "missing-shop.myshopify.com",
        sessionId: "sess-1",
      }),
    });

    const response = await analyzeIntentAction({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Shop not found");
  });

  it("routes intent analysis through the gateway with the resolved shop id", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({ id: "shop-1" } as any);
    mockAnalyzeIntent.mockResolvedValue({
      analysis: {
        sessionId: "sess-1",
        scores: {
          purchaseIntent: 0.9,
          abandonmentRisk: 0.1,
          needsHelp: 0.2,
          priceShopperRisk: 0.1,
          browseIntent: 0.05,
        },
        dominantIntent: "PURCHASE_INTENT",
        confidence: 0.9,
        triggers: ["high_purchase_intent"],
        recommendations: ["show_offer"],
        lastAnalyzedAt: new Date("2026-03-10T10:00:00Z"),
      },
      signal: null,
    });

    const request = new Request("http://localhost/api/intent/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shopDomain: "test-shop.myshopify.com",
        sessionId: "sess-1",
        visitorId: "visitor-1",
      }),
    });

    const response = await analyzeIntentAction({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockAnalyzeIntent).toHaveBeenCalledWith(
      {
        shopId: "shop-1",
        sessionId: "sess-1",
        visitorId: "visitor-1",
      },
      "test-shop.myshopify.com",
    );
    expect(data.success).toBe(true);
    expect(data.analysis.dominantIntent).toBe("PURCHASE_INTENT");
  });

  it("loads intent signals using the query-based sessionId contract", async () => {
    mockGetIntentSignals.mockResolvedValue([
      {
        id: "sig-1",
        shopId: "shop-1",
        sessionId: "sess-1",
        signalType: "PURCHASE_INTENT",
        confidence: 0.8,
        triggerData: {},
        actionTaken: null,
        outcome: null,
        createdAt: new Date("2026-03-10T10:00:00Z"),
      },
    ]);

    const request = new Request(
      "http://localhost/api/intent/analyze?sessionId=sess-1&shopDomain=test-shop.myshopify.com",
      {
        method: "GET",
      },
    );

    const response = await analyzeIntentLoader({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetIntentSignals).toHaveBeenCalledWith("sess-1", "test-shop.myshopify.com");
    expect(data.signalCount).toBe(1);
  });

  it("maps backend decisioning failures to their upstream status code", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({ id: "shop-1" } as any);
    mockAnalyzeIntent.mockRejectedValue(
      new IABackendError("Decisioning backend unavailable", 503),
    );

    const request = new Request("http://localhost/api/intent/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shopDomain: "test-shop.myshopify.com",
        sessionId: "sess-1",
      }),
    });

    const response = await analyzeIntentAction({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toContain("Decisioning backend unavailable");
  });

  it("routes trigger evaluation through the gateway and preserves the response contract", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({ id: "shop-1" } as any);
    mockEvaluateTriggers.mockResolvedValue({
      evaluations: [
        {
          triggerId: "trigger-1",
          triggerName: "High Intent Offer",
          decision: "SEND",
          reason: "Match",
          message: "Take 10% off",
          score: 0.92,
        },
      ],
      recommendation: {
        triggerId: "trigger-1",
        action: "SEND",
        message: "Take 10% off",
        triggerName: "High Intent Offer",
        score: 0.92,
      },
    });

    const request = new Request("http://localhost/api/triggers/evaluate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shopDomain: "test-shop.myshopify.com",
        sessionId: "sess-1",
        visitorId: "visitor-1",
      }),
    });

    const response = await evaluateTriggersAction({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockEvaluateTriggers).toHaveBeenCalledWith(
      {
        shopId: "shop-1",
        sessionId: "sess-1",
        visitorId: "visitor-1",
      },
      "test-shop.myshopify.com",
    );
    expect(data.evaluationCount).toBe(1);
    expect(data.sendCount).toBe(1);
    expect(data.recommendation.action).toBe("SEND");
  });

  it("maps trigger backend failures to their upstream status code", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue({ id: "shop-1" } as any);
    mockEvaluateTriggers.mockRejectedValue(
      new IABackendError("Trigger backend timeout", 504),
    );

    const request = new Request("http://localhost/api/triggers/evaluate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shopDomain: "test-shop.myshopify.com",
        sessionId: "sess-1",
      }),
    });

    const response = await evaluateTriggersAction({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(504);
    expect(data.error).toContain("Trigger backend timeout");
  });
});