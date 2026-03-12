/**
 * Contract Tests — IAGateway Chat
 *
 * Validates the /api/v1/chat contract between the frontend gateway and the
 * backend (fluxbot-studio-back-ia).  Two concerns are tested:
 *
 * 1. LOCAL CONTRACT  — LocalIAGateway correctly delegates to AIOrchestrationService
 *    and maps the response to GatewayChatResponse.
 *
 * 2. REMOTE CONTRACT — RemoteIAGateway sends the right HTTP request shape to the
 *    versioned /api/v1/chat endpoint and maps the backend response correctly.
 *
 * 3. FACTORY CONTRACT — getIAGateway() selects the right implementation based on
 *    IA_EXECUTION_MODE.
 *
 * These tests do NOT need a running backend — the fetch and AIOrchestrationService
 * are mocked at the test boundary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const SHOP_DOMAIN = 'test-shop.myshopify.com';

const ORCHESTRATION_RESPONSE = {
  message: 'Here is a great product for you!',
  confidence: 0.92,
  requiresEscalation: false,
  escalationReason: undefined,
  toolsUsed: ['search_products'],
  sourceReferences: [
    { documentId: 'doc-1', chunkId: 'chunk-1', title: 'Product A', relevance: 0.95 },
  ],
  actions: [{ type: 'show_product', productId: 'prod-1' }],
  metadata: { latencyMs: 320 },
};

const BACKEND_RESPONSE = {
  message: 'Here is a great product for you!',
  conversationId: 'conv-abc',
  confidence: 0.92,
  requiresEscalation: false,
  toolsUsed: ['search_products'],
  sourceReferences: [
    { documentId: 'doc-1', chunkId: 'chunk-1', title: 'Product A', relevance: 0.95 },
  ],
  actions: [{ type: 'show_product', productId: 'prod-1' }],
};

// ─── Setup ────────────────────────────────────────────────────────────────────

// We need to mock at module level because vitest supports top-level vi.mock
vi.mock('../../app/services/ai-orchestration.server', () => ({
  AIOrchestrationService: {
    chat: vi.fn(),
  },
}));

// Intercept global fetch used by ia-backend.server.ts
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper to reset env and singleton between tests
beforeEach(() => {
  vi.resetModules();
  delete process.env.IA_EXECUTION_MODE;
  delete process.env.IA_BACKEND_URL;
  delete process.env.IA_BACKEND_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── 1. LOCAL CONTRACT ────────────────────────────────────────────────────────

describe('LocalIAGateway — local contract', () => {
  async function buildLocalGateway() {
    // Re-import after env reset so singleton is fresh
    const { LocalIAGateway } = await import('../../app/services/ia-gateway.server');
    const { AIOrchestrationService } = await import('../../app/services/ai-orchestration.server');
    (AIOrchestrationService.chat as Mock).mockResolvedValue(ORCHESTRATION_RESPONSE);
    return { gateway: new LocalIAGateway(), AIOrchestrationService };
  }

  it('delegates chat to AIOrchestrationService with correct arguments', async () => {
    const { gateway, AIOrchestrationService } = await buildLocalGateway();

    await gateway.chat(
      { message: 'Hola', conversationId: 'conv-1', shopId: 'shop-1', locale: 'es' },
      SHOP_DOMAIN,
    );

    expect(AIOrchestrationService.chat).toHaveBeenCalledOnce();
    expect(AIOrchestrationService.chat).toHaveBeenCalledWith('shop-1', 'conv-1', 'Hola', 'es');
  });

  it('returns a GatewayChatResponse with the correct shape', async () => {
    const { gateway } = await buildLocalGateway();

    const result = await gateway.chat(
      { message: 'Hola', conversationId: 'conv-1', shopId: 'shop-1', locale: 'es' },
      SHOP_DOMAIN,
    );

    expect(result).toMatchObject({
      message: ORCHESTRATION_RESPONSE.message,
      confidence: ORCHESTRATION_RESPONSE.confidence,
      requiresEscalation: false,
      toolsUsed: ['search_products'],
    });
    expect(result.sourceReferences).toHaveLength(1);
    expect(result.actions).toHaveLength(1);
  });

  it('normalises undefined optional fields to empty arrays', async () => {
    const { gateway, AIOrchestrationService } = await buildLocalGateway();
    (AIOrchestrationService.chat as Mock).mockResolvedValue({
      ...ORCHESTRATION_RESPONSE,
      sourceReferences: undefined,
      actions: undefined,
    });

    const result = await gateway.chat(
      { message: 'hi', conversationId: 'conv-1', shopId: 'shop-1', locale: 'en' },
      SHOP_DOMAIN,
    );

    expect(result.sourceReferences).toEqual([]);
    expect(result.actions).toEqual([]);
  });
});

// ─── 2. REMOTE CONTRACT ───────────────────────────────────────────────────────

describe('RemoteIAGateway — remote contract (/api/v1/chat)', () => {
  async function buildRemoteGateway() {
    process.env.IA_BACKEND_URL = 'http://localhost:3001';
    process.env.IA_BACKEND_API_KEY = 'test-api-key-32chars-padded-here!!';
    const { RemoteIAGateway } = await import('../../app/services/ia-gateway.server');
    return new RemoteIAGateway();
  }

  function mockFetchSuccess(body: unknown) {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => body,
    });
  }

  it('calls the versioned /api/v1/chat endpoint via POST', async () => {
    const gateway = await buildRemoteGateway();
    mockFetchSuccess(BACKEND_RESPONSE);

    await gateway.chat(
      { message: 'Hola', conversationId: 'conv-1', shopId: 'shop-1', locale: 'es' },
      SHOP_DOMAIN,
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/chat');
    expect(init.method).toBe('POST');
  });

  it('sends the correct Authorization and X-Shop-Domain headers', async () => {
    const gateway = await buildRemoteGateway();
    mockFetchSuccess(BACKEND_RESPONSE);

    await gateway.chat(
      { message: 'Hola', conversationId: 'conv-1', shopId: 'shop-1', locale: 'es' },
      SHOP_DOMAIN,
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-api-key-32chars-padded-here!!');
    expect(headers['X-Shop-Domain']).toBe(SHOP_DOMAIN);
  });

  it('sends the correct request body shape', async () => {
    const gateway = await buildRemoteGateway();
    mockFetchSuccess(BACKEND_RESPONSE);

    await gateway.chat(
      { message: 'Hola', conversationId: 'conv-1', shopId: 'shop-1', locale: 'es', channel: 'WEB_CHAT' },
      SHOP_DOMAIN,
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      message: 'Hola',
      conversationId: 'conv-1',
      context: { shopId: 'shop-1', locale: 'es', channel: 'WEB_CHAT' },
    });
  });

  it('maps the backend ChatResponse to GatewayChatResponse', async () => {
    const gateway = await buildRemoteGateway();
    mockFetchSuccess(BACKEND_RESPONSE);

    const result = await gateway.chat(
      { message: 'Hola', conversationId: 'conv-1', shopId: 'shop-1', locale: 'es' },
      SHOP_DOMAIN,
    );

    expect(result.message).toBe(BACKEND_RESPONSE.message);
    expect(result.confidence).toBe(BACKEND_RESPONSE.confidence);
    expect(result.requiresEscalation).toBe(false);
    expect(result.toolsUsed).toEqual(['search_products']);
    expect(result.sourceReferences).toHaveLength(1);
  });

  it('fills default values when backend omits optional fields', async () => {
    const gateway = await buildRemoteGateway();
    mockFetchSuccess({ message: 'ok', conversationId: 'conv-1' });

    const result = await gateway.chat(
      { message: 'hi', conversationId: 'conv-1', shopId: 'shop-1', locale: 'en' },
      SHOP_DOMAIN,
    );

    expect(result.confidence).toBe(0.9);
    expect(result.requiresEscalation).toBe(false);
    expect(result.toolsUsed).toEqual([]);
    expect(result.sourceReferences).toEqual([]);
    expect(result.actions).toEqual([]);
  });

  it('wraps non-IABackendError network errors as IABackendError 502', async () => {
    const gateway = await buildRemoteGateway();
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const { IABackendError } = await import('../../app/services/ia-backend.server');

    await expect(
      gateway.chat(
        { message: 'hi', conversationId: 'conv-1', shopId: 'shop-1', locale: 'en' },
        SHOP_DOMAIN,
      ),
    ).rejects.toBeInstanceOf(IABackendError);
  });

  it('re-throws IABackendError unchanged', async () => {
    const gateway = await buildRemoteGateway();
    const { IABackendError } = await import('../../app/services/ia-backend.server');
    const original = new IABackendError('Forbidden', 403);
    mockFetch.mockRejectedValue(original);

    await expect(
      gateway.chat(
        { message: 'hi', conversationId: 'conv-1', shopId: 'shop-1', locale: 'en' },
        SHOP_DOMAIN,
      ),
    ).rejects.toBe(original);
  });
});

// ─── 3. FACTORY CONTRACT ─────────────────────────────────────────────────────

describe('getIAGateway — factory contract', () => {
  it('returns RemoteIAGateway when IA_EXECUTION_MODE is not set', async () => {
    delete process.env.IA_EXECUTION_MODE;
    process.env.IA_BACKEND_URL = 'http://localhost:3001';
    process.env.IA_BACKEND_API_KEY = 'test-api-key-32chars-padded-here!!';
    const { getIAGateway, RemoteIAGateway, _resetIAGateway } = await import('../../app/services/ia-gateway.server');
    _resetIAGateway();
    expect(getIAGateway()).toBeInstanceOf(RemoteIAGateway);
    _resetIAGateway();
  });

  it('returns LocalIAGateway when IA_EXECUTION_MODE=local', async () => {
    process.env.IA_EXECUTION_MODE = 'local';
    const { getIAGateway, LocalIAGateway, _resetIAGateway } = await import('../../app/services/ia-gateway.server');
    _resetIAGateway();
    expect(getIAGateway()).toBeInstanceOf(LocalIAGateway);
    _resetIAGateway();
  });

  it('returns RemoteIAGateway when IA_EXECUTION_MODE=remote', async () => {
    process.env.IA_EXECUTION_MODE = 'remote';
    const { getIAGateway, RemoteIAGateway, _resetIAGateway } = await import('../../app/services/ia-gateway.server');
    _resetIAGateway();
    expect(getIAGateway()).toBeInstanceOf(RemoteIAGateway);
    _resetIAGateway();
  });

  it('caches the singleton across multiple calls', async () => {
    delete process.env.IA_EXECUTION_MODE;
    const { getIAGateway, _resetIAGateway } = await import('../../app/services/ia-gateway.server');
    _resetIAGateway();
    const g1 = getIAGateway();
    const g2 = getIAGateway();
    expect(g1).toBe(g2);
    _resetIAGateway();
  });

  it('resets the singleton after _resetIAGateway()', async () => {
    delete process.env.IA_EXECUTION_MODE;
    const { getIAGateway, _resetIAGateway } = await import('../../app/services/ia-gateway.server');
    _resetIAGateway();
    const g1 = getIAGateway();
    _resetIAGateway();
    const g2 = getIAGateway();
    expect(g1).not.toBe(g2);
    _resetIAGateway();
  });
});

// ─── 4. EXECUTION MODE CONTRACT ───────────────────────────────────────────────

describe('getExecutionMode — execution mode contract', () => {
  afterEach(() => {
    delete process.env.IA_EXECUTION_MODE;
  });

  it('defaults to "remote" when env var is absent', async () => {
    delete process.env.IA_EXECUTION_MODE;
    const { getExecutionMode } = await import('../../app/services/ia-gateway.server');
    expect(getExecutionMode()).toBe('remote');
  });

  it('returns "remote" when IA_EXECUTION_MODE=remote', async () => {
    process.env.IA_EXECUTION_MODE = 'remote';
    const { getExecutionMode } = await import('../../app/services/ia-gateway.server');
    expect(getExecutionMode()).toBe('remote');
  });

  it('falls back to "remote" for unknown values', async () => {
    process.env.IA_EXECUTION_MODE = 'hybrid';
    const { getExecutionMode } = await import('../../app/services/ia-gateway.server');
    expect(getExecutionMode()).toBe('remote');
  });
});
