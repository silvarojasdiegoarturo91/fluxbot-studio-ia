import { describe, expect, it } from "vitest";
import { loader } from "../../../app/routes/healthcheck";

describe("healthcheck route", () => {
  it("returns a public 200 liveness payload without requiring auth", async () => {
    const request = new Request("https://app.fluxbotia.com/healthcheck", {
      headers: { accept: "application/json" },
    });

    const response = await loader({ request } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const payload = (await response.json()) as { status: string; timestamp: string };
    expect(payload.status).toBe("ok");
    expect(typeof payload.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
  });

  it("does not leak configuration or secrets", async () => {
    process.env.SHOPIFY_API_SECRET = "super-secret-value";
    process.env.IA_BACKEND_API_KEY = "backend-key";

    try {
      const request = new Request("https://app.fluxbotia.com/healthcheck");
      const response = await loader({ request } as never);
      const body = await response.text();

      expect(body).not.toContain("super-secret-value");
      expect(body).not.toContain("backend-key");
      expect(body).not.toContain("DATABASE_URL");
    } finally {
      delete process.env.SHOPIFY_API_SECRET;
      delete process.env.IA_BACKEND_API_KEY;
    }
  });
});
