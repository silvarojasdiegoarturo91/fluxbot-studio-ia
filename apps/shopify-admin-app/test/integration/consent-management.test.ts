import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordConsentEvent,
  getConsentStatus,
  revokeConsent,
  verifyConsent,
  initiateDataExport,
  getExportJobStatus,
  compileExportData,
  completeExportJob,
  initiateDataDeletion,
  getDeletionJobStatus,
  executeDataDeletion,
  completeDeletionJob,
  getConsentAuditTrail,
  cleanupExpiredExports,
  getComplianceStatus,
} from '../../app/services/consent-management.server';

vi.mock('../../app/db.server', () => ({
  default: {
    consentRecord: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    dataExportJob: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    dataDeletionJob: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    behaviorEvent: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    intentSignal: {
      deleteMany: vi.fn(),
    },
    handoffRequest: {
      deleteMany: vi.fn(),
    },
    shop: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import prisma from '../../app/db.server';

const testShopId = 'test-shop-consent';
const mockConsentRecord = {
  id: 'consent-1',
  shopId: testShopId,
  visitorId: null,
  customerId: null,
  consentType: 'CHAT_STORAGE' as const,
  granted: true,
  ipAddress: null,
  userAgent: null,
  revokedAt: null,
  createdAt: new Date(),
};

const mockExportJob = {
  id: 'export-1',
  shopId: testShopId,
  requestedBy: null,
  status: 'PENDING',
  exportUrl: null,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  createdAt: new Date(),
  completedAt: null,
};

const mockDeletionJob = {
  id: 'deletion-1',
  shopId: testShopId,
  requestedBy: null,
  status: 'PENDING',
  recordsDeleted: null,
  createdAt: new Date(),
  completedAt: null,
};

describe('Consent Management Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordConsentEvent', () => {
    it('records granted consent with schema-aligned fields', async () => {
      (prisma.consentRecord.create as any).mockResolvedValue(mockConsentRecord);

      const result = await recordConsentEvent(testShopId, 'CONSENT_GIVEN');

      expect(prisma.consentRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            shopId: testShopId,
            consentType: 'CHAT_STORAGE',
            granted: true,
          }),
        })
      );
      expect(result.granted).toBe(true);
      expect(result.consentType).toBe('CHAT_STORAGE');
    });

    it('records revoked consent', async () => {
      const revokedRecord = {
        ...mockConsentRecord,
        granted: false,
        revokedAt: new Date(),
      };
      (prisma.consentRecord.create as any).mockResolvedValue(revokedRecord);

      const result = await recordConsentEvent(testShopId, 'CONSENT_REVOKED', {
        reason: 'User requested',
      });

      expect(result.granted).toBe(false);
      expect(result.revokedAt).toBeInstanceOf(Date);
    });

    it('supports explicit consentType and identity metadata fields', async () => {
      const recordWithFields = {
        ...mockConsentRecord,
        consentType: 'ANALYTICS' as const,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        visitorId: 'visitor-1',
      };
      (prisma.consentRecord.create as any).mockResolvedValue(recordWithFields);

      const result = await recordConsentEvent(testShopId, 'CONSENT_GIVEN', {
        consentType: 'ANALYTICS',
        visitorId: 'visitor-1',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        metadata: { locationUrl: 'https://example.com/privacy' },
      });

      expect(result.consentType).toBe('ANALYTICS');
      expect(result.ipAddress).toBe('192.168.1.1');
      expect(result.userAgent).toBe('Mozilla/5.0');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('getConsentStatus', () => {
    it('returns consented status when latest record is granted', async () => {
      (prisma.consentRecord.findMany as any).mockResolvedValue([mockConsentRecord]);

      const status = await getConsentStatus(testShopId);

      expect(status.isCurrentlyConsented).toBe(true);
      expect(status.hasConsent).toBe(true);
      expect(status.lastConsent).toBeDefined();
    });

    it('detects revoked consent from latest record', async () => {
      const revokedRecord = {
        ...mockConsentRecord,
        granted: false,
        revokedAt: new Date(),
      };
      (prisma.consentRecord.findMany as any).mockResolvedValue([revokedRecord]);

      const status = await getConsentStatus(testShopId);

      expect(status.isCurrentlyConsented).toBe(false);
      expect(status.lastRevocation).toBeDefined();
    });
  });

  describe('revokeConsent', () => {
    it('creates a revoked consent record', async () => {
      const revokedRecord = {
        ...mockConsentRecord,
        granted: false,
        revokedAt: new Date(),
      };
      (prisma.consentRecord.create as any).mockResolvedValue(revokedRecord);

      await revokeConsent(testShopId, 'User opted out');

      expect(prisma.consentRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            granted: false,
          }),
        })
      );
    });
  });

  describe('verifyConsent', () => {
    it('returns true for active consent and writes audit event', async () => {
      (prisma.consentRecord.findMany as any).mockResolvedValue([mockConsentRecord]);
      (prisma.auditLog.create as any).mockResolvedValue({ id: 'audit-1' });

      const result = await verifyConsent(testShopId);

      expect(result).toBe(true);
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('returns false when no consent records exist', async () => {
      (prisma.consentRecord.findMany as any).mockResolvedValue([]);

      const result = await verifyConsent(testShopId);

      expect(result).toBe(false);
    });
  });

  describe('initiateDataExport', () => {
    it('creates an export job and logs audit event', async () => {
      (prisma.dataExportJob.create as any).mockResolvedValue(mockExportJob);
      (prisma.auditLog.create as any).mockResolvedValue({ id: 'audit-1' });

      const job = await initiateDataExport(testShopId);

      expect(prisma.dataExportJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            shopId: testShopId,
            status: 'PENDING',
          }),
        })
      );
      expect(job.status).toBe('PENDING');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('sets export expiration roughly 7 days in the future', async () => {
      (prisma.dataExportJob.create as any).mockResolvedValue({
        ...mockExportJob,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const job = await initiateDataExport(testShopId);

      expect(job.expiresAt).toBeTruthy();
      const expiry = job.expiresAt!.getTime();
      const now = Date.now();
      const expectedWindow = 7 * 24 * 60 * 60 * 1000;
      expect(expiry - now).toBeGreaterThan(expectedWindow - 60000);
      expect(expiry - now).toBeLessThan(expectedWindow + 60000);
    });
  });

  describe('getExportJobStatus', () => {
    it('returns export job status by id', async () => {
      (prisma.dataExportJob.findUnique as any).mockResolvedValue(mockExportJob);

      const job = await getExportJobStatus('export-1');
      expect(job?.id).toBe('export-1');
    });
  });

  describe('compileExportData', () => {
    it('compiles conversations, events, and consent records', async () => {
      (prisma.conversation.findMany as any).mockResolvedValue([
        {
          id: 'conv-1',
          shopId: testShopId,
          status: 'ACTIVE',
          startedAt: new Date(),
          lastMessageAt: new Date(),
          messages: [
            { role: 'user', content: 'Hello', createdAt: new Date() },
            { role: 'assistant', content: 'Hi there', createdAt: new Date() },
          ],
        },
      ]);
      (prisma.behaviorEvent.findMany as any).mockResolvedValue([
        { eventType: 'PAGE_VIEW', eventData: { url: '/' }, timestamp: new Date() },
      ]);
      (prisma.consentRecord.findMany as any).mockResolvedValue([
        { ...mockConsentRecord, consentType: 'CHAT_STORAGE', granted: true },
      ]);
      (prisma.shop.findUnique as any).mockResolvedValue({
        id: testShopId,
        domain: 'test.myshopify.com',
      });

      const exportData = await compileExportData(testShopId);

      expect(exportData.shop.id).toBe(testShopId);
      expect(exportData.conversations).toHaveLength(1);
      expect(exportData.events).toHaveLength(1);
      expect(exportData.consents[0].consentType).toBe('CHAT_STORAGE');
      expect(exportData.consents[0].granted).toBe(true);
    });
  });

  describe('completeExportJob', () => {
    it('marks export as completed and stores exportUrl', async () => {
      const completedJob = {
        ...mockExportJob,
        status: 'COMPLETED',
        exportUrl: 's3://bucket/export.json',
        completedAt: new Date(),
      };
      (prisma.dataExportJob.update as any).mockResolvedValue(completedJob);

      const job = await completeExportJob('export-1', 's3://bucket/export.json');

      expect(job.status).toBe('COMPLETED');
      expect(job.exportUrl).toBe('s3://bucket/export.json');
      expect(job.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('initiateDataDeletion', () => {
    it('creates deletion job for full-shop purge', async () => {
      (prisma.dataDeletionJob.create as any).mockResolvedValue(mockDeletionJob);
      (prisma.auditLog.create as any).mockResolvedValue({ id: 'audit-2' });

      const job = await initiateDataDeletion(testShopId);

      expect(job.status).toBe('PENDING');
      expect(prisma.dataDeletionJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            shopId: testShopId,
            requestedBy: null,
          }),
        })
      );
    });

    it('encodes targeted customer deletion in requestedBy marker', async () => {
      const customerJob = { ...mockDeletionJob, requestedBy: 'customer:cust-123' };
      (prisma.dataDeletionJob.create as any).mockResolvedValue(customerJob);

      const job = await initiateDataDeletion(testShopId, 'cust-123');

      expect(job.requestedBy).toBe('customer:cust-123');
    });
  });

  describe('getDeletionJobStatus', () => {
    it('returns deletion job status by id', async () => {
      (prisma.dataDeletionJob.findUnique as any).mockResolvedValue(mockDeletionJob);

      const job = await getDeletionJobStatus('deletion-1');
      expect(job?.id).toBe('deletion-1');
    });
  });

  describe('executeDataDeletion', () => {
    it('deletes all tenant-scoped data for full-shop deletion', async () => {
      (prisma.conversation.deleteMany as any).mockResolvedValue({ count: 5 });
      (prisma.behaviorEvent.deleteMany as any).mockResolvedValue({ count: 10 });
      (prisma.intentSignal.deleteMany as any).mockResolvedValue({ count: 3 });
      (prisma.handoffRequest.deleteMany as any).mockResolvedValue({ count: 2 });

      const deletedCount = await executeDataDeletion(testShopId);

      expect(deletedCount).toBe(20);
      expect(prisma.handoffRequest.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversation: { shopId: testShopId },
          },
        })
      );
    });

    it('deletes customer-scoped records when customerId is provided', async () => {
      (prisma.conversation.deleteMany as any).mockResolvedValue({ count: 1 });
      (prisma.behaviorEvent.deleteMany as any).mockResolvedValue({ count: 5 });
      (prisma.intentSignal.deleteMany as any).mockResolvedValue({ count: 0 });
      (prisma.handoffRequest.deleteMany as any).mockResolvedValue({ count: 0 });

      const deletedCount = await executeDataDeletion(testShopId, 'cust-123');

      expect(deletedCount).toBe(6);
      expect(prisma.handoffRequest.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversation: {
              shopId: testShopId,
              customerId: 'cust-123',
            },
          },
        })
      );
    });
  });

  describe('completeDeletionJob', () => {
    it('marks deletion job completed with recordsDeleted', async () => {
      const completedJob = {
        ...mockDeletionJob,
        status: 'COMPLETED',
        recordsDeleted: 20,
        completedAt: new Date(),
      };
      (prisma.dataDeletionJob.update as any).mockResolvedValue(completedJob);

      const job = await completeDeletionJob('deletion-1', 20);

      expect(job.status).toBe('COMPLETED');
      expect(job.recordsDeleted).toBe(20);
      expect(job.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('getConsentAuditTrail', () => {
    it('returns records in reverse chronological order and respects limit', async () => {
      const records = [
        { ...mockConsentRecord, id: 'r1', createdAt: new Date('2026-01-10') },
        { ...mockConsentRecord, id: 'r2', createdAt: new Date('2026-01-05') },
      ];
      (prisma.consentRecord.findMany as any).mockResolvedValue(records);

      const audit = await getConsentAuditTrail(testShopId, 5);

      expect(audit).toHaveLength(2);
      expect(prisma.consentRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 })
      );
    });
  });

  describe('cleanupExpiredExports', () => {
    it('deletes expired export jobs', async () => {
      (prisma.dataExportJob.deleteMany as any).mockResolvedValue({ count: 3 });

      const deleted = await cleanupExpiredExports();

      expect(deleted).toBe(3);
      expect(prisma.dataExportJob.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            expiresAt: { lt: expect.any(Date) },
          }),
        })
      );
    });
  });

  describe('getComplianceStatus', () => {
    it('returns compliance summary', async () => {
      (prisma.consentRecord.findMany as any)
        .mockResolvedValueOnce([mockConsentRecord])
        .mockResolvedValueOnce([mockConsentRecord]);
      (prisma.dataExportJob.count as any).mockResolvedValue(2);
      (prisma.dataDeletionJob.count as any).mockResolvedValue(1);

      const status = await getComplianceStatus(testShopId);

      expect(status.consentStatus).toBe('CONSENTED');
      expect(status.pendingExports).toBe(2);
      expect(status.pendingDeletions).toBe(1);
      expect(status.dataRetentionDays).toBe(90);
    });
  });
});
