/**
 * Config Execution Tests - Priority 4
 * 
 * Tests actual config.server.ts execution with various environment configurations.
 * Target: +5% code coverage by testing config initialization logic.
 * 
 * Functions tested:
 * - loadEnvironmentConfig() with different env var combinations
 * - validateRequiredEnv(), getOptionalEnv(), getBooleanEnv(), getNumberEnv()
 * - validateAIProvider()
 * - getConfig() singleton caching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original env
const originalEnv = process.env;

// Clear module cache before each test to reset singleton
beforeEach(() => {
  vi.resetModules();
  // Create a fresh copy of env
  process.env = { ...originalEnv };
});

afterEach(() => {
  // Restore original env
  process.env = originalEnv;
});

describe('Config Server - Environment Loading', () => {
  describe('loadEnvironmentConfig - OpenAI provider', () => {
    it('should load valid OpenAI configuration', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test123';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.shopify.apiKey).toBe('test-api-key');
      expect(config.shopify.apiSecret).toBe('test-api-secret');
      expect(config.shopify.appUrl).toBe('https://test.ngrok.io');
      expect(config.database.url).toBe('postgresql://localhost/test');
      expect(config.session.secret).toBe('a'.repeat(32));
      expect(config.ai.provider).toBe('openai');
      expect(config.ai.openai?.apiKey).toBe('sk-test123');
      expect(config.ai.openai?.model).toBe('gpt-4o-mini');
      expect(config.ai.openai?.embeddingModel).toBe('text-embedding-3-small');
    });

    it('should use custom OpenAI models when specified', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-custom';
      process.env.OPENAI_MODEL = 'gpt-4o';
      process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-3-large';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.ai.openai?.model).toBe('gpt-4o');
      expect(config.ai.openai?.embeddingModel).toBe('text-embedding-3-large');
    });
  });

  describe('loadEnvironmentConfig - Anthropic provider', () => {
    it('should load valid Anthropic configuration', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'b'.repeat(32);
      process.env.AI_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test123';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.ai.provider).toBe('anthropic');
      expect(config.ai.anthropic?.apiKey).toBe('sk-ant-test123');
      expect(config.ai.anthropic?.model).toBe('claude-3-5-sonnet-20241022');
      expect(config.ai.openai).toBeUndefined();
      expect(config.ai.gemini).toBeUndefined();
    });

    it('should use custom Anthropic model when specified', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'b'.repeat(32);
      process.env.AI_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-custom';
      process.env.ANTHROPIC_MODEL = 'claude-3-opus-20240229';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.ai.anthropic?.model).toBe('claude-3-opus-20240229');
    });
  });

  describe('loadEnvironmentConfig - Gemini provider', () => {
    it('should load valid Gemini configuration', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'c'.repeat(32);
      process.env.AI_PROVIDER = 'gemini';
      process.env.GEMINI_API_KEY = 'gemini-test123';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.ai.provider).toBe('gemini');
      expect(config.ai.gemini?.apiKey).toBe('gemini-test123');
      expect(config.ai.gemini?.model).toBe('gemini-2.0-flash-exp');
      expect(config.ai.openai).toBeUndefined();
      expect(config.ai.anthropic).toBeUndefined();
    });

    it('should use custom Gemini model when specified', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'c'.repeat(32);
      process.env.AI_PROVIDER = 'gemini';
      process.env.GEMINI_API_KEY = 'gemini-custom';
      process.env.GEMINI_MODEL = 'gemini-1.5-pro';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.ai.gemini?.model).toBe('gemini-1.5-pro');
    });
  });

  describe('loadEnvironmentConfig - Optional values and defaults', () => {
    it('should use default values for optional environment variables', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'd'.repeat(32);
      process.env.OPENAI_API_KEY = 'sk-default-test';
      // Clear test environment overrides set in test/setup.ts
      delete process.env.AI_PROVIDER;
      delete process.env.REDIS_URL;
      delete process.env.SENTRY_DSN;

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.ai.provider).toBe('openai'); // default
      // Note: SCOPES is set in test/setup.ts to 'read_products,write_products,read_orders'
      expect(config.shopify.scopes).toBe('read_products,write_products,read_orders'); // from setup.ts
      expect(config.redis.url).toBe('redis://localhost:6379'); // default
      // Note: NODE_ENV is 'test' when running under Vitest
      expect(config.nodeEnv).toBe('test'); // vitest environment
      expect(config.observability.logLevel).toBe('info'); // default
      expect(config.rateLimit.maxRequests).toBe(100); // default
      expect(config.rateLimit.windowMs).toBe(60000); // default
      expect(config.retention.conversationDays).toBe(365); // default
      expect(config.retention.behaviorEventDays).toBe(90); // default
    });

    it('should use custom optional values when provided', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'e'.repeat(32);
      process.env.OPENAI_API_KEY = 'sk-custom';
      process.env.SCOPES = 'read_products,write_orders';
      process.env.REDIS_URL = 'redis://custom:6380';
      process.env.NODE_ENV = 'production';
      process.env.LOG_LEVEL = 'debug';
      process.env.RATE_LIMIT_MAX_REQUESTS = '200';
      process.env.RATE_LIMIT_WINDOW_MS = '120000';
      process.env.CONVERSATION_RETENTION_DAYS = '730';
      process.env.BEHAVIOR_EVENT_RETENTION_DAYS = '180';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.shopify.scopes).toBe('read_products,write_orders');
      expect(config.redis.url).toBe('redis://custom:6380');
      expect(config.nodeEnv).toBe('production');
      expect(config.observability.logLevel).toBe('debug');
      expect(config.rateLimit.maxRequests).toBe(200);
      expect(config.rateLimit.windowMs).toBe(120000);
      expect(config.retention.conversationDays).toBe(730);
      expect(config.retention.behaviorEventDays).toBe(180);
    });

    it('should handle optional Sentry DSN', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'f'.repeat(32);
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.SENTRY_DSN = 'https://sentry.io/123';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.observability.sentryDsn).toBe('https://sentry.io/123');
    });
  });

  describe('loadEnvironmentConfig - Feature flags', () => {
    it('should use default feature flag values', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'g'.repeat(32);
      process.env.OPENAI_API_KEY = 'sk-test';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.features.proactiveTriggers).toBe(false); // default
      expect(config.features.humanHandoff).toBe(false); // default
      expect(config.features.orderLookup).toBe(true); // default
    });

    it('should parse feature flags as booleans (true values)', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'h'.repeat(32);
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.ENABLE_PROACTIVE_TRIGGERS = 'true';
      process.env.ENABLE_HUMAN_HANDOFF = 'TRUE';
      process.env.ENABLE_ORDER_LOOKUP = 'true';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.features.proactiveTriggers).toBe(true);
      expect(config.features.humanHandoff).toBe(true);
      expect(config.features.orderLookup).toBe(true);
    });

    it('should parse feature flags as booleans (false values)', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'i'.repeat(32);
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.ENABLE_PROACTIVE_TRIGGERS = 'false';
      process.env.ENABLE_HUMAN_HANDOFF = 'FALSE';
      process.env.ENABLE_ORDER_LOOKUP = 'FaLsE';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.features.proactiveTriggers).toBe(false);
      expect(config.features.humanHandoff).toBe(false);
      expect(config.features.orderLookup).toBe(false);
    });

    it('should treat non-true string values as false', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'j'.repeat(32);
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.ENABLE_PROACTIVE_TRIGGERS = '1';
      process.env.ENABLE_HUMAN_HANDOFF = 'yes';
      process.env.ENABLE_ORDER_LOOKUP = 'enabled';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.features.proactiveTriggers).toBe(false);
      expect(config.features.humanHandoff).toBe(false);
      expect(config.features.orderLookup).toBe(false);
    });
  });

  describe('loadEnvironmentConfig - Number parsing', () => {
    it('should parse valid number environment variables', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'k'.repeat(32);
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.RATE_LIMIT_MAX_REQUESTS = '500';
      process.env.RATE_LIMIT_WINDOW_MS = '30000';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.rateLimit.maxRequests).toBe(500);
      expect(config.rateLimit.windowMs).toBe(30000);
    });

    it('should use defaults for invalid number strings', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'l'.repeat(32);
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.RATE_LIMIT_MAX_REQUESTS = 'invalid';
      process.env.RATE_LIMIT_WINDOW_MS = 'not-a-number';

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.rateLimit.maxRequests).toBe(100); // default
      expect(config.rateLimit.windowMs).toBe(60000); // default
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid number for RATE_LIMIT_MAX_REQUESTS')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('loadEnvironmentConfig - Validation errors', () => {
    it('should throw error for missing SHOPIFY_API_KEY', async () => {
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'm'.repeat(32);
      delete process.env.SHOPIFY_API_KEY;

      const { loadEnvironmentConfig } = await import('../../app/config.server');

      expect(() => loadEnvironmentConfig()).toThrow('Missing required environment variable: SHOPIFY_API_KEY');
    });

    it('should throw error for missing SHOPIFY_API_SECRET', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'n'.repeat(32);
      delete process.env.SHOPIFY_API_SECRET;

      const { loadEnvironmentConfig } = await import('../../app/config.server');

      expect(() => loadEnvironmentConfig()).toThrow('Missing required environment variable: SHOPIFY_API_SECRET');
    });

    it('should throw error for missing DATABASE_URL', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.SESSION_SECRET = 'o'.repeat(32);
      delete process.env.DATABASE_URL;

      const { loadEnvironmentConfig } = await import('../../app/config.server');

      expect(() => loadEnvironmentConfig()).toThrow('Missing required environment variable: DATABASE_URL');
    });

    it('should throw error for missing SESSION_SECRET', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      delete process.env.SESSION_SECRET;

      const { loadEnvironmentConfig } = await import('../../app/config.server');

      expect(() => loadEnvironmentConfig()).toThrow('Missing required environment variable: SESSION_SECRET');
    });

    it('should throw error for SESSION_SECRET shorter than 32 characters', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'short'; // only 5 chars
      process.env.OPENAI_API_KEY = 'sk-test';

      const { loadEnvironmentConfig } = await import('../../app/config.server');

      expect(() => loadEnvironmentConfig()).toThrow('SESSION_SECRET must be at least 32 characters long');
    });

    it('should throw error for invalid AI_PROVIDER', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'p'.repeat(32);
      process.env.AI_PROVIDER = 'invalid-provider';

      const { loadEnvironmentConfig } = await import('../../app/config.server');

      expect(() => loadEnvironmentConfig()).toThrow(
        'Invalid AI_PROVIDER: invalid-provider. Must be one of: openai, anthropic, gemini'
      );
    });

    it('should throw error for missing OPENAI_API_KEY when provider is openai', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'q'.repeat(32);
      process.env.AI_PROVIDER = 'openai';
      delete process.env.OPENAI_API_KEY;

      const { loadEnvironmentConfig } = await import('../../app/config.server');

      expect(() => loadEnvironmentConfig()).toThrow('Missing required environment variable: OPENAI_API_KEY');
    });

    it('should throw error for missing ANTHROPIC_API_KEY when provider is anthropic', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'r'.repeat(32);
      process.env.AI_PROVIDER = 'anthropic';
      delete process.env.ANTHROPIC_API_KEY;

      const { loadEnvironmentConfig } = await import('../../app/config.server');

      expect(() => loadEnvironmentConfig()).toThrow('Missing required environment variable: ANTHROPIC_API_KEY');
    });

    it('should throw error for missing GEMINI_API_KEY when provider is gemini', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 's'.repeat(32);
      process.env.AI_PROVIDER = 'gemini';
      delete process.env.GEMINI_API_KEY;

      const { loadEnvironmentConfig } = await import('../../app/config.server');

      expect(() => loadEnvironmentConfig()).toThrow('Missing required environment variable: GEMINI_API_KEY');
    });

    it('should throw error for empty string in required variable', async () => {
      process.env.SHOPIFY_API_KEY = '';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 't'.repeat(32);

      const { loadEnvironmentConfig } = await import('../../app/config.server');

      expect(() => loadEnvironmentConfig()).toThrow('Missing required environment variable: SHOPIFY_API_KEY');
    });

    it('should throw error for whitespace-only string in required variable', async () => {
      process.env.SHOPIFY_API_KEY = '   ';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'u'.repeat(32);

      const { loadEnvironmentConfig } = await import('../../app/config.server');

      expect(() => loadEnvironmentConfig()).toThrow('Missing required environment variable: SHOPIFY_API_KEY');
    });
  });

  describe('getConfig - Singleton caching', () => {
    it('should return same instance on multiple calls', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'v'.repeat(32);
      process.env.OPENAI_API_KEY = 'sk-test';

      const { getConfig } = await import('../../app/config.server');
      
      const config1 = getConfig();
      const config2 = getConfig();
      const config3 = getConfig();

      expect(config1).toBe(config2);
      expect(config2).toBe(config3);
    });

    it('should cache config between calls', async () => {
      process.env.SHOPIFY_API_KEY = 'test-api-key';
      process.env.SHOPIFY_API_SECRET = 'test-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://test.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'w'.repeat(32);
      process.env.OPENAI_API_KEY = 'sk-test';

      const configModule = await import('../../app/config.server');

      const config1 = configModule.getConfig();
      const config2 = configModule.getConfig();
      const config3 = configModule.getConfig();

      // All calls should return the same cached object instance
      expect(config1).toBe(config2);
      expect(config2).toBe(config3);
      // Verify it's not recreating the config
      expect(config1.shopify.apiKey).toBe('test-api-key');
    });
  });

  describe('Complete configuration scenarios', () => {
    it('should load complete production-like configuration', async () => {
      process.env.SHOPIFY_API_KEY = 'prod-api-key';
      process.env.SHOPIFY_API_SECRET = 'prod-api-secret';
      process.env.SHOPIFY_APP_URL = 'https://myapp.com';
      process.env.SCOPES = 'read_products,write_products,read_orders,read_customers';
      process.env.DATABASE_URL = 'postgresql://user:pass@prod-db:5432/myapp';
      process.env.REDIS_URL = 'redis://prod-redis:6379';
      process.env.AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-prod-key';
      process.env.OPENAI_MODEL = 'gpt-4o';
      process.env.SESSION_SECRET = 'x'.repeat(64);
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_PROACTIVE_TRIGGERS = 'true';
      process.env.ENABLE_HUMAN_HANDOFF = 'true';
      process.env.ENABLE_ORDER_LOOKUP = 'true';
      process.env.SENTRY_DSN = 'https://sentry.io/project';
      process.env.LOG_LEVEL = 'warn';
      process.env.RATE_LIMIT_MAX_REQUESTS = '1000';
      process.env.RATE_LIMIT_WINDOW_MS = '60000';
      process.env.CONVERSATION_RETENTION_DAYS = '730';
      process.env.BEHAVIOR_EVENT_RETENTION_DAYS = '180';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config).toMatchObject({
        shopify: {
          apiKey: 'prod-api-key',
          apiSecret: 'prod-api-secret',
          appUrl: 'https://myapp.com',
          scopes: 'read_products,write_products,read_orders,read_customers',
        },
        database: {
          url: 'postgresql://user:pass@prod-db:5432/myapp',
        },
        redis: {
          url: 'redis://prod-redis:6379',
        },
        ai: {
          provider: 'openai',
          openai: {
            apiKey: 'sk-prod-key',
            model: 'gpt-4o',
            embeddingModel: 'text-embedding-3-small',
          },
        },
        session: {
          secret: 'x'.repeat(64),
        },
        nodeEnv: 'production',
        features: {
          proactiveTriggers: true,
          humanHandoff: true,
          orderLookup: true,
        },
        observability: {
          sentryDsn: 'https://sentry.io/project',
          logLevel: 'warn',
        },
        rateLimit: {
          maxRequests: 1000,
          windowMs: 60000,
        },
        retention: {
          conversationDays: 730,
          behaviorEventDays: 180,
        },
      });
    });

    it('should load minimal test environment configuration', async () => {
      process.env.SHOPIFY_API_KEY = 'dev-key';
      process.env.SHOPIFY_API_SECRET = 'dev-secret';
      process.env.SHOPIFY_APP_URL = 'https://dev.ngrok.io';
      process.env.DATABASE_URL = 'postgresql://localhost/dev';
      process.env.SESSION_SECRET = 'y'.repeat(32);
      process.env.GEMINI_API_KEY = 'gemini-dev-key';
      process.env.AI_PROVIDER = 'gemini';

      const { loadEnvironmentConfig } = await import('../../app/config.server');
      const config = loadEnvironmentConfig();

      expect(config.shopify.apiKey).toBe('dev-key');
      expect(config.ai.provider).toBe('gemini');
      expect(config.ai.gemini?.apiKey).toBe('gemini-dev-key');
      expect(config.nodeEnv).toBe('test'); // Vitest sets NODE_ENV=test
      expect(config.redis.url).toBe('redis://localhost:6379'); // default
      expect(config.features.proactiveTriggers).toBe(false); // default
    });
  });
});
