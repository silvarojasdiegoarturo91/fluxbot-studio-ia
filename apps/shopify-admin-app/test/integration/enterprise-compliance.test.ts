/**
 * Enterprise Compliance Service Tests — Phase 5
 * Tests for:
 * - DataResidencyService (config, enforcement, storage validation)
 * - ProcessingRecordService (GDPR Article 30 activities)
 * - BreachNotificationService (registration, marking, 72h rule)
 * - RetentionEnforcementService (policy enforcement, data deletion)
 * - AuditReportService (compliance report generation)
 * - SupportAgentAccessService (scope-limited access tokens)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ComplianceSIEMExportService,
  DataResidencyService,
  LegalHoldService,
  ProcessingRecordService,
  RegionalDeploymentControlService,
  BreachNotificationService,
  RetentionEnforcementService,
  SupportAgentAccessService,
  AuditReportService,
} from "../../app/services/enterprise-compliance.server";

// ---------------------------------------------------------------------------
// MOCK PRISMA
// ---------------------------------------------------------------------------

vi.mock("../../app/db.server", () => ({
  default: {
    conversation: {
      deleteMany: vi.fn(),
    },
    behaviorEvent: {
      deleteMany: vi.fn(),
    },
    consentRecord: {
      findMany: vi.fn(),
    },
    dataExportJob: {
      count: vi.fn(),
    },
    dataDeletionJob: {
      findMany: vi.fn(),
    },
    auditLog: {
      count: vi.fn(),
    },
    regionalDeploymentControl: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    legalHold: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import prisma from "../../app/db.server";

const SHOP_ID = "enterprise-shop.myshopify.com";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.regionalDeploymentControl.findUnique as any).mockResolvedValue(null);
  (prisma.legalHold.findMany as any).mockResolvedValue([]);
  (prisma.legalHold.count as any).mockResolvedValue(0);
  (prisma.legalHold.findUnique as any).mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// DATA RESIDENCY
// ---------------------------------------------------------------------------

describe("DataResidencyService", () => {
  it("returns GLOBAL config by default when none set", async () => {
    const config = await DataResidencyService.getConfig("not-configured.myshopify.com");
    expect(config.region).toBe("GLOBAL");
    expect(config.enforced).toBe(false);
  });

  it("stores and retrieves residency config", async () => {
    await DataResidencyService.setConfig(SHOP_ID, "EU", ["DE", "FR", "ES"]);
    const config = await DataResidencyService.getConfig(SHOP_ID);

    expect(config.region).toBe("EU");
    expect(config.enforced).toBe(true);
    expect(config.enforcedCountries).toContain("DE");
  });

  it("allows storage when region matches customer country", async () => {
    await DataResidencyService.setConfig(SHOP_ID, "EU", ["DE"]);
    await expect(DataResidencyService.isStorageAllowed(SHOP_ID, "DE")).resolves.toBe(true);
    await expect(DataResidencyService.isStorageAllowed(SHOP_ID, "FR")).resolves.toBe(true); // FR is also EU
  });

  it("blocks storage when customer country is outside enforced region", async () => {
    await DataResidencyService.setConfig(SHOP_ID, "EU", ["DE"]);
    await expect(DataResidencyService.isStorageAllowed(SHOP_ID, "US")).resolves.toBe(false);
    await expect(DataResidencyService.isStorageAllowed(SHOP_ID, "JP")).resolves.toBe(false);
  });

  it("allows everything for GLOBAL region", async () => {
    await DataResidencyService.setConfig(SHOP_ID, "GLOBAL");
    await expect(DataResidencyService.isStorageAllowed(SHOP_ID, "US")).resolves.toBe(true);
    await expect(DataResidencyService.isStorageAllowed(SHOP_ID, "JP")).resolves.toBe(true);
    await expect(DataResidencyService.isStorageAllowed(SHOP_ID, "DE")).resolves.toBe(true);
  });

  it("allows everything when config is not enforced (no countries)", async () => {
    await DataResidencyService.setConfig(SHOP_ID, "EU", []);
    await expect(DataResidencyService.isStorageAllowed(SHOP_ID, "US")).resolves.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// REGIONAL DEPLOYMENT CONTROLS
// ---------------------------------------------------------------------------

describe("RegionalDeploymentControlService", () => {
  it("returns GLOBAL defaults when no deployment control is configured", async () => {
    (prisma.regionalDeploymentControl.findUnique as any).mockResolvedValue(null);

    const config = await RegionalDeploymentControlService.getConfig("deployment-empty.myshopify.com");
    expect(config.primaryRegion).toBe("GLOBAL");
    expect(config.failoverRegions).toEqual([]);
    expect(config.strictIsolation).toBe(false);
  });

  it("stores and retrieves deployment control overrides", async () => {
    (prisma.regionalDeploymentControl.findUnique as any).mockResolvedValueOnce(null);
    (prisma.regionalDeploymentControl.upsert as any).mockResolvedValue({
      shopId: SHOP_ID,
      primaryRegion: "EU",
      failoverRegions: ["US", "APAC"],
      strictIsolation: true,
      piiRestrictedToPrimary: true,
      updatedAt: new Date(),
    });

    const config = await RegionalDeploymentControlService.setConfig(SHOP_ID, {
      primaryRegion: "EU",
      failoverRegions: ["US", "APAC"],
      strictIsolation: true,
      piiRestrictedToPrimary: true,
    });

    expect(config.primaryRegion).toBe("EU");
    expect(config.failoverRegions).toEqual(["US", "APAC"]);
    expect(config.strictIsolation).toBe(true);
    expect(config.piiRestrictedToPrimary).toBe(true);
  });

  it("returns deduplicated allowed regions", async () => {
    (prisma.regionalDeploymentControl.findUnique as any).mockResolvedValue({
      shopId: "deployment-allowed.myshopify.com",
      primaryRegion: "US",
      failoverRegions: ["EU", "US"],
      strictIsolation: false,
      piiRestrictedToPrimary: false,
      updatedAt: new Date(),
    });

    await expect(RegionalDeploymentControlService.getAllowedRegions("deployment-allowed.myshopify.com")).resolves.toEqual([
      "US",
      "EU",
    ]);
  });
});

// ---------------------------------------------------------------------------
// LEGAL HOLD WORKFLOW
// ---------------------------------------------------------------------------

describe("LegalHoldService", () => {
  it("creates and lists legal holds", async () => {
    (prisma.legalHold.create as any).mockResolvedValue({
      id: "hold-1",
      shopId: "legal-hold-shop.myshopify.com",
      title: "Regulatory preservation",
      reason: "Pending legal investigation",
      scope: ["ALL"],
      placedBy: "admin",
      placedAt: new Date(),
      expiresAt: null,
      releasedAt: null,
      releasedBy: null,
      releaseReason: null,
    });
    (prisma.legalHold.findMany as any).mockResolvedValue([
      {
        id: "hold-1",
        shopId: "legal-hold-shop.myshopify.com",
        title: "Regulatory preservation",
        reason: "Pending legal investigation",
        scope: ["ALL"],
        placedBy: "admin",
        placedAt: new Date(),
        expiresAt: null,
        releasedAt: null,
        releasedBy: null,
        releaseReason: null,
      },
    ]);

    const hold = await LegalHoldService.create("legal-hold-shop.myshopify.com", {
      title: "Regulatory preservation",
      reason: "Pending legal investigation",
      scope: ["ALL"],
      placedBy: "admin",
    });

    expect(hold.id).toBeDefined();
    expect(hold.scope).toEqual(["ALL"]);
    await expect(LegalHoldService.list("legal-hold-shop.myshopify.com")).resolves.toHaveLength(1);
  });

  it("tracks active hold count and release", async () => {
    const shopId = "legal-hold-release.myshopify.com";
    (prisma.legalHold.create as any).mockResolvedValue({
      id: "hold-2",
      shopId,
      title: "Retention freeze",
      reason: "Customer dispute",
      scope: ["CONVERSATIONS"],
      placedBy: "admin",
      placedAt: new Date(),
      expiresAt: null,
      releasedAt: null,
      releasedBy: null,
      releaseReason: null,
    });
    (prisma.legalHold.count as any).mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    (prisma.legalHold.findUnique as any).mockResolvedValue({
      id: "hold-2",
      shopId,
      releasedAt: null,
    });
    (prisma.legalHold.update as any).mockResolvedValue({
      id: "hold-2",
      shopId,
      title: "Retention freeze",
      reason: "Customer dispute",
      scope: ["CONVERSATIONS"],
      placedBy: "admin",
      placedAt: new Date(),
      expiresAt: null,
      releasedAt: new Date(),
      releasedBy: "admin",
      releaseReason: "Case closed",
    });

    const hold = await LegalHoldService.create(shopId, {
      title: "Retention freeze",
      reason: "Customer dispute",
      scope: ["CONVERSATIONS"],
      placedBy: "admin",
    });

    await expect(LegalHoldService.getActiveHoldCount(shopId)).resolves.toBe(1);

    const released = await LegalHoldService.release(shopId, hold.id, "admin", "Case closed");
    expect(released).not.toBeNull();
    expect(released?.releasedBy).toBe("admin");
    await expect(LegalHoldService.getActiveHoldCount(shopId)).resolves.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PROCESSING RECORDS (GDPR ARTICLE 30)
// ---------------------------------------------------------------------------

describe("ProcessingRecordService", () => {
  it("registers a processing activity and returns it with id", async () => {
    const activity = await ProcessingRecordService.registerActivity(SHOP_ID, {
      activityName: "Test Activity",
      purpose: "Test purpose",
      legalBasis: "Consent",
      dataCategories: ["personal_data"],
      dataSubjects: ["customers"],
      retentionDays: 365,
      thirdParties: [],
      transferCountries: [],
    });

    expect(activity.id).toBeDefined();
    expect(activity.shopId).toBe(SHOP_ID);
    expect(activity.activityName).toBe("Test Activity");
  });

  it("retrieves all activities for a shop", async () => {
    const shopId = "activities-test.myshopify.com";
    await ProcessingRecordService.registerActivity(shopId, {
      activityName: "Activity A",
      purpose: "Purpose A",
      legalBasis: "Legitimate interest",
      dataCategories: ["session_data"],
      dataSubjects: ["visitors"],
      retentionDays: 90,
      thirdParties: [],
      transferCountries: [],
    });

    const activities = await ProcessingRecordService.getActivities(shopId);
    expect(activities.length).toBeGreaterThan(0);
    expect(activities[0].activityName).toBe("Activity A");
  });

  it("removes an activity by id", async () => {
    const shopId = "remove-test.myshopify.com";
    const activity = await ProcessingRecordService.registerActivity(shopId, {
      activityName: "Removable",
      purpose: "To be removed",
      legalBasis: "Consent",
      dataCategories: [],
      dataSubjects: [],
      retentionDays: 30,
      thirdParties: [],
      transferCountries: [],
    });

    const removed = await ProcessingRecordService.removeActivity(shopId, activity.id);
    expect(removed).toBe(true);
    await expect(ProcessingRecordService.getActivities(shopId)).resolves.toHaveLength(0);
  });

  it("seeds default activities for new shops", async () => {
    const shopId = "seed-test.myshopify.com";
    await ProcessingRecordService.seedDefaultActivities(shopId);

    const activities = await ProcessingRecordService.getActivities(shopId);
    expect(activities.length).toBeGreaterThanOrEqual(3);
    expect(activities.some((a) => a.activityName.includes("Chat"))).toBe(true);
  });

  it("returns empty array for shop with no activities", async () => {
    await expect(ProcessingRecordService.getActivities("empty.myshopify.com")).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// BREACH NOTIFICATION
// ---------------------------------------------------------------------------

describe("BreachNotificationService", () => {
  it("registers a breach and returns it with id", async () => {
    const breach = await BreachNotificationService.register(SHOP_ID, {
      detectedAt: new Date(),
      severity: "HIGH",
      description: "Unauthorized data access",
      affectedDataSubjects: 500,
      dataCategories: ["email"],
      mitigationTaken: "Revoked API tokens",
      reportedToAuthority: false,
      reportedAt72h: false,
    });

    expect(breach.id).toBeDefined();
    expect(breach.shopId).toBe(SHOP_ID);
    expect(breach.severity).toBe("HIGH");
  });

  it("sets reportedAt72h = true when breach detected within 72h", async () => {
    const recentlyDetected = new Date(Date.now() - 10 * 60 * 60 * 1000); // 10h ago
    const breach = await BreachNotificationService.register(SHOP_ID, {
      detectedAt: recentlyDetected,
      severity: "MEDIUM",
      description: "Potential breach",
      affectedDataSubjects: 10,
      dataCategories: ["behavioral_data"],
      mitigationTaken: "Monitoring increased",
      reportedToAuthority: false,
      reportedAt72h: false,
    });

    expect(breach.reportedAt72h).toBe(true);
  });

  it("sets reportedAt72h = false when breach detected over 72h ago", async () => {
    const oldDetection = new Date(Date.now() - 100 * 60 * 60 * 1000); // 100h ago
    const breach = await BreachNotificationService.register(SHOP_ID, {
      detectedAt: oldDetection,
      severity: "LOW",
      description: "Old breach",
      affectedDataSubjects: 1,
      dataCategories: [],
      mitigationTaken: "Patched",
      reportedToAuthority: false,
      reportedAt72h: false,
    });

    expect(breach.reportedAt72h).toBe(false);
  });

  it("marks a breach as reported to authority", async () => {
    const shopId = "report-breach.myshopify.com";
    const breach = await BreachNotificationService.register(shopId, {
      detectedAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5h ago
      severity: "CRITICAL",
      description: "Critical breach",
      affectedDataSubjects: 10000,
      dataCategories: ["personal_data", "financial_data"],
      mitigationTaken: "System taken offline",
      reportedToAuthority: false,
      reportedAt72h: false,
    });

    const updated = await BreachNotificationService.markReported(shopId, breach.id);

    expect(updated).not.toBeNull();
    expect(updated!.reportedToAuthority).toBe(true);
    expect(updated!.reportedAt).toBeDefined();
    expect(updated!.reportedAt72h).toBe(true); // 5h < 72h
  });

  it("returns null when marking unknown breach", async () => {
    const result = await BreachNotificationService.markReported(SHOP_ID, "non-existent-id");
    expect(result).toBeNull();
  });

  it("retrieves all breaches for a shop", async () => {
    const shopId = "list-breaches.myshopify.com";
    await BreachNotificationService.register(shopId, {
      detectedAt: new Date(),
      severity: "LOW",
      description: "Breach 1",
      affectedDataSubjects: 1,
      dataCategories: [],
      mitigationTaken: "Fixed",
      reportedToAuthority: true,
      reportedAt72h: true,
    });

    const breaches = await BreachNotificationService.getBreaches(shopId);
    expect(breaches.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// RETENTION ENFORCEMENT
// ---------------------------------------------------------------------------

describe("RetentionEnforcementService", () => {
  it("deletes conversations and events beyond retention thresholds", async () => {
    (prisma.conversation.deleteMany as any).mockResolvedValue({ count: 5 });
    (prisma.behaviorEvent.deleteMany as any).mockResolvedValue({ count: 20 });

    const result = await RetentionEnforcementService.enforce(SHOP_ID);

    expect(result.conversationsDeleted).toBe(5);
    expect(result.eventsDeleted).toBe(20);

    expect(prisma.conversation.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: SHOP_ID,
          status: { not: "ACTIVE" },
        }),
      })
    );
  });

  it("applies custom policy overrides", async () => {
    (prisma.conversation.deleteMany as any).mockResolvedValue({ count: 2 });
    (prisma.behaviorEvent.deleteMany as any).mockResolvedValue({ count: 8 });

    const result = await RetentionEnforcementService.enforce(SHOP_ID, {
      conversationRetentionDays: 30,
      behaviorEventRetentionDays: 14,
    });

    // Verify shorter cutoffs are used
    const deleteManyCall = (prisma.conversation.deleteMany as any).mock.calls[0][0];
    const cutoffDate: Date = deleteManyCall.where.startedAt.lt;
    const daysDiff = (Date.now() - cutoffDate.getTime()) / 86400000;

    expect(daysDiff).toBeCloseTo(30, 0);
    expect(result.conversationsDeleted).toBe(2);
  });

  it("returns effective policy with defaults for unspecified fields", () => {
    const policy = RetentionEnforcementService.getEffectivePolicy(SHOP_ID, {
      conversationRetentionDays: 90,
    });

    expect(policy.conversationRetentionDays).toBe(90);
    expect(policy.behaviorEventRetentionDays).toBe(90); // default unchanged
    expect(policy.auditLogRetentionDays).toBe(2555); // default unchanged
  });

  it("persists retention policy overrides per shop", () => {
    const updated = RetentionEnforcementService.setPolicy(SHOP_ID, {
      conversationRetentionDays: 45,
      behaviorEventRetentionDays: 21,
    });

    expect(updated.conversationRetentionDays).toBe(45);
    expect(updated.behaviorEventRetentionDays).toBe(21);

    const retrieved = RetentionEnforcementService.getPolicy(SHOP_ID);
    expect(retrieved.conversationRetentionDays).toBe(45);
    expect(retrieved.behaviorEventRetentionDays).toBe(21);
  });

  it("uses persisted retention policy when enforce() receives no inline override", async () => {
    RetentionEnforcementService.setPolicy(SHOP_ID, {
      conversationRetentionDays: 10,
      behaviorEventRetentionDays: 5,
    });

    (prisma.conversation.deleteMany as any).mockResolvedValue({ count: 1 });
    (prisma.behaviorEvent.deleteMany as any).mockResolvedValue({ count: 2 });

    await RetentionEnforcementService.enforce(SHOP_ID);

    const convCall = (prisma.conversation.deleteMany as any).mock.calls.at(-1)?.[0];
    const convCutoff: Date = convCall.where.startedAt.lt;
    const convDays = (Date.now() - convCutoff.getTime()) / 86400000;

    expect(convDays).toBeCloseTo(10, 0);
  });

  it("skips retention when an active legal hold exists", async () => {
    const shopId = "retention-hold.myshopify.com";
    (prisma.legalHold.findMany as any).mockResolvedValue([
      {
        id: "hold-all",
        shopId,
        title: "Litigation",
        reason: "Preserve records",
        scope: ["ALL"],
        placedBy: "admin",
        placedAt: new Date(),
        expiresAt: null,
        releasedAt: null,
        releasedBy: null,
        releaseReason: null,
      },
    ]);

    const result = await RetentionEnforcementService.enforce(shopId);

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toMatch(/legal hold/i);
    expect(result.conversationsDeleted).toBe(0);
    expect(result.eventsDeleted).toBe(0);
    expect(prisma.conversation.deleteMany).not.toHaveBeenCalled();
    expect(prisma.behaviorEvent.deleteMany).not.toHaveBeenCalled();
  });

  it("applies scoped retention exclusion only to held data type", async () => {
    const shopId = "retention-scope-shop.myshopify.com";
    (prisma.legalHold.findMany as any).mockResolvedValue([
      {
        id: "hold-conv",
        shopId,
        title: "Conversation hold",
        reason: "Ticket dispute",
        scope: ["CONVERSATIONS"],
        placedBy: "admin",
        placedAt: new Date(),
        expiresAt: null,
        releasedAt: null,
        releasedBy: null,
        releaseReason: null,
      },
    ]);

    (prisma.behaviorEvent.deleteMany as any).mockResolvedValue({ count: 9 });

    const result = await RetentionEnforcementService.enforce(shopId);

    expect(result.skipped).toBe(true);
    expect(result.skippedScopes).toContain("CONVERSATIONS");
    expect(result.conversationsDeleted).toBe(0);
    expect(result.eventsDeleted).toBe(9);
    expect(prisma.conversation.deleteMany).not.toHaveBeenCalled();
    expect(prisma.behaviorEvent.deleteMany).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// AUDIT REPORT
// ---------------------------------------------------------------------------

describe("AuditReportService", () => {
  it("generates a compliance report with all required sections", async () => {
    (prisma.consentRecord.findMany as any).mockResolvedValue([
      { consentType: "ANALYTICS" },
      { consentType: "ANALYTICS" },
      { consentType: "MARKETING" },
    ]);
    (prisma.dataExportJob.count as any).mockResolvedValue(3);
    (prisma.dataDeletionJob.findMany as any).mockResolvedValue([
      { recordsDeleted: 100 },
      { recordsDeleted: 50 },
    ]);
    (prisma.auditLog.count as any).mockResolvedValue(250);

    const report = await AuditReportService.generateReport(SHOP_ID, 365);

    expect(report.shopId).toBe(SHOP_ID);
    expect(report.totalConsentEvents).toBe(3);
    expect(report.consentBreakdown["ANALYTICS"]).toBe(2);
    expect(report.consentBreakdown["MARKETING"]).toBe(1);
    expect(report.dataExportRequests).toBe(3);
    expect(report.dataDeletionRequests).toBe(2);
    expect(report.deletedRecords).toBe(150);
    expect(report.auditLogEntries).toBe(250);
    expect(report.processingActivities).toBeDefined();
    expect(Array.isArray(report.processingActivities)).toBe(true);
  });

  it("handles zero consent events gracefully", async () => {
    (prisma.consentRecord.findMany as any).mockResolvedValue([]);
    (prisma.dataExportJob.count as any).mockResolvedValue(0);
    (prisma.dataDeletionJob.findMany as any).mockResolvedValue([]);
    (prisma.auditLog.count as any).mockResolvedValue(0);

    const report = await AuditReportService.generateReport(SHOP_ID, 30);

    expect(report.totalConsentEvents).toBe(0);
    expect(report.consentBreakdown).toEqual({});
    expect(report.deletedRecords).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SIEM EXPORT PIPELINE
// ---------------------------------------------------------------------------

describe("ComplianceSIEMExportService", () => {
  it("generates NDJSON export with enterprise compliance events", async () => {
    const shopId = "siem-shop.myshopify.com";

    (prisma.consentRecord.findMany as any).mockResolvedValue([{ consentType: "ANALYTICS" }]);
    (prisma.dataExportJob.count as any).mockResolvedValue(1);
    (prisma.dataDeletionJob.findMany as any).mockResolvedValue([{ recordsDeleted: 5 }]);
    (prisma.auditLog.count as any).mockResolvedValue(12);

    await DataResidencyService.setConfig(shopId, "EU", ["DE"]);
    (prisma.regionalDeploymentControl.findUnique as any).mockResolvedValue({
      shopId,
      primaryRegion: "EU",
      failoverRegions: ["US"],
      strictIsolation: true,
      piiRestrictedToPrimary: true,
      updatedAt: new Date(),
    });
    (prisma.legalHold.findMany as any).mockResolvedValue([
      {
        id: "hold-1",
        shopId,
        title: "Case hold",
        reason: "Regulatory review",
        scope: ["ALL"],
        placedBy: "admin",
        placedAt: new Date(),
        expiresAt: null,
        releasedAt: null,
        releasedBy: null,
        releaseReason: null,
      },
    ]);

    const result = await ComplianceSIEMExportService.generateNDJSON(shopId, 7);

    expect(result.format).toBe("ndjson");
    expect(result.windowDays).toBe(7);
    expect(result.eventCount).toBeGreaterThanOrEqual(5);
    const lines = result.content.split("\n");
    expect(lines.length).toBe(result.eventCount);
    expect(lines.some((line) => line.includes("compliance.audit.summary"))).toBe(true);
    expect(lines.some((line) => line.includes("compliance.legal_hold"))).toBe(true);
  });

  it("dispatches NDJSON events to configured connector implementations", async () => {
    const exportResult = {
      exportId: "siem_dispatch_1",
      shopId: "dispatch-shop.myshopify.com",
      generatedAt: new Date(),
      windowDays: 3,
      format: "ndjson" as const,
      eventCount: 1,
      content: JSON.stringify({ type: "compliance.audit.summary", shopId: "dispatch-shop.myshopify.com" }),
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    });
    vi.stubGlobal("fetch", mockFetch);

    process.env.SIEM_DATADOG_API_KEY = "datadog-test-key";
    process.env.SIEM_DATADOG_SITE = "datadoghq.com";
    process.env.SIEM_SPLUNK_HEC_URL = "https://splunk.example.com/services/collector/event";
    process.env.SIEM_SPLUNK_HEC_TOKEN = "splunk-test-token";

    const dispatch = await ComplianceSIEMExportService.dispatchToConnectors(exportResult, [
      "datadog",
      "splunk",
    ]);

    expect(dispatch.connectors).toHaveLength(2);
    expect(dispatch.connectors.every((entry) => entry.delivered)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    delete process.env.SIEM_DATADOG_API_KEY;
    delete process.env.SIEM_DATADOG_SITE;
    delete process.env.SIEM_SPLUNK_HEC_URL;
    delete process.env.SIEM_SPLUNK_HEC_TOKEN;
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// SUPPORT AGENT ACCESS
// ---------------------------------------------------------------------------

describe("SupportAgentAccessService", () => {
  it("creates a scoped agent token", () => {
    const token = SupportAgentAccessService.createToken(SHOP_ID, "agent-1", [
      "read:conversations",
      "read:orders",
    ]);

    expect(token.token).toBeDefined();
    expect(token.shopId).toBe(SHOP_ID);
    expect(token.scope).toContain("read:conversations");
    expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("validates token against required scope", () => {
    const { token } = SupportAgentAccessService.createToken(SHOP_ID, "agent-2", [
      "read:conversations",
    ]);

    expect(SupportAgentAccessService.validateToken(token, "read:conversations")).toBe(true);
    expect(SupportAgentAccessService.validateToken(token, "write:orders")).toBe(false);
  });

  it("wildcard scope grants access to any resource", () => {
    const { token } = SupportAgentAccessService.createToken(SHOP_ID, "admin-agent", ["*"]);

    expect(SupportAgentAccessService.validateToken(token, "read:conversations")).toBe(true);
    expect(SupportAgentAccessService.validateToken(token, "write:orders")).toBe(true);
  });

  it("rejects expired tokens", async () => {
    const { token } = SupportAgentAccessService.createToken(SHOP_ID, "agent-3", ["read:*"], -1000); // already expired

    const isValid = SupportAgentAccessService.validateToken(token, "read:conversations");
    expect(isValid).toBe(false);
  });

  it("revokes tokens", () => {
    const { token } = SupportAgentAccessService.createToken(SHOP_ID, "agent-4", ["read:*"]);

    const revoked = SupportAgentAccessService.revokeToken(token);
    expect(revoked).toBe(true);

    const isValid = SupportAgentAccessService.validateToken(token, "read:conversations");
    expect(isValid).toBe(false);
  });

  it("counts active tokens for a shop", () => {
    const shopId = "count-shop.myshopify.com";
    SupportAgentAccessService.createToken(shopId, "a1", ["read:*"]);
    SupportAgentAccessService.createToken(shopId, "a2", ["read:*"]);

    const count = SupportAgentAccessService.getActiveTokenCount(shopId);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("returns false for unknown token", () => {
    expect(SupportAgentAccessService.validateToken("totally-fake-token", "read:*")).toBe(false);
  });
});
