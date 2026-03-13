import { TextEncoder } from "node:util";
import * as jose from "jose";
import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData, useLocation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as ShopifyEmbeddedAppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisReactAppProvider } from "@shopify/polaris";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisTranslationsEn from "@shopify/polaris/locales/en.json";
import polarisTranslationsEs from "@shopify/polaris/locales/es.json";

import { getMerchantAdminConfig } from "../services/admin-config.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { authenticate } from "../shopify.server";
import type { AdminLanguage } from "../services/admin-config.server";

const AUTH_DEBUG_HEADER_NAMES = [
  "x-shopify-api-request-failure-reauthorize",
  "x-shopify-api-request-failure-reauthorize-url",
  "x-shopify-retry-invalid-session-request",
  "www-authenticate",
  "location",
] as const;

const ADMIN_NAV_ITEMS: Record<AdminLanguage, Array<{ label: string; url: string }>> = {
  en: [
    { label: "Dashboard", url: "/app" },
    { label: "Onboarding", url: "/app/onboarding" },
    { label: "Assistant", url: "/app/settings" },
    { label: "Data Sources", url: "/app/data-sources" },
    { label: "Campaigns", url: "/app/campaigns" },
    { label: "Conversations", url: "/app/conversations" },
    { label: "Analytics", url: "/app/analytics" },
    { label: "Compliance", url: "/app/privacy" },
    { label: "Operations", url: "/app/operations" },
    { label: "Widget", url: "/app/widget-settings" },
    { label: "Widget Publish", url: "/app/widget-publish" },
    { label: "llms.txt", url: "/app/llms-status" },
    { label: "Billing", url: "/app/billing" },
  ],
  es: [
    { label: "Panel", url: "/app" },
    { label: "Onboarding", url: "/app/onboarding" },
    { label: "Asistente", url: "/app/settings" },
    { label: "Fuentes de datos", url: "/app/data-sources" },
    { label: "Campanas", url: "/app/campaigns" },
    { label: "Conversaciones", url: "/app/conversations" },
    { label: "Analitica", url: "/app/analytics" },
    { label: "Cumplimiento", url: "/app/privacy" },
    { label: "Operaciones", url: "/app/operations" },
    { label: "Widget", url: "/app/widget-settings" },
    { label: "Publicar widget", url: "/app/widget-publish" },
    { label: "llms.txt", url: "/app/llms-status" },
    { label: "Facturacion", url: "/app/billing" },
  ],
};

function normalizeAdminLanguage(value: unknown): AdminLanguage {
  return value === "es" ? "es" : "en";
}

function buildOnboardingRedirectPath(requestUrl: URL, step: number): string {
  const params = new URLSearchParams(requestUrl.search);
  params.delete("saved");
  params.delete("onboarding");
  params.set("step", String(Math.max(1, Math.min(7, Math.floor(step) || 1))));

  const queryString = params.toString();
  return `/app/onboarding${queryString ? `?${queryString}` : ""}`;
}

function decodeJwtClaims(token: string) {
  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8"));
    if (!claims || typeof claims !== "object") {
      return null;
    }

    const payload = claims as Record<string, unknown>;

    return {
      aud: payload.aud,
      dest: payload.dest,
      iss: payload.iss,
      sub: payload.sub,
      iat: payload.iat,
      nbf: payload.nbf,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

function pickAuthDebugHeaders(headers: Headers) {
  return AUTH_DEBUG_HEADER_NAMES.reduce<Record<string, string>>((acc, headerName) => {
    const value = headers.get(headerName);
    if (value) {
      acc[headerName] = value;
    }
    return acc;
  }, {});
}

async function inspectAuthorizationToken(request: Request) {
  const authorizationHeader = request.headers.get("authorization");
  if (!authorizationHeader) {
    return {
      hasAuthorizationHeader: false,
      hasBearerToken: false,
      tokenAudMatchesApiKey: null as boolean | null,
      jwtVerificationError: null as string | null,
      tokenClaims: null as Record<string, unknown> | null,
    };
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return {
      hasAuthorizationHeader: true,
      hasBearerToken: false,
      tokenAudMatchesApiKey: null as boolean | null,
      jwtVerificationError: "Authorization header is not a Bearer token",
      tokenClaims: null as Record<string, unknown> | null,
    };
  }

  const token = match[1];
  const tokenClaims = decodeJwtClaims(token);
  const tokenAudMatchesApiKey =
    typeof tokenClaims?.aud === "string" &&
    tokenClaims.aud === (process.env.SHOPIFY_API_KEY || "");

  let jwtVerificationError: string | null = null;
  try {
    await jose.jwtVerify(token, new TextEncoder().encode(process.env.SHOPIFY_API_SECRET || ""), {
      algorithms: ["HS256"],
      clockTolerance: 10,
    });
  } catch (error) {
    jwtVerificationError = error instanceof Error ? error.message : String(error);
  }

  return {
    hasAuthorizationHeader: true,
    hasBearerToken: true,
    tokenAudMatchesApiKey,
    jwtVerificationError,
    tokenClaims,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const authTokenDebug = await inspectAuthorizationToken(request);
  const requestUrl = new URL(request.url);
  let adminLanguage: AdminLanguage = "en";

  try {
    const authResult = await authenticate.admin(request);

    const shop = await ensureShopForSession((authResult as { session?: unknown }).session);
    if (shop) {
      const adminConfig = await getMerchantAdminConfig(shop.id);
      adminLanguage = normalizeAdminLanguage(adminConfig.adminLanguage);

      if (!requestUrl.pathname.startsWith("/app/onboarding") && !adminConfig.onboardingCompleted) {
        throw redirect(buildOnboardingRedirectPath(requestUrl, adminConfig.onboardingStep));
      }
    }

    // Debug signal for embedded auth loops without leaking sensitive values.
    console.info("[auth-debug] /app authenticated", {
      ...authTokenDebug,
    });

    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      adminLanguage,
    };
  } catch (error) {
    if (error instanceof Response) {
      if (error.status >= 300 && error.status < 400) {
        throw error;
      }

      console.error("[auth-debug] /app authenticate.admin response", {
        status: error.status,
        statusText: error.statusText,
        responseHeaders: pickAuthDebugHeaders(error.headers),
        ...authTokenDebug,
      });
    } else {
      console.error("[auth-debug] /app authenticate.admin unknown error", {
        ...authTokenDebug,
      });
    }

    throw error;
  }
};

export default function App() {
  const { apiKey, adminLanguage } = useLoaderData<typeof loader>();
  const location = useLocation();
  const [isHydrated, setIsHydrated] = useState(false);
  const normalizedLanguage = normalizeAdminLanguage(adminLanguage);
  const navItems = ADMIN_NAV_ITEMS[normalizedLanguage] ?? ADMIN_NAV_ITEMS.en;
  const polarisTranslations =
    normalizedLanguage === "es" ? polarisTranslationsEs : polarisTranslationsEn;

  const withEmbeddedQuery = (path: string) => `${path}${location.search || ""}`;

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return (
    <ShopifyEmbeddedAppProvider embedded apiKey={apiKey}>
      <PolarisReactAppProvider i18n={polarisTranslations}>
        {isHydrated ? (
          <>
            <NavMenu>
              {navItems.map((item) => (
                <a key={item.url} href={withEmbeddedQuery(item.url)}>
                  {item.label}
                </a>
              ))}
            </NavMenu>
            <Outlet />
          </>
        ) : null}
      </PolarisReactAppProvider>
    </ShopifyEmbeddedAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
