/**
 * Unit Tests: Enterprise Compliance Service — Prisma delegate paths & edge cases
 *
 * The integration suite covers the in-memory fallback branches (prisma without
 * the Phase 5 delegates). These tests provide the delegate models so the
 * DB-backed branches of every service are exercised, plus SIEM connector
 * edge cases and legal-hold release guards.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mockDataResidencyUpsert = vi.fn();
const mockDataResidencyFindUnique = vi.fn();
const mockProcessingCreate = vi.fn();
const mockProcessingFindMany = vi.fn();
const mockProcessingUpdateMany = vi.fn();
const mockProcessingCount = vi.fn();
const mockBreachCreate = vi.fn();
const mockBreachFindMany = vi.fn();
const mockBreachFindFirst = vi.fn();
const mockBreachUpdate = vi.fn();
const mockConversationDeleteMany = vi.fn();
const mockBehaviorEventDeleteMany = vi.fn();
const mockConsentFindMany = vi.fn();
const mockDataExportCount = vi.fn();
const mockDeletionFindMany = vi.fn();
const mockAuditLogCount = vi.fn();
const mockDeploymentFindUnique = vi.fn();
const mockDeploymentUpsert = vi.fn();
const mockLegalHoldCreate = vi.fn();
const mockLegalHoldFindMany = vi.fn();
const mockLegalHoldCount = vi.fn();
const mockLegalHoldFindUnique = vi.fn();
const mockLegalHoldUpdate = vi.fn();

vi.mock("../../../app/db.server", () => ({
  default: {
    dataResidencySetting: {
      upsert: mockDataResidencyUpsert,
      findUnique: mockDataResidencyFindUnique,
    },
    processingActivityRecord: {
      create: mockProcessingCreate,
      findMany: mockProcessingFindMany,
      updateMany: mockProcessingUpdateMany,
      count: mockProcessingCount,
    },
    breachNotificationRecord: {
      create: mockBreachCreate,
      findMany: mockBreachFindMany,
      findFirst: mockBreachFindFirst,
      update: mockBreachUpdate,
    },
    conversation: { deleteMany: mockConversationDeleteMany },
    behaviorEvent: { deleteMany: mockBehaviorEventDeleteMany },
    consentRecord: { findMany: mockConsentFindMany },
    dataExportJob: { count: mockDataExportCount },
    dataDeletionJob: { findMany: mockDeletionFindMany },
    auditLog: { count: mockAuditLogCount },
    regionalDeploymentControl: {
      findUnique: mockDeploymentFindUnique,
      upsert: mockDeploymentUpsert,
    },
    legalHold: {
      create: mockLegalHoldCreate,
      findMany: mockLegalHoldFindMany,
      count: mockLegalHoldCount,
      findUnique: mockLegalHoldFindUnique,
      update: mockLegalHoldUpdate,
    },
  },
}));

const SHOP_ID = "unit-enterprise-shop.myshopify.com";

function makeLegalHoldRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "hold-1",
    shopId: SHOP_ID,
    title: "Litigation hold",
    reason: "Pending case",
    scope: ["ALL"],
    placedBy: "admin",
    placedAt: new Date(),
    expiresAt: null,
    releasedAt: null,
    releasedBy: null,
    releaseReason: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.SIEM_DATADOG_API_KEY;
  delete process.env.SIEM_DATADOG_SITE;
  delete process.env.SIEM_SPLUNK_HEC_URL;
  delete process.env.SIEM_SPLUNK_HEC_TOKEN;
});

describe("DataResidencyService — prisma delegate path", () => {
  it("persists config through the dataResidencySetting.upsert delegate", async () => {
    const {
      DataResidencyService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockDataResidencyUpsert.mockResolvedValue({
      shopId: SHOP_ID,
      region: "EU",
      enforced: true,
      enforcedCountries: ["DE"],
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const config = await DataResidencyService.setConfig(SHOP_ID, "EU", ["DE"]);

    expect(mockDataResidencyUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: SHOP_ID },
        create: expect.objectContaining({ region: "EU", enforcedCountries: ["DE"] }),
        update: expect.objectContaining({ region: "EU", enforcedCountries: ["DE"] }),
      }),
    );
    expect(config.region).toBe("EU");
    expect(config.enforced).toBe(true);
    expect(config.updatedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  it("reads an existing record through the findUnique delegate", async () => {
    const {
      DataResidencyService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockDataResidencyFindUnique.mockResolvedValue({
      shopId: SHOP_ID,
      region: "APAC",
      enforced: true,
      enforcedCountries: ["JP"],
      updatedAt: new Date("2026-02-01T00:00:00Z"),
    });

    const config = await DataResidencyService.getConfig(SHOP_ID);

    expect(mockDataResidencyFindUnique).toHaveBeenCalledWith({ where: { shopId: SHOP_ID } });
    expect(config.region).toBe("APAC");
    expect(config.enforcedCountries).toEqual(["JP"]);
  });

  it("falls back to GLOBAL when no record exists on the delegate path", async () => {
    const {
      DataResidencyService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockDataResidencyFindUnique.mockResolvedValue(null);

    const config = await DataResidencyService.getConfig(SHOP_ID);

    expect(config.region).toBe("GLOBAL");
    expect(config.enforced).toBe(false);
  });

  it("blocks storage for unknown countries when a region is enforced", async () => {
    const {
      DataResidencyService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockDataResidencyFindUnique.mockResolvedValue({
      shopId: SHOP_ID,
      region: "EU",
      enforced: true,
      enforcedCountries: ["DE"],
      updatedAt: new Date(),
    });

    await expect(DataResidencyService.isStorageAllowed(SHOP_ID, "XX")).resolves.toBe(false);
    await expect(DataResidencyService.isStorageAllowed(SHOP_ID, "CA")).resolves.toBe(false);
  });
});

describe("ProcessingRecordService — prisma delegate path", () => {
  it("registers an activity through the create delegate", async () => {
    const {
      ProcessingRecordService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockProcessingCreate.mockResolvedValue({
      id: "pa-delegate-1",
      shopId: SHOP_ID,
      activityName: "Delegate Activity",
      purpose: "Delegate purpose",
      legalBasis: "Consent",
      dataCategories: ["personal_data"],
      dataSubjects: ["customers"],
      retentionDays: 120,
      thirdParties: ["OpenAI"],
      transferCountries: ["US"],
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const activity = await ProcessingRecordService.registerActivity(SHOP_ID, {
      activityName: "Delegate Activity",
      purpose: "Delegate purpose",
      legalBasis: "Consent",
      dataCategories: ["personal_data"],
      dataSubjects: ["customers"],
      retentionDays: 120,
      thirdParties: ["OpenAI"],
      transferCountries: ["US"],
    });

    expect(mockProcessingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: true, shopId: SHOP_ID }),
      }),
    );
    expect(activity.id).toBe("pa-delegate-1");
  });

  it("maps records through the findMany delegate", async () => {
    const {
      ProcessingRecordService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockProcessingFindMany.mockResolvedValue([
      {
        id: "pa-1",
        shopId: SHOP_ID,
        activityName: "A",
        purpose: "P",
        legalBasis: "L",
        dataCategories: [],
        dataSubjects: [],
        retentionDays: 30,
        thirdParties: [],
        transferCountries: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const activities = await ProcessingRecordService.getActivities(SHOP_ID);

    expect(mockProcessingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId: SHOP_ID, isActive: true } }),
    );
    expect(activities).toHaveLength(1);
    expect(activities[0].activityName).toBe("A");
  });

  it("removes an activity through updateMany and reports the count", async () => {
    const {
      ProcessingRecordService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockProcessingUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await expect(ProcessingRecordService.removeActivity(SHOP_ID, "pa-1")).resolves.toBe(true);
    await expect(ProcessingRecordService.removeActivity(SHOP_ID, "pa-1")).resolves.toBe(false);
  });

  it("seeds default activities when none exist on the delegate path", async () => {
    const {
      ProcessingRecordService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockProcessingCount.mockResolvedValue(0);
    mockProcessingCreate.mockResolvedValue({
      id: "pa-seeded",
      shopId: SHOP_ID,
      activityName: "Chat Conversation Storage",
      purpose: "p",
      legalBasis: "l",
      dataCategories: [],
      dataSubjects: [],
      retentionDays: 365,
      thirdParties: [],
      transferCountries: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await ProcessingRecordService.seedDefaultActivities(SHOP_ID);

    expect(mockProcessingCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId: SHOP_ID, isActive: true } }),
    );
    expect(mockProcessingCreate).toHaveBeenCalledTimes(3);
  });

  it("skips seeding when activities already exist on the delegate path", async () => {
    const {
      ProcessingRecordService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockProcessingCount.mockResolvedValue(2);

    await ProcessingRecordService.seedDefaultActivities(SHOP_ID);

    expect(mockProcessingCreate).not.toHaveBeenCalled();
  });
});

describe("BreachNotificationService — prisma delegate path", () => {
  it("computes reportedAt72h only when reported to authority with a reportedAt", async () => {
    const {
      BreachNotificationService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockBreachCreate.mockResolvedValue({
      id: "breach-1",
      shopId: SHOP_ID,
      detectedAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
      reportedAt: null,
      severity: "MEDIUM",
      description: "Delegate breach",
      affectedDataSubjects: 5,
      dataCategories: ["email"],
      mitigationTaken: "Monitored",
      reportedToAuthority: false,
      reportedAt72h: false,
    });

    const breach = await BreachNotificationService.register(SHOP_ID, {
      detectedAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
      severity: "MEDIUM",
      description: "Delegate breach",
      affectedDataSubjects: 5,
      dataCategories: ["email"],
      mitigationTaken: "Monitored",
      reportedToAuthority: true,
      reportedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      reportedAt72h: false,
    });

    expect(mockBreachCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reportedAt72h: true }) }),
    );
    expect(breach.id).toBe("breach-1");
  });

  it("registers CRITICAL breaches and logs them on the delegate path", async () => {
    const {
      BreachNotificationService,
    } = await import("../../../app/services/enterprise-compliance.server");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockBreachCreate.mockResolvedValue({
      id: "breach-2",
      shopId: SHOP_ID,
      detectedAt: new Date(),
      reportedAt: null,
      severity: "CRITICAL",
      description: "PII exposure",
      affectedDataSubjects: 1000,
      dataCategories: ["personal_data"],
      mitigationTaken: "Offline",
      reportedToAuthority: false,
      reportedAt72h: false,
    });

    await BreachNotificationService.register(SHOP_ID, {
      detectedAt: new Date(),
      severity: "CRITICAL",
      description: "PII exposure",
      affectedDataSubjects: 1000,
      dataCategories: ["personal_data"],
      mitigationTaken: "Offline",
      reportedToAuthority: false,
      reportedAt72h: false,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("CRITICAL BREACH detected"),
    );
    errorSpy.mockRestore();
  });

  it("maps rows through the findMany delegate", async () => {
    const {
      BreachNotificationService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockBreachFindMany.mockResolvedValue([
      {
        id: "breach-3",
        shopId: SHOP_ID,
        detectedAt: new Date(),
        reportedAt: new Date(),
        severity: "LOW",
        description: "d",
        affectedDataSubjects: 1,
        dataCategories: [],
        mitigationTaken: "m",
        reportedToAuthority: true,
        reportedAt72h: true,
      },
    ]);

    const breaches = await BreachNotificationService.getBreaches(SHOP_ID);

    expect(breaches).toHaveLength(1);
    expect(breaches[0].reportedToAuthority).toBe(true);
  });

  it("returns null when the breach is unknown on the delegate path", async () => {
    const {
      BreachNotificationService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockBreachFindFirst.mockResolvedValue(null);

    await expect(
      BreachNotificationService.markReported(SHOP_ID, "missing"),
    ).resolves.toBeNull();
    expect(mockBreachUpdate).not.toHaveBeenCalled();
  });

  it("marks an existing breach as reported through the update delegate", async () => {
    const {
      BreachNotificationService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockBreachFindFirst.mockResolvedValue({
      id: "breach-4",
      shopId: SHOP_ID,
      detectedAt: new Date(Date.now() - 1000),
    });
    mockBreachUpdate.mockResolvedValue({
      id: "breach-4",
      shopId: SHOP_ID,
      detectedAt: new Date(Date.now() - 1000),
      reportedAt: new Date(),
      severity: "LOW",
      description: "d",
      affectedDataSubjects: 1,
      dataCategories: [],
      mitigationTaken: "m",
      reportedToAuthority: true,
      reportedAt72h: true,
    });

    const updated = await BreachNotificationService.markReported(SHOP_ID, "breach-4");

    expect(mockBreachUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "breach-4" },
        data: expect.objectContaining({ reportedToAuthority: true }),
      }),
    );
    expect(updated?.reportedToAuthority).toBe(true);
  });
});

describe("LegalHoldService — guard rails", () => {
  it("hasActiveHold reflects the active hold count", async () => {
    const {
      LegalHoldService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockLegalHoldCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(LegalHoldService.hasActiveHold(SHOP_ID)).resolves.toBe(true);
    await expect(LegalHoldService.hasActiveHold(SHOP_ID)).resolves.toBe(false);
  });

  it("builds a deduplicated active scope set from held records", async () => {
    const {
      LegalHoldService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockLegalHoldFindMany.mockResolvedValue([
      makeLegalHoldRecord({ scope: ["CONVERSATIONS"] }),
      makeLegalHoldRecord({ id: "hold-2", scope: ["CONVERSATIONS", "AUDIT_LOGS"] }),
      makeLegalHoldRecord({ id: "hold-3", scope: ["NOT_A_SCOPE"] as never }),
    ]);

    const scopes = await LegalHoldService.getActiveScopeSet(SHOP_ID);

    expect(scopes.has("CONVERSATIONS")).toBe(true);
    expect(scopes.has("AUDIT_LOGS")).toBe(true);
    expect(scopes.has("ALL")).toBe(true);
  });

  it("returns null when releasing a hold owned by another shop", async () => {
    const {
      LegalHoldService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockLegalHoldFindUnique.mockResolvedValue({
      id: "hold-other",
      shopId: "another-shop.myshopify.com",
      releasedAt: null,
    });

    await expect(
      LegalHoldService.release(SHOP_ID, "hold-other", "admin"),
    ).resolves.toBeNull();
    expect(mockLegalHoldUpdate).not.toHaveBeenCalled();
  });

  it("returns null when releasing an already-released hold", async () => {
    const {
      LegalHoldService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockLegalHoldFindUnique.mockResolvedValue({
      id: "hold-released",
      shopId: SHOP_ID,
      releasedAt: new Date(),
    });

    await expect(
      LegalHoldService.release(SHOP_ID, "hold-released", "admin"),
    ).resolves.toBeNull();
  });
});

describe("ComplianceSIEMExportService — connector edge cases", () => {
  it("skips datadog dispatch when the API key is not configured", async () => {
    const {
      ComplianceSIEMExportService,
    } = await import("../../../app/services/enterprise-compliance.server");
    const exportResult = {
      exportId: "siem-1",
      shopId: SHOP_ID,
      generatedAt: new Date(),
      windowDays: 30,
      format: "ndjson" as const,
      eventCount: 1,
      content: JSON.stringify({ type: "compliance.audit.summary" }),
    };

    const result = await ComplianceSIEMExportService.dispatchToConnectors(exportResult, [
      "datadog",
    ]);

    expect(result.connectors[0].attempted).toBe(false);
    expect(result.connectors[0].error).toContain("SIEM_DATADOG_API_KEY");
  });

  it("skips splunk dispatch when the HEC URL is not configured", async () => {
    const {
      ComplianceSIEMExportService,
    } = await import("../../../app/services/enterprise-compliance.server");
    const exportResult = {
      exportId: "siem-1",
      shopId: SHOP_ID,
      generatedAt: new Date(),
      windowDays: 30,
      format: "ndjson" as const,
      eventCount: 1,
      content: JSON.stringify({ type: "compliance.audit.summary" }),
    };
    process.env.SIEM_DATADOG_API_KEY = "datadog-key";

    const result = await ComplianceSIEMExportService.dispatchToConnectors(exportResult, [
      "splunk",
    ]);

    expect(result.connectors[0].attempted).toBe(false);
    expect(result.connectors[0].error).toContain("SIEM_SPLUNK_HEC_URL");
  });

  it("records the status code when datadog responds non-ok", async () => {
    const {
      ComplianceSIEMExportService,
    } = await import("../../../app/services/enterprise-compliance.server");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "over capacity",
    });
    vi.stubGlobal("fetch", mockFetch);
    process.env.SIEM_DATADOG_API_KEY = "datadog-key";

    const exportResult = {
      exportId: "siem-1",
      shopId: SHOP_ID,
      generatedAt: new Date(),
      windowDays: 30,
      format: "ndjson" as const,
      eventCount: 1,
      content: JSON.stringify({ type: "compliance.audit.summary" }),
    };

    const result = await ComplianceSIEMExportService.dispatchToConnectors(exportResult, [
      "datadog",
    ]);

    expect(result.connectors[0].delivered).toBe(false);
    expect(result.connectors[0].statusCode).toBe(503);
    expect(result.connectors[0].error).toBe("over capacity");
    vi.unstubAllGlobals();
  });

  it("reports fetch failures as non-delivered attempts", async () => {
    const {
      ComplianceSIEMExportService,
    } = await import("../../../app/services/enterprise-compliance.server");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    process.env.SIEM_DATADOG_API_KEY = "datadog-key";

    const exportResult = {
      exportId: "siem-1",
      shopId: SHOP_ID,
      generatedAt: new Date(),
      windowDays: 30,
      format: "ndjson" as const,
      eventCount: 1,
      content: JSON.stringify({ type: "compliance.audit.summary" }),
    };

    const result = await ComplianceSIEMExportService.dispatchToConnectors(exportResult, [
      "datadog",
    ]);

    expect(result.connectors[0].attempted).toBe(true);
    expect(result.connectors[0].delivered).toBe(false);
    expect(result.connectors[0].error).toBe("ECONNREFUSED");
    vi.unstubAllGlobals();
  });

  it("handles malformed NDJSON lines as raw events on the splunk path", async () => {
    const {
      ComplianceSIEMExportService,
    } = await import("../../../app/services/enterprise-compliance.server");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    });
    vi.stubGlobal("fetch", mockFetch);
    process.env.SIEM_SPLUNK_HEC_URL = "https://splunk.example.com/collector";
    process.env.SIEM_SPLUNK_HEC_TOKEN = "token";

    const exportResult = {
      exportId: "siem-1",
      shopId: SHOP_ID,
      generatedAt: new Date(),
      windowDays: 30,
      format: "ndjson" as const,
      eventCount: 2,
      content: `${JSON.stringify({ type: "compliance.audit.summary" })}\n{not valid json`,
    };

    const result = await ComplianceSIEMExportService.dispatchToConnectors(exportResult, [
      "splunk",
    ]);

    expect(result.connectors[0].delivered).toBe(true);
    expect(result.connectors[0].ingestedEvents).toBe(2);
    const body = mockFetch.mock.calls[0][1].body as string;
    expect(body).toContain("compliance.raw_event");
    vi.unstubAllGlobals();
  });

  it("generateAndDispatch chains export generation with connector dispatch", async () => {
    const {
      ComplianceSIEMExportService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockConsentFindMany.mockResolvedValue([]);
    mockDataExportCount.mockResolvedValue(0);
    mockDeletionFindMany.mockResolvedValue([]);
    mockAuditLogCount.mockResolvedValue(0);
    mockDataResidencyFindUnique.mockResolvedValue(null);
    mockBreachFindMany.mockResolvedValue([]);
    mockDeploymentFindUnique.mockResolvedValue(null);
    mockLegalHoldFindMany.mockResolvedValue([]);
    process.env.SIEM_DATADOG_API_KEY = "datadog-key";

    const result = await ComplianceSIEMExportService.generateAndDispatch(SHOP_ID, 7, [
      "datadog",
    ]);

    expect(result.export.windowDays).toBe(7);
    expect(result.dispatch.connectors[0].connector).toBe("datadog");
  });

  it("caps and floors the window days for NDJSON exports", async () => {
    const {
      ComplianceSIEMExportService,
    } = await import("../../../app/services/enterprise-compliance.server");
    mockConsentFindMany.mockResolvedValue([]);
    mockDataExportCount.mockResolvedValue(0);
    mockDeletionFindMany.mockResolvedValue([]);
    mockAuditLogCount.mockResolvedValue(0);
    mockDataResidencyFindUnique.mockResolvedValue(null);
    mockBreachFindMany.mockResolvedValue([]);
    mockDeploymentFindUnique.mockResolvedValue(null);
    mockLegalHoldFindMany.mockResolvedValue([]);

    const huge = await ComplianceSIEMExportService.generateNDJSON(SHOP_ID, 999999);
    expect(huge.windowDays).toBe(3650);

    const tiny = await ComplianceSIEMExportService.generateNDJSON(SHOP_ID, -5);
    expect(tiny.windowDays).toBe(1);

    const invalid = await ComplianceSIEMExportService.generateNDJSON(SHOP_ID, Number.NaN);
    expect(invalid.windowDays).toBe(30);
  });
});

describe("RetentionEnforcementService — policy sanitization", () => {
  it("sanitizes non-positive and out-of-range retention days", async () => {
    const {
      RetentionEnforcementService,
    } = await import("../../../app/services/enterprise-compliance.server");

    const policy = RetentionEnforcementService.setPolicy(SHOP_ID, {
      conversationRetentionDays: 0,
      behaviorEventRetentionDays: -10,
      consentRecordRetentionDays: Number.NaN,
      auditLogRetentionDays: 999999,
    });

    expect(policy.conversationRetentionDays).toBe(365);
    expect(policy.behaviorEventRetentionDays).toBe(90);
    expect(policy.consentRecordRetentionDays).toBe(1825);
    expect(policy.auditLogRetentionDays).toBe(3650);
  });

  it("uses stored overrides when enforce receives an empty policy object", async () => {
    const {
      RetentionEnforcementService,
    } = await import("../../../app/services/enterprise-compliance.server");
    RetentionEnforcementService.setPolicy(SHOP_ID, {
      conversationRetentionDays: 15,
      behaviorEventRetentionDays: 7,
    });
    mockLegalHoldFindMany.mockResolvedValue([]);
    mockConversationDeleteMany.mockResolvedValue({ count: 3 });
    mockBehaviorEventDeleteMany.mockResolvedValue({ count: 4 });

    const result = await RetentionEnforcementService.enforce(SHOP_ID, {});

    expect(result.conversationsDeleted).toBe(3);
    expect(result.eventsDeleted).toBe(4);
  });
});
