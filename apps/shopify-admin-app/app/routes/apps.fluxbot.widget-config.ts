/**
 * App Proxy — Widget config endpoint
 * Route: /apps/fluxbot/widget-config  (proxied by Shopify via app_proxy config)
 *
 * Returns admin-managed launcher settings used by the storefront widget runtime.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { verifyShopifyProxyRequest } from "../services/shopify-proxy-auth.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, X-Shopify-Shop-Domain",
};

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      ...CORS_HEADERS,
      ...init?.headers,
    },
  });
}

function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractWidgetBranding(metadata: unknown) {
  const adminSetup = asRecord(asRecord(metadata).adminSetup);
  const widgetBranding = asRecord(adminSetup.widgetBranding);

  const avatarStyle =
    widgetBranding.avatarStyle === "assistant" ||
    widgetBranding.avatarStyle === "spark" ||
    widgetBranding.avatarStyle === "store"
      ? widgetBranding.avatarStyle
      : "assistant";

  const launcherLabel =
    typeof widgetBranding.launcherLabel === "string"
      ? widgetBranding.launcherLabel.trim().slice(0, 64)
      : "";

  const primaryColor =
    typeof widgetBranding.primaryColor === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(widgetBranding.primaryColor.trim())
      ? widgetBranding.primaryColor.trim()
      : "#008060";

  const launcherPosition =
    widgetBranding.launcherPosition === "bottom-left" ? "bottom-left" : "bottom-right";

  const welcomeMessage =
    typeof adminSetup.welcomeMessage === "string"
      ? adminSetup.welcomeMessage.trim().slice(0, 280)
      : "";

  const botName =
    typeof adminSetup.botName === "string"
      ? adminSetup.botName.trim().slice(0, 64)
      : "";

  const botGoal =
    adminSetup.botGoal === "SALES" ||
    adminSetup.botGoal === "SUPPORT" ||
    adminSetup.botGoal === "SALES_SUPPORT"
      ? adminSetup.botGoal
      : "SALES_SUPPORT";

  const adminLanguage = adminSetup.adminLanguage === "en" ? "en" : "es";

  return {
    avatarStyle,
    launcherLabel,
    primaryColor,
    launcherPosition,
    welcomeMessage,
    botName,
    botGoal,
    adminLanguage,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyShopifyProxyRequest(request, { allowUnsignedInDevelopment: true })) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const shopDomain =
    url.searchParams.get("shop") ||
    request.headers.get("X-Shopify-Shop-Domain") ||
    "";

  if (!shopDomain) {
    return json({ success: false, error: "Missing shop identifier" }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
    select: { metadata: true },
  });

  if (!shop) {
    return json({ success: false, error: "Shop not found" }, { status: 404 });
  }

  return json({
    success: true,
    widgetBranding: extractWidgetBranding(shop.metadata),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return preflight();
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}