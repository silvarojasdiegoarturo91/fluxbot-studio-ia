import prisma from "../db.server";
import { getConfig } from "../config.server";
import type { Prisma } from "@prisma/client";

export type HandoffStatus = "pending" | "assigned" | "completed" | "resolved" | "cancelled";

export interface CreateHandoffInput {
  shopId: string;
  conversationId: string;
  reason: string;
  context?: Record<string, unknown>;
  assignedTo?: string;
  agentNotes?: string;
}

export interface UpdateHandoffInput {
  handoffId: string;
  shopId: string;
  status?: HandoffStatus;
  assignedTo?: string;
  agentNotes?: string;
}

const FINAL_STATUSES = new Set<HandoffStatus>(["completed", "resolved", "cancelled"]);

function normalizeStatus(value: string | undefined): HandoffStatus {
  const candidate = String(value || "pending").toLowerCase();
  if (
    candidate === "pending" ||
    candidate === "assigned" ||
    candidate === "completed" ||
    candidate === "resolved" ||
    candidate === "cancelled"
  ) {
    return candidate;
  }

  return "pending";
}

async function writeAudit(params: {
  shopId: string;
  action: string;
  entityId?: string;
  details: Record<string, unknown>;
}) {
  await prisma.auditLog
    .create({
      data: {
        shopId: params.shopId,
        action: params.action,
        entityType: "HANDOFF_REQUEST",
        entityId: params.entityId,
        changes: params.details as Prisma.InputJsonValue,
      },
    })
    .catch(() => {});
}

export class HandoffService {
  static isEnabled(): boolean {
    return getConfig().features.humanHandoff;
  }

  static async create(input: CreateHandoffInput) {
    const existing = await prisma.handoffRequest.findFirst({
      where: {
        shopId: input.shopId,
        conversationId: input.conversationId,
        status: {
          in: ["pending", "assigned"],
        },
      },
    });

    if (existing) {
      await writeAudit({
        shopId: input.shopId,
        action: "HANDOFF_REQUEST_REUSED",
        entityId: existing.id,
        details: {
          conversationId: input.conversationId,
          reason: input.reason,
          status: existing.status,
        },
      });

      return existing;
    }

    const handoff = await prisma.handoffRequest.create({
      data: {
        shopId: input.shopId,
        conversationId: input.conversationId,
        reason: input.reason,
        context: (input.context || {}) as Prisma.InputJsonValue,
        assignedTo: input.assignedTo,
        agentNotes: input.agentNotes,
        status: input.assignedTo ? "assigned" : "pending",
      },
    });

    await prisma.conversation
      .update({
        where: { id: input.conversationId },
        data: {
          status: "ESCALATED",
          lastMessageAt: new Date(),
        },
      })
      .catch(() => {});

    await writeAudit({
      shopId: input.shopId,
      action: "HANDOFF_REQUEST_CREATED",
      entityId: handoff.id,
      details: {
        conversationId: input.conversationId,
        reason: input.reason,
        status: handoff.status,
        assignedTo: handoff.assignedTo || null,
      },
    });

    return handoff;
  }

  static async listByShop(shopId: string, limit = 50) {
    return prisma.handoffRequest.findMany({
      where: { shopId },
      include: {
        conversation: {
          select: {
            id: true,
            customerId: true,
            visitorId: true,
            channel: true,
            locale: true,
            startedAt: true,
            lastMessageAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  static async update(input: UpdateHandoffInput) {
    const status = input.status ? normalizeStatus(input.status) : undefined;

    const handoff = await prisma.handoffRequest.findFirst({
      where: {
        id: input.handoffId,
        shopId: input.shopId,
      },
      select: {
        id: true,
        status: true,
        conversationId: true,
      },
    });

    if (!handoff) {
      throw new Error("Handoff request not found");
    }

    const nextStatus = status || normalizeStatus(handoff.status);
    const resolvedAt = FINAL_STATUSES.has(nextStatus) ? new Date() : null;

    const updated = await prisma.handoffRequest.update({
      where: { id: handoff.id },
      data: {
        status: nextStatus,
        assignedTo: input.assignedTo,
        agentNotes: input.agentNotes,
        resolvedAt,
      },
    });

    if (resolvedAt) {
      await prisma.conversation
        .update({
          where: { id: handoff.conversationId },
          data: {
            status: "RESOLVED",
            endedAt: resolvedAt,
            lastMessageAt: resolvedAt,
          },
        })
        .catch(() => {});
    }

    await writeAudit({
      shopId: input.shopId,
      action: "HANDOFF_REQUEST_UPDATED",
      entityId: updated.id,
      details: {
        previousStatus: handoff.status,
        nextStatus,
        assignedTo: updated.assignedTo || null,
      },
    });

    return updated;
  }
}
