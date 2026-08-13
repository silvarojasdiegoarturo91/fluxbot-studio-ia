import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../app/shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

vi.mock("../../../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../../app/services/enterprise-compliance.server", () => ({
  AuditReportService: { generateReport: vi.fn() },
  BreachNotificationService: {
    getBreaches: vi.fn(),
    register: vi.fn(),
    markReported: vi.fn(),
  },
  DataResidencyService: { getConfig: vi.fn(), setConfig: vi.fn() },
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
  RetentionEnforcementService: { enforce: vi.fn(), getPolicy: vi.fn() },
  SupportAgentAccessService: {
    getActiveTokenCount: vi.fn(),
    createToken: vi.fn(),
  },
}));

import { authenticate } from "../../../app/shopify.server";
import prisma from "../../../app/db.server";
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
} from "../../../app/services/enterprise-compliance.server";
import { action, loader } from "../../../app/routes/api.compliance.enterprise";

const SHOP = { id: "shop-enterprise-1", domain: "enterprise-shop.myshopify.com", status: "ACTIVE" };

function makeRequest(body: unknown, method = "POST") {
  return new Request("http://localhost/api/compliance/enterprise", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function runAction(body: unknown) {
  const response = await action({ request: makeRequest(body), params: {}, context: {} } as never);
  return { response, data: await response.json() };
}

describe("api.compliance.enterprise route — extended coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticate.admin).mockResolvedValue({
      session: { shop: "enterprise-shop.myshopify.com" },
    } as never);
    vi.mocked(prisma.shop.findUnique).mockResolvedValue(SHOP as never);
    vi.mocked(RegionalDeploymentControlService.getConfig).mockResolvedValue({
      shopId: SHOP.id,
      primaryRegion: "GLOBAL",
      failoverRegions: [],
      strictIsolation: false,
      piiRestrictedToPrimary: false,
      updatedAt: new Date(),
    } as never);
    vi.mocked(LegalHoldService.list).mockResolvedValue([] as never);
    vi.mocked(LegalHoldService.getActiveHoldCount).mockResolvedValue(0 as never);
    vi.mocked(RetentionEnforcementService.getPolicy).mockReturnValue({
      shopId: SHOP.id,
      conversationRetentionDays: 365,
      behaviorEventRetentionDays: 90,
      consentRecordRetentionDays: 1825,
      auditLogRetentionDays: 2555,
    } as never);
    vi.mocked(AuditReportService.generateReport).mockResolvedValue({
      shopId: SHOP.id,
      generatedAt: new Date(),
      period: { from: new Date(), to: new Date() },
      totalConsentEvents: 0,
      consentBreakdown: {},
      dataExportRequests: 0,
      dataDeletionRequests: 0,
      deletedRecords: 0,
      auditLogEntries: 0,
      processingActivities: [],
    } as never);
    vi.mocked(DataResidencyService.getConfig).mockResolvedValue({
      shopId: SHOP.id,
      region: "GLOBAL",
      enforced: false,
      enforcedCountries: [],
      updatedAt: new Date(),
    } as never);
    vi.mocked(BreachNotificationService.getBreaches).mockResolvedValue([] as never);
    vi.mocked(SupportAgentAccessService.getActiveTokenCount).mockReturnValue(0);
  });

  it("loader does not reseed when processing activities already exist", async () => {
    vi.mocked(ProcessingRecordService.getActivities).mockResolvedValue([
      { id: "pa-1", activityName: "Existing" },
    ] as never);

    const response = await loader({
      request: new Request("http://localhost/api/compliance/enterprise?days=30"),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    expect(ProcessingRecordService.seedDefaultActivities).not.toHaveBeenCalled();
  });

  it("loader rejects the request with 500 when the shop cannot be resolved", async () => {
    vi.mocked(prisma.shop.findUnique).mockResolvedValue(null as never);

    const response = await loader({
      request: new Request("http://localhost/api/compliance/enterprise"),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Shop not found");
  });

  it("loader surfaces authentication failures as a 500", async () => {
    vi.mocked(authenticate.admin).mockRejectedValue(new Error("token invalid"));

    const response = await loader({
      request: new Request("http://localhost/api/compliance/enterprise"),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("token invalid");
  });

  it("rejects non-POST requests with 405", async () => {
    const request = new Request("http://localhost/api/compliance/enterprise", { method: "GET" });
    const response = await action({ request, params: {}, context: {} } as never);

    expect(response.status).toBe(405);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it("set_residency requires a region", async () => {
    const { response, data } = await runAction({ action: "set_residency" });

    expect(response.status).toBe(400);
    expect(data.error).toBe("region is required");
  });

  it("seed_processing_activities returns the seeded count", async () => {
    vi.mocked(ProcessingRecordService.getActivities).mockResolvedValue([
      { id: "a1" },
      { id: "a2" },
    ] as never);

    const { response, data } = await runAction({ action: "seed_processing_activities" });

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.count).toBe(2);
    expect(ProcessingRecordService.seedDefaultActivities).toHaveBeenCalledWith(SHOP.id);
  });

  it("create_support_token defaults scope when none is provided", async () => {
    vi.mocked(SupportAgentAccessService.createToken).mockReturnValue({
      token: "tok-1",
      shopId: SHOP.id,
      agentId: "agent-9",
      scope: ["read:conversations"],
      expiresAt: new Date(Date.now() + 1000),
      createdAt: new Date(),
    } as never);

    const { response, data } = await runAction({
      action: "create_support_token",
      agentId: "agent-9",
    });

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(SupportAgentAccessService.createToken).toHaveBeenCalledWith(
      SHOP.id,
      "agent-9",
      ["read:conversations"],
      undefined,
    );
  });

  it("create_support_token forwards custom scope and ttl", async () => {
    vi.mocked(SupportAgentAccessService.createToken).mockReturnValue({
      token: "tok-2",
      shopId: SHOP.id,
      agentId: "agent-9",
      scope: ["read:orders"],
      expiresAt: new Date(),
      createdAt: new Date(),
    } as never);

    await runAction({
      action: "create_support_token",
      agentId: "agent-9",
      scope: ["read:orders"],
      ttlMs: 3600000,
    });

    expect(SupportAgentAccessService.createToken).toHaveBeenCalledWith(
      SHOP.id,
      "agent-9",
      ["read:orders"],
      3600000,
    );
  });

  it("register_breach requires severity and description", async () => {
    const { response } = await runAction({ action: "register_breach", breach: { severity: "HIGH" } });
    expect(response.status).toBe(400);

    const missingSeverity = await runAction({ action: "register_breach", breach: { description: "x" } });
    expect(missingSeverity.response.status).toBe(400);
  });

  it("register_breach registers a breach with defaults", async () => {
    vi.mocked(BreachNotificationService.register).mockResolvedValue({
      id: "breach-new",
      shopId: SHOP.id,
      severity: "HIGH",
      description: "Unauthorized access",
      detectedAt: new Date(),
      affectedDataSubjects: 0,
      dataCategories: [],
      mitigationTaken: "Investigation in progress",
      reportedToAuthority: false,
      reportedAt72h: false,
    } as never);

    const { response, data } = await runAction({
      action: "register_breach",
      breach: { severity: "HIGH", description: "Unauthorized access" },
    });

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(BreachNotificationService.register).toHaveBeenCalledWith(
      SHOP.id,
      expect.objectContaining({
        severity: "HIGH",
        description: "Unauthorized access",
        affectedDataSubjects: 0,
        dataCategories: [],
      }),
    );
  });

  it("mark_breach_reported requires a breachId", async () => {
    const { response } = await runAction({ action: "mark_breach_reported" });
    expect(response.status).toBe(400);
  });

  it("mark_breach_reported returns 404 for unknown breaches", async () => {
    vi.mocked(BreachNotificationService.markReported).mockResolvedValue(null as never);

    const { response } = await runAction({ action: "mark_breach_reported", breachId: "missing" });
    expect(response.status).toBe(404);
  });

  it("mark_breach_reported confirms a reported breach", async () => {
    vi.mocked(BreachNotificationService.markReported).mockResolvedValue({
      id: "breach-1",
      shopId: SHOP.id,
      severity: "LOW",
      description: "d",
      detectedAt: new Date(),
      reportedAt: new Date(),
      affectedDataSubjects: 0,
      dataCategories: [],
      mitigationTaken: "m",
      reportedToAuthority: true,
      reportedAt72h: true,
    } as never);

    const { response, data } = await runAction({ action: "mark_breach_reported", breachId: "breach-1" });

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(BreachNotificationService.markReported).toHaveBeenCalledWith(SHOP.id, "breach-1");
  });

  it("create_legal_hold requires title and reason", async () => {
    const { response } = await runAction({ action: "create_legal_hold", legalHold: { title: "Only title" } });
    expect(response.status).toBe(400);
  });

  it("create_legal_hold filters invalid scopes and defaults placedBy", async () => {
    vi.mocked(LegalHoldService.create).mockResolvedValue({
      id: "hold-1",
      shopId: SHOP.id,
      title: "Case",
      reason: "Reason",
      scope: ["CONVERSATIONS"],
      placedBy: "admin",
      placedAt: new Date(),
    } as never);

    const { response, data } = await runAction({
      action: "create_legal_hold",
      legalHold: {
        title: "Case",
        reason: "Reason",
        scope: ["CONVERSATIONS", "NOT_VALID" as never],
      },
    });

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(LegalHoldService.create).toHaveBeenCalledWith(
      SHOP.id,
      expect.objectContaining({
        title: "Case",
        scope: ["CONVERSATIONS"],
        placedBy: "admin",
      }),
    );
  });

  it("release_legal_hold requires a holdId", async () => {
    const { response } = await runAction({ action: "release_legal_hold" });
    expect(response.status).toBe(400);
  });

  it("release_legal_hold returns 404 when the hold is not found", async () => {
    vi.mocked(LegalHoldService.release).mockResolvedValue(null as never);

    const { response } = await runAction({ action: "release_legal_hold", holdId: "missing" });
    expect(response.status).toBe(404);
  });

  it("release_legal_hold releases an existing hold", async () => {
    vi.mocked(LegalHoldService.release).mockResolvedValue({
      id: "hold-1",
      shopId: SHOP.id,
      title: "Case",
      reason: "Reason",
      scope: ["ALL"],
      placedBy: "admin",
      placedAt: new Date(),
      releasedAt: new Date(),
      releasedBy: "admin",
    } as never);

    const { response, data } = await runAction({
      action: "release_legal_hold",
      holdId: "hold-1",
      releaseReason: "Resolved",
    });

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(LegalHoldService.release).toHaveBeenCalledWith(SHOP.id, "hold-1", "admin", "Resolved");
  });

  it("export_siem_ndjson returns full content by default", async () => {
    vi.mocked(ComplianceSIEMExportService.generateNDJSON).mockResolvedValue({
      exportId: "siem-1",
      shopId: SHOP.id,
      generatedAt: new Date(),
      windowDays: 30,
      format: "ndjson",
      eventCount: 3,
      content: '{"a":1}',
    } as never);

    const { response, data } = await runAction({ action: "export_siem_ndjson" });

    expect(response.status).toBe(200);
    expect(data.export.content).toBe('{"a":1}');
  });

  it("returns 400 for unsupported actions", async () => {
    const { response, data } = await runAction({ action: "nuke_everything" });

    expect(response.status).toBe(400);
    expect(data.error).toBe("Unsupported action");
  });

  it("surfaces service failures as a 500", async () => {
    vi.mocked(DataResidencyService.setConfig).mockRejectedValue(new Error("db down"));

    const { response, data } = await runAction({
      action: "set_residency",
      region: "EU",
    });

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe("db down");
  });

  it("handles malformed JSON bodies with a 500", async () => {
    const request = new Request("http://localhost/api/compliance/enterprise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });

    const response = await action({ request, params: {}, context: {} } as never);

    expect(response.status).toBe(500);
  });
});
