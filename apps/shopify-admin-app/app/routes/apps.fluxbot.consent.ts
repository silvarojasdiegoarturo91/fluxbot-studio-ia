/**
 * App Proxy — Consent recording endpoint
 * Route: /apps/fluxbot/consent  (proxied by Shopify via app_proxy config)
 *
 * POST — Records a GDPR consent grant or revocation from the storefront widget.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { createHmac, timingSafeEqual } from "crypto";
import prisma from "../db.server";
import { recordConsentEvent } from "../services/consent-management.server";

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
    const body = (await request.json()) as Record<string, unknown>;
    const url = new URL(request.url);
    const shopFromBody =
      typeof body.shop === "string"
        ? body.shop
        : typeof body.shopDomain === "string"
          ? body.shopDomain
          : "";
    const shopDomain =
      url.searchParams.get("shop") ||
      request.headers.get("X-Shopify-Shop-Domain") ||
      shopFromBody ||
      "";

    if (!shopDomain) {
      return json({ success: false, error: "Missing shop identifier" }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      select: { id: true },
    });

    if (!shop) {
      return json({ success: false, error: "Shop not found" }, { status: 404 });
    }

    const granted = body.granted === true;
    const visitorId = typeof body.visitorId === "string" ? body.visitorId : undefined;
    const customerId = typeof body.customerId === "string" ? body.customerId : undefined;
    const locale = typeof body.locale === "string" ? body.locale : undefined;
    const consentVersion =
      typeof body.consentVersion === "string" ? body.consentVersion : undefined;

    // Best-effort IP — Shopify proxy forwards via X-Forwarded-For
    const ipAddress =
      request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || undefined;
    const userAgent = request.headers.get("User-Agent") || undefined;

    await recordConsentEvent(
      shop.id,
      granted ? "CONSENT_GIVEN" : "CONSENT_REVOKED",
      {
        visitorId,
        customerId,
        ipAddress,
        userAgent,
        metadata: {
          source: "widget",
          ...(locale ? { locale } : {}),
          ...(consentVersion ? { consentVersion } : {}),
        },
      },
    );

    return json({ success: true, granted });
  } catch (error) {
    console.error("[ProxyConsent] POST error:", error);
    return json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
