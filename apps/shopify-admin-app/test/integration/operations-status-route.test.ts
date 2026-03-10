import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/services/delivery.server", () => ({
  getDeliveryStatus: vi.fn(),
}));

vi.mock("../../app/jobs/scheduler.server", () => ({
  getProactiveJobSchedulerStats: vi.fn(),
}));

vi.mock("../../app/services/operations-metrics.server", () => ({
  getOperationsMetrics: vi.fn(),
}));

import { getDeliveryStatus } from "../../app/services/delivery.server";
import { getProactiveJobSchedulerStats } from "../../app/jobs/scheduler.server";
import { getOperationsMetrics } from "../../app/services/operations-metrics.server";
import { loader } from "../../app/routes/api.operations.status";

describe("Operations Status Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns delivery and scheduler status", async () => {
    vi.mocked(getDeliveryStatus).mockReturnValue({
      status: "ready",
      channels: ["WEB_CHAT", "WHATSAPP"],
      integratedChannels: ["WEB_CHAT", "WHATSAPP"],
      pendingChannels: ["EMAIL"],
      omnichannelBridge: {
        configured: true,
      },
    } as any);

    vi.mocked(getProactiveJobSchedulerStats).mockReturnValue({
      isRunning: {
        evaluation: true,
        cleanup: true,
      },
      intervals: {
        evaluationMs: 10000,
        cleanupMs: 300000,
      },
    } as any);

    vi.mocked(getOperationsMetrics).mockResolvedValue({
      windowMs: 3600000,
      since: new Date().toISOString(),
      callback: {
        total: 10,
        applied: 8,
        ignored: 2,
        deliveryFailures: 1,
        appliedRate: 0.8,
        ignoredRate: 0.2,
      },
      byChannel: {
        WEB_CHAT: {
          callbacks: 10,
          applied: 8,
          ignored: 2,
          failures: 1,
          avgLatencyMs: 120,
        },
      },
      deadLetter: {
        queued: 1,
        resolved: 0,
        resolvedByRetry: 0,
        resolvedByExpiry: 0,
        resolvedByManual: 0,
      },
    });

    const response = await loader({ request: new Request("http://localhost/api/operations/status"), params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.delivery.status).toBe("ready");
    expect(data.scheduler.isRunning.evaluation).toBe(true);
    expect(data.operations.callback.applied).toBe(8);
    expect(data.timestamp).toEqual(expect.any(String));
    expect(getDeliveryStatus).toHaveBeenCalledTimes(1);
    expect(getProactiveJobSchedulerStats).toHaveBeenCalledTimes(1);
    expect(getOperationsMetrics).toHaveBeenCalledWith(3600000);
  });

  it("uses custom time window query parameter", async () => {
    vi.mocked(getDeliveryStatus).mockReturnValue({ status: "ready" } as any);
    vi.mocked(getProactiveJobSchedulerStats).mockReturnValue({ isRunning: { evaluation: true } } as any);
    vi.mocked(getOperationsMetrics).mockResolvedValue({
      windowMs: 900000,
      since: new Date().toISOString(),
      callback: {
        total: 0,
        applied: 0,
        ignored: 0,
        deliveryFailures: 0,
        appliedRate: 0,
        ignoredRate: 0,
      },
      byChannel: {},
      deadLetter: {
        queued: 0,
        resolved: 0,
        resolvedByRetry: 0,
        resolvedByExpiry: 0,
        resolvedByManual: 0,
      },
    });

    const response = await loader({
      request: new Request("http://localhost/api/operations/status?windowMinutes=15"),
      params: {},
      context: {},
    } as any);

    expect(response.status).toBe(200);
    expect(getOperationsMetrics).toHaveBeenCalledWith(15 * 60 * 1000);
  });

  it("returns 500 when status provider throws", async () => {
    vi.mocked(getDeliveryStatus).mockImplementation(() => {
      throw new Error("delivery subsystem unavailable");
    });

    const response = await loader({ request: new Request("http://localhost/api/operations/status"), params: {}, context: {} } as any);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain("delivery subsystem unavailable");
  });
});
