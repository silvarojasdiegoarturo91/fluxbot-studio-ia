import type { LoaderFunctionArgs } from "react-router";

/**
 * Public liveness endpoint.
 *
 * Unauthenticated on purpose — used by systemd/Nginx readiness probes and
 * load balancer health checks. Returns a minimal JSON payload with a 200 so
 * a probe can confirm the web process is alive. It must never leak secrets,
 * configuration, or environment details.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  void request;
  return new Response(
    JSON.stringify({
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}
