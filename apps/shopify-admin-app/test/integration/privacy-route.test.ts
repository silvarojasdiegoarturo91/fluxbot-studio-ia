import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: vi.fn(),
}));

vi.mock("../../app/services/shop-context.server", () => ({
  ensureShopForSession: vi.fn(),
}));

vi.mock("../../app/services/admin-config.server", () => ({
  getMerchantAdminConfig: vi.fn(),
}));

vi.mock("../../app/services/delivery.server", () => ({
  getDeliveryStatus: vi.fn(),
}));

vi.mock("../../app/jobs/scheduler.server", () => ({
  getProactiveJobSchedulerStats: vi.fn(),
}));

vi.mock("../../app/services/enterprise-compliance.server", () => ({
  AuditReportService: {
    generateReport: vi.fn(),
  },
  BreachNotificationService: {
    getBreaches: vi.fn(),
  },
  ComplianceSIEMExportService: {
    generateNDJSON: vi.fn(),
    dispatchToConnectors: vi.fn(),
  },
  DataResidencyService: {
    getConfig: vi.fn(),
    setConfig: vi.fn(),
  },
  LegalHoldService: {
    list: vi.fn(),
    getActiveHoldCount: vi.fn(),
    create: vi.fn(),
    release: vi.fn(),
  },
  ProcessingRecordService: {
    getActivities: vi.fn(),
    seedDefaultActivities: vi.fn(),
  },
  RegionalDeploymentControlService: {
    getConfig: vi.fn(),
    setConfig: vi.fn(),
  },
  RetentionEnforcementService: {
    getPolicy: vi.fn(),
    setPolicy: vi.fn(),
    enforce: vi.fn(),
  },
  SupportAgentAccessService: {
    getActiveTokenCount: vi.fn(),
  },
}));

import { authenticateAdminRequest } from "../../app/utils/authenticate-admin.server";
import { ensureShopForSession } from "../../app/services/shop-context.server";
import { getMerchantAdminConfig } from "../../app/services/admin-config.server";
import { getDeliveryStatus } from "../../app/services/delivery.server";
import { getProactiveJobSchedulerStats } from "../../app/jobs/scheduler.server";
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
} from "../../app/services/enterprise-compliance.server";

const mockAuthenticateAdminRequest = vi.mocked(authenticateAdminRequest);
const mockEnsureShopForSession = vi.mocked(ensureShopForSession);
const mockGetMerchantAdminConfig = vi.mocked(getMerchantAdminConfig);
const mockGetDeliveryStatus = vi.mocked(getDeliveryStatus);
const mockGetProactiveJobSchedulerStats = vi.mocked(getProactiveJobSchedulerStats);
const mockAuditReportService = vi.mocked(AuditReportService);
const mockBreachNotificationService = vi.mocked(BreachNotificationService);
const mockComplianceSIEMExportService = vi.mocked(ComplianceSIEMExportService);
const mockDataResidencyService = vi.mocked(DataResidencyService);
const mockLegalHoldService = vi.mocked(LegalHoldService);
const mockProcessingRecordService = vi.mocked(ProcessingRecordService);
const mockRegionalDeploymentControlService = vi.mocked(RegionalDeploymentControlService);
const mockRetentionEnforcementService = vi.mocked(RetentionEnforcementService);
const mockSupportAgentAccessService = vi.mocked(SupportAgentAccessService);

function makePostRequest(fields: Record<string, string>) {
  return new Request("http://localhost/app/privacy?days=30", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("app.privacy route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthenticateAdminRequest.mockResolvedValue({
      session: { shop: "privacy-shop.myshopify.com" },
    } as any);
    mockEnsureShopForSession.mockResolvedValue({
      id: "shop-privacy",
      domain: "privacy-shop.myshopify.com",
    } as any);
    mockGetMerchantAdminConfig.mockResolvedValue({
      adminLanguage: "en",
    } as any);
    mockGetDeliveryStatus.mockReturnValue({ delivered: true } as any);
    mockGetProactiveJobSchedulerStats.mockReturnValue({
      isRunning: { retention: true },
      retention: { lastRunAt: new Date("2026-01-01T00:00:00.000Z") },
    } as any);

    mockProcessingRecordService.getActivities
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "activity-1", type: "EXPORT" }] as any);
    mockProcessingRecordService.seedDefaultActivities.mockResolvedValue(undefined);

    mockAuditReportService.generateReport.mockResolvedValue({
      totalConsentEvents: 10,
      auditLogEntries: 5,
      dataExportRequests: 2,
      dataDeletionRequests: 1,
      consentBreakdown: { consent_granted: 7, consent_revoked: 3 },
    } as any);
    mockDataResidencyService.getConfig.mockResolvedValue({
      region: "GLOBAL",
      enforced: false,
      enforcedCountries: [],
    } as any);
    mockBreachNotificationService.getBreaches.mockResolvedValue([] as any);
    mockRetentionEnforcementService.getPolicy.mockReturnValue({
      conversationRetentionDays: 365,
      behaviorEventRetentionDays: 90,
    } as any);
    mockRegionalDeploymentControlService.getConfig.mockResolvedValue({
      primaryRegion: "GLOBAL",
      failoverRegions: [],
      strictIsolation: false,
      piiRestrictedToPrimary: false,
    } as any);
    mockLegalHoldService.list.mockResolvedValue([] as any);
    mockLegalHoldService.getActiveHoldCount.mockResolvedValue(0 as any);
    mockSupportAgentAccessService.getActiveTokenCount.mockReturnValue(3 as any);
  });

  it("loads a privacy and compliance snapshot and seeds missing processing activities", async () => {
    const { loader } = await import("../../app/routes/app.privacy");
    const data = await loader({ request: new Request("http://localhost/app/privacy?days=14") } as any);

    expect(data.shop.id).toBe("shop-privacy");
    expect(data.days).toBe(14);
    expect(data.report.totalConsentEvents).toBe(10);
    expect(data.processingActivities).toHaveLength(1);
    expect(mockProcessingRecordService.seedDefaultActivities).toHaveBeenCalledWith("shop-privacy");
    expect(data.activeSupportTokens).toBe(3);
  });

  it("updates residency, retention and deployment controls", async () => {
    const { action } = await import("../../app/routes/app.privacy");

    const residency = await action({
      request: makePostRequest({
        intent: "set_residency",
        region: "EU",
        enforcedCountries: "DE, FR",
      }),
    } as any);
    expect(residency).toEqual({
      ok: true,
      message: "Data residency policy updated.",
    });
    expect(mockDataResidencyService.setConfig).toHaveBeenCalledWith("shop-privacy", "EU", ["DE", "FR"]);

    const retention = await action({
      request: makePostRequest({
        intent: "set_retention_policy",
        conversationRetentionDays: "180",
        behaviorEventRetentionDays: "30",
      }),
    } as any);
    expect(retention).toEqual({
      ok: true,
      message: "Retention policy updated.",
    });
    expect(mockRetentionEnforcementService.setPolicy).toHaveBeenCalledWith("shop-privacy", {
      conversationRetentionDays: 180,
      behaviorEventRetentionDays: 30,
    });

    const deployment = await action({
      request: makePostRequest({
        intent: "set_deployment_control",
        primaryRegion: "US",
        failoverRegions: "EU, US, APAC",
        strictIsolation: "true",
        piiRestrictedToPrimary: "true",
      }),
    } as any);
    expect(deployment).toEqual({
      ok: true,
      message: "Regional deployment controls updated.",
    });
    expect(mockRegionalDeploymentControlService.setConfig).toHaveBeenCalledWith("shop-privacy", {
      primaryRegion: "US",
      failoverRegions: ["EU", "APAC"],
      strictIsolation: true,
      piiRestrictedToPrimary: true,
    });
  });

  it("runs retention and processing refresh actions", async () => {
    const { action } = await import("../../app/routes/app.privacy");

    mockRetentionEnforcementService.enforce.mockResolvedValue({
      conversationsDeleted: 2,
      eventsDeleted: 5,
      skipped: false,
    } as any);

    const retentionRun = await action({
      request: makePostRequest({
        intent: "run_retention_now",
      }),
    } as any);
    expect(retentionRun).toEqual({
      ok: true,
      message: "Retention run completed. Conversations deleted: 2, events deleted: 5.",
    });
    expect(mockRetentionEnforcementService.enforce).toHaveBeenCalledWith("shop-privacy");

    const seed = await action({
      request: makePostRequest({
        intent: "seed_processing_activities",
      }),
    } as any);
    expect(seed).toEqual({
      ok: true,
      message: "Default processing activities seeded.",
    });
    expect(mockProcessingRecordService.seedDefaultActivities).toHaveBeenCalledWith("shop-privacy");
  });

  it("creates, releases and exports compliance artifacts", async () => {
    const { action } = await import("../../app/routes/app.privacy");

    mockLegalHoldService.create.mockResolvedValue({ id: "hold-1" } as any);
    mockLegalHoldService.release.mockResolvedValue(true as any);
    mockComplianceSIEMExportService.generateNDJSON.mockResolvedValue({
      exportId: "export-1",
      generatedAt: new Date("2026-01-02T00:00:00.000Z"),
      windowDays: 30,
      eventCount: 12,
    } as any);
    mockComplianceSIEMExportService.dispatchToConnectors.mockResolvedValue({
      connectors: [
        { connector: "datadog", attempted: true, delivered: true, statusCode: 200, ingestedEvents: 12 },
        { connector: "splunk", attempted: true, delivered: false, statusCode: 503, error: "down" },
      ],
    } as any);

    const legalHold = await action({
      request: makePostRequest({
        intent: "create_legal_hold",
        holdTitle: "Regulatory review",
        holdReason: "External audit",
        holdScope: "ALL",
        holdExpiresAt: "2026-12-31T23:59:59.000Z",
      }),
    } as any);
    expect(legalHold).toEqual({
      ok: true,
      message: "Legal hold created.",
    });
    expect(mockLegalHoldService.create).toHaveBeenCalledWith("shop-privacy", {
      title: "Regulatory review",
      reason: "External audit",
      scope: ["ALL"],
      placedBy: "admin",
      expiresAt: new Date("2026-12-31T23:59:59.000Z"),
    });

    const release = await action({
      request: makePostRequest({
        intent: "release_legal_hold",
        holdId: "hold-1",
      }),
    } as any);
    expect(release).toEqual({
      ok: true,
      message: "Legal hold released.",
    });
    expect(mockLegalHoldService.release).toHaveBeenCalledWith(
      "shop-privacy",
      "hold-1",
      "admin",
      "Manual release from admin UI",
    );

    const exportResult = await action({
      request: makePostRequest({
        intent: "export_siem",
        siemWindowDays: "45",
        dispatchConnectors: "true",
        siemConnectors: "datadog,splunk",
      }),
    } as any);

    expect(exportResult.ok).toBe(true);
    expect(exportResult.siemExport).toEqual({
      exportId: "export-1",
      generatedAt: "2026-01-02T00:00:00.000Z",
      windowDays: 30,
      eventCount: 12,
    });
    expect(mockComplianceSIEMExportService.generateNDJSON).toHaveBeenCalledWith("shop-privacy", 45);
    expect(mockComplianceSIEMExportService.dispatchToConnectors).toHaveBeenCalledWith(
      expect.objectContaining({ exportId: "export-1" }),
      ["datadog", "splunk"],
    );
  });

  it("rejects invalid compliance input and unsupported actions", async () => {
    const { action } = await import("../../app/routes/app.privacy");

    const invalidResidency = await action({
      request: makePostRequest({
        intent: "set_residency",
        region: "MARS",
      }),
    } as any);
    expect(invalidResidency).toEqual({ ok: false, error: "Invalid region" });

    const invalidHoldDate = await action({
      request: makePostRequest({
        intent: "create_legal_hold",
        holdTitle: "Hold",
        holdReason: "Reason",
        holdScope: "ALL",
        holdExpiresAt: "not-a-date",
      }),
    } as any);
    expect(invalidHoldDate).toEqual({ ok: false, error: "Invalid legal hold expiration date." });

    const missingHoldId = await action({
      request: makePostRequest({
        intent: "release_legal_hold",
        holdId: "",
      }),
    } as any);
    expect(missingHoldId).toEqual({ ok: false, error: "Missing legal hold ID" });

    const unsupported = await action({
      request: makePostRequest({
        intent: "unsupported",
      }),
    } as any);
    expect(unsupported).toEqual({ ok: false, error: "Unsupported action" });
  });
});
