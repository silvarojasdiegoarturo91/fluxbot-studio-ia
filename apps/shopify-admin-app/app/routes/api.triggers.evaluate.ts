/**
 * API Endpoint: Trigger Evaluation
 * 
 * POST /api/triggers/evaluate - Evaluate triggers for a session
 */

import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { IABackendError } from "../services/ia-backend.server";
import { getIAGateway, type GatewayTriggerEvaluation } from "../services/ia-gateway.server";

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
 * POST /api/triggers/evaluate
 * Evaluate all active triggers for a session and return recommendations
 * 
 * Request:
 * {
 *   "shopDomain": "mystore.myshopify.com",
 *   "sessionId": "sess-123",
 *   "visitorId": "visitor-456" (optional)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "sessionId": "sess-123",
 *   "evaluations": [
 *     {
 *       "triggerId": "t1",
 *       "triggerName": "Exit Intent Discount",
 *       "decision": "SEND",
 *       "reason": "All conditions met, ready to send",
 *       "message": "Don't go! Here's 10% off...",
 *       "score": 0.85,
 *       "metadata": { ... }
 *     }
 *   ],
 *   "recommend": {
 *     "triggerId": "t1",
 *     "action": "SEND",
 *     "message": "Don't go! Here's 10% off..."
 *   }
 * }
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
    const { evaluations, recommendation } = await gateway.evaluateTriggers(
      {
        shopId: shop.id,
        sessionId,
        visitorId,
      },
      shopDomain,
    );

    const sendRecommendations = evaluations.filter(
      (evaluation: GatewayTriggerEvaluation) => evaluation.decision === "SEND",
    );

    return json(
      {
        success: true,
        sessionId,
        evaluationCount: evaluations.length,
        sendCount: sendRecommendations.length,
        evaluations,
        recommendation,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Shop-Domain",
        },
      }
    );
  } catch (error) {
    console.error("[Trigger API] Evaluation failed:", error);
    const status = error instanceof IABackendError ? (error.statusCode || 502) : 500;

    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Evaluation failed",
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
