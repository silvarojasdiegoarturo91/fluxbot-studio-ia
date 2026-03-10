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
  ProcessingRecordService: {
    getActivities: vi.fn(),
    seedDefaultActivities: vi.fn(),
  },
  RetentionEnforcementService: {
    enforce: vi.fn(),
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
  DataResidencyService,
  ProcessingRecordService,
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
});
