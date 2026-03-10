/**
 * AI Orchestration Service
 * Core conversational engine integrating LLM, RAG, tools, and guardrails
 */

import prisma from '../db.server';
import { getConfig } from '../config.server';
import { EmbeddingsService } from './embeddings.server';
import { CommerceActionsService } from './commerce-actions.server';
import { HandoffService } from './handoff.server';
import type { ConversationMessage, MessageRole, Prisma } from '@prisma/client';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface Message {
  role: MessageRole;
  content: string;
  toolResults?: ToolResult[];
}

export interface ToolResult {
  toolName: string;
  success: boolean;
  result: any;
  error?: string;
}

export interface ChatResponse {
  message: string;
  confidence: number;
  requiresEscalation: boolean;
  escalationReason?: string;
  toolsUsed: string[];
  sourceReferences: SourceReference[];
  actions?: Array<Record<string, unknown>>;
  metadata: Record<string, any>;
}

export interface SourceReference {
  documentId: string;
  chunkId: string;
  title: string;
  relevance: number;
  url?: string;
}

export interface Intent {
  type: 'SALES' | 'SUPPORT' | 'GENERAL';
  confidence: number;
  topicKeywords: string[];
}

// ============================================================================
// LLM PROVIDERS (ADAPTER PATTERN)
// ============================================================================

export interface LLMProvider {
  generateResponse(
    systemPrompt: string,
    userMessage: string,
    history?: Message[]
  ): Promise<string>;
  countTokens(text: string): number;
}

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string = 'gpt-4o-mini';

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('OpenAI API key required');
    this.apiKey = apiKey;
  }

  async generateResponse(
    systemPrompt: string,
    userMessage: string,
    history: Message[] = []
  ): Promise<string> {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role.toLowerCase(), content: m.content })),
      { role: 'user', content: userMessage },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4); // Rough estimate
  }
}

export class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private model: string = 'claude-3-5-sonnet-20241022';

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Anthropic API key required');
    this.apiKey = apiKey;
  }

  async generateResponse(
    systemPrompt: string,
    userMessage: string,
    history: Message[] = []
  ): Promise<string> {
    const messages = [
      ...history.map((m) => ({ role: m.role.toLowerCase() as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: userMessage },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 500,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Anthropic error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 3); // Anthropic averages ~3 chars per token
  }
}

export class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private model: string = 'gemini-1.5-flash';

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Gemini API key required');
    this.apiKey = apiKey;
  }

  async generateResponse(
    systemPrompt: string,
    userMessage: string,
    history: Message[] = []
  ): Promise<string> {
    const contents = [
      ...history.map((m) => ({
        role: m.role === 'ASSISTANT' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents,
          generationConfig: {
            maxOutputTokens: 500,
            temperature: 0.7,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

// ============================================================================
// TOOLS & RETRIEVAL
// ============================================================================

export class ToolRegistry {
  /**
   * Search products in knowledge base
   */
  static async searchProducts(
    shopId: string,
    query: string,
    limit: number = 5
  ): Promise<{ sourceReferences: SourceReference[]; context: string }> {
    // Use embeddings service to find similar documents
    const results = await EmbeddingsService.searchSimilar(shopId, query, limit);

    const sourceReferences = results.map((r: any) => ({
      documentId: r.chunk.documentId,
      chunkId: r.chunkId,
      title: r.chunk.document.title || 'Product',
      relevance: r.similarity,
      url: r.chunk.metadata?.handle ? `/products/${r.chunk.metadata.handle}` : undefined,
    }));

    const context = results.map((r: any) => r.chunk.content).join('\n\n');

    return { sourceReferences, context };
  }

  /**
   * Search support topics (policies, FAQs)
   */
  static async searchSupport(
    shopId: string,
    query: string,
    limit: number = 3
  ): Promise<{ sourceReferences: SourceReference[]; context: string }> {
    const results = await EmbeddingsService.searchSimilar(shopId, query, limit);

    const filteredResults = results.filter(
      (r: any) => r.chunk.document.source?.sourceType === 'POLICIES'
    );

    const sourceReferences = filteredResults.map((r: any) => ({
      documentId: r.chunk.documentId,
      chunkId: r.chunkId,
      title: r.chunk.document.title || 'Policy',
      relevance: r.similarity,
      url: r.chunk.metadata?.url,
    }));

    const context = filteredResults.map((r: any) => r.chunk.content).join('\n\n');

    return { sourceReferences, context };
  }

  /**
   * Look up order status
   */
  static async getOrderStatus(
    shopId: string,
    orderRef: string
  ): Promise<Record<string, any> | null> {
    const order = await prisma.orderProjection.findFirst({
      where: {
        shopId,
        OR: [{ orderId: orderRef }, { orderNumber: orderRef }],
      },
    });
    if (!order) return null;

    return {
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      email: order.email,
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      totalPrice: order.totalPrice,
      lineItems: order.lineItems,
      syncedAt: order.syncedAt,
    };
  }

  /**
   * Get store policies
   */
  static async getPolicies(shopId: string, topic: string): Promise<string> {
    const policy = await prisma.policyProjection.findUnique({
      where: {
        shopId_policyType: {
          shopId,
          policyType: topic.toLowerCase(),
        },
      },
    });

    if (!policy) return 'Policy not found.';
    return `${policy.title}\n\n${policy.body}`;
  }
}

// ============================================================================
// AI ORCHESTRATION SERVICE
// ============================================================================

let cachedLLMProvider: LLMProvider | null = null;

export class AIOrchestrationService {
  /**
   * Get or create LLM provider
   */
  static getLLMProvider(): LLMProvider {
    if (cachedLLMProvider) return cachedLLMProvider;

    const config = getConfig();

    switch (config.ai.provider) {
      case 'openai':
        if (!config.ai.openai) throw new Error('OpenAI config missing');
        cachedLLMProvider = new OpenAIProvider(config.ai.openai.apiKey);
        break;
      case 'anthropic':
        if (!config.ai.anthropic) throw new Error('Anthropic config missing');
        cachedLLMProvider = new AnthropicProvider(config.ai.anthropic.apiKey);
        break;
      case 'gemini':
        if (!config.ai.gemini) throw new Error('Gemini config missing');
        cachedLLMProvider = new GeminiProvider(config.ai.gemini.apiKey);
        break;
      default:
        throw new Error(`Unknown LLM provider: ${config.ai.provider}`);
    }

    return cachedLLMProvider;
  }

  /**
   * Process user message and generate response
   */
  static async chat(
    shopId: string,
    conversationId: string,
    userMessage: string,
    language: string = 'en'
  ): Promise<ChatResponse> {
    const config = getConfig();
    const humanHandoffEnabled = config.features?.humanHandoff === true;

    // 1. Get conversation context
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 10 } },
    });

    const chatbotConfig = await prisma.chatbotConfig.findUniqueOrThrow({
      where: { shopId },
    });

    // 2. Detect intent
    const intent = await this.detectIntent(userMessage, language);

    // 3. Retrieve relevant context (RAG)
    let sourceReferences: SourceReference[] = [];
    let retrievedContext = '';

    if (intent.type === 'SALES') {
      const searchResult = await ToolRegistry.searchProducts(shopId, userMessage);
      sourceReferences = searchResult.sourceReferences;
      retrievedContext = searchResult.context;
    } else if (intent.type === 'SUPPORT') {
      const searchResult = await ToolRegistry.searchSupport(shopId, userMessage);
      sourceReferences = searchResult.sourceReferences;
      retrievedContext = searchResult.context;
    }

    // 4. Build system prompt
    const systemPrompt = this.buildSystemPrompt(
      chatbotConfig,
      intent,
      retrievedContext,
      language
    );

    // 5. Generate response
    const llmProvider = this.getLLMProvider();
    let botMessage = '';

    const history: Message[] = conversation.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      botMessage = await llmProvider.generateResponse(
        systemPrompt,
        userMessage,
        history
      );
    } catch (error) {
      botMessage = 'I apologize, but I encountered an issue processing your request. Please try again.';
    }

    // 6. Apply guardrails
    const guardrailResult = this.applyGuardrails(botMessage, intent);
    let finalMessage = guardrailResult.message;
    const { requiresEscalation, confidence } = guardrailResult;
    const actions: Array<Record<string, unknown>> = [];
    let escalationReason: string | undefined;

    if (this.shouldSuggestAddToCart(intent, userMessage, sourceReferences)) {
      const addToCartAction = await this.maybeBuildAddToCartAction({
        shopId,
        conversationId,
        sessionId: conversation.sessionId || undefined,
        userMessage,
        sourceReferences,
      });

      if (addToCartAction) {
        actions.push(addToCartAction);
      }
    }

    if (requiresEscalation) {
      escalationReason = this.buildEscalationReason(intent, confidence);

      if (humanHandoffEnabled) {
        const handoffAction = await this.maybeCreateHandoffAction({
          shopId,
          conversationId,
          reason: escalationReason,
          context: {
            intentType: intent.type,
            confidence,
            language,
            sourceReferences,
            lastMessages: conversation.messages.slice(-4).map((message) => ({
              role: message.role,
              content: message.content,
              createdAt: message.createdAt,
            })),
          },
        });

        if (handoffAction) {
          actions.push(handoffAction);
        }
      }

      finalMessage = this.appendEscalationHint(finalMessage, language);
    }

    // 7. Store conversation
    await prisma.conversationMessage.create({
      data: {
        conversationId,
        role: 'user' as MessageRole,
        content: userMessage,
        confidence: 0.95, // User message is always confident
      },
    });

    const assistantMetadata: Prisma.InputJsonValue = {
      intent: intent.type,
      toolsUsed: [],
      actions: actions as unknown as Prisma.InputJsonValue,
      escalationReason: escalationReason || null,
    };

    const assistantMessage = await prisma.conversationMessage.create({
      data: {
        conversationId,
        role: 'assistant' as MessageRole,
        content: finalMessage,
        confidence,
        metadata: assistantMetadata,
      },
    });

    // 8. Log tool invocations
    if (sourceReferences.length > 0) {
      await prisma.toolInvocation.create({
        data: {
          messageId: assistantMessage.id,
          toolName: intent.type === 'SALES' ? 'searchProducts' : 'searchSupport',
          input: { query: userMessage },
          output: sourceReferences as unknown as Prisma.InputJsonValue,
          success: true,
          durationMs: 0,
        },
      });
    }

    return {
      message: finalMessage,
      confidence,
      requiresEscalation,
      escalationReason,
      toolsUsed: sourceReferences.length > 0 ? ['rag'] : [],
      sourceReferences,
      actions,
      metadata: {
        intent: intent.type,
        language,
      },
    };
  }

  private static shouldSuggestAddToCart(
    intent: Intent,
    userMessage: string,
    sourceReferences: SourceReference[]
  ): boolean {
    if (intent.type !== 'SALES') return false;
    if (sourceReferences.length === 0) return false;

    return /(add to cart|buy now|checkout|purchase|comprar|agregar al carrito|anadir al carrito|añadir al carrito)/i.test(
      userMessage
    );
  }

  private static extractProductReference(sourceReferences: SourceReference[]): string | null {
    if (sourceReferences.length === 0) return null;

    const primary = sourceReferences[0];
    if (primary.url) {
      const match = primary.url.match(/\/products\/([^/?#]+)/i);
      if (match?.[1]) return match[1];
    }

    return primary.documentId || null;
  }

  private static parseDesiredQuantity(userMessage: string): number {
    const explicitQuantity = userMessage.match(/\b(\d{1,2})\s?(x|items?|units?|unidades?)\b/i);
    if (!explicitQuantity) return 1;

    const parsed = Number(explicitQuantity[1]);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;

    return Math.min(Math.floor(parsed), 20);
  }

  private static async maybeBuildAddToCartAction(params: {
    shopId: string;
    conversationId: string;
    sessionId?: string;
    userMessage: string;
    sourceReferences: SourceReference[];
  }): Promise<Record<string, unknown> | null> {
    const productRef = this.extractProductReference(params.sourceReferences);
    if (!productRef) return null;

    try {
      const quantity = this.parseDesiredQuantity(params.userMessage);

      const prepared = await CommerceActionsService.prepareAddToCartByShopId({
        shopId: params.shopId,
        productRef,
        quantity,
        conversationId: params.conversationId,
        sessionId: params.sessionId,
        source: 'chat',
      });

      return {
        type: 'ADD_TO_CART',
        label: 'Add to cart',
        variantId: prepared.variantId,
        quantity: prepared.quantity,
        productRef: prepared.productRef || null,
        cartUrl: prepared.cartUrl,
        checkoutUrl: prepared.checkoutUrl,
      };
    } catch {
      return null;
    }
  }

  private static buildEscalationReason(intent: Intent, confidence: number): string {
    if (intent.type === 'SUPPORT') {
      return `Support request requires human follow-up (confidence ${confidence.toFixed(2)})`;
    }

    return `Escalation requested by guardrails (confidence ${confidence.toFixed(2)})`;
  }

  private static async maybeCreateHandoffAction(params: {
    shopId: string;
    conversationId: string;
    reason: string;
    context: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null> {
    try {
      const handoff = await HandoffService.create({
        shopId: params.shopId,
        conversationId: params.conversationId,
        reason: params.reason,
        context: params.context,
      });

      return {
        type: 'HUMAN_HANDOFF',
        label: 'Connect with support',
        handoffId: handoff.id,
        status: handoff.status,
      };
    } catch {
      return null;
    }
  }

  private static appendEscalationHint(message: string, language: string): string {
    const isSpanish = language.toLowerCase().startsWith('es');
    const hint = isSpanish
      ? ' Un agente de soporte puede continuar esta conversación contigo.'
      : ' A support agent can continue this conversation with you.';

    if (message.includes(hint.trim())) {
      return message;
    }

    return `${message.trim()}${hint}`;
  }

  /**
   * Detect user intent
   */
  private static async detectIntent(
    message: string,
    language: string
  ): Promise<Intent> {
    const lowercased = message.toLowerCase();

    // Keyword-based intent detection (can be enhanced with ML)
    const salesKeywords = ['buy', 'price', 'discount', 'recommend', 'product', 'available'];
    const supportKeywords = ['help', 'issue', 'problem', 'return', 'shipping', 'policy', 'refund'];

    const salesMatch = salesKeywords.filter((k) =>
      lowercased.includes(k)
    ).length;
    const supportMatch = supportKeywords.filter((k) =>
      lowercased.includes(k)
    ).length;

    let type: Intent['type'] = 'GENERAL';
    if (salesMatch > supportMatch) type = 'SALES';
    if (supportMatch > salesMatch) type = 'SUPPORT';

    return {
      type,
      confidence: Math.max(salesMatch, supportMatch) / Math.max(salesKeywords.length, supportKeywords.length),
      topicKeywords: [...new Set([
        ...message.split(' ').filter((w) => w.length > 3),
      ])].slice(0, 5),
    };
  }

  /**
   * Build system prompt with context
   */
  private static buildSystemPrompt(
    config: any,
    intent: Intent,
    context: string,
    language: string
  ): string {
    const role =
      intent.type === 'SALES'
        ? 'a helpful shopping assistant'
        : intent.type === 'SUPPORT'
          ? 'a helpful customer support representative'
          : 'a helpful shopping assistant';

    return `You are ${role} for an online store.

${config.systemPrompt || 'Provide accurate, helpful, and friendly responses.'}

Available context:
${context}

Guidelines:
- Be helpful and concise
- If you don't know something, say so
- Suggest alternatives when helpful
- Use friendly, professional tone
- Respond in ${language} language`;
  }

  /**
   * Apply safety guardrails
   */
  private static applyGuardrails(message: string, intent: Intent): {
    message: string;
    requiresEscalation: boolean;
    confidence: number;
  } {
    // 1. Check for escalation triggers in bot message
    const escalationKeywords = ['human', 'agent', 'manager', 'complaint', 'urgent', 'real person', 'support team'];
    const botWantsEscalation = escalationKeywords.some((k) =>
      message.toLowerCase().includes(k)
    );

    // 2. Check if intent confidence was very low
    const lowIntentConfidence = intent.confidence < 0.3;

    // 3. Final escalation decision
    const requiresEscalation = botWantsEscalation || (intent.type === 'SUPPORT' && lowIntentConfidence);

    // 4. Hallucination detection (heuristic)
    // If the bot says "I don't know" or "I'm not sure", it's actually a sign of honesty, so confidence is high
    const isHonestUncertainty = message.includes("don't know") || message.includes("not sure") || message.includes("I apologize, but I don't have");
    
    // If it's very confident but we had low intent confidence, it might be hallucinating
    const hallucinationRisk = !isHonestUncertainty && lowIntentConfidence;

    let confidence = Math.min(0.95, intent.confidence + 0.3);
    if (hallucinationRisk) confidence *= 0.5;
    if (isHonestUncertainty) confidence = 0.99;

    return {
      message,
      requiresEscalation,
      confidence,
    };
  }

  /**
   * Create a new conversation
   */
  static async createConversation(
    shopId: string,
    visitorId: string,
    channel: string = 'WEB_CHAT'
  ) {
    return prisma.conversation.create({
      data: {
        shopId,
        channel: channel as any,
        visitorId,
        status: 'ACTIVE' as any,
      },
    });
  }

  /**
   * Get conversation history
   */
  static async getConversationHistory(conversationId: string) {
    return prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Escalate to human
   */
  static async escalateToHuman(
    conversationId: string,
    reason: string
  ) {
    // Get conversation to retrieve shopId
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { shopId: true },
    });

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    return prisma.handoffRequest.create({
      data: {
        shopId: conversation.shopId,
        conversationId,
        reason,
        status: 'pending',
      },
    });
  }
}
