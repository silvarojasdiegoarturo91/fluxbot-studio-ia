import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

vi.mock("../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../app/services/enterprise-compliance.server", () => ({
  AuditReportService: {
    generateReport: vi.fn(),
  },
  BreachNotificationService: {
    getBreaches: vi.fn(),
    register: vi.fn(),
    markReported: vi.fn(),
  },
  DataResidencyService: {
    getConfig: vi.fn(),
    setConfig: vi.fn(),
  },
  ComplianceSIEMExportService: {
    generateNDJSON: vi.fn(),
    dispatchToConnectors: vi.fn(),
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
    getAllowedRegions: vi.fn(),
  },
  RetentionEnforcementService: {
    enforce: vi.fn(),
    getPolicy: vi.fn(),
  },
  SupportAgentAccessService: {
    getActiveTokenCount: vi.fn(),
    createToken: vi.fn(),
  },
}));

import { authenticate } from "../../app/shopify.server";
import prisma from "../../app/db.server";
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
import { action, loader } from "../../app/routes/api.compliance.enterprise";

describe("Enterprise Compliance API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(authenticate.admin).mockResolvedValue({
      session: { shop: "enterprise-shop.myshopify.com" },
    } as any);

    vi.mocked(prisma.shop.findUnique).mockResolvedValue({
      id: "shop-enterprise-1",
      domain: "enterprise-shop.myshopify.com",
      name: "Enterprise Shop",
      status: "ACTIVE",
    } as any);

    vi.mocked(RegionalDeploymentControlService.getConfig).mockReturnValue({
      shopId: "shop-enterprise-1",
      primaryRegion: "GLOBAL",
      failoverRegions: [],
      strictIsolation: false,
      piiRestrictedToPrimary: false,
      updatedAt: new Date(),
    } as any);
    vi.mocked(LegalHoldService.list).mockReturnValue([] as any);
    vi.mocked(LegalHoldService.getActiveHoldCount).mockReturnValue(0);
    vi.mocked(RetentionEnforcementService.getPolicy).mockReturnValue({
      shopId: "shop-enterprise-1",
      conversationRetentionDays: 365,
      behaviorEventRetentionDays: 90,
      consentRecordRetentionDays: 1825,
      auditLogRetentionDays: 2555,
    } as any);
  });

  it("loader returns compliance snapshot", async () => {
    vi.mocked(ProcessingRecordService.getActivities)
      .mockReturnValueOnce([] as any)
      .mockReturnValueOnce([
        {
          id: "pa-1",
          activityName: "Chat Processing",
          purpose: "Support",
          legalBasis: "Legitimate interest",
          retentionDays: 365,
        },
      ] as any);

    vi.mocked(AuditReportService.generateReport).mockResolvedValue({
      shopId: "shop-enterprise-1",
      generatedAt: new Date(),
      period: { from: new Date(), to: new Date() },
      totalConsentEvents: 10,
      consentBreakdown: { ANALYTICS: 10 },
      dataExportRequests: 2,
      dataDeletionRequests: 1,
      deletedRecords: 100,
      auditLogEntries: 50,
      processingActivities: [],
    } as any);

    vi.mocked(DataResidencyService.getConfig).mockReturnValue({
      shopId: "shop-enterprise-1",
      region: "EU",
      enforced: true,
      enforcedCountries: ["DE", "FR"],
      updatedAt: new Date(),
    } as any);

    vi.mocked(BreachNotificationService.getBreaches).mockReturnValue([] as any);
    vi.mocked(SupportAgentAccessService.getActiveTokenCount).mockReturnValue(2);

    const response = await loader({
      request: new Request("http://localhost/api/compliance/enterprise?days=365"),
      params: {},
      context: {},
    } as any);

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.shop.id).toBe("shop-enterprise-1");
    expect(data.report.totalConsentEvents).toBe(10);
    expect(data.residencyConfig.region).toBe("EU");
    expect(data.activeSupportTokens).toBe(2);
    expect(data.activeLegalHolds).toBe(0);
    expect(ProcessingRecordService.seedDefaultActivities).toHaveBeenCalledWith("shop-enterprise-1");
  });

  it("action set_residency updates residency config", async () => {
    vi.mocked(DataResidencyService.setConfig).mockReturnValue({
      shopId: "shop-enterprise-1",
      region: "US",
      enforced: true,
      enforcedCountries: ["US"],
      updatedAt: new Date(),
    } as any);

    const request = new Request("http://localhost/api/compliance/enterprise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_residency",
        region: "US",
        enforcedCountries: ["US"],
      }),
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(DataResidencyService.setConfig).toHaveBeenCalledWith(
      "shop-enterprise-1",
      "US",
      ["US"]
    );
  });

  it("action create_support_token validates required agentId", async () => {
    const request = new Request("http://localhost/api/compliance/enterprise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_support_token",
      }),
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("agentId");
  });

  it("action enforce_retention executes retention run", async () => {
    vi.mocked(RetentionEnforcementService.enforce).mockResolvedValue({
      conversationsDeleted: 12,
      eventsDeleted: 40,
    } as any);

    const request = new Request("http://localhost/api/compliance/enterprise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "enforce_retention",
        policy: {
          conversationRetentionDays: 60,
          behaviorEventRetentionDays: 30,
        },
      }),
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.result.conversationsDeleted).toBe(12);
    expect(RetentionEnforcementService.enforce).toHaveBeenCalledWith("shop-enterprise-1", {
      conversationRetentionDays: 60,
      behaviorEventRetentionDays: 30,
    });
  });

  it("action set_deployment_control updates deployment config", async () => {
    vi.mocked(RegionalDeploymentControlService.setConfig).mockReturnValue({
      shopId: "shop-enterprise-1",
      primaryRegion: "EU",
      failoverRegions: ["US"],
      strictIsolation: true,
      piiRestrictedToPrimary: true,
      updatedAt: new Date(),
    } as any);
    vi.mocked(RegionalDeploymentControlService.getAllowedRegions).mockReturnValue(["EU", "US"] as any);

    const request = new Request("http://localhost/api/compliance/enterprise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_deployment_control",
        deployment: {
          primaryRegion: "EU",
          failoverRegions: ["US"],
          strictIsolation: true,
          piiRestrictedToPrimary: true,
        },
      }),
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.allowedRegions).toEqual(["EU", "US"]);
  });

  it("action create_legal_hold creates a legal hold", async () => {
    vi.mocked(LegalHoldService.create).mockReturnValue({
      id: "hold-1",
      shopId: "shop-enterprise-1",
      title: "Regulatory case",
      reason: "Preserve records",
      scope: ["ALL"],
      placedBy: "admin",
      placedAt: new Date(),
    } as any);

    const request = new Request("http://localhost/api/compliance/enterprise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_legal_hold",
        legalHold: {
          title: "Regulatory case",
          reason: "Preserve records",
          scope: ["ALL"],
        },
      }),
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.hold.id).toBe("hold-1");
  });

  it("action release_legal_hold releases hold by id", async () => {
    vi.mocked(LegalHoldService.release).mockReturnValue({
      id: "hold-1",
      shopId: "shop-enterprise-1",
      title: "Regulatory case",
      reason: "Preserve records",
      scope: ["ALL"],
      placedBy: "admin",
      placedAt: new Date(),
      releasedAt: new Date(),
      releasedBy: "admin",
    } as any);

    const request = new Request("http://localhost/api/compliance/enterprise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "release_legal_hold",
        holdId: "hold-1",
      }),
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.hold.id).toBe("hold-1");
  });

  it("action export_siem_ndjson returns export metadata", async () => {
    vi.mocked(ComplianceSIEMExportService.generateNDJSON).mockResolvedValue({
      exportId: "siem_export_1",
      shopId: "shop-enterprise-1",
      generatedAt: new Date(),
      windowDays: 30,
      format: "ndjson",
      eventCount: 12,
      content: "{}",
    } as any);

    const request = new Request("http://localhost/api/compliance/enterprise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "export_siem_ndjson",
        windowDays: 30,
        includeContent: false,
      }),
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.export.exportId).toBe("siem_export_1");
    expect(data.export.eventCount).toBe(12);
    expect(data.export.content).toBeUndefined();
  });

  it("action export_siem_ndjson dispatches to connectors when requested", async () => {
    vi.mocked(ComplianceSIEMExportService.generateNDJSON).mockResolvedValue({
      exportId: "siem_export_2",
      shopId: "shop-enterprise-1",
      generatedAt: new Date(),
      windowDays: 14,
      format: "ndjson",
      eventCount: 5,
      content: "{}",
    } as any);
    vi.mocked(ComplianceSIEMExportService.dispatchToConnectors).mockResolvedValue({
      exportId: "siem_export_2",
      shopId: "shop-enterprise-1",
      generatedAt: new Date(),
      connectors: [
        {
          connector: "datadog",
          attempted: true,
          delivered: true,
          statusCode: 200,
          ingestedEvents: 5,
        },
      ],
    } as any);

    const request = new Request("http://localhost/api/compliance/enterprise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "export_siem_ndjson",
        windowDays: 14,
        includeContent: false,
        dispatchConnectors: true,
        connectors: ["datadog"],
      }),
    });

    const response = await action({ request, params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.dispatch.connectors).toHaveLength(1);
    expect(ComplianceSIEMExportService.dispatchToConnectors).toHaveBeenCalledOnce();
  });
});
