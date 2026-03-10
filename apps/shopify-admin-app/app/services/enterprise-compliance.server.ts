/**
 * Enterprise Compliance Service — Phase 5
 *
 * Extends the basic consent management with:
 * - Data residency enforcement (EU, US, APAC region routing)
 * - Advanced audit reporting (GDPR Article 30 processing records)
 * - Scope-limited data access for support agents
 * - Automated retention enforcement (scheduled purge)
 * - Data Processing Agreement (DPA) status tracking
 * - Breach notification registry
 *
 * This module is designed for enterprise merchants who need demonstrable
 * GDPR / EU AI Act compliance posture.
 */

import prisma from "../db.server";

// ============================================================================
// TYPES
// ============================================================================

export type DataRegion = "EU" | "US" | "APAC" | "GLOBAL";

export interface DataResidencyConfig {
  shopId: string;
  region: DataRegion;
  enforced: boolean;
  /** ISO country codes that must store data locally, e.g. ["DE","FR"] */
  enforcedCountries: string[];
  updatedAt: Date;
}

export interface ProcessingActivity {
  id: string;
  shopId: string;
  activityName: string;
  purpose: string;
  legalBasis: string;
  dataCategories: string[];
  dataSubjects: string[];
  retentionDays: number;
  thirdParties: string[];
  transferCountries: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditReport {
  shopId: string;
  generatedAt: Date;
  period: { from: Date; to: Date };
  totalConsentEvents: number;
  consentBreakdown: Record<string, number>;
  dataExportRequests: number;
  dataDeletionRequests: number;
  deletedRecords: number;
  auditLogEntries: number;
  processingActivities: ProcessingActivity[];
}

export interface BreachNotification {
  id: string;
  shopId: string;
  detectedAt: Date;
  reportedAt?: Date;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  affectedDataSubjects: number;
  dataCategories: string[];
  mitigationTaken: string;
  reportedToAuthority: boolean;
  reportedAt72h: boolean; // GDPR requires 72h reporting
}

export interface RetentionPolicy {
  shopId: string;
  conversationRetentionDays: number;
  behaviorEventRetentionDays: number;
  consentRecordRetentionDays: number;
  auditLogRetentionDays: number;
}

export interface SupportAgentAccessToken {
  token: string;
  shopId: string;
  agentId: string;
  scope: string[]; // e.g. ["read:conversations", "read:orders"]
  expiresAt: Date;
  createdAt: Date;
}

// ============================================================================
// DEFAULT RETENTION POLICIES
// ============================================================================

const DEFAULT_RETENTION: RetentionPolicy = {
  shopId: "",
  conversationRetentionDays: 365,
  behaviorEventRetentionDays: 90,
  consentRecordRetentionDays: 1825, // 5 years
  auditLogRetentionDays: 2555, // 7 years
};

// In-memory store for simplicity — production would use a dedicated table
const residencyConfigs = new Map<string, DataResidencyConfig>();
const processingActivities = new Map<string, ProcessingActivity[]>();
const breachRegistry = new Map<string, BreachNotification[]>();

// ============================================================================
// DATA RESIDENCY
// ============================================================================

export class DataResidencyService {
  /**
   * Configure data residency for a shop
   */
  static setConfig(shopId: string, region: DataRegion, enforcedCountries: string[] = []): DataResidencyConfig {
    const config: DataResidencyConfig = {
      shopId,
      region,
      enforced: enforcedCountries.length > 0,
      enforcedCountries,
      updatedAt: new Date(),
    };
    residencyConfigs.set(shopId, config);
    console.log(`[Compliance] Data residency set for ${shopId}: ${region}`);
    return config;
  }

  /**
   * Get residency config for a shop
   */
  static getConfig(shopId: string): DataResidencyConfig {
    return residencyConfigs.get(shopId) ?? {
      shopId,
      region: "GLOBAL",
      enforced: false,
      enforcedCountries: [],
      updatedAt: new Date(),
    };
  }

  /**
   * Validate that a storage operation is allowed for a given customer locale
   */
  static isStorageAllowed(shopId: string, customerCountry: string): boolean {
    const config = this.getConfig(shopId);
    if (!config.enforced) return true;

    const countryRegionMap: Record<string, DataRegion> = {
      DE: "EU", FR: "EU", IT: "EU", ES: "EU", NL: "EU", PL: "EU",
      US: "US", CA: "US",
      JP: "APAC", AU: "APAC", SG: "APAC", KR: "APAC",
    };

    const customerRegion = countryRegionMap[customerCountry.toUpperCase()] ?? "GLOBAL";
    return config.region === "GLOBAL" || config.region === customerRegion;
  }
}

// ============================================================================
// ARTICLE 30 PROCESSING RECORDS
// ============================================================================

export class ProcessingRecordService {
  /**
   * Register a data processing activity (GDPR Article 30)
   */
  static registerActivity(shopId: string, activity: Omit<ProcessingActivity, "id" | "shopId" | "createdAt" | "updatedAt">): ProcessingActivity {
    const record: ProcessingActivity = {
      ...activity,
      id: `pa_${shopId}_${Date.now()}`,
      shopId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const existing = processingActivities.get(shopId) ?? [];
    existing.push(record);
    processingActivities.set(shopId, existing);

    console.log(`[Compliance] Processing activity registered: ${activity.activityName} for ${shopId}`);
    return record;
  }

  /**
   * Get all processing activities for a shop
   */
  static getActivities(shopId: string): ProcessingActivity[] {
    return processingActivities.get(shopId) ?? [];
  }

  /**
   * Remove a processing activity (e.g. when feature is disabled)
   */
  static removeActivity(shopId: string, activityId: string): boolean {
    const existing = processingActivities.get(shopId) ?? [];
    const filtered = existing.filter((a) => a.id !== activityId);
    processingActivities.set(shopId, filtered);
    return filtered.length < existing.length;
  }

  /**
   * Seed default processing activities for a newly installed shop
   */
  static seedDefaultActivities(shopId: string): void {
    const defaults = [
      {
        activityName: "Chat Conversation Storage",
        purpose: "Provide AI-powered customer service",
        legalBasis: "Legitimate interest (customer service)",
        dataCategories: ["conversational_data", "session_identifiers"],
        dataSubjects: ["website_visitors", "customers"],
        retentionDays: 365,
        thirdParties: ["OpenAI (AI processing)"],
        transferCountries: ["US"],
      },
      {
        activityName: "Behavioral Event Tracking",
        purpose: "Improve product recommendations and detect abandonment",
        legalBasis: "Consent",
        dataCategories: ["behavioral_data", "session_identifiers"],
        dataSubjects: ["website_visitors"],
        retentionDays: 90,
        thirdParties: [],
        transferCountries: [],
      },
      {
        activityName: "Order Attribution Analytics",
        purpose: "Measure ROI of chat interactions",
        legalBasis: "Legitimate interest (analytics)",
        dataCategories: ["purchase_data", "transaction_identifiers"],
        dataSubjects: ["customers"],
        retentionDays: 730,
        thirdParties: [],
        transferCountries: [],
      },
    ];

    defaults.forEach((d) => this.registerActivity(shopId, d));
  }
}

// ============================================================================
// BREACH NOTIFICATION
// ============================================================================

export class BreachNotificationService {
  /**
   * Register a detected data breach
   */
  static register(shopId: string, breach: Omit<BreachNotification, "id" | "shopId">): BreachNotification {
    const notification: BreachNotification = {
      ...breach,
      id: `breach_${Date.now()}`,
      shopId,
    };

    const existing = breachRegistry.get(shopId) ?? [];
    existing.push(notification);
    breachRegistry.set(shopId, existing);

    const withinDeadline = (Date.now() - breach.detectedAt.getTime()) < 72 * 60 * 60 * 1000;
    notification.reportedAt72h = withinDeadline;

    if (breach.severity === "HIGH" || breach.severity === "CRITICAL") {
      console.error(`[Compliance] CRITICAL BREACH detected for shop ${shopId}: ${breach.description}`);
    }

    return notification;
  }

  /**
   * Get all breaches for a shop
   */
  static getBreaches(shopId: string): BreachNotification[] {
    return breachRegistry.get(shopId) ?? [];
  }

  /**
   * Mark a breach as reported to authority
   */
  static markReported(shopId: string, breachId: string): BreachNotification | null {
    const existing = breachRegistry.get(shopId) ?? [];
    const breach = existing.find((b) => b.id === breachId);
    if (!breach) return null;

    breach.reportedToAuthority = true;
    breach.reportedAt = new Date();
    breach.reportedAt72h = (Date.now() - breach.detectedAt.getTime()) <= 72 * 60 * 60 * 1000;

    return breach;
  }
}

// ============================================================================
// RETENTION ENFORCEMENT
// ============================================================================

export class RetentionEnforcementService {
  /**
   * Apply retention policy for a shop — delete data older than configured thresholds
   * Designed to be called by a scheduled job (daily).
   */
  static async enforce(shopId: string, policy?: Partial<RetentionPolicy>): Promise<{
    conversationsDeleted: number;
    eventsDeleted: number;
  }> {
    const effective: RetentionPolicy = { ...DEFAULT_RETENTION, shopId, ...policy };
    const now = new Date();

    const convCutoff = new Date(now.getTime() - effective.conversationRetentionDays * 86400000);
    const eventCutoff = new Date(now.getTime() - effective.behaviorEventRetentionDays * 86400000);

    // Delete expired conversations
    const { count: conversationsDeleted } = await prisma.conversation.deleteMany({
      where: {
        shopId,
        startedAt: { lt: convCutoff },
        status: { not: "ACTIVE" },
      },
    });

    // Delete expired behavior events
    const { count: eventsDeleted } = await prisma.behaviorEvent.deleteMany({
      where: {
        shopId,
        timestamp: { lt: eventCutoff },
      },
    });

    console.log(`[Compliance] Retention ran for ${shopId}: ${conversationsDeleted} conversations, ${eventsDeleted} events deleted`);

    return { conversationsDeleted, eventsDeleted };
  }

  /**
   * Get retention policy for a shop (uses defaults for fields not overridden)
   */
  static getEffectivePolicy(shopId: string, overrides: Partial<RetentionPolicy> = {}): RetentionPolicy {
    return { ...DEFAULT_RETENTION, shopId, ...overrides };
  }
}

// ============================================================================
// AUDIT REPORTING
// ============================================================================

export class AuditReportService {
  /**
   * Generate a comprehensive compliance audit report for a period
   */
  static async generateReport(shopId: string, days: number = 365): Promise<AuditReport> {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);

    const [
      consentEvents,
      exportJobs,
      deletionJobs,
      auditLogs,
    ] = await Promise.all([
      prisma.consentRecord.findMany({
        where: { shopId, createdAt: { gte: from, lte: to } },
        select: { consentType: true },
      }),
      prisma.dataExportJob.count({
        where: { shopId, createdAt: { gte: from, lte: to } },
      }),
      prisma.dataDeletionJob.findMany({
        where: { shopId, createdAt: { gte: from, lte: to } },
        select: { recordsDeleted: true },
      }),
      prisma.auditLog.count({
        where: { shopId, createdAt: { gte: from, lte: to } },
      }),
    ]);

    // Build consent breakdown by action type
    const consentBreakdown: Record<string, number> = {};
    consentEvents.forEach(({ consentType }) => {
      consentBreakdown[consentType] = (consentBreakdown[consentType] ?? 0) + 1;
    });

    const deletedRecords = deletionJobs.reduce(
      (sum, j) => sum + (j.recordsDeleted ?? 0),
      0
    );

    return {
      shopId,
      generatedAt: new Date(),
      period: { from, to },
      totalConsentEvents: consentEvents.length,
      consentBreakdown,
      dataExportRequests: exportJobs,
      dataDeletionRequests: deletionJobs.length,
      deletedRecords,
      auditLogEntries: auditLogs,
      processingActivities: ProcessingRecordService.getActivities(shopId),
    };
  }
}

// ============================================================================
// SUPPORT AGENT ACCESS
// ============================================================================

/**
 * Minimal scope-limited access token for support agents.
 * In production integrate with your IdP / RBAC system.
 */
export class SupportAgentAccessService {
  private static tokens = new Map<string, SupportAgentAccessToken>();

  static createToken(
    shopId: string,
    agentId: string,
    scope: string[],
    ttlMs: number = 8 * 60 * 60 * 1000 // 8 hours
  ): SupportAgentAccessToken {
    const token = Buffer.from(`${shopId}:${agentId}:${Date.now()}:${Math.random()}`).toString("base64");
    const record: SupportAgentAccessToken = {
      token,
      shopId,
      agentId,
      scope,
      expiresAt: new Date(Date.now() + ttlMs),
      createdAt: new Date(),
    };
    this.tokens.set(token, record);
    return record;
  }

  static validateToken(token: string, requiredScope: string): boolean {
    const record = this.tokens.get(token);
    if (!record) return false;
    if (record.expiresAt < new Date()) {
      this.tokens.delete(token);
      return false;
    }
    return record.scope.includes(requiredScope) || record.scope.includes("*");
  }

  static revokeToken(token: string): boolean {
    return this.tokens.delete(token);
  }

  static getActiveTokenCount(shopId: string): number {
    return [...this.tokens.values()].filter(
      (t) => t.shopId === shopId && t.expiresAt > new Date()
    ).length;
  }
}
