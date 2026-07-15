import type { LoaderFunctionArgs } from "react-router";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { fetchShopConnection } from "../services/shop-connection.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin, session } = await authenticateAdminRequest(request);
    const shop = await ensureShopForSession(session);

    if (!shop) {
      return json(
        {
          ok: false,
          connected: false,
          error: "Unable to resolve shop context.",
        },
        { status: 400 },
      );
    }

    const result = await fetchShopConnection({
      admin,
      shopId: session?.shop || shop.id,
    });

    return json({
      ok: result.shopConnection.connected,
      connected: result.shopConnection.connected,
      cached: result.cacheHit,
      cacheAgeMs: result.cacheAgeMs,
      shopConnection: result.shopConnection,
      alerts: result.alerts,
    });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    return json(
      {
        ok: false,
        connected: false,
        error: error instanceof Error ? error.message : "Failed to check Shopify connectivity",
      },
      { status: 500 },
    );
  }
}

