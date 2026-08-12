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

const mockQueueSyncJob = vi.fn();
const mockRequeueSyncJob = vi.fn();
const mockRequeueStaleRunningJobs = vi.fn();
const mockRequeueRecentTerminalJobs = vi.fn();

vi.mock("../../app/services/sync-service.server", () => ({
  SyncService: {
    queueSyncJob: mockQueueSyncJob,
    requeueSyncJob: mockRequeueSyncJob,
    requeueStaleRunningJobs: mockRequeueStaleRunningJobs,
    requeueRecentTerminalJobs: mockRequeueRecentTerminalJobs,
  },
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
  mockQueueSyncJob.mockResolvedValue({ id: "job-queue-1" });
  mockRequeueSyncJob.mockResolvedValue(true);
  mockRequeueStaleRunningJobs.mockResolvedValue(0);
  mockRequeueRecentTerminalJobs.mockResolvedValue(0);

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

describe("app.data-sources action — data source management", () => {
  it("creates a typed source scoped to the authenticated shop", async () => {
    mockPrisma.knowledgeSource.create.mockResolvedValue({ id: "source-1" });
    const { action } = await import("../../app/routes/app.data-sources");
    const formData = new FormData();
    formData.append("intent", "create_source");
    formData.append("sourceType", "custom");
    formData.append("name", "Centro de ayuda");
    formData.append("endpoint", "https://help.example.com");

    const result = await action({
      request: new Request("http://localhost/app/data-sources", { method: "POST", body: formData }),
      params: {}, context: {},
    } as never);

    expect(result.ok).toBe(true);
    expect(mockPrisma.knowledgeSource.create).toHaveBeenCalledWith({
      data: {
        shopId: SHOP.id,
        sourceType: "CUSTOM",
        name: "Centro de ayuda",
        isActive: true,
        metadata: { endpoint: "https://help.example.com" },
      },
    });
  });

  it("rejects an invalid source type before persisting it", async () => {
    const { action } = await import("../../app/routes/app.data-sources");
    const formData = new FormData();
    formData.append("intent", "create_source");
    formData.append("sourceType", "UNTRUSTED");
    formData.append("name", "Fuente");

    const result = await action({
      request: new Request("http://localhost/app/data-sources", { method: "POST", body: formData }),
      params: {}, context: {},
    } as never);

    expect(result).toMatchObject({ ok: false, error: "Tipo de fuente invalido" });
    expect(mockPrisma.knowledgeSource.create).not.toHaveBeenCalled();
  });

  it("toggles only a source owned by the authenticated shop", async () => {
    mockPrisma.knowledgeSource.updateMany.mockResolvedValue({ count: 1 });
    const { action } = await import("../../app/routes/app.data-sources");
    const formData = new FormData();
    formData.append("intent", "toggle_source");
    formData.append("sourceId", "source-1");
    formData.append("nextState", "false");

    const result = await action({
      request: new Request("http://localhost/app/data-sources", { method: "POST", body: formData }),
      params: {}, context: {},
    } as never);

    expect(result.ok).toBe(true);
    expect(mockPrisma.knowledgeSource.updateMany).toHaveBeenCalledWith({
      where: { id: "source-1", shopId: SHOP.id },
      data: { isActive: false },
    });
  });

  it("rejects toggle_source when the source id is missing", async () => {
    const { action } = await import("../../app/routes/app.data-sources");
    const formData = new FormData();
    formData.append("intent", "toggle_source");

    const result = await action({
      request: new Request("http://localhost/app/data-sources", { method: "POST", body: formData }),
      params: {}, context: {},
    } as never);

    expect(result).toMatchObject({ ok: false, error: "sourceId es obligatorio" });
    expect(mockPrisma.knowledgeSource.updateMany).not.toHaveBeenCalled();
  });

  it("reports when toggle_source cannot find the source", async () => {
    mockPrisma.knowledgeSource.updateMany.mockResolvedValue({ count: 0 });
    const { action } = await import("../../app/routes/app.data-sources");
    const formData = new FormData();
    formData.append("intent", "toggle_source");
    formData.append("sourceId", "missing");

    const result = await action({
      request: new Request("http://localhost/app/data-sources", { method: "POST", body: formData }),
      params: {}, context: {},
    } as never);

    expect(result).toMatchObject({ ok: false, error: "Fuente no encontrada" });
  });

  it("rejects create_source when the name is missing", async () => {
    const { action } = await import("../../app/routes/app.data-sources");
    const formData = new FormData();
    formData.append("intent", "create_source");
    formData.append("sourceType", "CUSTOM");

    const result = await action({
      request: new Request("http://localhost/app/data-sources", { method: "POST", body: formData }),
      params: {}, context: {},
    } as never);

    expect(result).toMatchObject({ ok: false, error: "El nombre de la fuente es obligatorio" });
    expect(mockPrisma.knowledgeSource.create).not.toHaveBeenCalled();
  });

  it("creates a source without an endpoint metadata", async () => {
    mockPrisma.knowledgeSource.create.mockResolvedValue({ id: "source-2" });
    const { action } = await import("../../app/routes/app.data-sources");
    const formData = new FormData();
    formData.append("intent", "create_source");
    formData.append("sourceType", "PAGES");
    formData.append("name", "Blog");

    const result = await action({
      request: new Request("http://localhost/app/data-sources", { method: "POST", body: formData }),
      params: {}, context: {},
    } as never);

    expect(result.ok).toBe(true);
    expect(mockPrisma.knowledgeSource.create).toHaveBeenCalledWith({
      data: {
        shopId: SHOP.id,
        sourceType: "PAGES",
        name: "Blog",
        isActive: true,
        metadata: undefined,
      },
    });
  });
});

describe("app.data-sources action — queue_sync", () => {
  it("queues a valid sync job and dispatches it immediately", async () => {
    const { action } = await import("../../app/routes/app.data-sources");
    const formData = new FormData();
    formData.append("intent", "queue_sync");
    formData.append("jobType", "delta:products");

    const result = await action({
      request: new Request("http://localhost/app/data-sources", { method: "POST", body: formData }),
      params: {}, context: {},
    } as never);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("delta:products");
    expect(mockQueueSyncJob).toHaveBeenCalledWith(SHOP.id, "delta:products", 0);
    expect(mockProcessPendingSyncJobsForShop).toHaveBeenCalledWith(SHOP.id, 1, "dispatcher");
  });

  it("rejects an invalid sync job type", async () => {
    const { action } = await import("../../app/routes/app.data-sources");
    const formData = new FormData();
    formData.append("intent", "queue_sync");
    formData.append("jobType", "custom:full");

    const result = await action({
      request: new Request("http://localhost/app/data-sources", { method: "POST", body: formData }),
      params: {}, context: {},
    } as never);

    expect(result).toMatchObject({ ok: false, error: "Tipo de job de sync invalido" });
    expect(mockQueueSyncJob).not.toHaveBeenCalled();
  });

  it("reports when reprocessing a non-eligible sync job", async () => {
    mockRequeueSyncJob.mockResolvedValue(false);
    const { action } = await import("../../app/routes/app.data-sources");
    const formData = new FormData();
    formData.append("intent", "reprocess_sync_job");
    formData.append("jobId", "sync-stuck");

    const result = await action({
      request: new Request("http://localhost/app/data-sources", { method: "POST", body: formData }),
      params: {}, context: {},
    } as never);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("estado no elegible");
    expect(mockProcessPendingSyncJobsForShop).not.toHaveBeenCalled();
  });
});

describe("app.data-sources action — guards", () => {
  it("rejects non-POST requests", async () => {
    const { action } = await import("../../app/routes/app.data-sources");

    const result = await action({
      request: new Request("http://localhost/app/data-sources", { method: "GET" }),
      params: {}, context: {},
    } as never);

    expect(result).toEqual({ ok: false, error: "Method not allowed" });
  });

  it("returns a controlled error when the shop is missing", async () => {
    mockEnsureShopForSession.mockResolvedValue(null);
    const { action } = await import("../../app/routes/app.data-sources");

    const result = await action({
      request: new Request("http://localhost/app/data-sources", { method: "POST", body: new FormData() }),
      params: {}, context: {},
    } as never);

    expect(result).toEqual({ ok: false, error: "Shop not found" });
  });

  it("rejects an unsupported action intent", async () => {
    const { action } = await import("../../app/routes/app.data-sources");
    const formData = new FormData();
    formData.append("intent", "unsupported");

    const result = await action({
      request: new Request("http://localhost/app/data-sources", { method: "POST", body: formData }),
      params: {}, context: {},
    } as never);

    expect(result).toMatchObject({ ok: false, error: "Acción no soportada" });
  });
});

describe("app.data-sources loader — entry recovery", () => {
  it("runs the entry recovery routine and requeues stale jobs", async () => {
    mockRequeueStaleRunningJobs.mockResolvedValue(2);
    mockRequeueRecentTerminalJobs.mockResolvedValue(1);
    mockPrisma.syncJob.count.mockResolvedValueOnce(0);
    mockPrisma.syncJob.count.mockResolvedValue(0);

    const { loader } = await import("../../app/routes/app.data-sources");
    const request = new Request("http://localhost/app/data-sources");
    const result = await loader({ request, params: {}, context: {} } as never);

    expect(mockRequeueStaleRunningJobs).toHaveBeenCalledWith({
      shopId: SHOP.id,
      maxAgeMs: expect.any(Number),
      limit: expect.any(Number),
      triggerSource: "entry-routine",
    });
    expect(mockRequeueRecentTerminalJobs).toHaveBeenCalledWith(
      SHOP.id,
      expect.objectContaining({ triggerSource: "entry-routine" }),
    );
    expect(result.runningSyncJobs).toBe(0);
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
      mockRequeueSyncJob.mockResolvedValue(true);
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
      expect(mockRequeueSyncJob).toHaveBeenCalledWith(SHOP.id, "sync-123");
      expect(mockProcessPendingSyncJobsForShop).toHaveBeenCalledWith(SHOP.id, 1, "manual-reprocess");
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
