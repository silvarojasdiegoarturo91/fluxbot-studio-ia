/**
 * IA Backend Client
 * Communication layer with fluxbot-studio-back-ia
 */

interface IABackendConfig {
  baseUrl: string;
  apiKey: string;
}

type BackendRequestContext = {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
};

function getBackendConfig(): IABackendConfig {
  const baseUrl = process.env.IA_BACKEND_URL;
  const apiKey = process.env.IA_BACKEND_API_KEY;
  
  if (!baseUrl || !apiKey) {
    throw new Error('IA_BACKEND_URL and IA_BACKEND_API_KEY must be configured');
  }
  
  return { baseUrl, apiKey };
}

function buildBackendUrl(baseUrl: string, endpoint: string): string {
  try {
    return new URL(endpoint, baseUrl).toString();
  } catch {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${normalizedBase}${normalizedEndpoint}`;
  }
}

function describeNetworkError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: { code?: string; message?: string } }).cause;
    const causeCode = cause && typeof cause.code === 'string' ? cause.code : null;
    const causeMessage = cause && typeof cause.message === 'string' ? cause.message : null;
    if (causeCode || causeMessage) {
      return [causeCode, causeMessage].filter(Boolean).join(': ');
    }
    return error.message;
  }

  return String(error);
}

function buildTransportFailureMessage(context: BackendRequestContext, url: string, error: unknown): string {
  const details = describeNetworkError(error);
  return `IA backend unreachable (${context.method} ${url}). ${details}. ` +
    'Check IA_BACKEND_URL, backend service availability, and network routing.';
}

async function parseErrorBody(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const jsonError = await response.json().catch(() => null);
    return describeBackendErrorPayload(jsonError);
  }

  const text = await response.text().catch(() => 'Unknown error');
  return text || 'Unknown error';
}

export function describeBackendErrorPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return 'Unknown error';

  const record = payload as Record<string, unknown>;
  const error = record.error;

  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>;
    const code = typeof errorRecord.code === 'string' ? errorRecord.code : null;
    const message = typeof errorRecord.message === 'string' ? errorRecord.message : null;
    const details = describeDetails(errorRecord.details);
    return [message, code ? `Código: ${code}` : null, details].filter(Boolean).join(' | ') || JSON.stringify(errorRecord);
  }

  if (typeof record.message === 'string') return record.message;
  if (typeof record.code === 'string') return `Código: ${record.code}`;
  return JSON.stringify(record);
}

function describeDetails(details: unknown): string | null {
  if (!details) return null;
  if (typeof details === 'string') return details;
  if (Array.isArray(details)) {
    const messages = details
      .map((detail) => {
        if (typeof detail === 'string') return detail;
        if (detail && typeof detail === 'object' && typeof (detail as { message?: unknown }).message === 'string') {
          return (detail as { message: string }).message;
        }
        return null;
      })
      .filter(Boolean);
    return messages.length > 0 ? messages.join(', ') : null;
  }
  if (typeof details === 'object') return JSON.stringify(details);
  return String(details);
}

function getHttpStatusHint(status: number): string {
  if (status === 401 || status === 403) {
    return 'Verify IA_BACKEND_API_KEY matches the backend configuration.';
  }

  if (status === 404) {
    return 'Verify IA_BACKEND_URL and backend route versioning (/api/v1/*).';
  }

  if (status >= 500) {
    return 'Backend service is up but failing internally; inspect backend logs.';
  }

  return '';
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  context?: {
    shopId: string;
    locale?: string;
    channel?: string;
  };
}

export interface ChatResponse {
  message: string;
  conversationId: string;
  // Rich fields returned by /api/v1/chat
  confidence?: number;
  requiresEscalation?: boolean;
  escalationReason?: string;
  toolsUsed?: string[];
  sourceReferences?: Array<{
    documentId: string;
    chunkId: string;
    title: string;
    relevance: number;
    url?: string;
  }>;
  actions?: Array<Record<string, unknown>>;
  toolInvocations?: unknown[];
}

export interface ProvidersResponse {
  providers: Array<{
    id: string;
    provider: string;
    model: string;
    isPrimary: boolean;
    isActive: boolean;
  }>;
}

export type RerankStrategy = 'cross_encoder' | 'reciprocal_rank_fusion' | 'bm25_hybrid' | 'none';

export interface RAGSearchRequest {
  query: string;
  filters?: {
    sourceType?: 'CATALOG' | 'POLICIES' | 'PAGES' | 'BLOG' | 'FAQ' | 'CUSTOM';
    language?: string;
    limit?: number;
    /** Minimum relevance score (0–1); backend should pre-filter results below this threshold. */
    minScore?: number;
    /** Reranking strategy the backend should apply after initial retrieval. */
    rerankStrategy?: RerankStrategy;
    /** Maximum results to return after reranking; defaults to `limit` when omitted. */
    topK?: number;
  };
}

export interface RAGQualityMetadata {
  wasReranked: boolean;
  rerankStrategy: string;
  appliedMinScore: number;
  candidatesBeforeRerank: number;
}

export interface RAGSearchResult {
  results: Array<{
    chunkId: string;
    content: string;
    score: number;
    metadata?: unknown;
  }>;
  /** Optional quality metadata populated by the backend when reranking was applied. */
  qualityMetadata?: RAGQualityMetadata;
}

export interface EmbeddingSearchRequest {
  queryEmbedding: number[];
  options?: {
    limit?: number;
    threshold?: number;
    filter?: {
      documentType?: string;
      locales?: string[];
      shopId?: string;
      metadata?: Record<string, unknown>;
    };
  };
}

export interface EmbeddingSearchResult {
  chunkId: string;
  documentType?: string;
  title?: string;
  content: string;
  relevance?: number;
  score?: number;
  metadata?: unknown;
}

export interface EmbeddingSearchResponse {
  results: EmbeddingSearchResult[];
}

export interface IntentScore {
  purchaseIntent: number;
  abandonmentRisk: number;
  needsHelp: number;
  priceShopperRisk: number;
  browseIntent: number;
}

export interface IntentAnalysisResult {
  sessionId: string;
  scores: IntentScore;
  dominantIntent: string;
  confidence: number;
  triggers: string[];
  recommendations: string[];
  lastAnalyzedAt: string;
}

export interface IntentSignalResult {
  id: string;
  shopId: string;
  sessionId: string;
  visitorId?: string | null;
  signalType: string;
  confidence: number;
  triggerData: Record<string, unknown>;
  actionTaken?: string | null;
  outcome?: string | null;
  createdAt: string;
}

export interface IntentAnalyzeRequest {
  sessionId: string;
  visitorId?: string;
  context?: {
    shopId: string;
  };
}

export interface IntentAnalyzeResponse {
  analysis: IntentAnalysisResult;
  signal: IntentSignalResult | null;
}

export interface IntentSessionSignalsResponse {
  signals: IntentSignalResult[];
}

export interface TriggerEvaluateRequest {
  sessionId: string;
  visitorId?: string;
  context?: {
    shopId: string;
  };
}

export interface TriggerEvaluationResult {
  triggerId: string;
  triggerName: string;
  decision: 'SEND' | 'WAIT_COOLDOWN' | 'CONDITION_NOT_MET' | 'SKIP';
  reason: string;
  message?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface TriggerRecommendationResult {
  triggerId: string;
  action: string;
  message?: string;
  reason?: string;
  triggerName?: string;
  score?: number;
}

export interface TriggerEvaluateResponse {
  evaluations: TriggerEvaluationResult[];
  recommendation?: TriggerRecommendationResult | null;
}

export interface LlmsTxtGenerateRequest {
  shopDomain?: string;
  includePolicies?: boolean;
  includeProducts?: boolean;
  maxProducts?: number;
}

export interface ShopSyncRequest {
  shop: {
    id: string;
    domain: string;
    name?: string;
    accessToken?: string;
  };
}

export interface ShopSyncResponse {
  shop: {
    id: string;
    domain: string;
    name?: string | null;
  };
  created: boolean;
  syncedAt: string;
}

export type AssistantPersona = 'FRIENDLY' | 'PROFESSIONAL' | 'EXPERT' | 'CASUAL';

export interface AssistantConfigRequest {
  shopId: string;
  assistantName?: string;
  persona?: AssistantPersona;
  tone?: string;
  systemInstructions?: string | null;
  welcomeMessage?: string | null;
  language?: string;
  productCategories?: string[];
}

export interface AssistantConfigResponse {
  shopId: string;
  assistantName: string;
  persona: AssistantPersona;
  tone: string;
  systemInstructions: string | null;
  welcomeMessage: string | null;
  language: string;
  productCategories: string[];
}

export interface CatalogSyncRequest {
  shopId: string;
  fullSync?: boolean;
}

export interface CatalogSyncResponse {
  chunksIndexed: number;
  productsProcessed?: number;
  durationMs: number;
  errors?: string[];
}

export interface BillingPlanResponse {
  code: string;
  name: string;
  billingMode: 'shopify_app_pricing' | 'shopify_legacy_billing';
  currency: string;
  basePrice?: number;
  includedMessages: number;
  includedPeriodType: 'lifetime' | 'monthly';
  extraBlockSize?: number | null;
  extraBlockPrice?: number | null;
  cappedAmount?: number | null;
}

export interface BillingStatusResponse {
  hasActiveSubscription: boolean;
  subscriptions: Array<{
    id: string;
    name: string;
    status: string;
    test: boolean;
    priceAmount: string;
    priceCurrency: string;
    interval: string;
  }>;
  shopId: string;
  activePlanCode: string;
  billingCurrency: string;
  currentUsage: number;
  includedUsage: number;
  billableBlocks: number;
  billedBlocks: number;
  balanceUsed: number;
  cappedAmount: number;
  softCapAmount: number;
  billingCycleStart: string;
  billingCycleEnd: string;
  status: string;
}

export interface BillingSubscribeRequest {
  planCode: string;
  returnUrl?: string;
  test?: boolean;
}

export interface BillingSubscribeResponse {
  confirmationUrl: string;
  subscriptionId?: string;
  usageLineItemId?: string;
}

export class IABackendError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public isOperational = true
  ) {
    super(message);
    this.name = 'IABackendError';
  }
}

async function makeRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
  shopDomain?: string
): Promise<T> {
  const config = getBackendConfig();
  const requestContext: BackendRequestContext = { endpoint, method };
  const url = buildBackendUrl(config.baseUrl, endpoint);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };

  if (shopDomain) {
    headers['X-Shop-Domain'] = shopDomain;
  }

  console.info("[IABackend] enviando request", {
    endpoint,
    method,
    hasShopDomain: !!shopDomain,
    shopDomain,
    url: url.replace(/\/[^/]+\/[^/]+$/, "/..."),
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof IABackendError) {
      throw error;
    }
    throw new IABackendError(buildTransportFailureMessage(requestContext, url, error), 503);
  }

  if (!response.ok) {
    const backendError = await parseErrorBody(response);
    const hint = getHttpStatusHint(response.status);
    const message = `IA backend request failed (${method} ${url}) with status ${response.status}: ${backendError}`;
    throw new IABackendError(hint ? `${message}. ${hint}` : message, response.status);
  }

  // Backend wraps all responses as { data: T, requestId, timestamp }.
  // Unwrap here so callers and gateway normalizers work against the inner payload.
  const envelope = await response.json();
  if (
    envelope !== null &&
    typeof envelope === 'object' &&
    'data' in envelope &&
    typeof (envelope as { data: unknown }).data !== 'undefined'
  ) {
    return (envelope as { data: T }).data;
  }
  return envelope as T;
}

async function makeTextRequest(
  endpoint: string,
  method: 'GET' | 'POST',
  body?: unknown,
  shopDomain?: string
): Promise<string> {
  const config = getBackendConfig();
  const requestContext: BackendRequestContext = { endpoint, method };
  const url = buildBackendUrl(config.baseUrl, endpoint);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };

  if (shopDomain) {
    headers['X-Shop-Domain'] = shopDomain;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof IABackendError) {
      throw error;
    }
    throw new IABackendError(buildTransportFailureMessage(requestContext, url, error), 503);
  }

  if (!response.ok) {
    const backendError = await parseErrorBody(response);
    const hint = getHttpStatusHint(response.status);
    const message = `IA backend request failed (${method} ${url}) with status ${response.status}: ${backendError}`;
    throw new IABackendError(hint ? `${message}. ${hint}` : message, response.status);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    if (typeof payload === 'string') return payload;
    if (payload && typeof payload.content === 'string') return payload.content;
    if (payload && typeof payload.llmsTxt === 'string') return payload.llmsTxt;
    return JSON.stringify(payload);
  }

  return response.text();
}

// API version prefix — all backend endpoints are versioned under /api/v1
const API_V1 = '/api/v1';

export const iaClient = {
  chat: {
    send: (request: ChatRequest, shopDomain?: string) =>
      makeRequest<ChatResponse>(`${API_V1}/chat`, 'POST', request, shopDomain),

    stream: (request: ChatRequest, shopDomain?: string) =>
      makeRequest<ChatResponse>(`${API_V1}/chat/stream`, 'POST', request, shopDomain),
  },

  providers: {
    list: (shopDomain?: string) =>
      makeRequest<ProvidersResponse>(`${API_V1}/providers`, 'GET', undefined, shopDomain),

    create: (config: unknown, shopDomain?: string) =>
      makeRequest<ProvidersResponse>(`${API_V1}/providers`, 'POST', config, shopDomain),

    update: (id: string, config: unknown, shopDomain?: string) =>
      makeRequest<ProvidersResponse>(`${API_V1}/providers/${id}`, 'PUT', config, shopDomain),

    delete: (id: string, shopDomain?: string) =>
      makeRequest<{ message: string }>(`${API_V1}/providers/${id}`, 'DELETE', undefined, shopDomain),
  },

  rag: {
    search: (request: RAGSearchRequest, shopDomain?: string) =>
      makeRequest<RAGSearchResult>(`${API_V1}/rag/search`, 'POST', request, shopDomain),

    index: (documents: unknown[], shopDomain?: string) =>
      makeRequest<{ message: string }>(`${API_V1}/rag/index`, 'POST', { documents }, shopDomain),
  },

  embeddings: {
    generate: (text: string, provider?: string, shopDomain?: string) =>
      makeRequest<{ embedding: number[] }>(`${API_V1}/embeddings/generate`, 'POST', { text, provider }, shopDomain),

    generateBatch: (texts: string[], provider?: string, shopDomain?: string) =>
      makeRequest<{ embeddings: number[][] }>(`${API_V1}/embeddings/generate/batch`, 'POST', { texts, provider }, shopDomain),

    search: (request: EmbeddingSearchRequest, shopDomain?: string) =>
      makeRequest<EmbeddingSearchResponse>(`${API_V1}/embeddings/search`, 'POST', request, shopDomain),
  },

  intent: {
    analyze: (request: IntentAnalyzeRequest, shopDomain?: string) =>
      makeRequest<IntentAnalyzeResponse>(`${API_V1}/intent/analyze`, 'POST', request, shopDomain),

    getSessionSignals: (sessionId: string, shopDomain?: string) =>
      makeRequest<IntentSessionSignalsResponse>(
        `${API_V1}/intent/session/${encodeURIComponent(sessionId)}`,
        'GET',
        undefined,
        shopDomain,
      ),
  },

  triggers: {
    list: (shopDomain?: string) =>
      makeRequest<{ triggers: unknown[] }>(`${API_V1}/triggers`, 'GET', undefined, shopDomain),

    create: (config: unknown, shopDomain?: string) =>
      makeRequest<{ message: string }>(`${API_V1}/triggers`, 'POST', config, shopDomain),

    evaluate: (context: TriggerEvaluateRequest, shopDomain?: string) =>
      makeRequest<TriggerEvaluateResponse>(`${API_V1}/triggers/evaluate`, 'POST', context, shopDomain),
  },

  analytics: {
    record: (metrics: unknown, shopDomain?: string) =>
      makeRequest<{ message: string }>(`${API_V1}/analytics`, 'POST', metrics, shopDomain),

    get: (params?: { startDate?: string; endDate?: string; provider?: string }, shopDomain?: string) =>
      makeRequest<{ totalRequests: number; totalTokens: number; totalCost: number; averageLatency: number }>(
        `${API_V1}/analytics`,
        'GET',
        undefined,
        shopDomain,
      ),
  },

  llms: {
    generate: (request: LlmsTxtGenerateRequest, shopDomain?: string) =>
      makeTextRequest(`${API_V1}/llms-txt/generate`, 'POST', request, shopDomain),
  },

  shops: {
    sync: (request: ShopSyncRequest, shopDomain?: string) =>
      makeRequest<ShopSyncResponse>(`${API_V1}/shops/sync`, 'POST', request, shopDomain),
  },

  catalog: {
    sync: (request: CatalogSyncRequest, shopDomain?: string) =>
      makeRequest<CatalogSyncResponse>(`${API_V1}/catalog/sync`, 'POST', request, shopDomain),
  },

  assistantConfig: {
    get: (shopDomain: string) =>
      makeRequest<AssistantConfigResponse>(`${API_V1}/assistant-config`, 'GET', undefined, shopDomain),

    upsert: (request: AssistantConfigRequest, shopDomain?: string) =>
      makeRequest<AssistantConfigResponse>(`${API_V1}/assistant-config`, 'POST', request, shopDomain),
  },

  billing: {
    plans: (shopDomain?: string) =>
      makeRequest<BillingPlanResponse[]>(`${API_V1}/billing/plans`, 'GET', undefined, shopDomain),

    status: (shopDomain?: string) =>
      makeRequest<BillingStatusResponse>(`${API_V1}/billing/status`, 'GET', undefined, shopDomain),

    subscribe: (request: BillingSubscribeRequest, shopDomain?: string) =>
      makeRequest<BillingSubscribeResponse>(`${API_V1}/billing/subscribe`, 'POST', request, shopDomain),
  },
};
