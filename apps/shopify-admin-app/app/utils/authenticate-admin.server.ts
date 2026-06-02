import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

function buildE2EAuthResult() {
  const shopDomain =
    process.env.SHOPIFY_SHOP ||
    process.env.SHOPIFY_DEV_STORE_URL ||
    "quickstart-c8cc9986.myshopify.com";

  const mockSession = {
    id: `e2e-test-session`,
    shop: shopDomain,
    state: 'e2e-test',
    isOnline: false as const,
    accessToken: 'e2e-test-access-token',
    scope: process.env.SCOPES || '',
  };

  const mockGraphql = async (_query: unknown) => {
    return new Response(
      JSON.stringify({
        data: {
          shop: {
            name: 'Test Store',
            myshopifyDomain: shopDomain,
            primaryDomain: { host: shopDomain },
            plan: { displayName: 'Developer Preview' },
          },
        },
        errors: [],
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  };

  return {
    session: mockSession,
    admin: { graphql: mockGraphql as unknown },
    billing: {},
    cors: (r: Response) => r,
    redirect: (url: string) => redirect(url),
  } as unknown as Awaited<ReturnType<typeof authenticate.admin>>;
}

const AUTH_DEBUG_HEADER_NAMES = [
  "x-shopify-api-request-failure-reauthorize",
  "x-shopify-api-request-failure-reauthorize-url",
  "x-shopify-retry-invalid-session-request",
  "www-authenticate",
  "location",
] as const;

const SHOPIFY_REAUTH_HEADER_NAMES = [
  "x-shopify-api-request-failure-reauthorize",
  "x-shopify-api-request-failure-reauthorize-url",
  "x-shopify-retry-invalid-session-request",
  "www-authenticate",
] as const;

export function pickAuthDebugHeaders(headers: Headers) {
  return AUTH_DEBUG_HEADER_NAMES.reduce<Record<string, string>>((acc, headerName) => {
    const value = headers.get(headerName);
    if (value) {
      acc[headerName] = value;
    }
    return acc;
  }, {});
}

export function isDocumentRequest(request: Request) {
  const secFetchDest = request.headers.get("sec-fetch-dest");
  if (secFetchDest === "document") {
    return true;
  }

  const secFetchMode = request.headers.get("sec-fetch-mode");
  if (secFetchMode === "navigate") {
    return true;
  }

  const accept = request.headers.get("accept");
  return typeof accept === "string" && accept.includes("text/html");
}

function headersHasTruthyValue(headers: Headers, headerName: string) {
  const value = headers.get(headerName);
  return value !== null && value !== "" && value !== "0" && value.toLowerCase() !== "false";
}

export function isShopifyReauthResponse(error: Response) {
  if (error.status === 401 || error.status === 403) {
    return true;
  }

  return SHOPIFY_REAUTH_HEADER_NAMES.some((headerName) => headersHasTruthyValue(error.headers, headerName));
}

export function buildSessionTokenBounceRedirectPath(requestUrl: URL) {
  const searchParams = new URLSearchParams(requestUrl.search);
  searchParams.delete("id_token");
  searchParams.delete("shopify-reload");

  const appUrl = process.env.SHOPIFY_APP_URL || requestUrl.origin;
  const reloadUrl = new URL(requestUrl.pathname, appUrl);

  if (searchParams.toString()) {
    reloadUrl.search = searchParams.toString();
  }

  searchParams.set("shopify-reload", reloadUrl.toString());
  return `/auth/session-token?${searchParams.toString()}`;
}

export async function authenticateAdminRequest(
  request: Request,
): Promise<Awaited<ReturnType<typeof authenticate.admin>>> {
  if (process.env.E2E_TEST_MODE === 'true') {
    return buildE2EAuthResult();
  }
  try {
    return await authenticate.admin(request);
  } catch (error) {
    if (error instanceof Response && isDocumentRequest(request) && isShopifyReauthResponse(error)) {
      throw redirect(buildSessionTokenBounceRedirectPath(new URL(request.url)));
    }

    throw error;
  }
}
