import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { useRouteError } from "react-router";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const SESSION_TOKEN_CONTEXT_KEYS = ["shop", "host", "embedded", "plan", "charge_id"] as const;

function resolveSafeSessionTokenReloadPath(requestUrl: URL): string {
  const reloadRaw = requestUrl.searchParams.get("shopify-reload");

  const allowedOrigins = new Set<string>([requestUrl.origin]);
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (appUrl) {
    try {
      allowedOrigins.add(new URL(appUrl).origin);
    } catch {
      // Ignore invalid SHOPIFY_APP_URL and keep current request origin as the only allowed target.
    }
  }

  let targetUrl: URL | null = null;
  if (reloadRaw) {
    try {
      const candidate = new URL(reloadRaw, requestUrl.origin);
      if (allowedOrigins.has(candidate.origin)) {
        targetUrl = candidate;
      }
    } catch {
      targetUrl = null;
    }
  }

  if (!targetUrl) {
    targetUrl = new URL("/app", requestUrl.origin);
  }

  for (const key of SESSION_TOKEN_CONTEXT_KEYS) {
    if (targetUrl.searchParams.has(key)) {
      continue;
    }
    const value = requestUrl.searchParams.get(key);
    if (value) {
      targetUrl.searchParams.set(key, value);
    }
  }

  return `${targetUrl.pathname}${targetUrl.search}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticateAdminRequest(request);
  const requestUrl = new URL(request.url);

  if (requestUrl.pathname === "/auth/session-token") {
    throw redirect(resolveSafeSessionTokenReloadPath(requestUrl));
  }

  return null;
};

export default function AuthCallback() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
