/**
 * API Endpoint: Intent Analysis
 * 
 * POST /api/intent/analyze - Analyze session intent
 * GET /api/intent/session/:sessionId - Get stored signals for session
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { IntentDetectionEngine } from "../services/intent-detection.server";

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

    // Analyze session and optionally record signal
    const { analysis, signal } = await IntentDetectionEngine.analyzeAndRecord(
      shopDomain, // Using shopDomain as shopId for now
      sessionId,
      visitorId
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
    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Analysis failed" 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/intent/session/:sessionId
 * Retrieve stored intent signals for a session
 */
export async function loader({ params, request }: LoaderFunctionArgs) {
  try {
    const { sessionId } = params;

    if (!sessionId) {
      return json({ error: "sessionId is required" }, { status: 400 });
    }

    // Get stored signals
    const signals = await IntentDetectionEngine.getSessionSignals(sessionId);

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
    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to fetch signals" 
      },
      { status: 500 }
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
