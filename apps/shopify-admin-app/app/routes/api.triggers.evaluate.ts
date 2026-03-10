/**
 * API Endpoint: Trigger Evaluation
 * 
 * POST /api/triggers/evaluate - Evaluate triggers for a session
 * GET /api/triggers/config - Get trigger configurations for a shop
 * POST /api/triggers/config - Create new trigger
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { TriggerEvaluationService } from "../services/trigger-evaluation.server";

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

    // Evaluate all triggers for this session
    const evaluations = await TriggerEvaluationService.evaluateSessionTriggers(
      shopDomain,
      sessionId,
      visitorId
    );

    // Find the best recommendation (first SEND, or first CONDITION_NOT_MET if no SEND)
    const sendRecommendations = evaluations.filter((e) => e.decision === "SEND");
    const recommendation =
      sendRecommendations.length > 0
        ? {
            triggerId: sendRecommendations[0].triggerId,
            action: "SEND",
            message: sendRecommendations[0].message,
            triggerName: sendRecommendations[0].triggerName,
            score: sendRecommendations[0].score,
          }
        : evaluations.length > 0
          ? {
              triggerId: evaluations[0].triggerId,
              action: evaluations[0].decision,
              reason: evaluations[0].reason,
              triggerName: evaluations[0].triggerName,
            }
          : null;

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
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Evaluation failed",
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
