/**
 * App Proxy — Widget config endpoint
 * Route: /apps/fluxbot/widget-config  (proxied by Shopify via app_proxy config)
 *
 * Returns admin-managed launcher settings used by the storefront widget runtime.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { getMerchantAdminConfig } from "../services/admin-config.server";
import { verifyShopifyProxyRequest } from "../services/shopify-proxy-auth.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, X-Shopify-Shop-Domain, ngrok-skip-browser-warning",
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

function buildSafeWidgetBranding(adminLanguage: "es" | "en") {
  const isEnglish = adminLanguage === "en";
  return {
    avatarStyle: "assistant" as const,
    launcherLabel: isEnglish ? "Assistant" : "Asistente",
    primaryColor: "#008060",
    launcherPosition: "bottom-right" as const,
    welcomeMessage: isEnglish
      ? "Hi, I'm here to help with products, orders, and common questions."
      : "Hola, estoy aquí para ayudarte con productos, pedidos y dudas frecuentes.",
    botName: isEnglish ? "AI Assistant" : "Asistente IA",
    botGoal: "SALES_SUPPORT" as const,
    adminLanguage,
    onboardingCompleted: false,
  };
}

function buildWidgetEndpoints(_request: Request) {
  const configuredAppUrl = process.env.SHOPIFY_APP_URL || process.env.APP_URL || "";

  let appOrigin = "";
  if (configuredAppUrl) {
    try {
      appOrigin = new URL(configuredAppUrl).origin;
    } catch {
      appOrigin = "";
    }
  }

  return {
    apiBaseUrl: appOrigin,
    chatEndpoint: "/apps/fluxbot/chat",
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
    select: { id: true },
  });

  if (!shop) {
    return json({ success: false, error: "Shop not found" }, { status: 404 });
  }

  const config = await getMerchantAdminConfig(shop.id);
  const configVersion = config.updatedAt;
  const endpoints = buildWidgetEndpoints(request);

  const onboardingCompleted = config.onboardingCompleted;
  const widgetBranding = onboardingCompleted
    ? {
        avatarStyle: config.widgetBranding.avatarStyle,
        launcherLabel: config.widgetBranding.launcherLabel,
        primaryColor: config.widgetBranding.primaryColor,
        launcherPosition: config.widgetBranding.launcherPosition,
        welcomeMessage: config.welcomeMessage,
        botName: config.botName,
        botGoal: config.botGoal,
        adminLanguage: config.adminLanguage,
        onboardingCompleted: true,
      }
    : buildSafeWidgetBranding(config.adminLanguage);

  console.info("[WidgetConfig] serving config", {
    shopDomain,
    configVersion,
    onboardingCompleted,
    botName: widgetBranding.botName,
    primaryColor: widgetBranding.primaryColor,
    launcherPosition: widgetBranding.launcherPosition,
    avatarStyle: widgetBranding.avatarStyle,
    adminLanguage: widgetBranding.adminLanguage,
  });

  console.info("[WidgetConfig] chatEndpoint servido", {
    chatEndpoint: endpoints.chatEndpoint,
    apiBaseUrl: endpoints.apiBaseUrl,
  });

  return json({
    success: true,
    configVersion,
    apiBaseUrl: endpoints.apiBaseUrl,
    chatEndpoint: endpoints.chatEndpoint,
    botLanguage: config.primaryBotLanguage,
    supportedLanguages: config.supportedLanguages,
    widgetBranding,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return preflight();
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
