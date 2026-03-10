/**
 * Enterprise Compliance API
 *
 * Admin-authenticated API for advanced compliance operations:
 * - Compliance audit report retrieval
 * - Data residency configuration
 * - Retention enforcement execution
 * - Processing activity (Article 30) seeding
 * - Scoped support-agent token issuance
 * - Breach registry management
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  AuditReportService,
  BreachNotificationService,
  DataResidencyService,
  ProcessingRecordService,
  RetentionEnforcementService,
  SupportAgentAccessService,
  type DataRegion,
} from "../services/enterprise-compliance.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function resolveShopFromAdminRequest(request: Request) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
    select: {
      id: true,
      domain: true,
      status: true,
    },
  });

  if (!shop) {
    throw new Error(`Shop not found for domain ${session.shop}`);
  }

  return shop;
}

function parseDays(raw: string | null, defaultValue: number = 365) {
  const parsed = Number(raw || defaultValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return Math.min(3650, Math.floor(parsed));
}

/**
 * GET /api/compliance/enterprise
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const shop = await resolveShopFromAdminRequest(request);
    const url = new URL(request.url);
    const days = parseDays(url.searchParams.get("days"), 365);

    if (ProcessingRecordService.getActivities(shop.id).length === 0) {
      ProcessingRecordService.seedDefaultActivities(shop.id);
    }

    const [report, residencyConfig, breaches] = await Promise.all([
      AuditReportService.generateReport(shop.id, days),
      Promise.resolve(DataResidencyService.getConfig(shop.id)),
      Promise.resolve(BreachNotificationService.getBreaches(shop.id)),
    ]);

    const activeSupportTokens = SupportAgentAccessService.getActiveTokenCount(shop.id);

    return json({
      success: true,
      shop,
      report,
      residencyConfig,
      breaches,
      activeSupportTokens,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load enterprise compliance data",
      },
      { status: 500 }
    );
  }
}

interface EnterpriseComplianceActionPayload {
  action?:
    | "set_residency"
    | "seed_processing_activities"
    | "enforce_retention"
    | "create_support_token"
    | "register_breach"
    | "mark_breach_reported";
  region?: DataRegion;
  enforcedCountries?: string[];
  policy?: {
    conversationRetentionDays?: number;
    behaviorEventRetentionDays?: number;
  };
  agentId?: string;
  scope?: string[];
  ttlMs?: number;
  breachId?: string;
  breach?: {
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    description: string;
    affectedDataSubjects?: number;
    dataCategories?: string[];
    mitigationTaken?: string;
    detectedAt?: string;
  };
}

/**
 * POST /api/compliance/enterprise
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const shop = await resolveShopFromAdminRequest(request);
    const body = (await request.json()) as EnterpriseComplianceActionPayload;

    switch (body.action) {
      case "set_residency": {
        if (!body.region) {
          return json({ success: false, error: "region is required" }, { status: 400 });
        }

        const config = DataResidencyService.setConfig(
          shop.id,
          body.region,
          Array.isArray(body.enforcedCountries) ? body.enforcedCountries : []
        );

        return json({ success: true, config });
      }

      case "seed_processing_activities": {
        ProcessingRecordService.seedDefaultActivities(shop.id);
        const activities = ProcessingRecordService.getActivities(shop.id);
        return json({ success: true, count: activities.length, activities });
      }

      case "enforce_retention": {
        const result = await RetentionEnforcementService.enforce(shop.id, body.policy || {});
        return json({ success: true, result });
      }

      case "create_support_token": {
        if (!body.agentId || body.agentId.trim().length === 0) {
          return json({ success: false, error: "agentId is required" }, { status: 400 });
        }

        const token = SupportAgentAccessService.createToken(
          shop.id,
          body.agentId,
          Array.isArray(body.scope) && body.scope.length > 0
            ? body.scope
            : ["read:conversations"],
          typeof body.ttlMs === "number" ? body.ttlMs : undefined
        );

        return json({ success: true, token });
      }

      case "register_breach": {
        if (!body.breach?.severity || !body.breach?.description) {
          return json(
            { success: false, error: "breach.severity and breach.description are required" },
            { status: 400 }
          );
        }

        const entry = BreachNotificationService.register(shop.id, {
          detectedAt: body.breach.detectedAt ? new Date(body.breach.detectedAt) : new Date(),
          severity: body.breach.severity,
          description: body.breach.description,
          affectedDataSubjects: body.breach.affectedDataSubjects ?? 0,
          dataCategories: body.breach.dataCategories ?? [],
          mitigationTaken: body.breach.mitigationTaken ?? "Investigation in progress",
          reportedToAuthority: false,
          reportedAt72h: false,
        });

        return json({ success: true, breach: entry });
      }

      case "mark_breach_reported": {
        if (!body.breachId) {
          return json({ success: false, error: "breachId is required" }, { status: 400 });
        }

        const updated = BreachNotificationService.markReported(shop.id, body.breachId);
        if (!updated) {
          return json({ success: false, error: "Breach not found" }, { status: 404 });
        }

        return json({ success: true, breach: updated });
      }

      default:
        return json({ success: false, error: "Unsupported action" }, { status: 400 });
    }
  } catch (error) {
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process enterprise compliance action",
      },
      { status: 500 }
    );
  }
}
