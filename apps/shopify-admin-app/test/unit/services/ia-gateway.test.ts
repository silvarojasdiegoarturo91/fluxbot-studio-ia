/**
 * Unit Tests — ia-gateway.server.ts
 *
 * Verifies the internal wiring of the gateway: mode detection, routing,
 * error handling, and singleton management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('../../../app/services/ai-orchestration.server', () => ({
  AIOrchestrationService: {
    chat: vi.fn(),
  },
}));

// Suppress fetch calls (remote gateway tests are in contract tests)
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.resetModules();
  delete process.env.IA_EXECUTION_MODE;
  delete process.env.IA_BACKEND_URL;
  delete process.env.IA_BACKEND_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── getExecutionMode ──────────────────────────────────────────────────────

describe('getExecutionMode()', () => {
  it('returns "remote" by default', async () => {
    const { getExecutionMode } = await import('../../../app/services/ia-gateway.server');
    expect(getExecutionMode()).toBe('remote');
  });

  it('returns "remote" when env var is "remote"', async () => {
    process.env.IA_EXECUTION_MODE = 'remote';
    const { getExecutionMode } = await import('../../../app/services/ia-gateway.server');
    expect(getExecutionMode()).toBe('remote');
  });

  it('returns "remote" for any other value', async () => {
    process.env.IA_EXECUTION_MODE = 'anything';
    const { getExecutionMode } = await import('../../../app/services/ia-gateway.server');
    expect(getExecutionMode()).toBe('remote');
  });
});

// ─── LocalIAGateway ────────────────────────────────────────────────────────

describe('LocalIAGateway', () => {
  const fullResponse = {
    message: 'Great choice!',
    confidence: 0.88,
    requiresEscalation: false,
    toolsUsed: ['search'],
    sourceReferences: [{ documentId: 'd1', chunkId: 'c1', title: 'T', relevance: 0.9 }],
    actions: [{ type: 'add_to_cart' }],
    metadata: {},
  };

  it('passes shopId, conversationId, message and locale to AIOrchestrationService.chat', async () => {
    const { LocalIAGateway } = await import('../../../app/services/ia-gateway.server');
    const { AIOrchestrationService } = await import('../../../app/services/ai-orchestration.server');
    (AIOrchestrationService.chat as Mock).mockResolvedValue(fullResponse);

    const gw = new LocalIAGateway();
    await gw.chat(
      { message: 'hi', conversationId: 'conv-x', shopId: 'shop-x', locale: 'fr' },
      'test.myshopify.com',
    );

    expect(AIOrchestrationService.chat).toHaveBeenCalledWith('shop-x', 'conv-x', 'hi', 'fr');
  });

  it('returns mapped GatewayChatResponse fields', async () => {
    const { LocalIAGateway } = await import('../../../app/services/ia-gateway.server');
    const { AIOrchestrationService } = await import('../../../app/services/ai-orchestration.server');
    (AIOrchestrationService.chat as Mock).mockResolvedValue(fullResponse);

    const gw = new LocalIAGateway();
    const result = await gw.chat(
      { message: 'hi', conversationId: 'conv-x', shopId: 'shop-x', locale: 'en' },
      'test.myshopify.com',
    );

    expect(result.message).toBe('Great choice!');
    expect(result.confidence).toBe(0.88);
    expect(result.requiresEscalation).toBe(false);
    expect(result.toolsUsed).toEqual(['search']);
    expect(result.sourceReferences).toHaveLength(1);
    expect(result.actions).toHaveLength(1);
  });

  it('defaults sourceReferences and actions to [] when undefined', async () => {
    const { LocalIAGateway } = await import('../../../app/services/ia-gateway.server');
    const { AIOrchestrationService } = await import('../../../app/services/ai-orchestration.server');
    (AIOrchestrationService.chat as Mock).mockResolvedValue({
      ...fullResponse,
      sourceReferences: undefined,
      actions: undefined,
    });

    const gw = new LocalIAGateway();
    const result = await gw.chat(
      { message: 'hi', conversationId: 'conv-x', shopId: 'shop-x', locale: 'en' },
      'test.myshopify.com',
    );

    expect(result.sourceReferences).toEqual([]);
    expect(result.actions).toEqual([]);
  });

  it('propagates errors from AIOrchestrationService', async () => {
    const { LocalIAGateway } = await import('../../../app/services/ia-gateway.server');
    const { AIOrchestrationService } = await import('../../../app/services/ai-orchestration.server');
    (AIOrchestrationService.chat as Mock).mockRejectedValue(new Error('LLM timeout'));

    const gw = new LocalIAGateway();
    await expect(
      gw.chat({ message: 'hi', conversationId: 'c', shopId: 's', locale: 'en' }, 'test.myshopify.com'),
    ).rejects.toThrow('LLM timeout');
  });

  it('rejects analyzeIntent in local mode because decisioning is remote-only', async () => {
    const { LocalIAGateway } = await import('../../../app/services/ia-gateway.server');
    const gw = new LocalIAGateway();

    await expect(
      gw.analyzeIntent(
        { shopId: 'shop-1', sessionId: 'sess-1', visitorId: 'visitor-1' },
        'test.myshopify.com',
      ),
    ).rejects.toThrow('Intent analysis must run in the remote IA backend');
  });

  it('rejects getIntentSignals in local mode because decisioning is remote-only', async () => {
    const { LocalIAGateway } = await import('../../../app/services/ia-gateway.server');
    const gw = new LocalIAGateway();

    await expect(
      gw.getIntentSignals('sess-1', 'test.myshopify.com'),
    ).rejects.toThrow('Intent signal retrieval must run in the remote IA backend');
  });

  it('rejects evaluateTriggers in local mode because decisioning is remote-only', async () => {
    const { LocalIAGateway } = await import('../../../app/services/ia-gateway.server');
    const gw = new LocalIAGateway();

    await expect(
      gw.evaluateTriggers(
        { shopId: 'shop-1', sessionId: 'sess-1', visitorId: 'visitor-1' },
        'test.myshopify.com',
      ),
    ).rejects.toThrow('Trigger decisioning must run in the remote IA backend');
  });
});

describe('RemoteIAGateway', () => {
  beforeEach(() => {
    process.env.IA_BACKEND_URL = 'http://localhost:3001';
    process.env.IA_BACKEND_API_KEY = 'test-api-key-32chars-padded-here!!';
  });

  it('normalizes remote intent analysis dates', async () => {
    const { RemoteIAGateway } = await import('../../../app/services/ia-gateway.server');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        analysis: {
          sessionId: 'sess-1',
          scores: {
            purchaseIntent: 0.9,
            abandonmentRisk: 0.1,
            needsHelp: 0.2,
            priceShopperRisk: 0.1,
            browseIntent: 0.05,
          },
          dominantIntent: 'PURCHASE_INTENT',
          confidence: 0.9,
          triggers: ['high_purchase_intent'],
          recommendations: ['show_offer'],
          lastAnalyzedAt: '2026-03-10T10:00:00.000Z',
        },
        signal: {
          id: 'sig-1',
          shopId: 'shop-1',
          sessionId: 'sess-1',
          signalType: 'PURCHASE_INTENT',
          confidence: 0.9,
          triggerData: {},
          createdAt: '2026-03-10T10:00:00.000Z',
        },
      }),
    });

    const gw = new RemoteIAGateway();
    const result = await gw.analyzeIntent(
      { shopId: 'shop-1', sessionId: 'sess-1' },
      'test.myshopify.com',
    );

    expect(result.analysis.lastAnalyzedAt).toBeInstanceOf(Date);
    expect(result.signal?.createdAt).toBeInstanceOf(Date);
  });

  it('normalizes remote trigger responses and keeps backend recommendation when provided', async () => {
    const { RemoteIAGateway } = await import('../../../app/services/ia-gateway.server');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        evaluations: [
          {
            triggerId: 'trigger-1',
            triggerName: 'High Intent Offer',
            decision: 'SEND',
            reason: 'Match',
            message: 'Take 10% off',
            score: 0.92,
          },
        ],
        recommendation: {
          triggerId: 'trigger-1',
          action: 'SEND',
          message: 'Take 10% off',
        },
      }),
    });

    const gw = new RemoteIAGateway();
    const result = await gw.evaluateTriggers(
      { shopId: 'shop-1', sessionId: 'sess-1' },
      'test.myshopify.com',
    );

    expect(result.evaluations).toHaveLength(1);
    expect(result.recommendation).toMatchObject({
      triggerId: 'trigger-1',
      action: 'SEND',
    });
  });
});

describe('RemoteIAGateway — chat', () => {
  beforeEach(() => {
    process.env.IA_BACKEND_URL = 'http://localhost:3001';
    process.env.IA_BACKEND_API_KEY = 'test-api-key-32chars-padded-here!!';
  });

  it('sends the chat request and maps the response with defaults', async () => {
    const { RemoteIAGateway } = await import('../../../app/services/ia-gateway.server');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'Hola!',
        conversationId: 'conv-1',
        sourceReferences: [],
        actions: [],
      }),
    });

    const gw = new RemoteIAGateway();
    const result = await gw.chat(
      { message: 'Hola', conversationId: 'conv-1', shopId: 'shop-1', locale: 'es' },
      'test.myshopify.com',
    );

    expect(result.message).toBe('Hola!');
    expect(result.confidence).toBe(0.9);
    expect(result.requiresEscalation).toBe(false);
    expect(result.toolsUsed).toEqual([]);
    expect(result.sourceReferences).toEqual([]);
    expect(result.actions).toEqual([]);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/chat');
    expect(init.method).toBe('POST');
  });

  it('wraps a plain network error as an IABackendError with 502', async () => {
    const { RemoteIAGateway } = await import('../../../app/services/ia-gateway.server');
    const { IABackendError } = await import('../../../app/services/ia-backend.server');
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const gw = new RemoteIAGateway();
    await expect(
      gw.chat({ message: 'hi', conversationId: 'c', shopId: 's', locale: 'en' }, 'test.myshopify.com'),
    ).rejects.toBeInstanceOf(IABackendError);
  });

  it('rethrows an IABackendError instance unchanged', async () => {
    const { RemoteIAGateway } = await import('../../../app/services/ia-gateway.server');
    const { IABackendError } = await import('../../../app/services/ia-backend.server');
    const original = new IABackendError('Forbidden', 403);
    mockFetch.mockRejectedValue(original);

    const gw = new RemoteIAGateway();
    await expect(
      gw.chat({ message: 'hi', conversationId: 'c', shopId: 's', locale: 'en' }, 'test.myshopify.com'),
    ).rejects.toBe(original);
  });
});

describe('RemoteIAGateway — signals, triggers and embeddings', () => {
  beforeEach(() => {
    process.env.IA_BACKEND_URL = 'http://localhost:3001';
    process.env.IA_BACKEND_API_KEY = 'test-api-key-32chars-padded-here!!';
  });

  it('normalizes intent signals dates', async () => {
    const { RemoteIAGateway } = await import('../../../app/services/ia-gateway.server');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        signals: [
          {
            id: 'sig-1',
            shopId: 'shop-1',
            sessionId: 'sess-1',
            signalType: 'ABANDONMENT_RISK',
            confidence: 0.7,
            triggerData: {},
            createdAt: '2026-03-10T10:00:00.000Z',
          },
        ],
      }),
    });

    const gw = new RemoteIAGateway();
    const result = await gw.getIntentSignals('sess-1', 'test.myshopify.com');

    expect(result).toHaveLength(1);
    expect(result[0].signalType).toBe('ABANDONMENT_RISK');
    expect(result[0].createdAt).toBeInstanceOf(Date);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('/api/v1/intent/session/sess-1');
  });

  it('derives a SEND recommendation when the backend omits it', async () => {
    const { RemoteIAGateway } = await import('../../../app/services/ia-gateway.server');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        evaluations: [
          {
            triggerId: 'trigger-send',
            triggerName: 'Offer',
            decision: 'SEND',
            reason: 'high intent',
            message: 'Take 10% off',
            score: 0.9,
          },
        ],
      }),
    });

    const gw = new RemoteIAGateway();
    const result = await gw.evaluateTriggers(
      { shopId: 'shop-1', sessionId: 'sess-1' },
      'test.myshopify.com',
    );

    expect(result.recommendation).toEqual({
      triggerId: 'trigger-send',
      action: 'SEND',
      message: 'Take 10% off',
      triggerName: 'Offer',
      score: 0.9,
    });
  });

  it('derives a recommendation from the first evaluation when nothing is SEND', async () => {
    const { RemoteIAGateway } = await import('../../../app/services/ia-gateway.server');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        evaluations: [
          {
            triggerId: 'trigger-hold',
            triggerName: 'Wait',
            decision: 'HOLD',
            reason: 'not ready',
            score: 0.4,
          },
        ],
      }),
    });

    const gw = new RemoteIAGateway();
    const result = await gw.evaluateTriggers(
      { shopId: 'shop-1', sessionId: 'sess-1' },
      'test.myshopify.com',
    );

    expect(result.recommendation).toEqual({
      triggerId: 'trigger-hold',
      action: 'HOLD',
      reason: 'not ready',
      triggerName: 'Wait',
      score: 0.4,
    });
  });

  it('returns a null recommendation for empty evaluations', async () => {
    const { RemoteIAGateway } = await import('../../../app/services/ia-gateway.server');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ evaluations: [] }),
    });

    const gw = new RemoteIAGateway();
    const result = await gw.evaluateTriggers(
      { shopId: 'shop-1', sessionId: 'sess-1' },
      'test.myshopify.com',
    );

    expect(result.recommendation).toBeNull();
  });

  it('normalizes embedding search results (relevance fallbacks and defaults)', async () => {
    const { RemoteIAGateway } = await import('../../../app/services/ia-gateway.server');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { chunkId: 'c1', content: 'x', relevance: 0.8, documentType: 'product', title: 'Helmet', metadata: { locale: 'es' } },
          { chunkId: 'c2', content: 'y', score: 0.7, metadata: 'not-an-object' },
          { chunkId: 'c3', content: 'z', title: '', metadata: {} },
        ],
      }),
    });

    const gw = new RemoteIAGateway();
    const result = await gw.searchEmbeddings(
      { queryEmbedding: [1, 0, 0] },
      'test.myshopify.com',
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      chunkId: 'c1',
      documentType: 'product',
      title: 'Helmet',
      content: 'x',
      relevance: 0.8,
      metadata: { locale: 'es' },
    });
    // score fallback, default documentType and Untitled title
    expect(result[1]).toMatchObject({ chunkId: 'c2', relevance: 0.7, documentType: 'article', metadata: {} });
    expect(result[2]).toMatchObject({ chunkId: 'c3', relevance: 0, title: 'Untitled' });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/embeddings/search');
    const body = JSON.parse(init.body as string);
    expect(body.queryEmbedding).toEqual([1, 0, 0]);
  });

  it('maps embedding search errors to IABackendError', async () => {
    const { RemoteIAGateway } = await import('../../../app/services/ia-gateway.server');
    const { IABackendError } = await import('../../../app/services/ia-backend.server');
    mockFetch.mockRejectedValue(new Error('timeout'));

    const gw = new RemoteIAGateway();
    await expect(
      gw.searchEmbeddings({ queryEmbedding: [1, 0, 0] }, 'test.myshopify.com'),
    ).rejects.toBeInstanceOf(IABackendError);
  });
});

describe('LocalIAGateway — searchEmbeddings', () => {
  it('rejects searchEmbeddings in local mode because retrieval is remote-only', async () => {
    const { LocalIAGateway } = await import('../../../app/services/ia-gateway.server');
    const gw = new LocalIAGateway();

    await expect(
      gw.searchEmbeddings({ queryEmbedding: [1, 0, 0] }, 'test.myshopify.com'),
    ).rejects.toThrow('Vector retrieval must run in the remote IA backend');
  });
});

// ─── getIAGateway singleton ────────────────────────────────────────────────

describe('getIAGateway() singleton', () => {
  it('creates a RemoteIAGateway when IA_EXECUTION_MODE is absent', async () => {
    process.env.IA_BACKEND_URL = 'http://localhost:3001';
    process.env.IA_BACKEND_API_KEY = 'test-api-key-32chars-padded-here!!';
    const { getIAGateway, RemoteIAGateway, _resetIAGateway } = await import('../../../app/services/ia-gateway.server');
    _resetIAGateway();
    expect(getIAGateway()).toBeInstanceOf(RemoteIAGateway);
    _resetIAGateway();
  });

  it('returns the same instance on repeated calls', async () => {
    const { getIAGateway, _resetIAGateway } = await import('../../../app/services/ia-gateway.server');
    _resetIAGateway();
    expect(getIAGateway()).toBe(getIAGateway());
    _resetIAGateway();
  });

  it('creates a RemoteIAGateway when IA_EXECUTION_MODE=remote', async () => {
    process.env.IA_EXECUTION_MODE = 'remote';
    const { getIAGateway, RemoteIAGateway, _resetIAGateway } = await import('../../../app/services/ia-gateway.server');
    _resetIAGateway();
    expect(getIAGateway()).toBeInstanceOf(RemoteIAGateway);
    _resetIAGateway();
  });

  it('creates a LocalIAGateway when IA_EXECUTION_MODE=local', async () => {
    process.env.IA_EXECUTION_MODE = 'local';
    const { getIAGateway, LocalIAGateway, _resetIAGateway } = await import('../../../app/services/ia-gateway.server');
    _resetIAGateway();
    expect(getIAGateway()).toBeInstanceOf(LocalIAGateway);
    _resetIAGateway();
  });

  it('_resetIAGateway allows a new instance to be created', async () => {
    const { getIAGateway, _resetIAGateway } = await import('../../../app/services/ia-gateway.server');
    _resetIAGateway();
    const a = getIAGateway();
    _resetIAGateway();
    const b = getIAGateway();
    expect(a).not.toBe(b);
    _resetIAGateway();
  });
});
