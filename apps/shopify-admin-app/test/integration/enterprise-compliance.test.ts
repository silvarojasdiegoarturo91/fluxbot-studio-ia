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
  DataResidencyService,
  ProcessingRecordService,
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
  },
}));

import prisma from "../../app/db.server";

const SHOP_ID = "enterprise-shop.myshopify.com";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// DATA RESIDENCY
// ---------------------------------------------------------------------------

describe("DataResidencyService", () => {
  it("returns GLOBAL config by default when none set", () => {
    const config = DataResidencyService.getConfig("not-configured.myshopify.com");
    expect(config.region).toBe("GLOBAL");
    expect(config.enforced).toBe(false);
  });

  it("stores and retrieves residency config", () => {
    DataResidencyService.setConfig(SHOP_ID, "EU", ["DE", "FR", "ES"]);
    const config = DataResidencyService.getConfig(SHOP_ID);

    expect(config.region).toBe("EU");
    expect(config.enforced).toBe(true);
    expect(config.enforcedCountries).toContain("DE");
  });

  it("allows storage when region matches customer country", () => {
    DataResidencyService.setConfig(SHOP_ID, "EU", ["DE"]);
    expect(DataResidencyService.isStorageAllowed(SHOP_ID, "DE")).toBe(true);
    expect(DataResidencyService.isStorageAllowed(SHOP_ID, "FR")).toBe(true); // FR is also EU
  });

  it("blocks storage when customer country is outside enforced region", () => {
    DataResidencyService.setConfig(SHOP_ID, "EU", ["DE"]);
    expect(DataResidencyService.isStorageAllowed(SHOP_ID, "US")).toBe(false);
    expect(DataResidencyService.isStorageAllowed(SHOP_ID, "JP")).toBe(false);
  });

  it("allows everything for GLOBAL region", () => {
    DataResidencyService.setConfig(SHOP_ID, "GLOBAL");
    expect(DataResidencyService.isStorageAllowed(SHOP_ID, "US")).toBe(true);
    expect(DataResidencyService.isStorageAllowed(SHOP_ID, "JP")).toBe(true);
    expect(DataResidencyService.isStorageAllowed(SHOP_ID, "DE")).toBe(true);
  });

  it("allows everything when config is not enforced (no countries)", () => {
    DataResidencyService.setConfig(SHOP_ID, "EU", []);
    expect(DataResidencyService.isStorageAllowed(SHOP_ID, "US")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PROCESSING RECORDS (GDPR ARTICLE 30)
// ---------------------------------------------------------------------------

describe("ProcessingRecordService", () => {
  it("registers a processing activity and returns it with id", () => {
    const activity = ProcessingRecordService.registerActivity(SHOP_ID, {
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

  it("retrieves all activities for a shop", () => {
    const shopId = "activities-test.myshopify.com";
    ProcessingRecordService.registerActivity(shopId, {
      activityName: "Activity A",
      purpose: "Purpose A",
      legalBasis: "Legitimate interest",
      dataCategories: ["session_data"],
      dataSubjects: ["visitors"],
      retentionDays: 90,
      thirdParties: [],
      transferCountries: [],
    });

    const activities = ProcessingRecordService.getActivities(shopId);
    expect(activities.length).toBeGreaterThan(0);
    expect(activities[0].activityName).toBe("Activity A");
  });

  it("removes an activity by id", () => {
    const shopId = "remove-test.myshopify.com";
    const activity = ProcessingRecordService.registerActivity(shopId, {
      activityName: "Removable",
      purpose: "To be removed",
      legalBasis: "Consent",
      dataCategories: [],
      dataSubjects: [],
      retentionDays: 30,
      thirdParties: [],
      transferCountries: [],
    });

    const removed = ProcessingRecordService.removeActivity(shopId, activity.id);
    expect(removed).toBe(true);
    expect(ProcessingRecordService.getActivities(shopId)).toHaveLength(0);
  });

  it("seeds default activities for new shops", () => {
    const shopId = "seed-test.myshopify.com";
    ProcessingRecordService.seedDefaultActivities(shopId);

    const activities = ProcessingRecordService.getActivities(shopId);
    expect(activities.length).toBeGreaterThanOrEqual(3);
    expect(activities.some((a) => a.activityName.includes("Chat"))).toBe(true);
  });

  it("returns empty array for shop with no activities", () => {
    expect(ProcessingRecordService.getActivities("empty.myshopify.com")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// BREACH NOTIFICATION
// ---------------------------------------------------------------------------

describe("BreachNotificationService", () => {
  it("registers a breach and returns it with id", () => {
    const breach = BreachNotificationService.register(SHOP_ID, {
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

  it("sets reportedAt72h = true when breach detected within 72h", () => {
    const recentlyDetected = new Date(Date.now() - 10 * 60 * 60 * 1000); // 10h ago
    const breach = BreachNotificationService.register(SHOP_ID, {
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

  it("sets reportedAt72h = false when breach detected over 72h ago", () => {
    const oldDetection = new Date(Date.now() - 100 * 60 * 60 * 1000); // 100h ago
    const breach = BreachNotificationService.register(SHOP_ID, {
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

  it("marks a breach as reported to authority", () => {
    const shopId = "report-breach.myshopify.com";
    const breach = BreachNotificationService.register(shopId, {
      detectedAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5h ago
      severity: "CRITICAL",
      description: "Critical breach",
      affectedDataSubjects: 10000,
      dataCategories: ["personal_data", "financial_data"],
      mitigationTaken: "System taken offline",
      reportedToAuthority: false,
      reportedAt72h: false,
    });

    const updated = BreachNotificationService.markReported(shopId, breach.id);

    expect(updated).not.toBeNull();
    expect(updated!.reportedToAuthority).toBe(true);
    expect(updated!.reportedAt).toBeDefined();
    expect(updated!.reportedAt72h).toBe(true); // 5h < 72h
  });

  it("returns null when marking unknown breach", () => {
    const result = BreachNotificationService.markReported(SHOP_ID, "non-existent-id");
    expect(result).toBeNull();
  });

  it("retrieves all breaches for a shop", () => {
    const shopId = "list-breaches.myshopify.com";
    BreachNotificationService.register(shopId, {
      detectedAt: new Date(),
      severity: "LOW",
      description: "Breach 1",
      affectedDataSubjects: 1,
      dataCategories: [],
      mitigationTaken: "Fixed",
      reportedToAuthority: true,
      reportedAt72h: true,
    });

    const breaches = BreachNotificationService.getBreaches(shopId);
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
