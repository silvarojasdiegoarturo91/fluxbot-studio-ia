import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { cors } from "remix-utils/cors";
import prisma from "../db.server";
import { HandoffService } from "../services/handoff.server";
import type { HandoffStatus } from "../services/handoff.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

function toHandoffStatus(value: unknown): HandoffStatus | undefined {
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "assigned" ||
    normalized === "completed" ||
    normalized === "resolved" ||
    normalized === "cancelled"
  ) {
    return normalized;
  }

  return undefined;
}

function resolveShopDomain(request: Request, explicit?: string): string | null {
  const candidate = explicit || request.headers.get("X-Shop-Domain");
  if (!candidate) return null;

  const normalized = candidate.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

async function resolveShopIdByDomain(shopDomain: string): Promise<string | null> {
  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
    select: { id: true },
  });

  return shop?.id || null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shopDomain = resolveShopDomain(request, url.searchParams.get("shopDomain") || undefined);

  if (!shopDomain) {
    return cors(
      request,
      json({ success: false, error: "shopDomain is required" }, { status: 400 })
    );
  }

  const shopId = await resolveShopIdByDomain(shopDomain);
  if (!shopId) {
    return cors(request, json({ success: false, error: "Shop not found" }, { status: 404 }));
  }

  const limit = Number(url.searchParams.get("limit") || "50");
  const handoffs = await HandoffService.listByShop(shopId, limit);

  return cors(
    request,
    json({
      success: true,
      data: handoffs,
      count: handoffs.length,
    })
  );
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return cors(request, new Response(null, { status: 204 }));
  }

  if (!HandoffService.isEnabled()) {
    return cors(
      request,
      json(
        {
          success: false,
          error: "Human handoff feature is disabled",
        },
        { status: 403 }
      )
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const shopDomain = resolveShopDomain(
      request,
      typeof body.shopDomain === "string" ? body.shopDomain : undefined
    );

    if (!shopDomain) {
      return cors(
        request,
        json({ success: false, error: "shopDomain is required" }, { status: 400 })
      );
    }

    const shopId = await resolveShopIdByDomain(shopDomain);
    if (!shopId) {
      return cors(request, json({ success: false, error: "Shop not found" }, { status: 404 }));
    }

    if (request.method === "POST") {
      const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";

      if (!conversationId) {
        return cors(
          request,
          json({ success: false, error: "conversationId is required" }, { status: 400 })
        );
      }

      if (!reason) {
        return cors(
          request,
          json({ success: false, error: "reason is required" }, { status: 400 })
        );
      }

      const created = await HandoffService.create({
        shopId,
        conversationId,
        reason,
        context:
          body.context && typeof body.context === "object"
            ? (body.context as Record<string, unknown>)
            : undefined,
        assignedTo: typeof body.assignedTo === "string" ? body.assignedTo : undefined,
        agentNotes: typeof body.agentNotes === "string" ? body.agentNotes : undefined,
      });

      return cors(
        request,
        json({
          success: true,
          data: created,
        })
      );
    }

    if (request.method === "PATCH") {
      const handoffId = typeof body.handoffId === "string" ? body.handoffId : "";
      if (!handoffId) {
        return cors(
          request,
          json({ success: false, error: "handoffId is required" }, { status: 400 })
        );
      }

      const updated = await HandoffService.update({
        handoffId,
        shopId,
        status: toHandoffStatus(body.status),
        assignedTo: typeof body.assignedTo === "string" ? body.assignedTo : undefined,
        agentNotes: typeof body.agentNotes === "string" ? body.agentNotes : undefined,
      });

      return cors(
        request,
        json({
          success: true,
          data: updated,
        })
      );
    }

    return cors(
      request,
      json({ success: false, error: "Method not allowed" }, { status: 405 })
    );
  } catch (error) {
    return cors(
      request,
      json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Handoff request failed",
        },
        { status: 500 }
      )
    );
  }
}
