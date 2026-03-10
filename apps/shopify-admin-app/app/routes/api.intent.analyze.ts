/**
 * API Endpoint: Intent Analysis
 * 
 * POST /api/intent/analyze - Analyze session intent
 * GET /api/intent/analyze?sessionId=:sessionId - Get stored signals for session
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { IABackendError } from "../services/ia-backend.client";
import { getIAGateway } from "../services/ia-gateway.server";

// Helper to create JSON responses
function json(data: any, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Shop-Domain",
      ...init?.headers,
    },
  });
}

/**
 * POST /api/intent/analyze
 * Body: { shopDomain: string, sessionId: string, visitorId?: string }
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { shopDomain, sessionId, visitorId } = body;

    // Validation
    if (!shopDomain || typeof shopDomain !== "string") {
      return json({ error: "shopDomain is required" }, { status: 400 });
    }
    if (!sessionId || typeof sessionId !== "string") {
      return json({ error: "sessionId is required" }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      select: { id: true },
    });

    if (!shop) {
      return json({ error: "Shop not found" }, { status: 404 });
    }

    const gateway = getIAGateway();
    const { analysis, signal } = await gateway.analyzeIntent(
      {
        shopId: shop.id,
        sessionId,
        visitorId,
      },
      shopDomain,
    );

    return json({
      success: true,
      analysis,
      signal: signal ? {
        id: signal.id,
        signalType: signal.signalType,
        confidence: signal.confidence,
        actionTaken: signal.actionTaken,
        createdAt: signal.createdAt,
      } : null,
    });
  } catch (error) {
    console.error("[Intent API] Analysis failed:", error);
    const status = error instanceof IABackendError ? (error.statusCode || 502) : 500;

    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Analysis failed" 
      },
      { status }
    );
  }
}

/**
 * GET /api/intent/analyze?sessionId=:sessionId
 * Retrieve stored intent signals for a session
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const shopDomain = request.headers.get("X-Shop-Domain") || url.searchParams.get("shopDomain") || undefined;

    if (!sessionId) {
      return json({ error: "sessionId is required" }, { status: 400 });
    }

    const gateway = getIAGateway();
    const signals = await gateway.getIntentSignals(sessionId, shopDomain);

    return json({
      success: true,
      sessionId,
      signalCount: signals.length,
      signals: signals.map((s) => ({
        id: s.id,
        signalType: s.signalType,
        confidence: s.confidence,
        actionTaken: s.actionTaken,
        outcome: s.outcome,
        createdAt: s.createdAt,
        triggerData: s.triggerData,
      })),
    });
  } catch (error) {
    console.error("[Intent API] Failed to fetch signals:", error);
    const status = error instanceof IABackendError ? (error.statusCode || 502) : 500;

    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to fetch signals" 
      },
      { status }
    );
  }
}

/**
 * Handle CORS preflight
 */
export async function options() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Shop-Domain",
    },
  });
}
