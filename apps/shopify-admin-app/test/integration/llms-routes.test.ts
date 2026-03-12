import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/services/llms-txt.server", () => ({
  LlmsTxtService: {
    generate: vi.fn(),
  },
}));

import { IABackendError } from "../../app/services/ia-backend.server";
import { LlmsTxtService } from "../../app/services/llms-txt.server";
import { loader as apiLlmsLoader } from "../../app/routes/api.llms-txt";
import { loader as publicLlmsLoader } from "../../app/routes/llms[.]txt";

describe("llms.txt routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when /api/llms-txt is missing shopDomain", async () => {
    const request = new Request("http://localhost/api/llms-txt", {
      method: "GET",
    });

    const response = await apiLlmsLoader({ request, params: {}, context: {} } as any);
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toContain("Missing shopDomain");
  });

  it("publishes /api/llms-txt by proxying generation to LlmsTxtService", async () => {
    vi.mocked(LlmsTxtService.generate).mockResolvedValue("# llms.txt\nshop: test-shop.myshopify.com");

    const request = new Request(
      "http://localhost/api/llms-txt?shopDomain=test-shop.myshopify.com&includePolicies=false&maxProducts=7",
      { method: "GET" },
    );

    const response = await apiLlmsLoader({ request, params: {}, context: {} } as any);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(body).toContain("# llms.txt");
    expect(LlmsTxtService.generate).toHaveBeenCalledWith({
      shopDomain: "test-shop.myshopify.com",
      includePolicies: false,
      includeProducts: true,
      maxProducts: 7,
    });
  });

  it("returns backend status when /api/llms-txt proxy fails", async () => {
    vi.mocked(LlmsTxtService.generate).mockRejectedValue(
      new IABackendError("Upstream llms generation unavailable", 503),
    );

    const request = new Request("http://localhost/api/llms-txt?shopDomain=test-shop.myshopify.com", {
      method: "GET",
    });

    const response = await apiLlmsLoader({ request, params: {}, context: {} } as any);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("Upstream llms generation unavailable");
  });

  it("returns 400 when /llms.txt is missing shop parameter", async () => {
    const request = new Request("http://localhost/llms.txt", {
      method: "GET",
    });

    const response = await publicLlmsLoader({ request, params: {}, context: {} } as any);
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toContain("Missing shop or shopDomain query param");
  });

  it("publishes /llms.txt from backend-generated payload", async () => {
    vi.mocked(LlmsTxtService.generate).mockResolvedValue("# llms.txt\nshop: test-shop.myshopify.com");

    const request = new Request("http://localhost/llms.txt?shop=test-shop.myshopify.com", {
      method: "GET",
    });

    const response = await publicLlmsLoader({ request, params: {}, context: {} } as any);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("shop: test-shop.myshopify.com");
    expect(LlmsTxtService.generate).toHaveBeenCalledWith({
      shopDomain: "test-shop.myshopify.com",
      includePolicies: true,
      includeProducts: true,
    });
  });
});
