import type { LoaderFunctionArgs } from "react-router";
import { IABackendError } from "../services/ia-backend.server";
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
    normalizeDomain(url.searchParams.get("shopDomain")) ||
    normalizeDomain(request.headers.get("X-Shop-Domain"));

  if (!shopDomain) {
    return text("Missing shopDomain", { status: 400 });
  }

  try {
    const forceRefresh = url.searchParams.get("refresh") === "1";
    const options: {
      shopDomain: string;
      includePolicies: boolean;
      includeProducts: boolean;
      maxProducts: number;
      forceRefresh?: boolean;
    } = {
      shopDomain,
      includePolicies: url.searchParams.get("includePolicies") !== "false",
      includeProducts: url.searchParams.get("includeProducts") !== "false",
      maxProducts: Number(url.searchParams.get("maxProducts") || "12"),
    };

    if (forceRefresh) {
      options.forceRefresh = true;
    }

    const payload = await LlmsTxtService.generate(options);

    return text(payload, { status: 200 });
  } catch (error) {
    const status =
      error instanceof IABackendError ? (error.statusCode || 502) : 500;

    return text(error instanceof Error ? error.message : "Could not generate llms.txt", {
      status,
    });
  }
}
