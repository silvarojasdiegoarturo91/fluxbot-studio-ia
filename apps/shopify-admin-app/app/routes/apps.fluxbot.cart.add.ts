/**
 * App Proxy — Cart add endpoint
 * Route: /apps/fluxbot/cart/add  (proxied by Shopify via app_proxy config)
 *
 * Delegates to CommerceActionsService after verifying the Shopify proxy HMAC.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { CommerceActionsService } from "../services/commerce-actions.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

function verifyShopifyProxy(request: Request): boolean {
  const url = new URL(request.url);
  const hmac = url.searchParams.get("hmac");
  if (!hmac) return false;

  const params = new URLSearchParams(url.searchParams);
  params.delete("hmac");

  const message = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const secret = process.env.SHOPIFY_API_SECRET || "";
  const expected = createHmac("sha256", secret).update(message).digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(hmac, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyShopifyProxy(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  return json({ ok: true });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!verifyShopifyProxy(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const shopDomain =
      url.searchParams.get("shop") ||
      request.headers.get("X-Shopify-Shop-Domain") ||
      "";

    if (!shopDomain) {
      return json({ success: false, error: "Missing shop identifier" }, { status: 400 });
    }

    const body = await request.json();
    const {
      variantId,
      productRef,
      quantity = 1,
      commit = false,
      conversationId,
      sessionId,
    } = body as Record<string, any>;

    if (!variantId && !productRef) {
      return json(
        { success: false, error: "Either variantId or productRef is required" },
        { status: 400 },
      );
    }

    if (commit) {
      const committed = await CommerceActionsService.commitAddToCart({
        shopDomain,
        productRef,
        variantId,
        quantity,
        conversationId,
        sessionId,
        source: "widget",
      });
      return json({ success: true, committed: true, data: committed });
    }

    const staged = await CommerceActionsService.prepareAddToCart({
      shopDomain,
      productRef,
      variantId,
      quantity,
      conversationId,
      sessionId,
      source: "widget",
    });

    return json({ success: true, committed: false, data: staged });
  } catch (error) {
    console.error("[ProxyCartAdd] Error:", error);
    return json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
