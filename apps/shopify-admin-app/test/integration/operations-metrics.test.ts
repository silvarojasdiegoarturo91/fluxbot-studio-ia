import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock Prisma before importing anything else
vi.mock("../../app/db.server", () => ({
  default: {
    deadLetterCallback: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    shop: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import prisma from "../../app/db.server";
import { getOperationsMetrics } from "../../app/services/operations-metrics.server";
import {
  queueDeadLetter,
  getQueuedDeadLetters,
  retryDeadLetter,
  resolvDeadLetterManually,
  getDeadLetterStats,
} from "../../app/services/dead-letter.server";

const testShopId = "test-shop-id-metrics";

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock implementations
  (prisma.deadLetterCallback.deleteMany as any).mockResolvedValue({ count: 0 });
  (prisma.auditLog.deleteMany as any).mockResolvedValue({ count: 0 });
  (prisma.auditLog.findMany as any).mockResolvedValue([]); // Default empty array for channel logs
  (prisma.deadLetterCallback.findMany as any).mockResolvedValue([]); // Default empty array
  (prisma.deadLetterCallback.groupBy as any).mockResolvedValue([]); // Default empty array for groupBy
  (prisma.shop.upsert as any).mockResolvedValue({
    id: testShopId,
    domain: "test-shop-metrics.myshopify.com",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

beforeEach(async () => {
  // Clean up test data
  await prisma.deadLetterCallback.deleteMany({
    where: { shopId: testShopId },
  });
  
  await prisma.auditLog.deleteMany({
    where: { shopId: testShopId },
  });

  // Create shop for testing if it doesn't exist
  await prisma.shop.upsert({
    where: { domain: "test-shop-metrics.myshopify.com" },
    create: {
      domain: "test-shop-metrics.myshopify.com",
      accessToken: "test-token",
    },
    update: {},
  });
});

afterEach(async () => {
  // Clean up after tests
  await prisma.deadLetterCallback.deleteMany({
    where: { shopId: testShopId },
  });

  await prisma.auditLog.deleteMany({
    where: { shopId: testShopId },
  });
});

describe("Operations Metrics - Enhanced", () => {
  it("should calculate basic callback metrics from audit logs", async () => {
    // Mock audit log count responses
    (prisma.auditLog.count as any)
      .mockResolvedValueOnce(5) // applied count
      .mockResolvedValueOnce(3) // ignored count
      .mockResolvedValueOnce(1); // delivery failures count

    const metrics = await getOperationsMetrics(3600000);

    expect(metrics.callback.total).toBe(8);
    expect(metrics.callback.applied).toBe(5);
    expect(metrics.callback.ignored).toBe(3);
    expect(metrics.callback.deliveryFailures).toBe(1);
  });

  it("should track callback ApplyRate", async () => {
    (prisma.auditLog.count as any)
      .mockResolvedValueOnce(10) // applied
      .mockResolvedValueOnce(10) // ignored
      .mockResolvedValueOnce(2); // failures

    const metrics = await getOperationsMetrics(3600000);

    expect(metrics.callback.appliedRate).toBe(0.5);
    expect(metrics.callback.ignoredRate).toBe(0.5);
  });

  it("should include deadLetter metrics in operations response", async () => {
    // Mock all audit log counts
    (prisma.auditLog.count as any)
      .mockResolvedValue(0);

    // Mock dead letter counts
    (prisma.deadLetterCallback.count as any)
      .mockResolvedValueOnce(3) // queued
      .mockResolvedValueOnce(5) // resolved
      .mockResolvedValueOnce(2) // resolved by retry
      .mockResolvedValueOnce(2) // resolved by expiry
      .mockResolvedValueOnce(1); // resolved by manual

    // Mock groupBy for channel metrics (empty for this test)
    (prisma.auditLog.findMany as any).mockResolvedValue([]);

    const metrics = await getOperationsMetrics(3600000);

    expect(metrics.deadLetter).toBeDefined();
    expect(metrics.deadLetter.queued).toBe(3);
    expect(metrics.deadLetter.resolved).toBe(5);
  });

  it("should return empty channel metrics when no audit logs exist", async () => {
    // Mock all counts
    (prisma.auditLog.count as any).mockResolvedValue(0);
    (prisma.deadLetterCallback.count as any).mockResolvedValue(0);
    (prisma.auditLog.findMany as any).mockResolvedValue([]);

    const metrics = await getOperationsMetrics(3600000);

    expect(metrics.byChannel).toBeDefined();
    expect(Object.keys(metrics.byChannel).length).toBe(0);
  });
});

describe("Dead Letter Queue Service", () => {
  it("should queue a failed callback", async () => {
    const mockEntry = {
      id: "dlq-1",
      shopId: testShopId,
      messageId: "msg-dead-1",
      channel: "EMAIL",
      originalStatus: "DELIVERED",
      failureReason: "Network timeout",
      errorDetails: { code: "ETIMEDOUT", attemptNumber: 3 },
      retryCount: 0,
      maxRetries: 3,
      nextRetryAt: new Date(),
      isResolved: false,
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (prisma.deadLetterCallback.create as any).mockResolvedValueOnce(mockEntry);

    const entry = await queueDeadLetter({
      shopId: testShopId,
      messageId: "msg-dead-1",
      channel: "EMAIL",
      originalStatus: "DELIVERED",
      failureReason: "Network timeout",
      errorDetails: { code: "ETIMEDOUT", attemptNumber: 3 },
    });

    expect(entry.id).toBe("dlq-1");
    expect(entry.shopId).toBe(testShopId);
    expect(entry.messageId).toBe("msg-dead-1");
    expect(entry.channel).toBe("EMAIL");
    expect(entry.failureReason).toBe("Network timeout");
    expect(entry.isResolved).toBe(false);
    expect(entry.retryCount).toBe(0);
  });

  it("should retrieve queued dead letters", async () => {
    const mockQueued = [
      {
        id: "dlq-1",
        shopId: testShopId,
        messageId: "msg-dead-1",
        channel: "EMAIL",
        failureReason: "Permanent failure",
        isResolved: false,
      },
      {
        id: "dlq-2",
        shopId: testShopId,
        messageId: "msg-dead-2",
        channel: "SMS",
        failureReason: "Provider error",
        isResolved: false,
      },
    ];

    (prisma.deadLetterCallback.findMany as any).mockResolvedValueOnce(mockQueued);

    const queued = await getQueuedDeadLetters(testShopId);

    expect(queued.length).toBe(2);
    expect(queued.some((d) => d.messageId === "msg-dead-1")).toBe(true);
    expect(queued.some((d) => d.messageId === "msg-dead-2")).toBe(true);
  });

  it("should filter dead letters by channel", async () => {
    const mockEmailQueue = [
      {
        id: "dlq-1",
        shopId: testShopId,
        messageId: "msg-email-1",
        channel: "EMAIL",
        failureReason: "Test",
        isResolved: false,
      },
    ];

    (prisma.deadLetterCallback.findMany as any).mockResolvedValueOnce(mockEmailQueue);

    const emailQueue = await getQueuedDeadLetters(testShopId, "EMAIL");

    expect(emailQueue.length).toBe(1);
    expect(emailQueue.every((d) => d.channel === "EMAIL")).toBe(true);
  });

  it("should retry a dead letter successfully", async () => {
    const mockEntry = {
      id: "dlq-retry",
      shopId: testShopId,
      messageId: "msg-dead-retry",
      channel: "EMAIL",
      originalStatus: "DELIVERED",
      failureReason: "Transient error",
      retryCount: 0,
      maxRetries: 3,
      isResolved: true,
      resolvedBy: "retry_succeeded",
      resolvedAt: new Date(),
    };

    (prisma.deadLetterCallback.findUniqueOrThrow as any).mockResolvedValueOnce({
      id: "dlq-retry",
      retryCount: 0,
      maxRetries: 3,
    });

    (prisma.deadLetterCallback.update as any).mockResolvedValueOnce(mockEntry);

    const resolved = await retryDeadLetter("dlq-retry", true);

    expect(resolved.isResolved).toBe(true);
    expect(resolved.resolvedBy).toBe("retry_succeeded");
  });

  it("should increment retry count on failed retry", async () => {
    const mockEntry = {
      id: "dlq-retry-fail",
      retryCount: 0,
      maxRetries: 3,
      nextRetryAt: new Date(),
      errorDetails: {},
    };

    const mockUpdated = {
      id: "dlq-retry-fail",
      retryCount: 1,
      isResolved: false,
      nextRetryAt: new Date(),
    };

    (prisma.deadLetterCallback.findUniqueOrThrow as any).mockResolvedValueOnce(mockEntry);
    (prisma.deadLetterCallback.update as any).mockResolvedValueOnce(mockUpdated);

    const afterFirstRetry = await retryDeadLetter("dlq-retry-fail", false, {
      code: "STILL_FAILING",
    });

    expect(afterFirstRetry.retryCount).toBe(1);
    expect(afterFirstRetry.isResolved).toBe(false);
  });

  it("should mark as expired after max retries", async () => {
    const mockEntry = {
      id: "dlq-max-retries",
      retryCount: 0,
      maxRetries: 1,
      nextRetryAt: new Date(),
      errorDetails: {},
    };

    const mockExpired = {
      id: "dlq-max-retries",
      retryCount: 1,
      isResolved: true,
      resolvedBy: "expired",
    };

    (prisma.deadLetterCallback.findUniqueOrThrow as any).mockResolvedValueOnce(mockEntry);
    (prisma.deadLetterCallback.update as any).mockResolvedValueOnce(mockExpired);

    const afterRetry = await retryDeadLetter("dlq-max-retries", false);

    expect(afterRetry.retryCount).toBe(1);
    expect(afterRetry.isResolved).toBe(true);
    expect(afterRetry.resolvedBy).toBe("expired");
  });

  it("should manually resolve a dead letter", async () => {
    const mockManualResolved = {
      id: "dlq-manual",
      isResolved: true,
      resolvedBy: "manual",
      resolvedAt: new Date(),
    };

    (prisma.deadLetterCallback.update as any).mockResolvedValueOnce(mockManualResolved);

    const resolved = await resolvDeadLetterManually("dlq-manual", "Manually resolved by support");

    expect(resolved.isResolved).toBe(true);
    expect(resolved.resolvedBy).toBe("manual");
  });

  it("should get dead letter statistics", async () => {
    (prisma.deadLetterCallback.count as any)
      .mockResolvedValueOnce(3) // queued
      .mockResolvedValueOnce(5) // resolved
      .mockResolvedValueOnce(2) // resolved by retry
      .mockResolvedValueOnce(2) // resolved by expiry
      .mockResolvedValueOnce(1); // resolved by manual

    (prisma.deadLetterCallback.groupBy as any).mockResolvedValueOnce([
      { channel: "EMAIL", _count: { id: 4 } },
      { channel: "SMS", _count: { id: 1 } },
    ]);

    const stats = await getDeadLetterStats(testShopId);

    expect(stats.queued).toBe(3);
    expect(stats.resolved).toBe(5);
    expect(stats.resolvedByRetry).toBe(2);
    expect(stats.resolvedByExpiry).toBe(2);
    expect(stats.resolvedByManual).toBe(1);
  });

  it("should track dead letters by channel in statistics", async () => {
    (prisma.deadLetterCallback.count as any).mockResolvedValue(5);
    (prisma.deadLetterCallback.groupBy as any).mockResolvedValueOnce([
      { channel: "EMAIL", _count: { id: 3 } },
      { channel: "SMS", _count: { id: 2 } },
    ]);

    const stats = await getDeadLetterStats(testShopId);

    expect(stats.byChannel).toBeDefined();
    expect(Object.keys(stats.byChannel).length).toBe(2);
    expect(stats.byChannel["EMAIL"]).toBe(3);
    expect(stats.byChannel["SMS"]).toBe(2);
  });
});
