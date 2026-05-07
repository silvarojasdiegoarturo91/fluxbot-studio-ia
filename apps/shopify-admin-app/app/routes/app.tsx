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
import type { AdminLanguage } from "../services/admin-config.server";
import { getAdminNavGroups } from "../utils/admin-navigation";
import {
  authenticateAdminRequest,
  buildSessionTokenBounceRedirectPath,
  isDocumentRequest,
  isShopifyReauthResponse,
  pickAuthDebugHeaders,
} from "../utils/authenticate-admin.server";
import { AdminShell } from "../components/admin-shell";

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
    const authResult = await authenticateAdminRequest(request);

    const shop = await ensureShopForSession((authResult as { session?: unknown }).session);
    if (shop) {
      const adminConfig = await getMerchantAdminConfig(shop.id);
      adminLanguage = normalizeAdminLanguage(adminConfig.adminLanguage);

      if (!requestUrl.pathname.startsWith("/app/onboarding") && !adminConfig.onboardingCompleted) {
        throw redirect(buildOnboardingRedirectPath(requestUrl, adminConfig.onboardingStep));
      }

      // Return onboarding status for conditional UI rendering
      return {
        apiKey: process.env.SHOPIFY_API_KEY || "",
        adminLanguage,
        storeDomain: typeof (authResult as { session?: { shop?: string } }).session?.shop === "string"
          ? (authResult as { session?: { shop?: string } }).session?.shop || null
          : null,
        onboardingCompleted: adminConfig.onboardingCompleted,
        isE2ETestMode: process.env.E2E_TEST_MODE === 'true',
      };
    }

    // Debug signal for embedded auth loops without leaking sensitive values.
    console.info("[auth-debug] /app authenticated", {
      ...authTokenDebug,
    });

    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      adminLanguage,
      storeDomain: typeof (authResult as { session?: { shop?: string } }).session?.shop === "string"
        ? (authResult as { session?: { shop?: string } }).session?.shop || null
        : null,
      isE2ETestMode: process.env.E2E_TEST_MODE === 'true',
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

      if (isDocumentRequest(request) && isShopifyReauthResponse(error)) {
        throw redirect(buildSessionTokenBounceRedirectPath(requestUrl));
      }
    } else {
      console.error("[auth-debug] /app authenticate.admin unknown error", {
        ...authTokenDebug,
      });
    }

    throw error;
  }
};

export default function App() {
  const { apiKey, adminLanguage, storeDomain, onboardingCompleted, isE2ETestMode } = useLoaderData<typeof loader>();
  const location = useLocation();
  const [isHydrated, setIsHydrated] = useState(false);
  const normalizedLanguage = normalizeAdminLanguage(adminLanguage);
  const navItems = getAdminNavGroups(normalizedLanguage, onboardingCompleted).flatMap((group) => group.items);
  const polarisTranslations =
    normalizedLanguage === "es" ? polarisTranslationsEs : polarisTranslationsEn;

  const withEmbeddedQuery = (path: string) => `${path}${location.search || ""}`;

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (isE2ETestMode) {
    return (
      <PolarisReactAppProvider i18n={polarisTranslations}>
        <AdminShell adminLanguage={normalizedLanguage} storeDomain={storeDomain ?? null}>
          <Outlet />
        </AdminShell>
      </PolarisReactAppProvider>
    );
  }

  return (
    <ShopifyEmbeddedAppProvider embedded apiKey={apiKey}>
      <PolarisReactAppProvider i18n={polarisTranslations}>
        {isHydrated ? (
          <>
            {/* Only show navigation menu if onboarding is complete */}
            {onboardingCompleted && (
              <NavMenu>
                {navItems.map((item) => (
                  <a key={item.url} href={withEmbeddedQuery(item.url)}>
                    {item.label}
                  </a>
                ))}
              </NavMenu>
            )}
            <AdminShell adminLanguage={normalizedLanguage} storeDomain={storeDomain}>
              <Outlet />
            </AdminShell>
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
