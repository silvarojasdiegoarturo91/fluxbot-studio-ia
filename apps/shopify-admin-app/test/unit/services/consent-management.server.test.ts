import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuditLogCreate,
  mockConsentRecordCreate,
  mockConsentRecordFindMany,
  mockDataExportJobCreate,
  mockDataExportJobFindUnique,
  mockDataExportJobUpdate,
  mockDataExportJobDeleteMany,
  mockDataExportJobCount,
  mockDataDeletionJobCreate,
  mockDataDeletionJobFindUnique,
  mockDataDeletionJobUpdate,
  mockDataDeletionJobCount,
  mockConversationFindMany,
  mockConversationDeleteMany,
  mockBehaviorEventFindMany,
  mockBehaviorEventDeleteMany,
  mockIntentSignalDeleteMany,
  mockHandoffRequestDeleteMany,
  mockShopFindUnique,
} = vi.hoisted(() => ({
  mockAuditLogCreate: vi.fn(),
  mockConsentRecordCreate: vi.fn(),
  mockConsentRecordFindMany: vi.fn(),
  mockDataExportJobCreate: vi.fn(),
  mockDataExportJobFindUnique: vi.fn(),
  mockDataExportJobUpdate: vi.fn(),
  mockDataExportJobDeleteMany: vi.fn(),
  mockDataExportJobCount: vi.fn(),
  mockDataDeletionJobCreate: vi.fn(),
  mockDataDeletionJobFindUnique: vi.fn(),
  mockDataDeletionJobUpdate: vi.fn(),
  mockDataDeletionJobCount: vi.fn(),
  mockConversationFindMany: vi.fn(),
  mockConversationDeleteMany: vi.fn(),
  mockBehaviorEventFindMany: vi.fn(),
  mockBehaviorEventDeleteMany: vi.fn(),
  mockIntentSignalDeleteMany: vi.fn(),
  mockHandoffRequestDeleteMany: vi.fn(),
  mockShopFindUnique: vi.fn(),
}));

vi.mock("../../../app/db.server", () => ({
  default: {
    auditLog: { create: mockAuditLogCreate },
    consentRecord: {
      create: mockConsentRecordCreate,
      findMany: mockConsentRecordFindMany,
    },
    dataExportJob: {
      create: mockDataExportJobCreate,
      findUnique: mockDataExportJobFindUnique,
      update: mockDataExportJobUpdate,
      deleteMany: mockDataExportJobDeleteMany,
      count: mockDataExportJobCount,
    },
    dataDeletionJob: {
      create: mockDataDeletionJobCreate,
      findUnique: mockDataDeletionJobFindUnique,
      update: mockDataDeletionJobUpdate,
      count: mockDataDeletionJobCount,
    },
    conversation: {
      findMany: mockConversationFindMany,
      deleteMany: mockConversationDeleteMany,
    },
    behaviorEvent: {
      findMany: mockBehaviorEventFindMany,
      deleteMany: mockBehaviorEventDeleteMany,
    },
    intentSignal: { deleteMany: mockIntentSignalDeleteMany },
    handoffRequest: { deleteMany: mockHandoffRequestDeleteMany },
    shop: { findUnique: mockShopFindUnique },
  },
}));

import {
  cleanupExpiredExports,
  completeDeletionJob,
  completeExportJob,
  compileExportData,
  executeDataDeletion,
  getComplianceStatus,
  getConsentAuditTrail,
  getDeletionJobStatus,
  getExportJobStatus,
  initiateDataDeletion,
  initiateDataExport,
  recordConsentEvent,
  verifyConsent,
} from "../../../app/services/consent-management.server";

describe("consent-management.server — unit coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditLogCreate.mockResolvedValue({});
    mockConsentRecordCreate.mockResolvedValue({
      id: "consent-1",
      shopId: "shop-1",
      granted: true,
      consentType: "CHAT_STORAGE",
      createdAt: new Date(),
    });
    mockDataExportJobCreate.mockResolvedValue({ id: "export-1", status: "PENDING" });
    mockDataExportJobFindUnique.mockResolvedValue(null);
    mockDataExportJobUpdate.mockResolvedValue({ id: "export-1", status: "COMPLETED" });
    mockDataExportJobDeleteMany.mockResolvedValue({ count: 3 });
    mockDataDeletionJobCreate.mockResolvedValue({ id: "del-1", status: "PENDING" });
    mockDataDeletionJobFindUnique.mockResolvedValue(null);
    mockDataDeletionJobUpdate.mockResolvedValue({ id: "del-1", status: "COMPLETED" });
    mockConversationFindMany.mockResolvedValue([]);
    mockBehaviorEventFindMany.mockResolvedValue([]);
    mockConsentRecordFindMany.mockResolvedValue([]);
    mockShopFindUnique.mockResolvedValue({ id: "shop-1", domain: "store.myshopify.com" });
    mockConversationDeleteMany.mockResolvedValue({ count: 4 });
    mockBehaviorEventDeleteMany.mockResolvedValue({ count: 2 });
    mockIntentSignalDeleteMany.mockResolvedValue({ count: 1 });
    mockHandoffRequestDeleteMany.mockResolvedValue({ count: 1 });
  });

  it("defaults consent type to CHAT_STORAGE when none is provided", async () => {
    await recordConsentEvent("shop-1", "CONSENT_GIVEN", { visitorId: "v-1" });

    expect(mockConsentRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopId: "shop-1",
          consentType: "CHAT_STORAGE",
          granted: true,
          visitorId: "v-1",
        }),
      }),
    );
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopId: "shop-1",
          action: "CONSENT_EVENT_CONSENT_GIVEN",
          entityType: "CONSENT",
        }),
      }),
    );
  });

  it("rejects unsupported consent record actions", async () => {
    await expect(recordConsentEvent("shop-1", "DATA_DELETED")).rejects.toThrow(
      "Unsupported consent action for consent_records",
    );
    expect(mockConsentRecordCreate).not.toHaveBeenCalled();
  });

  it("returns the record even when the compliance audit log fails", async () => {
    mockAuditLogCreate.mockRejectedValue(new Error("audit db down"));

    const record = await recordConsentEvent("shop-1", "CONSENT_GIVEN", { consentType: "MARKETING" });

    expect(record.id).toBe("consent-1");
  });

  it("rethrows when consent record creation fails", async () => {
    mockConsentRecordCreate.mockRejectedValue(new Error("db down"));

    await expect(recordConsentEvent("shop-1", "CONSENT_GIVEN")).rejects.toThrow("db down");
  });

  it("initiates an export job that expires in 7 days", async () => {
    const job = await initiateDataExport("shop-1");

    expect(job).toEqual({ id: "export-1", status: "PENDING" });
    const createArgs = mockDataExportJobCreate.mock.calls[0][0];
    expect(createArgs.data.status).toBe("PENDING");
    const expiryMs = createArgs.data.expiresAt.getTime() - Date.now();
    expect(expiryMs).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(expiryMs).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
  });

  it("rethrows when export job creation fails", async () => {
    mockDataExportJobCreate.mockRejectedValue(new Error("export db down"));

    await expect(initiateDataExport("shop-1")).rejects.toThrow("export db down");
  });

  it("returns export job status and rethrows on lookup failure", async () => {
    mockDataExportJobFindUnique.mockResolvedValue({ id: "export-1", status: "PENDING" });
    await expect(getExportJobStatus("export-1")).resolves.toEqual({ id: "export-1", status: "PENDING" });

    mockDataExportJobFindUnique.mockRejectedValue(new Error("read failed"));
    await expect(getExportJobStatus("export-1")).rejects.toThrow("read failed");
  });

  it("compiles structured export data for a shop", async () => {
    mockConversationFindMany.mockResolvedValue([
      {
        id: "conv-1",
        startedAt: new Date(),
        lastMessageAt: new Date(),
        status: "ACTIVE",
        messages: [
          { role: "user", content: "Hi", createdAt: new Date() },
          { role: "assistant", content: "Hello", createdAt: new Date() },
        ],
      },
    ]);
    mockBehaviorEventFindMany.mockResolvedValue([
      { eventType: "page_view", eventData: { page: "/" }, timestamp: new Date() },
    ]);
    mockConsentRecordFindMany.mockResolvedValue([
      { consentType: "MARKETING", granted: true, createdAt: new Date(), revokedAt: null, ipAddress: "1.2.3.4", userAgent: "ua" },
    ]);

    const data = await compileExportData("shop-1");

    expect(data.shop).toEqual({ id: "shop-1", domain: "store.myshopify.com" });
    expect(data.conversations[0].messages).toHaveLength(2);
    expect(data.conversations[0].metadata.messageCount).toBe(2);
    expect(data.events[0].type).toBe("page_view");
    expect(data.consents[0].consentType).toBe("MARKETING");
    expect(mockConversationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId: "shop-1" }, take: 100 }),
    );
  });

  it("throws when compiling export data for an unknown shop", async () => {
    mockShopFindUnique.mockResolvedValue(null);

    await expect(compileExportData("nope")).rejects.toThrow("nope not found");
  });

  it("completes an export job and rethrows on failure", async () => {
    await completeExportJob("export-1", "https://s3.example/exports/export-1.json");

    expect(mockDataExportJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "export-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          exportUrl: "https://s3.example/exports/export-1.json",
          completedAt: expect.any(Date),
        }),
      }),
    );

    mockDataExportJobUpdate.mockRejectedValue(new Error("update failed"));
    await expect(completeExportJob("export-1", "url")).rejects.toThrow("update failed");
  });

  it("initiates a deletion job with a customer marker when customerId is provided", async () => {
    await initiateDataDeletion("shop-1", "cust-9");

    expect(mockDataDeletionJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopId: "shop-1",
          requestedBy: "customer:cust-9",
          status: "PENDING",
        }),
      }),
    );

    mockDataDeletionJobCreate.mockRejectedValue(new Error("del create failed"));
    await expect(initiateDataDeletion("shop-1")).rejects.toThrow("del create failed");
  });

  it("returns deletion job status and rethrows on lookup failure", async () => {
    mockDataDeletionJobFindUnique.mockResolvedValue({ id: "del-1", status: "PENDING" });
    await expect(getDeletionJobStatus("del-1")).resolves.toEqual({ id: "del-1", status: "PENDING" });

    mockDataDeletionJobFindUnique.mockRejectedValue(new Error("read failed"));
    await expect(getDeletionJobStatus("del-1")).rejects.toThrow("read failed");
  });

  it("deletes all tenant data for a full-shop purge", async () => {
    const deleted = await executeDataDeletion("shop-1");

    expect(deleted).toBe(8);
    expect(mockConversationDeleteMany).toHaveBeenCalledWith({ where: { shopId: "shop-1" } });
    expect(mockBehaviorEventDeleteMany).toHaveBeenCalledWith({ where: { shopId: "shop-1" } });
    expect(mockIntentSignalDeleteMany).toHaveBeenCalledWith({ where: { shopId: "shop-1" } });
    expect(mockHandoffRequestDeleteMany).toHaveBeenCalledWith({
      where: { conversation: { shopId: "shop-1" } },
    });
  });

  it("deletes customer-scoped data when customerId is provided", async () => {
    const deleted = await executeDataDeletion("shop-1", "cust-9");

    expect(deleted).toBe(8);
    expect(mockConversationDeleteMany).toHaveBeenCalledWith({
      where: { shopId: "shop-1", customerId: "cust-9" },
    });
    expect(mockIntentSignalDeleteMany).toHaveBeenCalledWith({
      where: { shopId: "shop-1", visitorId: "cust-9" },
    });
    expect(mockHandoffRequestDeleteMany).toHaveBeenCalledWith({
      where: { conversation: { shopId: "shop-1", customerId: "cust-9" } },
    });
  });

  it("rethrows when deletion execution fails", async () => {
    mockConversationDeleteMany.mockRejectedValue(new Error("delete failed"));

    await expect(executeDataDeletion("shop-1")).rejects.toThrow("delete failed");
  });

  it("completes a deletion job and rethrows on failure", async () => {
    await completeDeletionJob("del-1", 8);

    expect(mockDataDeletionJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "del-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          recordsDeleted: 8,
          completedAt: expect.any(Date),
        }),
      }),
    );

    mockDataDeletionJobUpdate.mockRejectedValue(new Error("update failed"));
    await expect(completeDeletionJob("del-1", 8)).rejects.toThrow("update failed");
  });

  it("returns consent audit trail and rethrows on failure", async () => {
    mockConsentRecordFindMany.mockResolvedValue([{ id: "consent-1" }]);
    await expect(getConsentAuditTrail("shop-1", 5)).resolves.toEqual([{ id: "consent-1" }]);
    expect(mockConsentRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId: "shop-1" }, take: 5 }),
    );

    mockConsentRecordFindMany.mockRejectedValue(new Error("read failed"));
    await expect(getConsentAuditTrail("shop-1")).rejects.toThrow("read failed");
  });

  it("cleans up expired exports and rethrows on failure", async () => {
    await expect(cleanupExpiredExports()).resolves.toBe(3);

    mockDataExportJobDeleteMany.mockRejectedValue(new Error("cleanup failed"));
    await expect(cleanupExpiredExports()).rejects.toThrow("cleanup failed");
  });

  it("verifies consent by writing an audit record when consented", async () => {
    mockConsentRecordFindMany.mockResolvedValue([
      { granted: true, createdAt: new Date() },
      { granted: false, createdAt: new Date() },
    ]);

    await expect(verifyConsent("shop-1")).resolves.toBe(true);
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONSENT_VERIFIED" }),
      }),
    );
  });

  it("builds a compliance status summary", async () => {
    mockConsentRecordFindMany.mockResolvedValue([
      { granted: true, createdAt: new Date() },
      { granted: false, createdAt: new Date() },
    ]);
    mockDataExportJobCount.mockResolvedValue(2);
    mockDataDeletionJobCount.mockResolvedValue(1);

    const status = await getComplianceStatus("shop-1");

    expect(status.consentStatus).toBe("CONSENTED");
    expect(status.pendingExports).toBe(2);
    expect(status.pendingDeletions).toBe(1);
    expect(status.dataRetentionDays).toBe(90);
  });

  it("rethrows when the compliance status summary fails", async () => {
    mockConsentRecordFindMany.mockRejectedValue(new Error("status failed"));

    await expect(getComplianceStatus("shop-1")).rejects.toThrow("status failed");
  });
});
