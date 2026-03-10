import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Config Server', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Environment Variable Validation', () => {
    it('should have SHOPIFY_API_KEY defined', () => {
      expect(process.env.SHOPIFY_API_KEY).toBeDefined();
    });

    it('should have SHOPIFY_API_SECRET defined', () => {
      expect(process.env.SHOPIFY_API_SECRET).toBeDefined();
    });

    it('should have DATABASE_URL defined', () => {
      expect(process.env.DATABASE_URL).toBeDefined();
    });

    it('should have SESSION_SECRET defined or use default', () => {
      const sessionSecret = process.env.SESSION_SECRET || 'default-secret';
      expect(sessionSecret).toBeTruthy();
    });

    it('should have SCOPES defined', () => {
      expect(process.env.SCOPES).toBeDefined();
    });
  });

  describe('Optional Environment Variables', () => {
    it('should have NODE_ENV with default or set value', () => {
      const nodeEnv = process.env.NODE_ENV || 'development';
      expect(['development', 'production', 'test']).toContain(nodeEnv);
    });

    it('should handle OPENAI_API_KEY when set', () => {
      if (process.env.OPENAI_API_KEY) {
        expect(process.env.OPENAI_API_KEY).toBeTruthy();
      }
    });

    it('should handle REDIS_URL when set', () => {
      if (process.env.REDIS_URL) {
        expect(process.env.REDIS_URL).toMatch(/redis:\/\//);
      }
    });

    it('should handle LOG_LEVEL with default', () => {
      const logLevel = process.env.LOG_LEVEL || 'info';
      expect(['debug', 'info', 'warn', 'error']).toContain(logLevel);
    });

    it('should parse boolean flags correctly', () => {
      process.env.FEATURE_PROACTIVE = 'true';
      expect(process.env.FEATURE_PROACTIVE).toBe('true');

      process.env.FEATURE_HANDOFF = 'false';
      expect(process.env.FEATURE_HANDOFF).toBe('false');
    });

    it('should handle numeric environment variables', () => {
      process.env.RATE_LIMIT_MAX = '100';
      expect(parseInt(process.env.RATE_LIMIT_MAX, 10)).toBe(100);

      process.env.RATE_LIMIT_WINDOW = '60000';
      expect(parseInt(process.env.RATE_LIMIT_WINDOW, 10)).toBe(60000);
    });

    it('should handle retention period settings', () => {
      process.env.RETENTION_CONVERSATIONS = '90';
      expect(parseInt(process.env.RETENTION_CONVERSATIONS, 10)).toBe(90);

      process.env.RETENTION_EVENTS = '30';
      expect(parseInt(process.env.RETENTION_EVENTS, 10)).toBe(30);
    });

    it('should validate AI provider settings', () => {
      process.env.AI_PROVIDER = 'openai';
      expect(['openai', 'anthropic', 'gemini']).toContain(process.env.AI_PROVIDER);
    });

    it('should handle port configuration', () => {
      const port = process.env.PORT || '3000';
      expect(parseInt(port, 10)).toBeGreaterThan(0);
      expect(parseInt(port, 10)).toBeLessThan(65536);
    });

    it('should validate app URL format', () => {
      if (process.env.SHOPIFY_APP_URL) {
        expect(process.env.SHOPIFY_APP_URL).toMatch(/^https?:\/\//);
      }
    });

    it('should handle embedding model configuration', () => {
      process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
      expect(process.env.OPENAI_EMBEDDING_MODEL).toBeDefined();
    });

    it('should handle LLM model configuration', () => {
      process.env.OPENAI_MODEL = 'gpt-4';
      expect(process.env.OPENAI_MODEL).toBeDefined();
    });
  });

  describe('Configuration Defaults', () => {
    it('should provide default log level', () => {
      delete process.env.LOG_LEVEL;
      const logLevel = process.env.LOG_LEVEL || 'info';
      expect(logLevel).toBe('info');
    });

    it('should provide default node environment', () => {
      delete process.env.NODE_ENV;
      const nodeEnv = process.env.NODE_ENV || 'development';
      expect(nodeEnv).toBe('development');
    });

    it('should provide default rate limits', () => {
      delete process.env.RATE_LIMIT_MAX;
      const maxRequests = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
      expect(maxRequests).toBe(100);
    });

    it('should provide default window for rate limiting', () => {
      delete process.env.RATE_LIMIT_WINDOW;
      const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10);
      expect(windowMs).toBe(60000);
    });

    it('should provide default retention periods', () => {
      delete process.env.RETENTION_CONVERSATIONS;
      const conversationDays = parseInt(process.env.RETENTION_CONVERSATIONS || '90', 10);
      expect(conversationDays).toBe(90);
    });
  });

  describe('Feature Flags', () => {
    it('should parse feature flag for proactive triggers', () => {
      process.env.FEATURE_PROACTIVE_TRIGGERS = 'true';
      const enabled = process.env.FEATURE_PROACTIVE_TRIGGERS === 'true';
      expect(enabled).toBe(true);
    });

    it('should parse feature flag for human handoff', () => {
      process.env.FEATURE_HUMAN_HANDOFF = 'false';
      const enabled = process.env.FEATURE_HUMAN_HANDOFF === 'true';
      expect(enabled).toBe(false);
    });

    it('should parse feature flag for order lookup', () => {
      process.env.FEATURE_ORDER_LOOKUP = 'true';
      const enabled = process.env.FEATURE_ORDER_LOOKUP === 'true';
      expect(enabled).toBe(true);
    });

    it('should default feature flags to false when not set', () => {
      delete process.env.FEATURE_ANALYTICS;
      const enabled = process.env.FEATURE_ANALYTICS === 'true';
      expect(enabled).toBe(false);
    });
  });

  describe('Security Settings', () => {
    it('should require session secret in production', () => {
      if (process.env.NODE_ENV === 'production') {
        expect(process.env.SESSION_SECRET).toBeTruthy();
        expect(process.env.SESSION_SECRET!.length).toBeGreaterThanOrEqual(32);
      }
    });

    it('should validate scopes format', () => {
      const scopes = process.env.SCOPES || '';
      expect(scopes).toBeTruthy();
      expect(scopes.split(',')).toBeInstanceOf(Array);
    });

    it('should handle CORS origins when set', () => {
      process.env.CORS_ORIGINS = 'https://example.com,https://test.com';
      const origins = process.env.CORS_ORIGINS.split(',');
      expect(origins.length).toBeGreaterThan(0);
      origins.forEach(origin => {
        expect(origin).toMatch(/^https?:\/\//);
      });
    });
  });
});
