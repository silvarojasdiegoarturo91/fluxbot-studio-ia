/**
 * Environment configuration validation
 * Validates required environment variables on app startup
 */

interface EnvironmentConfig {
  // Shopify
  shopify: {
    apiKey: string;
    apiSecret: string;
    appUrl: string;
    scopes: string;
  };
  
  // Database
  database: {
    url: string;
  };
  
  // Redis
  redis: {
    url: string;
  };
  
  // AI Provider
  ai: {
    provider: 'openai' | 'anthropic' | 'gemini';
    openai?: {
      apiKey: string;
      model: string;
      embeddingModel: string;
    };
    anthropic?: {
      apiKey: string;
      model: string;
    };
    gemini?: {
      apiKey: string;
      model: string;
    };
  };
  
  // Session
  session: {
    secret: string;
  };
  
  // Environment
  nodeEnv: string;
  
  // Feature Flags
  features: {
    proactiveTriggers: boolean;
    humanHandoff: boolean;
    orderLookup: boolean;
  };
  
  // Observability
  observability: {
    sentryDsn?: string;
    logLevel: string;
  };
  
  // Rate Limiting
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
  
  // Data Retention
  retention: {
    conversationDays: number;
    behaviorEventDays: number;
  };

  // IA Gateway
  ia: {
    executionMode: 'local' | 'remote';
    backendUrl?: string;
    backendApiKey?: string;
  };
}

function validateRequiredEnv(key: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getBooleanEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

function getNumberEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    console.warn(`Invalid number for ${key}, using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

function validateAIProvider(provider: string): 'openai' | 'anthropic' | 'gemini' {
  if (provider !== 'openai' && provider !== 'anthropic' && provider !== 'gemini') {
    throw new Error(`Invalid AI_PROVIDER: ${provider}. Must be one of: openai, anthropic, gemini`);
  }
  return provider;
}

export function loadEnvironmentConfig(): EnvironmentConfig {
  // Load .env file in development
  if (process.env.NODE_ENV !== 'production') {
    try {
      // Dynamic import to avoid bundling in production
      // Note: You may need to install dotenv: npm install dotenv
      // require('dotenv').config();
    } catch {
      // dotenv not available, continue
    }
  }

  const iaExecutionMode = (process.env.IA_EXECUTION_MODE === 'local' ? 'local' : 'remote') as 'local' | 'remote';

  // The provider config is only executed in local mode, but we keep parsing the value
  // so the shape stays stable across both execution modes.
  const aiProvider = validateAIProvider(getOptionalEnv('AI_PROVIDER', 'openai'));
  
  const config: EnvironmentConfig = {
    shopify: {
      apiKey: validateRequiredEnv('SHOPIFY_API_KEY', process.env.SHOPIFY_API_KEY),
      apiSecret: validateRequiredEnv('SHOPIFY_API_SECRET', process.env.SHOPIFY_API_SECRET),
      appUrl: validateRequiredEnv('SHOPIFY_APP_URL', process.env.SHOPIFY_APP_URL),
      scopes: getOptionalEnv('SCOPES', 'read_products,write_products'),
    },
    
    database: {
      url: validateRequiredEnv('DATABASE_URL', process.env.DATABASE_URL),
    },
    
    redis: {
      url: getOptionalEnv('REDIS_URL', 'redis://localhost:6379'),
    },
    
    ai: {
      provider: aiProvider,
    },
    
    session: {
      secret: validateRequiredEnv('SESSION_SECRET', process.env.SESSION_SECRET),
    },
    
    nodeEnv: getOptionalEnv('NODE_ENV', 'development'),
    
    features: {
      proactiveTriggers: getBooleanEnv('ENABLE_PROACTIVE_TRIGGERS', false),
      humanHandoff: getBooleanEnv('ENABLE_HUMAN_HANDOFF', false),
      orderLookup: getBooleanEnv('ENABLE_ORDER_LOOKUP', true),
    },
    
    observability: {
      sentryDsn: process.env.SENTRY_DSN,
      logLevel: getOptionalEnv('LOG_LEVEL', 'info'),
    },
    
    rateLimit: {
      maxRequests: getNumberEnv('RATE_LIMIT_MAX_REQUESTS', 100),
      windowMs: getNumberEnv('RATE_LIMIT_WINDOW_MS', 60000),
    },
    
    retention: {
      conversationDays: getNumberEnv('CONVERSATION_RETENTION_DAYS', 365),
      behaviorEventDays: getNumberEnv('BEHAVIOR_EVENT_RETENTION_DAYS', 90),
    },
    ia: {
      executionMode: iaExecutionMode,
      backendUrl:
        iaExecutionMode === 'remote'
          ? validateRequiredEnv('IA_BACKEND_URL', process.env.IA_BACKEND_URL)
          : process.env.IA_BACKEND_URL,
      backendApiKey:
        iaExecutionMode === 'remote'
          ? validateRequiredEnv('IA_BACKEND_API_KEY', process.env.IA_BACKEND_API_KEY)
          : process.env.IA_BACKEND_API_KEY,
    },
  };

  // Validate AI provider credentials only in local mode.
  // In remote mode, the backend handles provider keys — no need to have them here.
  if (iaExecutionMode === 'local') {
    if (aiProvider === 'openai') {
      config.ai.openai = {
        apiKey: validateRequiredEnv('OPENAI_API_KEY', process.env.OPENAI_API_KEY),
        model: getOptionalEnv('OPENAI_MODEL', 'gpt-4o-mini'),
        embeddingModel: getOptionalEnv('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
      };
    } else if (aiProvider === 'anthropic') {
      config.ai.anthropic = {
        apiKey: validateRequiredEnv('ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY),
        model: getOptionalEnv('ANTHROPIC_MODEL', 'claude-3-5-sonnet-20241022'),
      };
    } else if (aiProvider === 'gemini') {
      config.ai.gemini = {
        apiKey: validateRequiredEnv('GEMINI_API_KEY', process.env.GEMINI_API_KEY),
        model: getOptionalEnv('GEMINI_MODEL', 'gemini-2.0-flash-exp'),
      };
    }
  }
  
  // Validate session secret length
  if (config.session.secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long');
  }
  
  return config;
}

// Singleton instance
let cachedConfig: EnvironmentConfig | null = null;

export function getConfig(): EnvironmentConfig {
  if (!cachedConfig) {
    cachedConfig = loadEnvironmentConfig();
  }
  return cachedConfig;
}

// Auto-validate on import in production
if (process.env.NODE_ENV === 'production') {
  try {
    loadEnvironmentConfig();
    console.log('✓ Environment configuration validated successfully');
  } catch (error) {
    console.error('✗ Environment configuration validation failed:', error);
    process.exit(1);
  }
}
