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

export interface RegionalDeploymentControl {
  shopId: string;
  primaryRegion: DataRegion;
  failoverRegions: DataRegion[];
  strictIsolation: boolean;
  piiRestrictedToPrimary: boolean;
  updatedAt: Date;
}

export type LegalHoldScope =
  | "ALL"
  | "CONVERSATIONS"
  | "BEHAVIOR_EVENTS"
  | "AUDIT_LOGS"
  | "CONSENT_RECORDS";

export interface LegalHoldRecord {
  id: string;
  shopId: string;
  title: string;
  reason: string;
  scope: LegalHoldScope[];
  placedBy: string;
  placedAt: Date;
  expiresAt?: Date;
  releasedAt?: Date;
  releasedBy?: string;
  releaseReason?: string;
}

export interface SIEMExportResult {
  exportId: string;
  shopId: string;
  generatedAt: Date;
  windowDays: number;
  format: "ndjson";
  eventCount: number;
  content: string;
}

export type SIEMConnectorTarget = "datadog" | "splunk";

export interface SIEMConnectorDeliveryResult {
  connector: SIEMConnectorTarget;
  attempted: boolean;
  delivered: boolean;
  statusCode?: number;
  ingestedEvents?: number;
  error?: string;
}

export interface SIEMConnectorDispatchResult {
  exportId: string;
  shopId: string;
  generatedAt: Date;
  connectors: SIEMConnectorDeliveryResult[];
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

// In-memory fallback stores when new Prisma delegates are unavailable
const residencyConfigs = new Map<string, DataResidencyConfig>();
const processingActivities = new Map<string, ProcessingActivity[]>();
const breachRegistry = new Map<string, BreachNotification[]>();

// In-memory store for retention overrides
const retentionOverrides = new Map<string, Partial<RetentionPolicy>>();

function hasDataResidencyDelegate() {
  const candidate = prisma as unknown as {
    dataResidencySetting?: {
      upsert?: unknown;
      findUnique?: unknown;
    };
  };

  return (
    typeof candidate.dataResidencySetting?.upsert === "function" &&
    typeof candidate.dataResidencySetting?.findUnique === "function"
  );
}

function hasProcessingActivityDelegate() {
  const candidate = prisma as unknown as {
    processingActivityRecord?: {
      create?: unknown;
      findMany?: unknown;
      updateMany?: unknown;
      count?: unknown;
    };
  };

  return (
    typeof candidate.processingActivityRecord?.create === "function" &&
    typeof candidate.processingActivityRecord?.findMany === "function" &&
    typeof candidate.processingActivityRecord?.updateMany === "function" &&
    typeof candidate.processingActivityRecord?.count === "function"
  );
}

function hasBreachDelegate() {
  const candidate = prisma as unknown as {
    breachNotificationRecord?: {
      create?: unknown;
      findMany?: unknown;
      findFirst?: unknown;
      update?: unknown;
    };
  };

  return (
    typeof candidate.breachNotificationRecord?.create === "function" &&
    typeof candidate.breachNotificationRecord?.findMany === "function" &&
    typeof candidate.breachNotificationRecord?.findFirst === "function" &&
    typeof candidate.breachNotificationRecord?.update === "function"
  );
}

// ============================================================================
// DATA RESIDENCY
// ============================================================================

export class DataResidencyService {
  /**
   * Configure data residency for a shop
   */
  static async setConfig(shopId: string, region: DataRegion, enforcedCountries: string[] = []): Promise<DataResidencyConfig> {
    if (!hasDataResidencyDelegate()) {
      const fallbackConfig: DataResidencyConfig = {
        shopId,
        region,
        enforced: enforcedCountries.length > 0,
        enforcedCountries,
        updatedAt: new Date(),
      };
      residencyConfigs.set(shopId, fallbackConfig);
      return fallbackConfig;
    }

    const saved = await prisma.dataResidencySetting.upsert({
      where: { shopId },
      create: {
        shopId,
        region,
        enforced: enforcedCountries.length > 0,
        enforcedCountries,
      },
      update: {
        region,
        enforced: enforcedCountries.length > 0,
        enforcedCountries,
      },
    });

    const config: DataResidencyConfig = {
      shopId: saved.shopId,
      region: saved.region as DataRegion,
      enforced: saved.enforced,
      enforcedCountries: saved.enforcedCountries,
      updatedAt: saved.updatedAt,
    };

    console.log(`[Compliance] Data residency set for ${shopId}: ${region}`);
    return config;
  }

  /**
   * Get residency config for a shop
   */
  static async getConfig(shopId: string): Promise<DataResidencyConfig> {
    if (!hasDataResidencyDelegate()) {
      return residencyConfigs.get(shopId) ?? {
        shopId,
        region: "GLOBAL",
        enforced: false,
        enforcedCountries: [],
        updatedAt: new Date(),
      };
    }

    const record = await prisma.dataResidencySetting.findUnique({
      where: { shopId },
    });

    if (!record) {
      return {
        shopId,
        region: "GLOBAL",
        enforced: false,
        enforcedCountries: [],
        updatedAt: new Date(),
      };
    }

    return {
      shopId,
      region: record.region as DataRegion,
      enforced: record.enforced,
      enforcedCountries: record.enforcedCountries,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Validate that a storage operation is allowed for a given customer locale
   */
  static async isStorageAllowed(shopId: string, customerCountry: string): Promise<boolean> {
    const config = await this.getConfig(shopId);
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
// REGIONAL DEPLOYMENT CONTROL
// ============================================================================

const DEFAULT_DEPLOYMENT: Omit<RegionalDeploymentControl, "shopId" | "updatedAt"> = {
  primaryRegion: "GLOBAL",
  failoverRegions: [],
  strictIsolation: false,
  piiRestrictedToPrimary: false,
};

export class RegionalDeploymentControlService {
  private static normalizeRegion(region: unknown, fallback: DataRegion): DataRegion {
    if (typeof region !== "string") {
      return fallback;
    }

    const candidate = region.toUpperCase() as DataRegion;
    return ["EU", "US", "APAC", "GLOBAL"].includes(candidate) ? candidate : fallback;
  }

  private static normalizeRegionList(regions: unknown): DataRegion[] {
    if (!Array.isArray(regions)) {
      return [];
    }

    const normalized = regions
      .map((region) => this.normalizeRegion(region, "GLOBAL"))
      .filter((region) => region !== "GLOBAL");

    return [...new Set(normalized)];
  }

  private static toOutput(record: {
    shopId: string;
    primaryRegion: DataRegion;
    failoverRegions: DataRegion[];
    strictIsolation: boolean;
    piiRestrictedToPrimary: boolean;
    updatedAt: Date;
  }): RegionalDeploymentControl {
    return {
      shopId: record.shopId,
      primaryRegion: record.primaryRegion,
      failoverRegions: record.failoverRegions,
      strictIsolation: record.strictIsolation,
      piiRestrictedToPrimary: record.piiRestrictedToPrimary,
      updatedAt: record.updatedAt,
    };
  }

  static async getConfig(shopId: string): Promise<RegionalDeploymentControl> {
    const record = await prisma.regionalDeploymentControl.findUnique({
      where: { shopId },
      select: {
        shopId: true,
        primaryRegion: true,
        failoverRegions: true,
        strictIsolation: true,
        piiRestrictedToPrimary: true,
        updatedAt: true,
      },
    });

    if (!record) {
      return {
        shopId,
        ...DEFAULT_DEPLOYMENT,
        updatedAt: new Date(),
      };
    }

    return this.toOutput(record as {
      shopId: string;
      primaryRegion: DataRegion;
      failoverRegions: DataRegion[];
      strictIsolation: boolean;
      piiRestrictedToPrimary: boolean;
      updatedAt: Date;
    });
  }

  static async setConfig(
    shopId: string,
    input: Partial<Omit<RegionalDeploymentControl, "shopId" | "updatedAt">>,
  ): Promise<RegionalDeploymentControl> {
    const current = await this.getConfig(shopId);
    const next: RegionalDeploymentControl = {
      shopId,
      primaryRegion: this.normalizeRegion(input.primaryRegion, current.primaryRegion),
      failoverRegions:
        input.failoverRegions !== undefined
          ? this.normalizeRegionList(input.failoverRegions)
          : current.failoverRegions,
      strictIsolation:
        typeof input.strictIsolation === "boolean"
          ? input.strictIsolation
          : current.strictIsolation,
      piiRestrictedToPrimary:
        typeof input.piiRestrictedToPrimary === "boolean"
          ? input.piiRestrictedToPrimary
          : current.piiRestrictedToPrimary,
      updatedAt: new Date(),
    };

    const persisted = await prisma.regionalDeploymentControl.upsert({
      where: { shopId },
      create: {
        shopId,
        primaryRegion: next.primaryRegion,
        failoverRegions: next.failoverRegions,
        strictIsolation: next.strictIsolation,
        piiRestrictedToPrimary: next.piiRestrictedToPrimary,
      },
      update: {
        primaryRegion: next.primaryRegion,
        failoverRegions: next.failoverRegions,
        strictIsolation: next.strictIsolation,
        piiRestrictedToPrimary: next.piiRestrictedToPrimary,
      },
      select: {
        shopId: true,
        primaryRegion: true,
        failoverRegions: true,
        strictIsolation: true,
        piiRestrictedToPrimary: true,
        updatedAt: true,
      },
    });

    return this.toOutput(persisted as {
      shopId: string;
      primaryRegion: DataRegion;
      failoverRegions: DataRegion[];
      strictIsolation: boolean;
      piiRestrictedToPrimary: boolean;
      updatedAt: Date;
    });
  }

  static async getAllowedRegions(shopId: string): Promise<DataRegion[]> {
    const config = await this.getConfig(shopId);
    return [...new Set([config.primaryRegion, ...config.failoverRegions])];
  }
}

// ============================================================================
// LEGAL HOLD WORKFLOW
// ============================================================================

export class LegalHoldService {
  private static readonly VALID_SCOPE: LegalHoldScope[] = [
    "ALL",
    "CONVERSATIONS",
    "BEHAVIOR_EVENTS",
    "AUDIT_LOGS",
    "CONSENT_RECORDS",
  ];

  private static normalizeScope(scope?: LegalHoldScope[]): LegalHoldScope[] {
    if (!scope || scope.length === 0) {
      return ["ALL"];
    }

    const filtered = scope.filter((entry): entry is LegalHoldScope =>
      this.VALID_SCOPE.includes(entry),
    );
    return filtered.length > 0 ? [...new Set(filtered)] : ["ALL"];
  }

  private static toOutput(record: {
    id: string;
    shopId: string;
    title: string;
    reason: string;
    scope: LegalHoldScope[];
    placedBy: string;
    placedAt: Date;
    expiresAt: Date | null;
    releasedAt: Date | null;
    releasedBy: string | null;
    releaseReason: string | null;
  }): LegalHoldRecord {
    return {
      id: record.id,
      shopId: record.shopId,
      title: record.title,
      reason: record.reason,
      scope: record.scope,
      placedBy: record.placedBy,
      placedAt: record.placedAt,
      expiresAt: record.expiresAt ?? undefined,
      releasedAt: record.releasedAt ?? undefined,
      releasedBy: record.releasedBy ?? undefined,
      releaseReason: record.releaseReason ?? undefined,
    };
  }

  static async create(
    shopId: string,
    input: {
      title: string;
      reason: string;
      scope?: LegalHoldScope[];
      placedBy: string;
      expiresAt?: Date;
    },
  ): Promise<LegalHoldRecord> {
    const scope = this.normalizeScope(input.scope);
    const created = await prisma.legalHold.create({
      data: {
        shopId,
        title: input.title,
        reason: input.reason,
        scope,
        placedBy: input.placedBy,
        expiresAt: input.expiresAt,
      },
      select: {
        id: true,
        shopId: true,
        title: true,
        reason: true,
        scope: true,
        placedBy: true,
        placedAt: true,
        expiresAt: true,
        releasedAt: true,
        releasedBy: true,
        releaseReason: true,
      },
    });

    return this.toOutput(created as {
      id: string;
      shopId: string;
      title: string;
      reason: string;
      scope: LegalHoldScope[];
      placedBy: string;
      placedAt: Date;
      expiresAt: Date | null;
      releasedAt: Date | null;
      releasedBy: string | null;
      releaseReason: string | null;
    });
  }

  static async list(shopId: string, options?: { includeReleased?: boolean }): Promise<LegalHoldRecord[]> {
    const includeReleased = options?.includeReleased ?? false;
    const records = await prisma.legalHold.findMany({
      where: {
        shopId,
        ...(includeReleased ? {} : { releasedAt: null }),
      },
      orderBy: { placedAt: "desc" },
      select: {
        id: true,
        shopId: true,
        title: true,
        reason: true,
        scope: true,
        placedBy: true,
        placedAt: true,
        expiresAt: true,
        releasedAt: true,
        releasedBy: true,
        releaseReason: true,
      },
    });

    return records.map((record) => this.toOutput(record as {
      id: string;
      shopId: string;
      title: string;
      reason: string;
      scope: LegalHoldScope[];
      placedBy: string;
      placedAt: Date;
      expiresAt: Date | null;
      releasedAt: Date | null;
      releasedBy: string | null;
      releaseReason: string | null;
    }));
  }

  static async getActive(shopId: string): Promise<LegalHoldRecord[]> {
    const now = Date.now();
    const records = await prisma.legalHold.findMany({
      where: {
        shopId,
        releasedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date(now) } },
        ],
      },
      orderBy: { placedAt: "desc" },
      select: {
        id: true,
        shopId: true,
        title: true,
        reason: true,
        scope: true,
        placedBy: true,
        placedAt: true,
        expiresAt: true,
        releasedAt: true,
        releasedBy: true,
        releaseReason: true,
      },
    });

    return records.map((record) => this.toOutput(record as {
      id: string;
      shopId: string;
      title: string;
      reason: string;
      scope: LegalHoldScope[];
      placedBy: string;
      placedAt: Date;
      expiresAt: Date | null;
      releasedAt: Date | null;
      releasedBy: string | null;
      releaseReason: string | null;
    }));
  }

  static async hasActiveHold(shopId: string): Promise<boolean> {
    return (await this.getActiveHoldCount(shopId)) > 0;
  }

  static async getActiveHoldCount(shopId: string): Promise<number> {
    return prisma.legalHold.count({
      where: {
        shopId,
        releasedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });
  }

  static async getActiveScopeSet(shopId: string): Promise<Set<LegalHoldScope>> {
    const holds = await this.getActive(shopId);
    const scopeSet = new Set<LegalHoldScope>();

    for (const hold of holds) {
      for (const scope of this.normalizeScope(hold.scope)) {
        scopeSet.add(scope);
      }
    }

    return scopeSet;
  }

  static async release(
    shopId: string,
    holdId: string,
    releasedBy: string,
    releaseReason?: string,
  ): Promise<LegalHoldRecord | null> {
    const existing = await prisma.legalHold.findUnique({
      where: { id: holdId },
      select: {
        id: true,
        shopId: true,
        releasedAt: true,
      },
    });

    if (!existing || existing.shopId !== shopId || existing.releasedAt) {
      return null;
    }

    const updated = await prisma.legalHold.update({
      where: { id: holdId },
      data: {
        releasedAt: new Date(),
        releasedBy,
        releaseReason,
      },
      select: {
        id: true,
        shopId: true,
        title: true,
        reason: true,
        scope: true,
        placedBy: true,
        placedAt: true,
        expiresAt: true,
        releasedAt: true,
        releasedBy: true,
        releaseReason: true,
      },
    });

    return this.toOutput(updated as {
      id: string;
      shopId: string;
      title: string;
      reason: string;
      scope: LegalHoldScope[];
      placedBy: string;
      placedAt: Date;
      expiresAt: Date | null;
      releasedAt: Date | null;
      releasedBy: string | null;
      releaseReason: string | null;
    });
  }
}

// ============================================================================
// ARTICLE 30 PROCESSING RECORDS
// ============================================================================

export class ProcessingRecordService {
  /**
   * Register a data processing activity (GDPR Article 30)
   */
  static async registerActivity(
    shopId: string,
    activity: Omit<ProcessingActivity, "id" | "shopId" | "createdAt" | "updatedAt">,
  ): Promise<ProcessingActivity> {
    if (!hasProcessingActivityDelegate()) {
      const fallbackRecord: ProcessingActivity = {
        ...activity,
        id: `pa_${shopId}_${Date.now()}`,
        shopId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const existing = processingActivities.get(shopId) ?? [];
      existing.push(fallbackRecord);
      processingActivities.set(shopId, existing);
      return fallbackRecord;
    }

    const saved = await prisma.processingActivityRecord.create({
      data: {
        shopId,
        activityName: activity.activityName,
        purpose: activity.purpose,
        legalBasis: activity.legalBasis,
        dataCategories: activity.dataCategories,
        dataSubjects: activity.dataSubjects,
        retentionDays: activity.retentionDays,
        thirdParties: activity.thirdParties,
        transferCountries: activity.transferCountries,
        isActive: true,
      },
    });

    console.log(`[Compliance] Processing activity registered: ${activity.activityName} for ${shopId}`);

    return {
      id: saved.id,
      shopId: saved.shopId,
      activityName: saved.activityName,
      purpose: saved.purpose,
      legalBasis: saved.legalBasis,
      dataCategories: saved.dataCategories,
      dataSubjects: saved.dataSubjects,
      retentionDays: saved.retentionDays,
      thirdParties: saved.thirdParties,
      transferCountries: saved.transferCountries,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  /**
   * Get all processing activities for a shop
   */
  static async getActivities(shopId: string): Promise<ProcessingActivity[]> {
    if (!hasProcessingActivityDelegate()) {
      return processingActivities.get(shopId) ?? [];
    }

    const records = await prisma.processingActivityRecord.findMany({
      where: { shopId, isActive: true },
      orderBy: { createdAt: "asc" },
    });

    return records.map((record) => ({
      id: record.id,
      shopId: record.shopId,
      activityName: record.activityName,
      purpose: record.purpose,
      legalBasis: record.legalBasis,
      dataCategories: record.dataCategories,
      dataSubjects: record.dataSubjects,
      retentionDays: record.retentionDays,
      thirdParties: record.thirdParties,
      transferCountries: record.transferCountries,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));
  }

  /**
   * Remove a processing activity (e.g. when feature is disabled)
   */
  static async removeActivity(shopId: string, activityId: string): Promise<boolean> {
    if (!hasProcessingActivityDelegate()) {
      const existing = processingActivities.get(shopId) ?? [];
      const filtered = existing.filter((entry) => entry.id !== activityId);
      processingActivities.set(shopId, filtered);
      return filtered.length < existing.length;
    }

    const updated = await prisma.processingActivityRecord.updateMany({
      where: { id: activityId, shopId, isActive: true },
      data: { isActive: false },
    });
    return updated.count > 0;
  }

  /**
   * Seed default processing activities for a newly installed shop
   */
  static async seedDefaultActivities(shopId: string): Promise<void> {
    if (!hasProcessingActivityDelegate()) {
      const existing = processingActivities.get(shopId) ?? [];
      if (existing.length > 0) return;

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

      for (const defaultActivity of defaults) {
        await this.registerActivity(shopId, defaultActivity);
      }
      return;
    }

    const existingCount = await prisma.processingActivityRecord.count({
      where: { shopId, isActive: true },
    });

    if (existingCount > 0) {
      return;
    }

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

    for (const defaultActivity of defaults) {
      await this.registerActivity(shopId, defaultActivity);
    }
  }
}

// ============================================================================
// BREACH NOTIFICATION
// ============================================================================

export class BreachNotificationService {
  /**
   * Register a detected data breach
   */
  static async register(
    shopId: string,
    breach: Omit<BreachNotification, "id" | "shopId">,
  ): Promise<BreachNotification> {
    if (!hasBreachDelegate()) {
      const notification: BreachNotification = {
        ...breach,
        id: `breach_${Date.now()}`,
        shopId,
        reportedAt72h:
          breach.reportedToAuthority && breach.reportedAt
            ? Date.now() - breach.detectedAt.getTime() <= 72 * 60 * 60 * 1000
            : Date.now() - breach.detectedAt.getTime() <= 72 * 60 * 60 * 1000,
      };

      const existing = breachRegistry.get(shopId) ?? [];
      existing.push(notification);
      breachRegistry.set(shopId, existing);

      if (breach.severity === "HIGH" || breach.severity === "CRITICAL") {
        console.error(`[Compliance] CRITICAL BREACH detected for shop ${shopId}: ${breach.description}`);
      }

      return notification;
    }

    const reportedAt72h =
      breach.reportedToAuthority && breach.reportedAt
        ? Date.now() - breach.detectedAt.getTime() <= 72 * 60 * 60 * 1000
        : false;

    const saved = await prisma.breachNotificationRecord.create({
      data: {
        shopId,
        detectedAt: breach.detectedAt,
        reportedAt: breach.reportedAt,
        severity: breach.severity,
        description: breach.description,
        affectedDataSubjects: breach.affectedDataSubjects,
        dataCategories: breach.dataCategories,
        mitigationTaken: breach.mitigationTaken,
        reportedToAuthority: breach.reportedToAuthority,
        reportedAt72h,
      },
    });

    if (breach.severity === "HIGH" || breach.severity === "CRITICAL") {
      console.error(`[Compliance] CRITICAL BREACH detected for shop ${shopId}: ${breach.description}`);
    }

    return {
      id: saved.id,
      shopId: saved.shopId,
      detectedAt: saved.detectedAt,
      reportedAt: saved.reportedAt ?? undefined,
      severity: saved.severity as BreachNotification["severity"],
      description: saved.description,
      affectedDataSubjects: saved.affectedDataSubjects,
      dataCategories: saved.dataCategories,
      mitigationTaken: saved.mitigationTaken,
      reportedToAuthority: saved.reportedToAuthority,
      reportedAt72h: saved.reportedAt72h,
    };
  }

  /**
   * Get all breaches for a shop
   */
  static async getBreaches(shopId: string): Promise<BreachNotification[]> {
    if (!hasBreachDelegate()) {
      return breachRegistry.get(shopId) ?? [];
    }

    const rows = await prisma.breachNotificationRecord.findMany({
      where: { shopId },
      orderBy: { detectedAt: "desc" },
    });

    return rows.map((row) => ({
      id: row.id,
      shopId: row.shopId,
      detectedAt: row.detectedAt,
      reportedAt: row.reportedAt ?? undefined,
      severity: row.severity as BreachNotification["severity"],
      description: row.description,
      affectedDataSubjects: row.affectedDataSubjects,
      dataCategories: row.dataCategories,
      mitigationTaken: row.mitigationTaken,
      reportedToAuthority: row.reportedToAuthority,
      reportedAt72h: row.reportedAt72h,
    }));
  }

  /**
   * Mark a breach as reported to authority
   */
  static async markReported(shopId: string, breachId: string): Promise<BreachNotification | null> {
    if (!hasBreachDelegate()) {
      const existing = breachRegistry.get(shopId) ?? [];
      const entry = existing.find((record) => record.id === breachId);
      if (!entry) return null;

      entry.reportedToAuthority = true;
      entry.reportedAt = new Date();
      entry.reportedAt72h =
        entry.reportedAt.getTime() - entry.detectedAt.getTime() <= 72 * 60 * 60 * 1000;
      return entry;
    }

    const existing = await prisma.breachNotificationRecord.findFirst({
      where: { id: breachId, shopId },
    });

    if (!existing) return null;

    const reportedAt = new Date();
    const reportedAt72h = reportedAt.getTime() - existing.detectedAt.getTime() <= 72 * 60 * 60 * 1000;

    const updated = await prisma.breachNotificationRecord.update({
      where: { id: breachId },
      data: {
        reportedToAuthority: true,
        reportedAt,
        reportedAt72h,
      },
    });

    return {
      id: updated.id,
      shopId: updated.shopId,
      detectedAt: updated.detectedAt,
      reportedAt: updated.reportedAt ?? undefined,
      severity: updated.severity as BreachNotification["severity"],
      description: updated.description,
      affectedDataSubjects: updated.affectedDataSubjects,
      dataCategories: updated.dataCategories,
      mitigationTaken: updated.mitigationTaken,
      reportedToAuthority: updated.reportedToAuthority,
      reportedAt72h: updated.reportedAt72h,
    };
  }
}

// ============================================================================
// RETENTION ENFORCEMENT
// ============================================================================

export class RetentionEnforcementService {
  private static sanitizeRetentionDays(
    value: number | undefined,
    fallback: number,
  ): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return fallback;
    }

    return Math.min(3650, Math.max(1, Math.floor(value)));
  }

  /**
   * Persist retention policy overrides for a shop.
   * Uses in-memory storage for now; move to DB-backed config in production.
   */
  static setPolicy(shopId: string, overrides: Partial<RetentionPolicy>): RetentionPolicy {
    const current = this.getPolicy(shopId);
    const nextOverrides: Partial<RetentionPolicy> = {
      conversationRetentionDays: this.sanitizeRetentionDays(
        overrides.conversationRetentionDays,
        current.conversationRetentionDays,
      ),
      behaviorEventRetentionDays: this.sanitizeRetentionDays(
        overrides.behaviorEventRetentionDays,
        current.behaviorEventRetentionDays,
      ),
      consentRecordRetentionDays: this.sanitizeRetentionDays(
        overrides.consentRecordRetentionDays,
        current.consentRecordRetentionDays,
      ),
      auditLogRetentionDays: this.sanitizeRetentionDays(
        overrides.auditLogRetentionDays,
        current.auditLogRetentionDays,
      ),
    };

    retentionOverrides.set(shopId, nextOverrides);
    return this.getPolicy(shopId);
  }

  /**
   * Get the persisted retention policy for a shop (defaults + overrides).
   */
  static getPolicy(shopId: string): RetentionPolicy {
    const overrides = retentionOverrides.get(shopId) ?? {};
    return this.getEffectivePolicy(shopId, overrides);
  }

  /**
   * Apply retention policy for a shop — delete data older than configured thresholds
   * Designed to be called by a scheduled job (daily).
   */
  static async enforce(shopId: string, policy?: Partial<RetentionPolicy>): Promise<{
    conversationsDeleted: number;
    eventsDeleted: number;
    skipped?: boolean;
    skipReason?: string;
    skippedScopes?: LegalHoldScope[];
  }> {
    const activeScopeSet = await LegalHoldService.getActiveScopeSet(shopId);
    const allScoped = activeScopeSet.has("ALL");
    const skipConversations = allScoped || activeScopeSet.has("CONVERSATIONS");
    const skipBehaviorEvents = allScoped || activeScopeSet.has("BEHAVIOR_EVENTS");

    const effective: RetentionPolicy =
      policy && Object.keys(policy).length > 0
        ? this.getEffectivePolicy(shopId, policy)
        : this.getPolicy(shopId);
    const now = new Date();

    const convCutoff = new Date(now.getTime() - effective.conversationRetentionDays * 86400000);
    const eventCutoff = new Date(now.getTime() - effective.behaviorEventRetentionDays * 86400000);

    let conversationsDeleted = 0;
    if (!skipConversations) {
      const result = await prisma.conversation.deleteMany({
        where: {
          shopId,
          startedAt: { lt: convCutoff },
          status: { not: "ACTIVE" },
        },
      });
      conversationsDeleted = result.count;
    }

    let eventsDeleted = 0;
    if (!skipBehaviorEvents) {
      const result = await prisma.behaviorEvent.deleteMany({
        where: {
          shopId,
          timestamp: { lt: eventCutoff },
        },
      });
      eventsDeleted = result.count;
    }

    const skippedScopes = [...activeScopeSet];
    const skipped = skipConversations || skipBehaviorEvents;
    const skipReason = skipped
      ? `Retention exclusions applied due to legal hold scopes: ${skippedScopes.join(", ")}`
      : undefined;

    console.log(`[Compliance] Retention ran for ${shopId}: ${conversationsDeleted} conversations, ${eventsDeleted} events deleted`);

    return {
      conversationsDeleted,
      eventsDeleted,
      skipped,
      skipReason,
      skippedScopes,
    };
  }

  /**
   * Get retention policy for a shop (uses defaults for fields not overridden)
   */
  static getEffectivePolicy(shopId: string, overrides: Partial<RetentionPolicy> = {}): RetentionPolicy {
    return {
      ...DEFAULT_RETENTION,
      shopId,
      ...overrides,
      conversationRetentionDays: this.sanitizeRetentionDays(
        overrides.conversationRetentionDays,
        DEFAULT_RETENTION.conversationRetentionDays,
      ),
      behaviorEventRetentionDays: this.sanitizeRetentionDays(
        overrides.behaviorEventRetentionDays,
        DEFAULT_RETENTION.behaviorEventRetentionDays,
      ),
      consentRecordRetentionDays: this.sanitizeRetentionDays(
        overrides.consentRecordRetentionDays,
        DEFAULT_RETENTION.consentRecordRetentionDays,
      ),
      auditLogRetentionDays: this.sanitizeRetentionDays(
        overrides.auditLogRetentionDays,
        DEFAULT_RETENTION.auditLogRetentionDays,
      ),
    };
  }
}

// ============================================================================
// SIEM EXPORT PIPELINE
// ============================================================================

export class ComplianceSIEMExportService {
  static async generateNDJSON(shopId: string, windowDays = 30): Promise<SIEMExportResult> {
    const days = Number.isFinite(windowDays)
      ? Math.min(3650, Math.max(1, Math.floor(windowDays)))
      : 30;

    const [report, residencyConfig, breaches, deploymentControl, holds] = await Promise.all([
      AuditReportService.generateReport(shopId, days),
      DataResidencyService.getConfig(shopId),
      BreachNotificationService.getBreaches(shopId),
      RegionalDeploymentControlService.getConfig(shopId),
      LegalHoldService.list(shopId, { includeReleased: true }),
    ]);

    const retentionPolicy = RetentionEnforcementService.getPolicy(shopId);

    const events: Array<Record<string, unknown>> = [
      {
        type: "compliance.audit.summary",
        generatedAt: new Date().toISOString(),
        shopId,
        period: report.period,
        totalConsentEvents: report.totalConsentEvents,
        dataExportRequests: report.dataExportRequests,
        dataDeletionRequests: report.dataDeletionRequests,
        deletedRecords: report.deletedRecords,
        auditLogEntries: report.auditLogEntries,
      },
      {
        type: "compliance.residency.config",
        generatedAt: new Date().toISOString(),
        shopId,
        region: residencyConfig.region,
        enforced: residencyConfig.enforced,
        enforcedCountries: residencyConfig.enforcedCountries,
      },
      {
        type: "compliance.retention.policy",
        generatedAt: new Date().toISOString(),
        shopId,
        policy: retentionPolicy,
      },
      {
        type: "compliance.deployment.control",
        generatedAt: new Date().toISOString(),
        shopId,
        deploymentControl,
      },
    ];

    breaches.forEach((breach) => {
      events.push({
        type: "compliance.breach",
        generatedAt: new Date().toISOString(),
        shopId,
        breach,
      });
    });

    holds.forEach((hold) => {
      events.push({
        type: "compliance.legal_hold",
        generatedAt: new Date().toISOString(),
        shopId,
        hold,
      });
    });

    const content = events.map((event) => JSON.stringify(event)).join("\n");

    return {
      exportId: `siem_${shopId}_${Date.now()}`,
      shopId,
      generatedAt: new Date(),
      windowDays: days,
      format: "ndjson",
      eventCount: events.length,
      content,
    };
  }

  private static parseNDJSON(content: string): Array<Record<string, unknown>> {
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return {
            type: "compliance.raw_event",
            raw: line,
          } as Record<string, unknown>;
        }
      });
  }

  private static async dispatchToDatadog(
    exportResult: SIEMExportResult,
  ): Promise<SIEMConnectorDeliveryResult> {
    const apiKey = process.env.SIEM_DATADOG_API_KEY;
    if (!apiKey) {
      return {
        connector: "datadog",
        attempted: false,
        delivered: false,
        error: "SIEM_DATADOG_API_KEY not configured",
      };
    }

    const site = process.env.SIEM_DATADOG_SITE || "datadoghq.com";
    const endpoint = `https://http-intake.logs.${site}/api/v2/logs`;
    const events = this.parseNDJSON(exportResult.content);

    const payload = events.map((event) => ({
      message: JSON.stringify(event),
      service: "fluxbot-compliance",
      ddsource: "fluxbot-studio-ia",
      ddtags: `shop:${exportResult.shopId},export:${exportResult.exportId}`,
      hostname: exportResult.shopId,
      ...event,
    }));

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "DD-API-KEY": apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          connector: "datadog",
          attempted: true,
          delivered: false,
          statusCode: response.status,
          error: body || `Datadog request failed with status ${response.status}`,
        };
      }

      return {
        connector: "datadog",
        attempted: true,
        delivered: true,
        statusCode: response.status,
        ingestedEvents: events.length,
      };
    } catch (error) {
      return {
        connector: "datadog",
        attempted: true,
        delivered: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private static async dispatchToSplunk(
    exportResult: SIEMExportResult,
  ): Promise<SIEMConnectorDeliveryResult> {
    const hecUrl = process.env.SIEM_SPLUNK_HEC_URL;
    const hecToken = process.env.SIEM_SPLUNK_HEC_TOKEN;

    if (!hecUrl || !hecToken) {
      return {
        connector: "splunk",
        attempted: false,
        delivered: false,
        error: "SIEM_SPLUNK_HEC_URL or SIEM_SPLUNK_HEC_TOKEN not configured",
      };
    }

    const events = this.parseNDJSON(exportResult.content);
    const payload = events
      .map((event) =>
        JSON.stringify({
          time: Math.floor(Date.now() / 1000),
          host: exportResult.shopId,
          source: "fluxbot-studio-ia",
          sourcetype: "fluxbot:compliance",
          event,
        }),
      )
      .join("\n");

    try {
      const response = await fetch(hecUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Splunk ${hecToken}`,
        },
        body: payload,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          connector: "splunk",
          attempted: true,
          delivered: false,
          statusCode: response.status,
          error: body || `Splunk request failed with status ${response.status}`,
        };
      }

      return {
        connector: "splunk",
        attempted: true,
        delivered: true,
        statusCode: response.status,
        ingestedEvents: events.length,
      };
    } catch (error) {
      return {
        connector: "splunk",
        attempted: true,
        delivered: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  static async dispatchToConnectors(
    exportResult: SIEMExportResult,
    connectors: SIEMConnectorTarget[] = ["datadog", "splunk"],
  ): Promise<SIEMConnectorDispatchResult> {
    const uniqueTargets = [...new Set(connectors)];
    const results: SIEMConnectorDeliveryResult[] = [];

    for (const connector of uniqueTargets) {
      if (connector === "datadog") {
        results.push(await this.dispatchToDatadog(exportResult));
        continue;
      }

      if (connector === "splunk") {
        results.push(await this.dispatchToSplunk(exportResult));
      }
    }

    return {
      exportId: exportResult.exportId,
      shopId: exportResult.shopId,
      generatedAt: new Date(),
      connectors: results,
    };
  }

  static async generateAndDispatch(
    shopId: string,
    windowDays = 30,
    connectors: SIEMConnectorTarget[] = ["datadog", "splunk"],
  ): Promise<{ export: SIEMExportResult; dispatch: SIEMConnectorDispatchResult }> {
    const exportResult = await this.generateNDJSON(shopId, windowDays);
    const dispatch = await this.dispatchToConnectors(exportResult, connectors);
    return { export: exportResult, dispatch };
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
      processingActivities: await ProcessingRecordService.getActivities(shopId),
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
