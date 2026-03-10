import type { ActionFunctionArgs } from "react-router";
import { cors } from "remix-utils/cors";
import { CommerceActionsService } from "../services/commerce-actions.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

interface AddToCartBody {
  shopDomain?: string;
  productRef?: string;
  variantId?: string;
  quantity?: number;
  commit?: boolean;
  conversationId?: string;
  sessionId?: string;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return cors(request, new Response(null, { status: 204 }));
  }

  if (request.method !== "POST") {
    return cors(
      request,
      json({ success: false, error: "Method not allowed" }, { status: 405 })
    );
  }

  try {
    const body = (await request.json()) as AddToCartBody;

    if (!body.shopDomain) {
      return cors(
        request,
        json({ success: false, error: "shopDomain is required" }, { status: 400 })
      );
    }

    if (!body.productRef && !body.variantId) {
      return cors(
        request,
        json(
          {
            success: false,
            error: "Either productRef or variantId must be provided",
          },
          { status: 400 }
        )
      );
    }

    if (body.commit) {
      const committed = await CommerceActionsService.commitAddToCart({
        shopDomain: body.shopDomain,
        productRef: body.productRef,
        variantId: body.variantId,
        quantity: body.quantity,
        conversationId: body.conversationId,
        sessionId: body.sessionId,
        source: "api",
      });

      return cors(
        request,
        json({
          success: true,
          committed: true,
          data: committed,
        })
      );
    }

    const prepared = await CommerceActionsService.prepareAddToCart({
      shopDomain: body.shopDomain,
      productRef: body.productRef,
      variantId: body.variantId,
      quantity: body.quantity,
      conversationId: body.conversationId,
      sessionId: body.sessionId,
      source: "api",
    });

    return cors(
      request,
      json({
        success: true,
        committed: false,
        data: prepared,
      })
    );
  } catch (error) {
    return cors(
      request,
      json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to add to cart",
        },
        { status: 500 }
      )
    );
  }
}
