import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SHOP_DOMAIN = 'test-shop.myshopify.com';

vi.mock('../../app/services/ai-orchestration.server', () => ({
  AIOrchestrationService: {
    chat: vi.fn(),
  },
}));

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

describe('LocalIAGateway — intent and trigger contract', () => {
  it('rejects analyzeIntent because local decisioning fallback is disabled', async () => {
    const { LocalIAGateway } = await import('../../app/services/ia-gateway.server');

    const gateway = new LocalIAGateway();

    await expect(
      gateway.analyzeIntent(
        { shopId: 'shop-1', sessionId: 'sess-1', visitorId: 'visitor-1' },
        SHOP_DOMAIN,
      ),
    ).rejects.toThrow('Intent analysis must run in the remote IA backend');
  });

  it('rejects evaluateTriggers because local decisioning fallback is disabled', async () => {
    const { LocalIAGateway } = await import('../../app/services/ia-gateway.server');

    const gateway = new LocalIAGateway();

    await expect(
      gateway.evaluateTriggers(
        { shopId: 'shop-1', sessionId: 'sess-1' },
        SHOP_DOMAIN,
      ),
    ).rejects.toThrow('Trigger decisioning must run in the remote IA backend');
  });
});

describe('RemoteIAGateway — intent and trigger contract', () => {
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

  it('calls POST /api/v1/intent/analyze with the versioned request body', async () => {
    const gateway = await buildRemoteGateway();
    mockFetchSuccess({
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
      signal: null,
    });

    await gateway.analyzeIntent(
      { shopId: 'shop-1', sessionId: 'sess-1', visitorId: 'visitor-1' },
      SHOP_DOMAIN,
    );

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/intent/analyze');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({
      sessionId: 'sess-1',
      visitorId: 'visitor-1',
      context: { shopId: 'shop-1' },
    });
  });

  it('calls GET /api/v1/intent/session/:sessionId for stored signals', async () => {
    const gateway = await buildRemoteGateway();
    mockFetchSuccess({ signals: [] });

    await gateway.getIntentSignals('sess-1', SHOP_DOMAIN);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/intent/session/sess-1');
    expect(init.method).toBe('GET');
  });

  it('calls POST /api/v1/triggers/evaluate with the versioned request body', async () => {
    const gateway = await buildRemoteGateway();
    mockFetchSuccess({
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
    });

    await gateway.evaluateTriggers(
      { shopId: 'shop-1', sessionId: 'sess-1', visitorId: 'visitor-1' },
      SHOP_DOMAIN,
    );

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/triggers/evaluate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({
      sessionId: 'sess-1',
      visitorId: 'visitor-1',
      context: { shopId: 'shop-1' },
    });
  });
});