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
  ComplianceSIEMExportService,
  DataResidencyService,
  LegalHoldService,
  ProcessingRecordService,
  RegionalDeploymentControlService,
  RetentionEnforcementService,
  SupportAgentAccessService,
  type DataRegion,
  type LegalHoldScope,
  type SIEMConnectorTarget,
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

    const existingActivities = await ProcessingRecordService.getActivities(shop.id);
    if (existingActivities.length === 0) {
      await ProcessingRecordService.seedDefaultActivities(shop.id);
    }

    const [report, residencyConfig, breaches, deploymentControl, legalHolds, activeLegalHolds] = await Promise.all([
      AuditReportService.generateReport(shop.id, days),
      DataResidencyService.getConfig(shop.id),
      BreachNotificationService.getBreaches(shop.id),
      RegionalDeploymentControlService.getConfig(shop.id),
      LegalHoldService.list(shop.id, { includeReleased: true }),
      LegalHoldService.getActiveHoldCount(shop.id),
    ]);
    const retentionPolicy = RetentionEnforcementService.getPolicy(shop.id);

    const activeSupportTokens = SupportAgentAccessService.getActiveTokenCount(shop.id);

    return json({
      success: true,
      shop,
      report,
      residencyConfig,
      deploymentControl,
      retentionPolicy,
      breaches,
      legalHolds,
      activeLegalHolds,
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
    | "set_deployment_control"
    | "seed_processing_activities"
    | "enforce_retention"
    | "create_support_token"
    | "register_breach"
    | "mark_breach_reported"
    | "create_legal_hold"
    | "release_legal_hold"
    | "export_siem_ndjson";
  region?: DataRegion;
  enforcedCountries?: string[];
  deployment?: {
    primaryRegion?: DataRegion;
    failoverRegions?: DataRegion[];
    strictIsolation?: boolean;
    piiRestrictedToPrimary?: boolean;
  };
  policy?: {
    conversationRetentionDays?: number;
    behaviorEventRetentionDays?: number;
  };
  agentId?: string;
  scope?: string[];
  ttlMs?: number;
  breachId?: string;
  holdId?: string;
  releaseReason?: string;
  legalHold?: {
    title: string;
    reason: string;
    scope?: LegalHoldScope[];
    placedBy?: string;
    expiresAt?: string;
  };
  windowDays?: number;
  includeContent?: boolean;
  dispatchConnectors?: boolean;
  connectors?: SIEMConnectorTarget[];
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

        const config = await DataResidencyService.setConfig(
          shop.id,
          body.region,
          Array.isArray(body.enforcedCountries) ? body.enforcedCountries : []
        );

        return json({ success: true, config });
      }

      case "set_deployment_control": {
        const config = await RegionalDeploymentControlService.setConfig(shop.id, {
          primaryRegion: body.deployment?.primaryRegion,
          failoverRegions: body.deployment?.failoverRegions,
          strictIsolation: body.deployment?.strictIsolation,
          piiRestrictedToPrimary: body.deployment?.piiRestrictedToPrimary,
        });

        const allowedRegions = await RegionalDeploymentControlService.getAllowedRegions(shop.id);

        return json({
          success: true,
          config,
          allowedRegions,
        });
      }

      case "seed_processing_activities": {
        await ProcessingRecordService.seedDefaultActivities(shop.id);
        const activities = await ProcessingRecordService.getActivities(shop.id);
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

        const entry = await BreachNotificationService.register(shop.id, {
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

        const updated = await BreachNotificationService.markReported(shop.id, body.breachId);
        if (!updated) {
          return json({ success: false, error: "Breach not found" }, { status: 404 });
        }

        return json({ success: true, breach: updated });
      }

      case "create_legal_hold": {
        if (!body.legalHold?.title || !body.legalHold?.reason) {
          return json(
            { success: false, error: "legalHold.title and legalHold.reason are required" },
            { status: 400 },
          );
        }

        const validScope: LegalHoldScope[] = [
          "ALL",
          "CONVERSATIONS",
          "BEHAVIOR_EVENTS",
          "AUDIT_LOGS",
          "CONSENT_RECORDS",
        ];

        const scope: LegalHoldScope[] = Array.isArray(body.legalHold.scope)
          ? body.legalHold.scope.filter((entry): entry is LegalHoldScope =>
            validScope.includes(entry),
          )
          : ["ALL"];

        const hold = await LegalHoldService.create(shop.id, {
          title: body.legalHold.title,
          reason: body.legalHold.reason,
          scope: scope.length > 0 ? scope : ["ALL"],
          placedBy: body.legalHold.placedBy || "admin",
          expiresAt: body.legalHold.expiresAt ? new Date(body.legalHold.expiresAt) : undefined,
        });

        return json({ success: true, hold });
      }

      case "release_legal_hold": {
        if (!body.holdId) {
          return json({ success: false, error: "holdId is required" }, { status: 400 });
        }

        const released = await LegalHoldService.release(
          shop.id,
          body.holdId,
          "admin",
          body.releaseReason,
        );

        if (!released) {
          return json({ success: false, error: "Legal hold not found" }, { status: 404 });
        }

        return json({ success: true, hold: released });
      }

      case "export_siem_ndjson": {
        const result = await ComplianceSIEMExportService.generateNDJSON(
          shop.id,
          typeof body.windowDays === "number" ? body.windowDays : 30,
        );

        const shouldDispatch = body.dispatchConnectors === true;
        let dispatch: Awaited<ReturnType<typeof ComplianceSIEMExportService.dispatchToConnectors>> | undefined;
        if (shouldDispatch) {
          dispatch = await ComplianceSIEMExportService.dispatchToConnectors(
            result,
            Array.isArray(body.connectors) && body.connectors.length > 0
              ? body.connectors
              : ["datadog", "splunk"],
          );
        }

        if (body.includeContent === false) {
          return json({
            success: true,
            export: {
              exportId: result.exportId,
              generatedAt: result.generatedAt,
              windowDays: result.windowDays,
              format: result.format,
              eventCount: result.eventCount,
            },
            ...(dispatch ? { dispatch } : {}),
          });
        }

        return json({
          success: true,
          export: result,
          ...(dispatch ? { dispatch } : {}),
        });
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
