import type { LoaderFunctionArgs } from "react-router";
import { IABackendError } from "../services/ia-backend.client";
import { LlmsTxtService } from "../services/llms-txt.server";

function text(content: string, init?: ResponseInit) {
  return new Response(content, {
    ...init,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      ...init?.headers,
    },
  });
}

function normalizeDomain(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shopDomain =
    normalizeDomain(url.searchParams.get("shop")) ||
    normalizeDomain(url.searchParams.get("shopDomain")) ||
    normalizeDomain(request.headers.get("X-Shop-Domain"));

  if (!shopDomain) {
    return text("Missing shop or shopDomain query param", { status: 400 });
  }

  try {
    const payload = await LlmsTxtService.generate({
      shopDomain,
      includePolicies: true,
      includeProducts: true,
    });

    return text(payload, { status: 200 });
  } catch (error) {
    const status =
      error instanceof IABackendError ? (error.statusCode || 502) : 500;

    return text(error instanceof Error ? error.message : "Could not generate llms.txt", {
      status,
    });
  }
}
