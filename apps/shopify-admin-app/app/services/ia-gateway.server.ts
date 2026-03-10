/**
 * IAGateway - Abstraction layer for AI execution and decisioning.
 *
 * Implements the Strangler Fig pattern: routes and orchestration services call
 * the gateway interface, and the concrete implementation is selected at runtime
 * via IA_EXECUTION_MODE.
 */

import { AIOrchestrationService } from './ai-orchestration.server';
import {
  iaClient,
  IABackendError,
  type IntentAnalyzeResponse,
  type IntentSessionSignalsResponse,
  type TriggerEvaluationResult as BackendTriggerEvaluationResult,
  type TriggerEvaluateResponse,
} from './ia-backend.client';
import type { IntentAnalysis, IntentSignalRecord } from './intent-detection.server';

// ─── Canonical gateway types ─────────────────────────────────────────────────

export interface GatewaySourceReference {
  documentId: string;
  chunkId: string;
  title: string;
  relevance: number;
  url?: string;
}

export interface GatewayChatRequest {
  message: string;
  conversationId: string;
  shopId: string;
  locale: string;
  channel?: string;
}

export interface GatewayChatResponse {
  message: string;
  confidence: number;
  requiresEscalation: boolean;
  escalationReason?: string;
  toolsUsed: string[];
  sourceReferences: GatewaySourceReference[];
  actions: Array<Record<string, unknown>>;
}

export interface GatewayIntentAnalyzeRequest {
  shopId: string;
  sessionId: string;
  visitorId?: string;
}

export interface GatewayIntentAnalyzeResponse {
  analysis: IntentAnalysis;
  signal: IntentSignalRecord | null;
}

export interface GatewayTriggerEvaluateRequest {
  shopId: string;
  sessionId: string;
  visitorId?: string;
}

export type GatewayTriggerEvaluation = BackendTriggerEvaluationResult;

export interface GatewayTriggerRecommendation {
  triggerId: string;
  action: string;
  message?: string;
  reason?: string;
  triggerName?: string;
  score?: number;
}

export interface GatewayTriggerEvaluateResponse {
  evaluations: GatewayTriggerEvaluation[];
  recommendation: GatewayTriggerRecommendation | null;
}

function deriveTriggerRecommendation(
  evaluations: GatewayTriggerEvaluation[],
): GatewayTriggerRecommendation | null {
  const sendRecommendation = evaluations.find((evaluation) => evaluation.decision === 'SEND');

  if (sendRecommendation) {
    return {
      triggerId: sendRecommendation.triggerId,
      action: 'SEND',
      message: sendRecommendation.message,
      triggerName: sendRecommendation.triggerName,
      score: sendRecommendation.score,
    };
  }

  if (evaluations.length === 0) {
    return null;
  }

  const firstEvaluation = evaluations[0];
  return {
    triggerId: firstEvaluation.triggerId,
    action: firstEvaluation.decision,
    reason: firstEvaluation.reason,
    triggerName: firstEvaluation.triggerName,
    score: firstEvaluation.score,
  };
}

function normalizeIntentAnalysis(response: IntentAnalyzeResponse): GatewayIntentAnalyzeResponse {
  return {
    analysis: {
      ...response.analysis,
      lastAnalyzedAt: new Date(response.analysis.lastAnalyzedAt),
    },
    signal: response.signal
      ? {
          ...response.signal,
          createdAt: new Date(response.signal.createdAt),
        }
      : null,
  };
}

function normalizeIntentSignals(
  response: IntentSessionSignalsResponse,
): IntentSignalRecord[] {
  return response.signals.map((signal) => ({
    ...signal,
    createdAt: new Date(signal.createdAt),
  }));
}

function normalizeTriggerResponse(
  response: TriggerEvaluateResponse,
): GatewayTriggerEvaluateResponse {
  return {
    evaluations: response.evaluations,
    recommendation: response.recommendation ?? deriveTriggerRecommendation(response.evaluations),
  };
}

function wrapGatewayError(error: unknown): never {
  if (error instanceof IABackendError) {
    throw error;
  }

  throw new IABackendError(
    error instanceof Error ? error.message : 'Unknown backend error',
    502,
  );
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IAGateway {
  chat(request: GatewayChatRequest, shopDomain: string): Promise<GatewayChatResponse>;
  analyzeIntent(
    request: GatewayIntentAnalyzeRequest,
    shopDomain: string,
  ): Promise<GatewayIntentAnalyzeResponse>;
  getIntentSignals(sessionId: string, shopDomain?: string): Promise<IntentSignalRecord[]>;
  evaluateTriggers(
    request: GatewayTriggerEvaluateRequest,
    shopDomain: string,
  ): Promise<GatewayTriggerEvaluateResponse>;
}

// ─── Local implementation (transitional — calls AIOrchestrationService) ──────

export class LocalIAGateway implements IAGateway {
  async chat(request: GatewayChatRequest, _shopDomain?: string): Promise<GatewayChatResponse> {
    const result = await AIOrchestrationService.chat(
      request.shopId,
      request.conversationId,
      request.message,
      request.locale,
    );

    return {
      message: result.message,
      confidence: result.confidence,
      requiresEscalation: result.requiresEscalation,
      escalationReason: result.escalationReason,
      toolsUsed: result.toolsUsed,
      sourceReferences: (result.sourceReferences ?? []) as GatewaySourceReference[],
      actions: (result.actions ?? []) as Array<Record<string, unknown>>,
    };
  }

  async analyzeIntent(
    _request: GatewayIntentAnalyzeRequest,
    _shopDomain?: string,
  ): Promise<GatewayIntentAnalyzeResponse> {
    throw new IABackendError(
      'Intent analysis must run in the remote IA backend. Set IA_EXECUTION_MODE=remote.',
      503,
    );
  }

  async getIntentSignals(_sessionId: string, _shopDomain?: string): Promise<IntentSignalRecord[]> {
    throw new IABackendError(
      'Intent signal retrieval must run in the remote IA backend. Set IA_EXECUTION_MODE=remote.',
      503,
    );
  }

  async evaluateTriggers(
    _request: GatewayTriggerEvaluateRequest,
    _shopDomain?: string,
  ): Promise<GatewayTriggerEvaluateResponse> {
    throw new IABackendError(
      'Trigger decisioning must run in the remote IA backend. Set IA_EXECUTION_MODE=remote.',
      503,
    );
  }
}

// ─── Remote implementation (target — calls fluxbot-studio-back-ia) ───────────

export class RemoteIAGateway implements IAGateway {
  async chat(request: GatewayChatRequest, shopDomain: string): Promise<GatewayChatResponse> {
    try {
      const result = await iaClient.chat.send(
        {
          message: request.message,
          conversationId: request.conversationId,
          context: {
            shopId: request.shopId,
            locale: request.locale,
            channel: request.channel,
          },
        },
        shopDomain,
      );

      return {
        message: result.message,
        confidence: result.confidence ?? 0.9,
        requiresEscalation: result.requiresEscalation ?? false,
        escalationReason: result.escalationReason,
        toolsUsed: result.toolsUsed ?? [],
        sourceReferences: (result.sourceReferences ?? []) as GatewaySourceReference[],
        actions: (result.actions ?? []) as Array<Record<string, unknown>>,
      };
    } catch (error) {
      wrapGatewayError(error);
    }
  }

  async analyzeIntent(
    request: GatewayIntentAnalyzeRequest,
    shopDomain: string,
  ): Promise<GatewayIntentAnalyzeResponse> {
    try {
      const result = await iaClient.intent.analyze(
        {
          sessionId: request.sessionId,
          visitorId: request.visitorId,
          context: {
            shopId: request.shopId,
          },
        },
        shopDomain,
      );

      return normalizeIntentAnalysis(result);
    } catch (error) {
      wrapGatewayError(error);
    }
  }

  async getIntentSignals(
    sessionId: string,
    shopDomain?: string,
  ): Promise<IntentSignalRecord[]> {
    try {
      const result = await iaClient.intent.getSessionSignals(sessionId, shopDomain);
      return normalizeIntentSignals(result);
    } catch (error) {
      wrapGatewayError(error);
    }
  }

  async evaluateTriggers(
    request: GatewayTriggerEvaluateRequest,
    shopDomain: string,
  ): Promise<GatewayTriggerEvaluateResponse> {
    try {
      const result = await iaClient.triggers.evaluate(
        {
          sessionId: request.sessionId,
          visitorId: request.visitorId,
          context: {
            shopId: request.shopId,
          },
        },
        shopDomain,
      );

      return normalizeTriggerResponse(result);
    } catch (error) {
      wrapGatewayError(error);
    }
  }
}

// ─── Mode helpers ─────────────────────────────────────────────────────────────

export type IAExecutionMode = 'local' | 'remote';

export function getExecutionMode(): IAExecutionMode {
  return process.env.IA_EXECUTION_MODE === 'local' ? 'local' : 'remote';
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _gateway: IAGateway | null = null;

export function getIAGateway(): IAGateway {
  if (!_gateway) {
    _gateway = getExecutionMode() === 'remote'
      ? new RemoteIAGateway()
      : new LocalIAGateway();
  }
  return _gateway;
}

/** Reset the singleton — for use in tests only. */
export function _resetIAGateway(): void {
  _gateway = null;
}
