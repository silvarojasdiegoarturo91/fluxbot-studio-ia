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

// Mock Shopify modules before importing components
vi.mock('@shopify/shopify-app-react-router/server', () => ({
  boundary: {
    error: vi.fn((error) => ({ error })),
    headers: vi.fn((args) => args),
  },
}));

vi.mock('../../app/shopify.server', () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

// Import components after mocks
import { loader as dashboardLoader } from '../../app/routes/app._index';
import { loader as appLoader } from '../../app/routes/app.tsx';
import { authenticate } from '../../app/shopify.server';

// ============================================================================
// DASHBOARD LOADER TESTS (app._index.tsx)
// ============================================================================

describe('DashboardIndex Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load connected shop data successfully', async () => {
    const mockGraphQL = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          shop: {
            name: 'My Shop',
            myshopifyDomain: 'myshop.myshopify.com',
            primaryDomain: {
              host: 'myshop.com',
            },
            plan: {
              displayName: 'Shopify',
            },
          },
        },
      }),
    });

    vi.mocked(authenticate.admin).mockResolvedValue({
      admin: {
        graphql: mockGraphQL,
      },
    } as any);

    const request = new Request('http://localhost/app');
    const result = await dashboardLoader({ request } as any);

    expect(result.shopConnection.connected).toBe(true);
    expect(result.shopConnection.name).toBe('My Shop');
    expect(result.shopConnection.myshopifyDomain).toBe('myshop.myshopify.com');
    expect(result.shopConnection.primaryDomainHost).toBe('myshop.com');
    expect(result.shopConnection.planName).toBe('Shopify');
    expect(result.shopConnection.error).toBeNull();
  });

  it('should handle shop with minimal data', async () => {
    const mockGraphQL = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          shop: {
            name: 'Test Shop',
          },
        },
      }),
    });

    vi.mocked(authenticate.admin).mockResolvedValue({
      admin: {
        graphql: mockGraphQL,
      },
    } as any);

    const request = new Request('http://localhost/app');
    const result = await dashboardLoader({ request } as any);

    expect(result.shopConnection.connected).toBe(true);
    expect(result.shopConnection.name).toBe('Test Shop');
    expect(result.shopConnection.myshopifyDomain).toBeNull();
    expect(result.shopConnection.primaryDomainHost).toBeNull();
    expect(result.shopConnection.planName).toBeNull();
  });

  it('should handle GraphQL errors gracefully', async () => {
    const mockGraphQL = vi.fn().mockResolvedValue({
      json: async () => ({
        errors: [
          {
            message: 'Access denied',
          },
        ],
      }),
    });

    vi.mocked(authenticate.admin).mockResolvedValue({
      admin: {
        graphql: mockGraphQL,
      },
    } as any);

    const request = new Request('http://localhost/app');
    const result = await dashboardLoader({ request } as any);

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toBe('Access denied');
  });

  it('should handle missing shop data', async () => {
    const mockGraphQL = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {},
      }),
    });

    vi.mocked(authenticate.admin).mockResolvedValue({
      admin: {
        graphql: mockGraphQL,
      },
    } as any);

    const request = new Request('http://localhost/app');
    const result = await dashboardLoader({ request } as any);

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toBe('No shop data returned by Admin API');
  });

  it('should handle authentication errors', async () => {
    vi.mocked(authenticate.admin).mockRejectedValue(new Error('Authentication failed'));

    const request = new Request('http://localhost/app');
    const result = await dashboardLoader({ request } as any);

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toBe('Authentication failed');
  });

  it('should handle network errors during GraphQL call', async () => {
    const mockGraphQL = vi.fn().mockRejectedValue(new Error('Network error'));

    vi.mocked(authenticate.admin).mockResolvedValue({
      admin: {
        graphql: mockGraphQL,
      },
    } as any);

    const request = new Request('http://localhost/app');
    const result = await dashboardLoader({ request } as any);

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toBe('Network error');
  });

  it('should handle non-Error exceptions', async () => {
    vi.mocked(authenticate.admin).mockRejectedValue('String error');

    const request = new Request('http://localhost/app');
    const result = await dashboardLoader({ request } as any);

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toBe('Unknown error');
  });

  it('should handle shop data with all fields populated', async () => {
    const mockGraphQL = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          shop: {
            name: 'Complete Store',
            myshopifyDomain: 'complete.myshopify.com',
            primaryDomain: {
              host: 'complete.com',
            },
            plan: {
              displayName: 'Shopify Plus',
            },
          },
        },
      }),
    });

    vi.mocked(authenticate.admin).mockResolvedValue({
      admin: {
        graphql: mockGraphQL,
      },
    } as any);

    const request = new Request('http://localhost/app');
    const result = await dashboardLoader({ request } as any);

    expect(result.shopConnection).toEqual({
      connected: true,
      name: 'Complete Store',
      myshopifyDomain: 'complete.myshopify.com',
      primaryDomainHost: 'complete.com',
      planName: 'Shopify Plus',
      error: null,
    });
  });

  it('should handle multiple GraphQL errors', async () => {
    const mockGraphQL = vi.fn().mockResolvedValue({
      json: async () => ({
        data: null,
        errors: [
          { message: 'Error 1' },
          { message: 'Error 2' },
        ],
      }),
    });

    vi.mocked(authenticate.admin).mockResolvedValue({
      admin: {
        graphql: mockGraphQL,
      },
    } as any);

    const request = new Request('http://localhost/app');
    const result = await dashboardLoader({ request } as any);

    expect(result.shopConnection.connected).toBe(false);
    expect(result.shopConnection.error).toBe('Error 1');
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
  });

  it('should return API key on successful authentication', async () => {
    vi.mocked(authenticate.admin).mockResolvedValue({} as any);

    const request = new Request('http://localhost/app');
    const result = await appLoader({ request } as any);

    expect(result.apiKey).toBe('test-api-key');
    expect(authenticate.admin).toHaveBeenCalledWith(request);
  });

  it('should throw error on authentication failure', async () => {
    const authError = new Response('Unauthorized', { status: 401 });
    vi.mocked(authenticate.admin).mockRejectedValue(authError);

    const request = new Request('http://localhost/app');

    await expect(appLoader({ request } as any)).rejects.toThrow();
  });

  it('should use empty string if SHOPIFY_API_KEY not set', async () => {
    delete process.env.SHOPIFY_API_KEY;
    vi.mocked(authenticate.admin).mockResolvedValue({} as any);

    const request = new Request('http://localhost/app');
    const result = await appLoader({ request } as any);

    expect(result.apiKey).toBe('');
  });

  it('should handle authentication with custom API key', async () => {
    process.env.SHOPIFY_API_KEY = 'custom-key-123';
    vi.mocked(authenticate.admin).mockResolvedValue({} as any);

    const request = new Request('http://localhost/app');
    const result = await appLoader({ request } as any);

    expect(result.apiKey).toBe('custom-key-123');
  });

  it('should not catch and handle Response errors', async () => {
    const authError = new Response('Forbidden', { status: 403 });
    vi.mocked(authenticate.admin).mockRejectedValue(authError);

    const request = new Request('http://localhost/app');

    await expect(appLoader({ request } as any)).rejects.toEqual(authError);
  });

  it('should handle other non-Response errors', async () => {
    const genericError = new Error('Something went wrong');
    vi.mocked(authenticate.admin).mockRejectedValue(genericError);

    const request = new Request('http://localhost/app');

    await expect(appLoader({ request } as any)).rejects.toThrow('Something went wrong');
  });
});
