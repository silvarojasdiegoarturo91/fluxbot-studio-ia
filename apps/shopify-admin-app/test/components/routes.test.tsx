/**
 * Component Tests - Priority 3
 * 
 * Tests React components using @testing-library/react in jsdom environment.
 * Target: +10-15% code coverage by testing component rendering and interactions.
 * 
 * Components tested:
 * - app._index.tsx (Dashboard) - loader only
 * - app.tsx (App Layout) - loader only
 * - app.settings.tsx (Settings page)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('@shopify/shopify-app-react-router/server', () => ({
  boundary: {
    error: vi.fn((error) => ({ error })),
    headers: vi.fn((args) => args),
  },
  ApiVersion: {
    January26: 'January26',
  },
  AppDistribution: {
    AppStore: 'AppStore',
  },
  shopifyApp: vi.fn(() => ({
    authenticate: {
      admin: vi.fn(),
    },
    addDocumentResponseHeaders: vi.fn(),
    unauthenticated: vi.fn(),
    login: vi.fn(),
    registerWebhooks: vi.fn(),
    sessionStorage: {},
  })),
}));

vi.mock('../../app/shopify.server', () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

vi.mock('../../app/utils/authenticate-admin.server', async () => {
  const actual = await vi.importActual<typeof import('../../app/utils/authenticate-admin.server')>(
    '../../app/utils/authenticate-admin.server',
  );

  return {
    ...actual,
    authenticateAdminRequest: vi.fn(),
  };
});

vi.mock('../../app/services/shop-connection.server', () => ({
  fetchShopConnection: vi.fn(),
  clearShopConnectionCache: vi.fn(),
}));

vi.mock('../../app/services/shop-context.server', () => ({
  ensureShopForSession: vi.fn(),
}));

vi.mock('../../app/services/admin-config.server', () => ({
  getMerchantAdminConfig: vi.fn(),
}));

vi.mock('../../app/services/analytics.server', () => ({
  AnalyticsService: {
    getReport: vi.fn(),
  },
}));

import { loader as dashboardLoader } from '../../app/routes/app._index';
import { loader as appLoader } from '../../app/routes/app.tsx';
import { authenticateAdminRequest } from '../../app/utils/authenticate-admin.server';
import { fetchShopConnection } from '../../app/services/shop-connection.server';
import { ensureShopForSession } from '../../app/services/shop-context.server';
import { getMerchantAdminConfig } from '../../app/services/admin-config.server';
import { AnalyticsService } from '../../app/services/analytics.server';

// ============================================================================
// DASHBOARD LOADER TESTS (app._index.tsx)
// ============================================================================

describe('DashboardIndex Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateAdminRequest).mockResolvedValue({
      admin: {},
      session: undefined,
    } as any);
  });

  it('should surface a connected shop when the service returns live data', async () => {
    vi.mocked(fetchShopConnection).mockResolvedValue({
      shopConnection: {
        connected: true,
        name: 'My Shop',
        myshopifyDomain: 'myshop.myshopify.com',
        primaryDomainHost: 'myshop.com',
        planName: 'Shopify',
        error: null,
        source: 'live',
      },
      alerts: [],
      cacheHit: false,
      cacheAgeMs: null,
    } as any);

    const request = new Request('http://localhost/app');
    const result = await dashboardLoader({ request } as any);

    expect(result.shopConnection.connected).toBe(true);
    expect(result.shopConnection.name).toBe('My Shop');
    expect(result.shopConnection.myshopifyDomain).toBe('myshop.myshopify.com');
    expect(result.shopConnection.primaryDomainHost).toBe('myshop.com');
    expect(result.shopConnection.planName).toBe('Shopify');
    expect(result.shopConnection.error).toBeNull();
    expect(result.shopConnection.source).toBe('live');
  });

  it('should include cache guidance when the helper serves cached data', async () => {
    vi.mocked(fetchShopConnection).mockResolvedValue({
      shopConnection: {
        connected: true,
        name: 'Cached Shop',
        myshopifyDomain: 'cached.myshopify.com',
        primaryDomainHost: 'cached.com',
        planName: 'Shopify Plus',
        error: null,
        source: 'cache',
      },
      alerts: ['Usando datos en caché de Shopify (120s de antigüedad).'],
      cacheHit: true,
      cacheAgeMs: 120_000,
    } as any);

    const request = new Request('http://localhost/app');
    const result = await dashboardLoader({ request } as any);

    expect(result.shopConnection.connected).toBe(true);
    expect(result.shopConnection.source).toBe('cache');
    expect(result.alerts).toContain('Usando datos en caché de Shopify (120s de antigüedad).');
  });

  it('should surface a friendly error when the helper returns a failure', async () => {
    vi.mocked(fetchShopConnection).mockResolvedValue({
      shopConnection: {
        connected: false,
        name: null,
        myshopifyDomain: null,
        primaryDomainHost: null,
        planName: null,
        error: 'No pudimos conectar con Shopify. Verifica tu conexión a internet.',
        source: 'live',
      },
      alerts: ['No pudimos conectar con Shopify. Verifica tu conexión a internet.'],
      cacheHit: false,
      cacheAgeMs: null,
    } as any);

    const request = new Request('http://localhost/app');
    const result = await dashboardLoader({ request } as any);

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toBe('No pudimos conectar con Shopify. Verifica tu conexión a internet.');
    expect(result.alerts).toContain('No pudimos conectar con Shopify. Verifica tu conexión a internet.');
  });
});

// ============================================================================
// APP LAYOUT LOADER TESTS (app.tsx)
// ============================================================================

describe('App Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variable
    process.env.SHOPIFY_API_KEY = 'test-api-key';
    delete process.env.SHOPIFY_APP_URL;
    vi.mocked(authenticateAdminRequest).mockResolvedValue({
      session: { shop: 'test-shop.myshopify.com' },
      admin: {},
    } as any);
    vi.mocked(ensureShopForSession).mockResolvedValue(null as any);
    vi.mocked(getMerchantAdminConfig).mockResolvedValue({
      adminLanguage: 'en',
      onboardingCompleted: true,
      onboardingStep: 1,
    } as any);
    vi.mocked(AnalyticsService.getReport).mockResolvedValue({
      conversations: { total: 0 },
      revenue: { totalRevenue: 0 },
      proactive: { sent: 0 },
    } as any);
  });

  it('should return API key on successful authentication', async () => {
    const request = new Request('http://localhost/app');
    const result = await appLoader({ request } as any);

    expect(result.apiKey).toBe('test-api-key');
    expect(authenticateAdminRequest).toHaveBeenCalledWith(request);
  });

  it('should throw error on authentication failure', async () => {
    const authError = new Response('Unauthorized', { status: 401 });
    vi.mocked(authenticateAdminRequest).mockRejectedValue(authError);

    const request = new Request('http://localhost/app');

    await expect(appLoader({ request } as any)).rejects.toThrow();
  });

  it('should use empty string if SHOPIFY_API_KEY not set', async () => {
    delete process.env.SHOPIFY_API_KEY;
    const request = new Request('http://localhost/app');
    const result = await appLoader({ request } as any);

    expect(result.apiKey).toBe('');
  });

  it('should handle authentication with custom API key', async () => {
    process.env.SHOPIFY_API_KEY = 'custom-key-123';
    const request = new Request('http://localhost/app');
    const result = await appLoader({ request } as any);

    expect(result.apiKey).toBe('custom-key-123');
  });

  it('should not catch and handle Response errors', async () => {
    const authError = new Response('Forbidden', { status: 403 });
    vi.mocked(authenticateAdminRequest).mockRejectedValue(authError);

    const request = new Request('http://localhost/app');

    await expect(appLoader({ request } as any)).rejects.toEqual(authError);
  });

  it('should bounce document requests with expired Shopify auth back through session token refresh', async () => {
    process.env.SHOPIFY_APP_URL = 'https://app.example.com';

    const authError = new Response('Unauthorized', {
      status: 401,
      headers: {
        'X-Shopify-Retry-Invalid-Session-Request': '1',
      },
    });
    vi.mocked(authenticateAdminRequest).mockRejectedValue(authError);

    const request = new Request(
      'http://localhost/app?shop=test-shop.myshopify.com&host=encoded-host&embedded=1&id_token=stale-token',
      {
        headers: {
          accept: 'text/html',
          authorization: 'Bearer expired-session-token',
        },
      },
    );

    try {
      await appLoader({ request } as any);
      throw new Error('Expected loader to redirect');
    } catch (error) {
      expect(error).toBeInstanceOf(Response);

      const response = error as Response;
      expect(response.status).toBe(302);

      const location = response.headers.get('Location');
      expect(location).toBeTruthy();

      const redirectUrl = new URL(location!, 'https://app.example.com');
      expect(`${redirectUrl.pathname}${redirectUrl.search}`).toContain('/auth/session-token?');
      expect(redirectUrl.searchParams.get('shop')).toBe('test-shop.myshopify.com');
      expect(redirectUrl.searchParams.get('host')).toBe('encoded-host');
      expect(redirectUrl.searchParams.get('embedded')).toBe('1');
      expect(redirectUrl.searchParams.get('id_token')).toBeNull();
      expect(redirectUrl.searchParams.get('shopify-reload')).toBe(
        'https://app.example.com/app?shop=test-shop.myshopify.com&host=encoded-host&embedded=1',
      );
    }
  });

  it('should handle other non-Response errors', async () => {
    const genericError = new Error('Something went wrong');
    vi.mocked(authenticateAdminRequest).mockRejectedValue(genericError);

    const request = new Request('http://localhost/app');

    await expect(appLoader({ request } as any)).rejects.toThrow('Something went wrong');
  });
});
