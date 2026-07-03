/**
 * Integration tests for app.data-sources.tsx — loader y actions
 *
 * PROPÓSITO: Verificar que el backend (loader + action) funciona correctamente.
 * Cubre lo que los component tests NO cubren porque mockean useLoaderData.
 *
 * Casos críticos:
 *  1. Loader devuelve productRows con el shape correcto (id, title, faqCount, disabled…)
 *  2. Action add_product_faq llama al servicio con los parámetros correctos
 *  3. Action disable_product llama al servicio con los parámetros correctos
 *  4. Loader gestiona productRows vacíos sin errores
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks de auth y contexto ──────────────────────────────────────────────────

const mockAuthenticateAdminRequest = vi.fn();
const mockEnsureShopForSession = vi.fn();
const mockGetMerchantAdminConfig = vi.fn();
const mockProcessPendingSyncJobsForShop = vi.fn();

vi.mock("../../app/utils/authenticate-admin.server", () => ({
  authenticateAdminRequest: mockAuthenticateAdminRequest,
}));

vi.mock("../../app/services/shop-context.server", () => ({
  ensureShopForSession: mockEnsureShopForSession,
}));

vi.mock("../../app/services/admin-config.server", () => ({
  getMerchantAdminConfig: mockGetMerchantAdminConfig,
}));

vi.mock("../../app/jobs/sync-worker.server", () => ({
  processPendingSyncJobsForShop: mockProcessPendingSyncJobsForShop,
}));

// ── Mock Prisma — simula la BD sin necesitar conexión real ────────────────────

const mockPrisma = {
  knowledgeSource: {
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  syncJob: {
    findMany: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
  },
  productProjection: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  policyProjection: { count: vi.fn() },
  orderProjection: { count: vi.fn() },
};

vi.mock("../../app/db.server", () => ({
  default: mockPrisma,
}));

// ── Mock de servicios de FAQ ──────────────────────────────────────────────────

const mockAppendProductFaq = vi.fn();
const mockSetProductDisabled = vi.fn();
const mockGetProductAdminMetadata = vi.fn();

vi.mock("../../app/services/product-faqs.server", () => ({
  appendProductFaq: mockAppendProductFaq,
  setProductDisabled: mockSetProductDisabled,
  getProductAdminMetadata: (raw: unknown) => mockGetProductAdminMetadata(raw),
  mergeProductAdminMetadata: vi.fn(),
}));

vi.mock("../../app/shopify.server", () => ({
  authenticate: { admin: vi.fn() },
}));

// ── Setup común ───────────────────────────────────────────────────────────────

const SHOP = { id: "shop-1", domain: "store.myshopify.com" };
const SESSION = { shop: "store.myshopify.com" };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthenticateAdminRequest.mockResolvedValue({ session: SESSION });
  mockEnsureShopForSession.mockResolvedValue(SHOP);
  mockGetMerchantAdminConfig.mockResolvedValue({ adminLanguage: "es" });
  mockProcessPendingSyncJobsForShop.mockResolvedValue({ processed: 0, failed: 0, jobs: [] });

  // Prisma defaults vacíos
  mockPrisma.knowledgeSource.findMany.mockResolvedValue([]);
  mockPrisma.syncJob.findMany.mockResolvedValue([]);
  mockPrisma.syncJob.count.mockResolvedValue(0);
  mockPrisma.syncJob.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.productProjection.count.mockResolvedValue(0);
  mockPrisma.policyProjection.count.mockResolvedValue(0);
  mockPrisma.orderProjection.count.mockResolvedValue(0);
  mockPrisma.productProjection.findMany.mockResolvedValue([]);

  // getProductAdminMetadata devuelve metadata vacía por defecto
  mockGetProductAdminMetadata.mockReturnValue({
    faqs: [],
    collections: [],
    tags: [],
    disabled: false,
  });
});

// ── Tests del LOADER ──────────────────────────────────────────────────────────

describe("app.data-sources loader", () => {
  it("devuelve productRows vacíos cuando no hay proyecciones", async () => {
    const { loader } = await import("../../app/routes/app.data-sources");

    const request = new Request("http://localhost/app/data-sources");
    const result = await loader({ request, params: {}, context: {} } as never);

    expect(result.productRows).toEqual([]);
  });

  it("devuelve productRows con el shape correcto (faqCount, disabled, title…)", async () => {
    mockPrisma.productProjection.findMany.mockResolvedValue([
      {
        id: "proj-1",
        productId: "gid://shopify/Product/111",
        title: "Camiseta Azul",
        handle: "camiseta-azul",
        metadata: null,
      },
      {
        id: "proj-2",
        productId: "gid://shopify/Product/222",
        title: "Pantalón Negro",
        handle: "pantalon-negro",
        metadata: { faqs: [{ id: "f1", question: "?", answer: "!" }], disabled: true, collections: [], tags: [] },
      },
    ]);

    mockGetProductAdminMetadata
      .mockReturnValueOnce({ faqs: [], collections: [], tags: [], disabled: false })
      .mockReturnValueOnce({
        faqs: [{ id: "f1", question: "?", answer: "!" }],
        collections: [],
        tags: [],
        disabled: true,
      });

    const { loader } = await import("../../app/routes/app.data-sources");
    const request = new Request("http://localhost/app/data-sources");
    const result = await loader({ request, params: {}, context: {} } as never);

    expect(result.productRows).toHaveLength(2);

    // Producto 1: sin FAQs, activo
    expect(result.productRows[0]).toMatchObject({
      id: "proj-1",
      title: "Camiseta Azul",
      faqCount: 0,
      disabled: false,
    });

    // Producto 2: 1 FAQ, deshabilitado
    expect(result.productRows[1]).toMatchObject({
      id: "proj-2",
      title: "Pantalón Negro",
      faqCount: 1,
      disabled: true,
    });
  });

  it("devuelve projections con los conteos de la BD", async () => {
    mockPrisma.productProjection.count.mockResolvedValue(10);
    mockPrisma.policyProjection.count.mockResolvedValue(3);

    const { loader } = await import("../../app/routes/app.data-sources");
    const request = new Request("http://localhost/app/data-sources");
    const result = await loader({ request, params: {}, context: {} } as never);

    expect(result.projections.productsProjected).toBe(10);
    expect(result.projections.policiesProjected).toBe(3);
  });

  it("devuelve runningSyncJobs y failedSyncJobs correctamente", async () => {
    mockPrisma.syncJob.count
      .mockResolvedValueOnce(0)  // pending jobs (entry recovery dispatch)
      .mockResolvedValueOnce(2)  // PENDING + RUNNING
      .mockResolvedValueOnce(1); // FAILED

    const { loader } = await import("../../app/routes/app.data-sources");
    const request = new Request("http://localhost/app/data-sources");
    const result = await loader({ request, params: {}, context: {} } as never);

    expect(result.runningSyncJobs).toBe(2);
    expect(result.failedSyncJobs).toBe(1);
  });

  it("ejecuta la rutina de recovery al entrar en data-sources", async () => {
    mockPrisma.syncJob.count.mockResolvedValueOnce(2);

    const { loader } = await import("../../app/routes/app.data-sources");
    const request = new Request("http://localhost/app/data-sources");
    await loader({ request, params: {}, context: {} } as never);

    expect(mockProcessPendingSyncJobsForShop).toHaveBeenCalledWith(
      SHOP.id,
      2,
      "entry-routine",
    );
  });

  it("lanza 404 si no existe el shop", async () => {
    mockEnsureShopForSession.mockResolvedValue(null);

    const { loader } = await import("../../app/routes/app.data-sources");
    const request = new Request("http://localhost/app/data-sources");

    await expect(
      loader({ request, params: {}, context: {} } as never),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ── Tests de las ACTIONS nuevas ───────────────────────────────────────────────

describe("app.data-sources action — add_product_faq", () => {
  it("llama a appendProductFaq con los parámetros correctos", async () => {
    mockAppendProductFaq.mockResolvedValue(undefined);

    const { action } = await import("../../app/routes/app.data-sources");

    const formData = new FormData();
    formData.append("intent", "add_product_faq");
    formData.append("productProjectionId", "proj-1");
    formData.append("category", "envío");
    formData.append("question", "¿Cuánto tarda?");
    formData.append("answer", "2 días hábiles.");

    const request = new Request("http://localhost/app/data-sources", {
      method: "POST",
      body: formData,
    });

    const result = await action({ request, params: {}, context: {} } as never);

    expect(result.ok).toBe(true);
    expect(mockAppendProductFaq).toHaveBeenCalledWith({
      shopId: SHOP.id,
      productProjectionId: "proj-1",
      category: "envío",
      question: "¿Cuánto tarda?",
      answer: "2 días hábiles.",
    });
  });

  it("devuelve error cuando faltan campos obligatorios", async () => {
    const { action } = await import("../../app/routes/app.data-sources");

    const formData = new FormData();
    formData.append("intent", "add_product_faq");
    formData.append("productProjectionId", "proj-1");
    // Sin question ni answer

    const request = new Request("http://localhost/app/data-sources", {
      method: "POST",
      body: formData,
    });

    const result = await action({ request, params: {}, context: {} } as never);

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("app.data-sources action — disable_product", () => {
  it("llama a setProductDisabled con los parámetros correctos", async () => {
    mockSetProductDisabled.mockResolvedValue(undefined);

    const { action } = await import("../../app/routes/app.data-sources");

    const formData = new FormData();
    formData.append("intent", "disable_product");
    formData.append("productProjectionId", "proj-2");

    const request = new Request("http://localhost/app/data-sources", {
      method: "POST",
      body: formData,
    });

    const result = await action({ request, params: {}, context: {} } as never);

    expect(result.ok).toBe(true);
    expect(mockSetProductDisabled).toHaveBeenCalledWith({
      shopId: SHOP.id,
      productProjectionId: "proj-2",
      disabled: true,
    });
  });

  describe("app.data-sources action — reprocess_sync_job", () => {
    it("reencola el sync job cuando está en un estado elegible", async () => {
      mockPrisma.syncJob.updateMany.mockResolvedValue({ count: 1 });
      const { action } = await import("../../app/routes/app.data-sources");

      const formData = new FormData();
      formData.append("intent", "reprocess_sync_job");
      formData.append("jobId", "sync-123");

      const request = new Request("http://localhost/app/data-sources", {
        method: "POST",
        body: formData,
      });

      const result = await action({ request, params: {}, context: {} } as never);

      expect(result.ok).toBe(true);
      expect(mockPrisma.syncJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: "sync-123",
          shopId: SHOP.id,
          status: { in: ["FAILED", "CANCELLED", "RUNNING", "COMPLETED", "PENDING"] },
        },
        data: {
          status: "PENDING",
          progress: 0,
          processedItems: 0,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        },
      });
    });

    it("devuelve error cuando falta jobId", async () => {
      const { action } = await import("../../app/routes/app.data-sources");

      const formData = new FormData();
      formData.append("intent", "reprocess_sync_job");

      const request = new Request("http://localhost/app/data-sources", {
        method: "POST",
        body: formData,
      });

      const result = await action({ request, params: {}, context: {} } as never);

      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });
});
