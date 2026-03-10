import type { ActionFunctionArgs } from "react-router";
import { cors } from "remix-utils/cors";
import {
  OrderLookupError,
  OrderLookupService,
} from "../services/order-lookup.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

interface OrderLookupBody {
  shopDomain?: string;
  orderRef?: string;
  conversationId?: string;
  verification?: {
    email?: string;
    customerId?: string;
  };
}

function resolveShopDomain(request: Request, explicit?: string): string | null {
  const candidate = explicit || request.headers.get("X-Shop-Domain");
  if (!candidate) return null;

  const normalized = candidate.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return cors(request, new Response(null, { status: 204 }));
  }

  if (request.method !== "POST") {
    return cors(
      request,
      json({ success: false, error: "Method not allowed" }, { status: 405 }),
    );
  }

  try {
    const body = (await request.json()) as OrderLookupBody;
    const shopDomain = resolveShopDomain(request, body.shopDomain);

    if (!shopDomain) {
      return cors(
        request,
        json({ success: false, error: "shopDomain is required" }, { status: 400 }),
      );
    }

    if (!body.orderRef || body.orderRef.trim().length === 0) {
      return cors(
        request,
        json({ success: false, error: "orderRef is required" }, { status: 400 }),
      );
    }

    const result = await OrderLookupService.lookupByShopDomain({
      shopDomain,
      orderRef: body.orderRef,
      conversationId: body.conversationId,
      verification: body.verification,
    });

    return cors(
      request,
      json({
        success: true,
        data: result,
      }),
    );
  } catch (error) {
    if (error instanceof OrderLookupError) {
      return cors(
        request,
        json(
          {
            success: false,
            error: error.message,
            code: error.code,
          },
          { status: error.statusCode },
        ),
      );
    }

    return cors(
      request,
      json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to look up order",
        },
        { status: 500 },
      ),
    );
  }
}