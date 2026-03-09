import { TextEncoder } from "node:util";
import * as jose from "jose";
import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as ShopifyEmbeddedAppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisReactAppProvider } from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";

import { authenticate } from "../shopify.server";

const AUTH_DEBUG_HEADER_NAMES = [
  "x-shopify-api-request-failure-reauthorize",
  "x-shopify-api-request-failure-reauthorize-url",
  "x-shopify-retry-invalid-session-request",
  "www-authenticate",
  "location",
] as const;

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

  try {
    await authenticate.admin(request);

    // Debug signal for embedded auth loops without leaking sensitive values.
    console.info("[auth-debug] /app authenticated", {
      ...authTokenDebug,
    });

    return { apiKey: process.env.SHOPIFY_API_KEY || "" };
  } catch (error) {
    if (error instanceof Response) {
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
  const { apiKey } = useLoaderData<typeof loader>();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return (
    <ShopifyEmbeddedAppProvider embedded apiKey={apiKey}>
      <PolarisReactAppProvider i18n={polarisTranslations}>
        {isHydrated ? <Outlet /> : null}
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
