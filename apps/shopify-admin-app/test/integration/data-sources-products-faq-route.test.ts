import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthenticateAdminRequest = vi.fn();
const mockEnsureShopForSession = vi.fn();
const mockGetMerchantAdminConfig = vi.fn();
const mockAppendProductFaq = vi.fn();
const mockRemoveProductFaq = vi.fn();

vi.mock("../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: mockAuthenticateAdminRequest,
}));

vi.mock("../../app/services/shop-context.server", () => ({
  ensureShopForSession: mockEnsureShopForSession,
}));

vi.mock("../../app/services/admin-config.server", () => ({
  getMerchantAdminConfig: mockGetMerchantAdminConfig,
}));

vi.mock("../../app/services/product-faqs.server", () => ({
  appendProductFaq: mockAppendProductFaq,
  removeProductFaq: mockRemoveProductFaq,
  getManagedProductProjection: vi.fn(),
}));

describe("app.data-sources.products.$productId.faq action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateAdminRequest.mockResolvedValue({ session: { shop: "store.myshopify.com" } });
    mockEnsureShopForSession.mockResolvedValue({ id: "shop-1", domain: "store.myshopify.com" });
    mockGetMerchantAdminConfig.mockResolvedValue({ adminLanguage: "es" });
  });

  it("adds product FAQ when payload is valid", async () => {
    const { action } = await import("../../app/routes/app.data-sources.products.$productId.faq");
    const formData = new FormData();
    formData.append("intent", "add_faq");
    formData.append("category", "shipping");
    formData.append("question", "Cuando llega?");
    formData.append("answer", "En 2 dias.");

    const request = new Request("http://localhost/app/data-sources/products/projection-1/faq", {
      method: "POST",
      body: formData,
    });

    const result = await action({
      request,
      params: { productId: "projection-1" },
      context: {},
    } as never);

    expect(result.ok).toBe(true);
    expect(mockAppendProductFaq).toHaveBeenCalledWith({
      shopId: "shop-1",
      productProjectionId: "projection-1",
      category: "shipping",
      question: "Cuando llega?",
      answer: "En 2 dias.",
    });
  });

  it("removes FAQ when delete intent is used", async () => {
    const { action } = await import("../../app/routes/app.data-sources.products.$productId.faq");
    const formData = new FormData();
    formData.append("intent", "delete_faq");
    formData.append("faqId", "faq-1");

    const request = new Request("http://localhost/app/data-sources/products/projection-1/faq", {
      method: "POST",
      body: formData,
    });

    const result = await action({
      request,
      params: { productId: "projection-1" },
      context: {},
    } as never);

    expect(result.ok).toBe(true);
    expect(mockRemoveProductFaq).toHaveBeenCalledWith({
      shopId: "shop-1",
      productProjectionId: "projection-1",
      faqId: "faq-1",
    });
  });
});
