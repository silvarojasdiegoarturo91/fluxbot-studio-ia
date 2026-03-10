/**
 * Consent Management Service - Phase 4
 *
 * Handles GDPR/privacy compliance including:
 * - Consent recording and tracking
 * - Data export (right to be informed)
 * - Data deletion (right to be forgotten)
 * - Audit logging of all operations
 * - Consent revocation
 */

import prisma from '../db.server';
import type {
  ConsentRecord,
  ConsentType,
  DataExportJob,
  DataDeletionJob,
  Prisma,
} from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export type ConsentAction =
  | 'CONSENT_GIVEN'
  | 'CONSENT_REVOKED'
  | 'DATA_EXPORTED'
  | 'DATA_DELETED'
  | 'CONSENT_VERIFIED'
  | 'CONTACT_PREFERENCE_UPDATED';

export type ExportJobStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ERROR';
export type DeletionJobStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ERROR';

export interface ConsentEventPayload {
  action: ConsentAction;
  timestamp: Date;
  reason?: string;
  consentType?: ConsentType;
  visitorId?: string;
  customerId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface DataExportFormat {
  exportDate: Date;
  shop: {
    id: string;
    domain: string;
  };
  conversations: Array<{
    id: string;
    messages: Array<{
      role: string;
      content: string;
      timestamp: Date;
    }>;
    metadata: Record<string, unknown>;
  }>;
  events: Array<{
    type: string;
    timestamp: Date;
    data: Record<string, unknown>;
  }>;
  consents: Array<{
    consentType: string;
    granted: boolean;
    timestamp: Date;
    revokedAt: Date | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }>;
}

const CONSENT_ACTIONS = new Set<ConsentAction>([
  'CONSENT_GIVEN',
  'CONSENT_REVOKED',
  'CONTACT_PREFERENCE_UPDATED',
]);

function resolveConsentType(action: ConsentAction, payload: Partial<ConsentEventPayload>): ConsentType {
  if (payload.consentType) {
    return payload.consentType;
  }

  if (action === 'CONTACT_PREFERENCE_UPDATED') {
    return 'MARKETING';
  }

  return 'CHAT_STORAGE';
}

async function createComplianceAuditLog(params: {
  shopId: string;
  action: string;
  details?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        shopId: params.shopId,
        action: params.action,
        entityType: 'CONSENT',
        changes: (params.details || {}) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.warn('[Consent] Failed to write compliance audit log', error);
  }
}

// ============================================================================
// CONSENT RECORDING & TRACKING
// ============================================================================

/**
 * Record a consent event for audit trail
 */
export async function recordConsentEvent(
  shopId: string,
  action: ConsentAction,
  payload: Partial<ConsentEventPayload> = {}
): Promise<ConsentRecord> {
  try {
    if (!CONSENT_ACTIONS.has(action)) {
      throw new Error(`Unsupported consent action for consent_records: ${action}`);
    }

    const granted = action !== 'CONSENT_REVOKED';
    const consentType = resolveConsentType(action, payload);

    const record = await prisma.consentRecord.create({
      data: {
        shopId,
        visitorId: payload.visitorId,
        customerId: payload.customerId,
        consentType,
        granted,
        ipAddress: payload.ipAddress,
        userAgent: payload.userAgent,
        revokedAt: granted ? null : payload.timestamp || new Date(),
      },
    });

    await createComplianceAuditLog({
      shopId,
      action: `CONSENT_EVENT_${action}`,
      details: {
        consentType,
        granted,
        reason: payload.reason,
        metadata: payload.metadata || {},
      },
    });

    console.log(`[Consent] ${action} recorded for shop ${shopId}`);
    return record;
  } catch (error) {
    console.error('[Consent] Failed to record event:', error);
    throw error;
  }
}

/**
 * Get current consent status for a shop
 */
export async function getConsentStatus(shopId: string): Promise<{
  hasConsent: boolean;
  lastConsent?: Date;
  lastRevocation?: Date;
  isCurrentlyConsented: boolean;
}> {
  try {
    const records = await prisma.consentRecord.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
    });

    const lastConsent = records.find((r) => r.granted);
    const lastRevocation = records.find((r) => !r.granted || r.revokedAt !== null);

    // Current consent is determined by most recent consent record
    const isCurrentlyConsented = records[0]?.granted ?? false;

    return {
      hasConsent: isCurrentlyConsented,
      lastConsent: lastConsent?.createdAt,
      lastRevocation: lastRevocation?.createdAt,
      isCurrentlyConsented,
    };
  } catch (error) {
    console.error('[Consent] Failed to get status:', error);
    throw error;
  }
}

/**
 * Revoke consent for a shop
 */
export async function revokeConsent(
  shopId: string,
  reason?: string
): Promise<ConsentRecord> {
  return recordConsentEvent(shopId, 'CONSENT_REVOKED', {
    reason,
    timestamp: new Date(),
  });
}

/**
 * Verify consent before processing data
 */
export async function verifyConsent(shopId: string): Promise<boolean> {
  const status = await getConsentStatus(shopId);

  if (status.isCurrentlyConsented) {
    await createComplianceAuditLog({
      shopId,
      action: 'CONSENT_VERIFIED',
      details: {
        verifiedAt: new Date().toISOString(),
      },
    });
    return true;
  }

  return false;
}

// ============================================================================
// DATA EXPORT (RIGHT TO ACCESS)
// ============================================================================

/**
 * Initiate a data export job for GDPR compliance
 */
export async function initiateDataExport(
  shopId: string
): Promise<DataExportJob> {
  try {
    // Create export job
    const job = await prisma.dataExportJob.create({
      data: {
        shopId,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    await createComplianceAuditLog({
      shopId,
      action: 'DATA_EXPORT_INITIATED',
      details: {
        jobId: job.id,
      },
    });

    console.log(`[Consent] Export job created: ${job.id}`);
    return job;
  } catch (error) {
    console.error('[Consent] Failed to create export job:', error);
    throw error;
  }
}

/**
 * Get status of a data export job
 */
export async function getExportJobStatus(
  jobId: string
): Promise<DataExportJob | null> {
  try {
    return await prisma.dataExportJob.findUnique({
      where: { id: jobId },
    });
  } catch (error) {
    console.error('[Consent] Failed to get export job status:', error);
    throw error;
  }
}

/**
 * Compile export data for a shop
 * In production, this would be async and generate a downloadable file
 */
export async function compileExportData(
  shopId: string
): Promise<DataExportFormat> {
  try {
    // Fetch conversations
    const conversations = await prisma.conversation.findMany({
      where: { shopId },
      include: {
        messages: {
          select: {
            role: true,
            content: true,
            createdAt: true,
          },
        },
      },
      take: 100, // Limit to recent 100 conversations
    });

    // Fetch behavior events
    const events = await prisma.behaviorEvent.findMany({
      where: { shopId },
      select: {
        eventType: true,
        eventData: true,
        timestamp: true,
      },
      take: 1000, // Limit to recent 1000 events
    });

    // Fetch consent records
    const consents = await prisma.consentRecord.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
    });

    // Get shop info
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true, domain: true },
    });

    if (!shop) {
      throw new Error(`Shop ${shopId} not found`);
    }

    // Compile structured export
    const exportData: DataExportFormat = {
      exportDate: new Date(),
      shop: {
        id: shop.id,
        domain: shop.domain,
      },
      conversations: conversations.map((conv) => ({
        id: conv.id,
        messages: conv.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.createdAt,
        })),
        metadata: {
          startedAt: conv.startedAt,
          lastMessageAt: conv.lastMessageAt,
          status: conv.status,
          messageCount: conv.messages.length,
        },
      })),
      events: events.map((evt) => ({
        type: evt.eventType,
        timestamp: evt.timestamp,
        data: evt.eventData as Record<string, unknown>,
      })),
      consents: consents.map((con) => ({
        consentType: con.consentType,
        granted: con.granted,
        timestamp: con.createdAt,
        revokedAt: con.revokedAt,
        ipAddress: con.ipAddress,
        userAgent: con.userAgent,
      })),
    };

    return exportData;
  } catch (error) {
    console.error('[Consent] Failed to compile export data:', error);
    throw error;
  }
}

/**
 * Complete a data export job
 */
export async function completeExportJob(
  jobId: string,
  s3Url: string
): Promise<DataExportJob> {
  try {
    const job = await prisma.dataExportJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        exportUrl: s3Url,
        completedAt: new Date(),
      },
    });

    console.log(`[Consent] Export job completed: ${jobId}`);
    return job;
  } catch (error) {
    console.error('[Consent] Failed to complete export job:', error);
    throw error;
  }
}

// ============================================================================
// DATA DELETION (RIGHT TO BE FORGOTTEN)
// ============================================================================

/**
 * Initiate a data deletion job for GDPR right to be forgotten
 */
export async function initiateDataDeletion(
  shopId: string,
  customerId?: string
): Promise<DataDeletionJob> {
  try {
    // Create deletion job
    const job = await prisma.dataDeletionJob.create({
      data: {
        shopId,
        requestedBy: customerId ? `customer:${customerId}` : null,
        status: 'PENDING',
      },
    });

    await createComplianceAuditLog({
      shopId,
      action: 'DATA_DELETION_INITIATED',
      details: {
        jobId: job.id,
        targetCustomerId: customerId || 'all',
      },
    });

    console.log(`[Consent] Deletion job created: ${job.id}`);
    return job;
  } catch (error) {
    console.error('[Consent] Failed to create deletion job:', error);
    throw error;
  }
}

/**
 * Get status of a data deletion job
 */
export async function getDeletionJobStatus(
  jobId: string
): Promise<DataDeletionJob | null> {
  try {
    return await prisma.dataDeletionJob.findUnique({
      where: { id: jobId },
    });
  } catch (error) {
    console.error('[Consent] Failed to get deletion job status:', error);
    throw error;
  }
}

/**
 * Execute data deletion for a shop (or specific customer)
 * Returns count of deleted records
 */
export async function executeDataDeletion(
  shopId: string,
  customerId?: string
): Promise<number> {
  let deletedCount = 0;

  try {
    // Delete conversations
    const convs = await prisma.conversation.deleteMany({
      where: customerId
        ? { shopId, customerId }
        : { shopId },
    });
    deletedCount += convs.count;

    // Delete behavior events
    const events = await prisma.behaviorEvent.deleteMany({
      where: customerId
        ? { shopId, customerId }
        : { shopId },
    });
    deletedCount += events.count;

    // Delete intent signals
    const signals = await prisma.intentSignal.deleteMany({
      where: customerId
        ? { shopId, visitorId: customerId }
        : { shopId },
    });
    deletedCount += signals.count;

    // Delete handoff requests
    const handoffs = await prisma.handoffRequest.deleteMany({
      where: customerId
        ? {
            conversation: {
              shopId,
              customerId,
            },
          }
        : { 
          conversation: { shopId },
        },
    });
    deletedCount += handoffs.count;

    console.log(
      `[Consent] Deleted ${deletedCount} records for ${customerId || 'shop'} ${shopId}`
    );

    return deletedCount;
  } catch (error) {
    console.error('[Consent] Failed to execute deletion:', error);
    throw error;
  }
}

/**
 * Complete a data deletion job
 */
export async function completeDeletionJob(
  jobId: string,
  deletedCount: number
): Promise<DataDeletionJob> {
  try {
    const job = await prisma.dataDeletionJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        recordsDeleted: deletedCount,
        completedAt: new Date(),
      },
    });

    console.log(`[Consent] Deletion job completed: ${jobId}, deleted ${deletedCount} records`);
    return job;
  } catch (error) {
    console.error('[Consent] Failed to complete deletion job:', error);
    throw error;
  }
}

// ============================================================================
// COMPLIANCE UTILITIES
// ============================================================================

/**
 * Get all consent records for a shop (audit trail)
 */
export async function getConsentAuditTrail(
  shopId: string,
  limit: number = 100
): Promise<ConsentRecord[]> {
  try {
    return await prisma.consentRecord.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (error) {
    console.error('[Consent] Failed to get audit trail:', error);
    throw error;
  }
}

/**
 * Clean up expired export jobs
 * Call this periodically to manage storage
 */
export async function cleanupExpiredExports(): Promise<number> {
  try {
    const result = await prisma.dataExportJob.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    console.log(`[Consent] Cleaned up ${result.count} expired exports`);
    return result.count;
  } catch (error) {
    console.error('[Consent] Failed to cleanup exports:', error);
    throw error;
  }
}

/**
 * Get compliance status summary for a shop
 */
export async function getComplianceStatus(shopId: string): Promise<{
  consentStatus: string;
  lastAuditRecord?: Date;
  pendingExports: number;
  pendingDeletions: number;
  dataRetentionDays: number;
}> {
  try {
    const consentStatus = await getConsentStatus(shopId);
    const auditTrail = await getConsentAuditTrail(shopId, 1);
    const pendingExports = await prisma.dataExportJob.count({
      where: { shopId, status: 'PENDING' },
    });
    const pendingDeletions = await prisma.dataDeletionJob.count({
      where: { shopId, status: 'PENDING' },
    });

    return {
      consentStatus: consentStatus.isCurrentlyConsented ? 'CONSENTED' : 'NOT_CONSENTED',
      lastAuditRecord: auditTrail[0]?.createdAt,
      pendingExports,
      pendingDeletions,
      dataRetentionDays: 90, // Default retention, configurable per shop
    };
  } catch (error) {
    console.error('[Consent] Failed to get compliance status:', error);
    throw error;
  }
}
