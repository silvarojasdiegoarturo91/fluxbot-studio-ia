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
    const jsonError = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    if (jsonError?.error) return jsonError.error;
    if (jsonError?.message) return jsonError.message;
  }

  const text = await response.text().catch(() => 'Unknown error');
  return text || 'Unknown error';
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

  return response.json();
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
};
