/**
 * Service Execution Tests - Priority 1
 * 
 * Executes actual service logic with mocked dependencies.
 * Target: +20-30% code coverage by testing core business logic.
 * 
 * Services tested:
 * - AIOrchestrationService (ai-orchestration.server.ts)
 * - SyncService (sync-service.server.ts)
 * - ProductTransformer, PolicyTransformer, PageTransformer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma before importing services
vi.mock('../../app/db.server', () => ({
  default: {
    conversation: {
      findUniqueOrThrow: vi.fn(),
    },
    chatbotConfig: {
      findUniqueOrThrow: vi.fn(),
    },
    conversationMessage: {
      create: vi.fn(),
    },
    toolInvocation: {
      create: vi.fn(),
    },
    orderProjection: {
      findFirst: vi.fn(),
    },
    policyProjection: {
      findUnique: vi.fn(),
    },
    knowledgeSource: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    knowledgeDocument: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    knowledgeChunk: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    syncJob: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// Mock config
vi.mock('../../app/config.server', () => ({
  getConfig: vi.fn(() => ({
    ai: {
      provider: 'gemini',
      gemini: {
        apiKey: 'test-gemini-key',
      },
    },
  })),
}));

// Mock embeddings service
vi.mock('../../app/services/embeddings.server', () => ({
  EmbeddingsService: {
    searchSimilar: vi.fn(),
  },
}));

// Import services after mocks
import prisma from '../../app/db.server';
import { getConfig } from '../../app/config.server';
import { EmbeddingsService } from '../../app/services/embeddings.server';
import {
  AIOrchestrationService,
  ToolRegistry,
  GeminiProvider,
  OpenAIProvider,
  AnthropicProvider,
} from '../../app/services/ai-orchestration.server';
import {
  SyncService,
  ProductTransformer,
  PolicyTransformer,
  PageTransformer,
  type ProductDocument,
  type PolicyDocument,
  type PageDocument,
} from '../../app/services/sync-service.server';

// ============================================================================
// AI ORCHESTRATION SERVICE TESTS
// ============================================================================

describe('AIOrchestrationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global fetch mock
    global.fetch = vi.fn();
    // Reset cached provider before each test
    (AIOrchestrationService as any).cachedLLMProvider = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getLLMProvider', () => {
    it('should return configured provider (Gemini in test env)', () => {
      vi.mocked(getConfig).mockReturnValue({
        ai: {
          provider: 'gemini',
          gemini: { apiKey: 'test-key' },
        },
      } as any);

      const provider = AIOrchestrationService.getLLMProvider();
      expect(provider).toBeInstanceOf(GeminiProvider);
    });

    // Note: Provider switching tests omitted due to module-level caching design.
    // The provider is cached at module scope and cannot be easily reset between tests
    // without more complex mocking. The chat() integration tests below verify
    // the actual LLM integration works correctly, which is the more important coverage.
  });

  describe('chat', () => {
    beforeEach(() => {
      // Mock Prisma responses
      vi.mocked(prisma.conversation.findUniqueOrThrow).mockResolvedValue({
        id: 'conv-123',
        shopId: 'shop-456',
        sessionId: 'session-789',
        customerId: null,
        locale: 'en',
        status: 'ACTIVE',
        startedAt: new Date('2026-03-10T10:00:00Z'),
        lastMessageAt: new Date('2026-03-10T10:00:00Z'),
        closedAt: null,
        metadata: {},
        createdAt: new Date('2026-03-10T10:00:00Z'),
        updatedAt: new Date('2026-03-10T10:00:00Z'),
        messages: [],
      } as any);

      vi.mocked(prisma.chatbotConfig.findUniqueOrThrow).mockResolvedValue({
        id: 'config-123',
        shopId: 'shop-456',
        agentName: 'ShopBot',
        systemPrompt: 'You are a helpful shopping assistant.',
        tone: 'FRIENDLY',
        primaryColor: '#000000',
        enableProactive: true,
        enableMultilang: true,
        supportedLanguages: ['en', 'es'],
        fallbackBehavior: 'ESCALATE',
        confidenceThreshold: 0.7,
        createdAt: new Date('2026-03-10T10:00:00Z'),
        updatedAt: new Date('2026-03-10T10:00:00Z'),
      } as any);

      vi.mocked(prisma.conversationMessage.create).mockResolvedValue({
        id: 'msg-123',
        conversationId: 'conv-123',
        role: 'ASSISTANT',
        content: 'Test response',
        confidence: 0.95,
        metadata: {},
        createdAt: new Date('2026-03-10T10:00:00Z'),
        updatedAt: new Date('2026-03-10T10:00:00Z'),
      } as any);

      vi.mocked(prisma.toolInvocation.create).mockResolvedValue({
        id: 'tool-123',
        messageId: 'msg-123',
        toolName: 'searchProducts',
        input: {},
        output: {},
        success: true,
        error: null,
        durationMs: 100,
        createdAt: new Date('2026-03-10T10:00:00Z'),
      } as any);

      // Mock embeddings search
      vi.mocked(EmbeddingsService.searchSimilar).mockResolvedValue([
        {
          chunkId: 'chunk-1',
          chunk: {
            documentId: 'doc-1',
            content: 'Product: Blue T-Shirt\nPrice: $25',
            document: { title: 'Blue T-Shirt', source: { sourceType: 'CATALOG' } },
            metadata: { handle: 'blue-tshirt' },
          },
          similarity: 0.95,
        },
      ] as any);

      // Mock Gemini API
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Based on your query, I recommend the Blue T-Shirt for $25.' }],
              },
            },
          ],
        }),
      } as any);

      // Set Gemini config
      vi.mocked(getConfig).mockReturnValue({
        ai: {
          provider: 'gemini',
          gemini: { apiKey: 'test-key' },
        },
      } as any);
    });

    it('should process sales intent message successfully', async () => {
      const response = await AIOrchestrationService.chat(
        'shop-456',
        'conv-123',
        'I want to buy a blue shirt',
        'en'
      );

      expect(response).toMatchObject({
        message: expect.any(String),
        confidence: expect.any(Number),
        requiresEscalation: expect.any(Boolean),
        toolsUsed: expect.arrayContaining(['rag']),
        sourceReferences: expect.any(Array),
        metadata: {
          intent: 'SALES',
          language: 'en',
        },
      });

      // Verify conversation was retrieved
      expect(prisma.conversation.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'conv-123' },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 10 } },
      });

      // Verify messages were stored
      expect(prisma.conversationMessage.create).toHaveBeenCalledTimes(2); // user + assistant

      // Verify tool invocation was logged
      expect(prisma.toolInvocation.create).toHaveBeenCalled();
    });

    it('should process support intent message successfully', async () => {
      // Mock support-focused search result
      vi.mocked(EmbeddingsService.searchSimilar).mockResolvedValue([
        {
          chunkId: 'chunk-2',
          chunk: {
            documentId: 'doc-2',
            content: 'Return Policy: 30 days full refund',
            document: { title: 'Return Policy', source: { sourceType: 'POLICIES' } },
            metadata: { url: '/policies/returns' },
          },
          similarity: 0.92,
        },
      ] as any);

      const response = await AIOrchestrationService.chat(
        'shop-456',
        'conv-123',
        'What is your return policy?',
        'en'
      );

      expect(response.metadata.intent).toBe('SUPPORT');
      expect(response.toolsUsed).toContain('rag');
    });

    it('should process general intent message successfully', async () => {
      const response = await AIOrchestrationService.chat(
        'shop-456',
        'conv-123',
        'Hello, how are you?',
        'en'
      );

      expect(response.metadata.intent).toBe('GENERAL');
      expect(response.sourceReferences).toHaveLength(0);
    });

    it('should handle LLM API errors gracefully', async () => {
      // Mock Gemini API failure
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Service Unavailable',
        json: async () => ({ error: { message: 'API error' } }),
      } as any);

      const response = await AIOrchestrationService.chat(
        'shop-456',
        'conv-123',
        'Test message',
        'en'
      );

      expect(response.message).toContain('apologize');
      expect(prisma.conversationMessage.create).toHaveBeenCalled();
    });

    it('should include conversation history in LLM request', async () => {
      vi.mocked(prisma.conversation.findUniqueOrThrow).mockResolvedValue({
        id: 'conv-123',
        shopId: 'shop-456',
        sessionId: 'session-789',
        customerId: null,
        locale: 'en',
        status: 'ACTIVE',
        startedAt: new Date('2026-03-10T10:00:00Z'),
        lastMessageAt: new Date('2026-03-10T10:00:00Z'),
        closedAt: null,
        metadata: {},
        createdAt: new Date('2026-03-10T10:00:00Z'),
        updatedAt: new Date('2026-03-10T10:00:00Z'),
        messages: [
          {
            id: 'msg-1',
            role: 'USER',
            content: 'Previous message',
            createdAt: new Date('2026-03-10T09:55:00Z'),
          },
          {
            id: 'msg-2',
            role: 'ASSISTANT',
            content: 'Previous response',
            createdAt: new Date('2026-03-10T09:56:00Z'),
          },
        ],
      } as any);

      await AIOrchestrationService.chat(
        'shop-456',
        'conv-123',
        'Follow-up question',
        'en'
      );

      // Verify fetch was called with history
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.objectContaining({
          body: expect.stringContaining('Previous message'),
        })
      );
    });
  });

  describe('ToolRegistry', () => {
    describe('searchProducts', () => {
      it('should search and format product results', async () => {
        vi.mocked(EmbeddingsService.searchSimilar).mockResolvedValue([
          {
            chunkId: 'chunk-1',
            chunk: {
              documentId: 'prod-123',
              content: 'Blue T-Shirt - Cotton blend, $25',
              document: { title: 'Blue T-Shirt' },
              metadata: { handle: 'blue-tshirt' },
            },
            similarity: 0.95,
          },
          {
            chunkId: 'chunk-2',
            chunk: {
              documentId: 'prod-456',
              content: 'Red T-Shirt - Premium cotton, $30',
              document: { title: 'Red T-Shirt' },
              metadata: { handle: 'red-tshirt' },
            },
            similarity: 0.88,
          },
        ] as any);

        const result = await ToolRegistry.searchProducts('shop-123', 't-shirt', 5);

        expect(result.sourceReferences).toHaveLength(2);
        expect(result.sourceReferences[0]).toMatchObject({
          documentId: 'prod-123',
          chunkId: 'chunk-1',
          title: 'Blue T-Shirt',
          relevance: 0.95,
          url: '/products/blue-tshirt',
        });
        expect(result.context).toContain('Blue T-Shirt');
        expect(EmbeddingsService.searchSimilar).toHaveBeenCalledWith('shop-123', 't-shirt', 5);
      });
    });

    describe('searchSupport', () => {
      it('should search and filter policy results', async () => {
        vi.mocked(EmbeddingsService.searchSimilar).mockResolvedValue([
          {
            chunkId: 'chunk-1',
            chunk: {
              documentId: 'policy-1',
              content: 'Return Policy: 30 days',
              document: { title: 'Returns', source: { sourceType: 'POLICIES' } },
              metadata: { url: '/policies/returns' },
            },
            similarity: 0.92,
          },
          {
            chunkId: 'chunk-2',
            chunk: {
              documentId: 'prod-999',
              content: 'Product info',
              document: { title: 'Product', source: { sourceType: 'CATALOG' } },
              metadata: {},
            },
            similarity: 0.85,
          },
        ] as any);

        const result = await ToolRegistry.searchSupport('shop-123', 'return policy', 3);

        // Should filter out CATALOG results
        expect(result.sourceReferences).toHaveLength(1);
        expect(result.sourceReferences[0].title).toBe('Returns');
      });
    });

    describe('getOrderStatus', () => {
      it('should retrieve order by order ID', async () => {
        vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
          id: 'order-proj-1',
          shopId: 'shop-123',
          orderId: 'gid://shopify/Order/123',
          orderNumber: '1001',
          customerId: 'cust-123',
          email: 'test@example.com',
          financialStatus: 'PAID',
          fulfillmentStatus: 'FULFILLED',
          totalPrice: '150.00',
          lineItems: [{ title: 'Blue T-Shirt', quantity: 2 }],
          syncedAt: new Date('2026-03-10T10:00:00Z'),
          createdAt: new Date('2026-03-10T10:00:00Z'),
          updatedAt: new Date('2026-03-10T10:00:00Z'),
        } as any);

        const result = await ToolRegistry.getOrderStatus('shop-123', 'gid://shopify/Order/123');

        expect(result).toMatchObject({
          orderId: 'gid://shopify/Order/123',
          orderNumber: '1001',
          financialStatus: 'PAID',
          fulfillmentStatus: 'FULFILLED',
        });
      });

      it('should retrieve order by order number', async () => {
        vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue({
          id: 'order-proj-1',
          shopId: 'shop-123',
          orderId: 'gid://shopify/Order/123',
          orderNumber: '1001',
          customerId: 'cust-123',
          email: 'test@example.com',
          financialStatus: 'PAID',
          fulfillmentStatus: 'FULFILLED',
          totalPrice: '150.00',
          lineItems: [],
          syncedAt: new Date('2026-03-10T10:00:00Z'),
          createdAt: new Date('2026-03-10T10:00:00Z'),
          updatedAt: new Date('2026-03-10T10:00:00Z'),
        } as any);

        const result = await ToolRegistry.getOrderStatus('shop-123', '1001');

        expect(prisma.orderProjection.findFirst).toHaveBeenCalledWith({
          where: {
            shopId: 'shop-123',
            OR: [{ orderId: '1001' }, { orderNumber: '1001' }],
          },
        });
      });

      it('should return null when order not found', async () => {
        vi.mocked(prisma.orderProjection.findFirst).mockResolvedValue(null);

        const result = await ToolRegistry.getOrderStatus('shop-123', '9999');

        expect(result).toBeNull();
      });
    });

    describe('getPolicies', () => {
      it('should retrieve policy by type', async () => {
        vi.mocked(prisma.policyProjection.findUnique).mockResolvedValue({
          id: 'policy-1',
          shopId: 'shop-123',
          policyType: 'return',
          title: 'Return Policy',
          body: 'We offer 30-day returns on all items.',
          url: '/policies/returns',
          syncedAt: new Date('2026-03-10T10:00:00Z'),
          createdAt: new Date('2026-03-10T10:00:00Z'),
          updatedAt: new Date('2026-03-10T10:00:00Z'),
        } as any);

        const result = await ToolRegistry.getPolicies('shop-123', 'return');

        expect(result).toContain('Return Policy');
        expect(result).toContain('30-day returns');
      });

      it('should return not found message for missing policy', async () => {
        vi.mocked(prisma.policyProjection.findUnique).mockResolvedValue(null);

        const result = await ToolRegistry.getPolicies('shop-123', 'missing');

        expect(result).toBe('Policy not found.');
      });
    });
  });
});

// ============================================================================
// LLM PROVIDER TESTS
// ============================================================================

describe('LLM Providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GeminiProvider', () => {
    it('should generate response successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Generated response from Gemini' }],
              },
            },
          ],
        }),
      } as any);

      const provider = new GeminiProvider('test-api-key');
      const response = await provider.generateResponse(
        'You are helpful',
        'Hello',
        []
      );

      expect(response).toBe('Generated response from Gemini');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should throw error on API failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'Invalid request' } }),
      } as any);

      const provider = new GeminiProvider('test-api-key');

      await expect(
        provider.generateResponse('System', 'User message', [])
      ).rejects.toThrow('Gemini error');
    });

    it('should count tokens roughly', () => {
      const provider = new GeminiProvider('test-key');
      const count = provider.countTokens('Hello world this is a test');
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('OpenAIProvider', () => {
    it('should generate response successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: { content: 'Generated response from OpenAI' },
            },
          ],
        }),
      } as any);

      const provider = new OpenAIProvider('test-api-key');
      const response = await provider.generateResponse(
        'You are helpful',
        'Hello',
        []
      );

      expect(response).toBe('Generated response from OpenAI');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });

    it('should throw error when API key missing', () => {
      expect(() => new OpenAIProvider('')).toThrow('OpenAI API key required');
    });
  });

  describe('AnthropicProvider', () => {
    it('should generate response successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ text: 'Generated response from Anthropic' }],
        }),
      } as any);

      const provider = new AnthropicProvider('test-api-key');
      const response = await provider.generateResponse(
        'You are helpful',
        'Hello',
        []
      );

      expect(response).toBe('Generated response from Anthropic');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
          }),
        })
      );
    });
  });
});

// ============================================================================
// SYNC SERVICE TESTS
// ============================================================================

describe('SyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ingestChunks', () => {
    it('should ingest chunks and create/update documents', async () => {
      vi.mocked(prisma.knowledgeSource.findFirst).mockResolvedValue({
        id: 'source-1',
        shopId: 'shop-123',
        sourceType: 'CATALOG',
        name: 'catalog source',
        isActive: true,
        config: {},
        lastSyncedAt: null,
        createdAt: new Date('2026-03-10T10:00:00Z'),
        updatedAt: new Date('2026-03-10T10:00:00Z'),
      } as any);

      vi.mocked(prisma.knowledgeDocument.upsert).mockResolvedValue({
        id: 'doc-1',
        sourceId: 'source-1',
        externalId: 'prod-123',
        title: 'Blue T-Shirt',
        language: 'en',
        metadata: {},
        version: 1,
        deletedAt: null,
        createdAt: new Date('2026-03-10T10:00:00Z'),
        updatedAt: new Date('2026-03-10T10:00:00Z'),
      } as any);

      vi.mocked(prisma.knowledgeChunk.upsert).mockResolvedValue({
        id: 'chunk-1',
        documentId: 'doc-1',
        sequence: 0,
        content: 'Product: Blue T-Shirt',
        metadata: {},
        tokenCount: 50,
        embeddingId: null,
        createdAt: new Date('2026-03-10T10:00:00Z'),
        updatedAt: new Date('2026-03-10T10:00:00Z'),
      } as any);

      const chunks = [
        {
          sourceId: 'shop-123',
          sourceType: 'CATALOG' as const,
          documentId: 'prod-123',
          sequence: 0,
          content: 'Product: Blue T-Shirt\nPrice: $25',
          metadata: { title: 'Blue T-Shirt', productId: 'prod-123' },
          language: 'en',
          shouldEmbed: true,
        },
      ];

      const count = await SyncService.ingestChunks('shop-123', chunks);

      expect(count).toBe(1);
      expect(prisma.knowledgeDocument.upsert).toHaveBeenCalled();
      expect(prisma.knowledgeChunk.upsert).toHaveBeenCalled();
    });

    it('should create source if it does not exist', async () => {
      vi.mocked(prisma.knowledgeSource.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.knowledgeSource.create).mockResolvedValue({
        id: 'source-new',
        shopId: 'shop-123',
        sourceType: 'POLICIES',
        name: 'policies source',
        isActive: true,
        config: {},
        lastSyncedAt: null,
        createdAt: new Date('2026-03-10T10:00:00Z'),
        updatedAt: new Date('2026-03-10T10:00:00Z'),
      } as any);

      vi.mocked(prisma.knowledgeDocument.upsert).mockResolvedValue({
        id: 'doc-1',
        sourceId: 'source-new',
        externalId: 'policy:return',
        title: 'Return Policy',
        language: 'en',
        metadata: {},
        version: 1,
        deletedAt: null,
        createdAt: new Date('2026-03-10T10:00:00Z'),
        updatedAt: new Date('2026-03-10T10:00:00Z'),
      } as any);

      vi.mocked(prisma.knowledgeChunk.upsert).mockResolvedValue({
        id: 'chunk-1',
        documentId: 'doc-1',
        sequence: 0,
        content: 'Policy content',
        metadata: {},
        tokenCount: 20,
        embeddingId: null,
        createdAt: new Date('2026-03-10T10:00:00Z'),
        updatedAt: new Date('2026-03-10T10:00:00Z'),
      } as any);

      const chunks = [
        {
          sourceId: 'shop-123',
          sourceType: 'POLICIES' as const,
          documentId: 'policy:return',
          sequence: 0,
          content: 'Return Policy text',
          metadata: { title: 'Return Policy' },
          language: 'en',
          shouldEmbed: true,
        },
      ];

      await SyncService.ingestChunks('shop-123', chunks);

      expect(prisma.knowledgeSource.create).toHaveBeenCalledWith({
        data: {
          shopId: 'shop-123',
          sourceType: 'POLICIES',
          name: 'policies source',
          isActive: true,
        },
      });
    });
  });

  describe('createSyncJob', () => {
    it('should create sync job with correct data', async () => {
      vi.mocked(prisma.syncJob.create).mockResolvedValue({
        id: 'job-1',
        shopId: 'shop-123',
        jobType: 'initial:catalog',
        status: 'RUNNING',
        progress: 0,
        processedItems: 0,
        totalItems: 100,
        error: null,
        startedAt: new Date('2026-03-10T10:00:00Z'),
        completedAt: null,
        createdAt: new Date('2026-03-10T10:00:00Z'),
        updatedAt: new Date('2026-03-10T10:00:00Z'),
      } as any);

      const job = await SyncService.createSyncJob('shop-123', 'initial:catalog', 100);

      expect(job.status).toBe('RUNNING');
      expect(job.totalItems).toBe(100);
      expect(prisma.syncJob.create).toHaveBeenCalledWith({
        data: {
          shopId: 'shop-123',
          jobType: 'initial:catalog',
          status: 'RUNNING',
          progress: 0,
          processedItems: 0,
          totalItems: 100,
          startedAt: expect.any(Date),
        },
      });
    });
  });

  describe('updateSyncJob', () => {
    it('should update job progress', async () => {
      vi.mocked(prisma.syncJob.update).mockResolvedValue({
        id: 'job-1',
        shopId: 'shop-123',
        jobType: 'initial:catalog',
        status: 'RUNNING',
        progress: 0.5,
        processedItems: 50,
        totalItems: 100,
        error: null,
        startedAt: new Date('2026-03-10T10:00:00Z'),
        completedAt: null,
        createdAt: new Date('2026-03-10T10:00:00Z'),
        updatedAt: new Date('2026-03-10T10:00:00Z'),
      } as any);

      await SyncService.updateSyncJob('job-1', { progress: 0.5, processedItems: 50 });

      expect(prisma.syncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { progress: 0.5, processedItems: 50 },
      });
    });
  });

  describe('completeSyncJob', () => {
    it('should mark job as completed', async () => {
      vi.mocked(prisma.syncJob.update).mockResolvedValue({
        id: 'job-1',
        shopId: 'shop-123',
        jobType: 'initial:catalog',
        status: 'COMPLETED',
        progress: 1,
        processedItems: 100,
        totalItems: 100,
        error: null,
        startedAt: new Date('2026-03-10T10:00:00Z'),
        completedAt: new Date('2026-03-10T10:15:00Z'),
        createdAt: new Date('2026-03-10T10:00:00Z'),
        updatedAt: new Date('2026-03-10T10:15:00Z'),
      } as any);

      const job = await SyncService.completeSyncJob('job-1', 'COMPLETED');

      expect(job.status).toBe('COMPLETED');
      expect(job.progress).toBe(1);
      expect(prisma.syncJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: {
          status: 'COMPLETED',
          progress: 1,
          completedAt: expect.any(Date),
        },
      });
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync summary with stats', async () => {
      vi.mocked(prisma.syncJob.findMany).mockResolvedValue([
        {
          id: 'job-1',
          jobType: 'initial:catalog',
          status: 'COMPLETED',
          progress: 1,
        },
      ] as any);

      vi.mocked(prisma.knowledgeSource.findMany).mockResolvedValue([
        {
          sourceType: 'CATALOG',
          _count: { documents: 50 },
        },
        {
          sourceType: 'POLICIES',
          _count: { documents: 5 },
        },
      ] as any);

      vi.mocked(prisma.knowledgeDocument.findMany).mockResolvedValue([
        {
          language: 'en',
          _count: { chunks: 100 },
        },
        {
          language: 'es',
          _count: { chunks: 80 },
        },
      ] as any);

      const status = await SyncService.getSyncStatus('shop-123');

      expect(status.jobs).toHaveLength(1);
      expect(status.documentsByType).toEqual({
        CATALOG: 50,
        POLICIES: 5,
      });
      expect(status.chunksByLanguage).toEqual({
        en: 100,
        es: 80,
      });
    });
  });
});

// ============================================================================
// TRANSFORMER TESTS
// ============================================================================

describe('ProductTransformer', () => {
  it('should transform product into chunks', () => {
    const product: ProductDocument = {
      id: 'gid://shopify/Product/123',
      title: 'Blue Cotton T-Shirt',
      description: 'Comfortable cotton t-shirt in blue',
      vendor: 'FashionCo',
      productType: 'Apparel',
      handle: 'blue-cotton-tshirt',
      variants: [
        {
          id: 'gid://shopify/ProductVariant/456',
          title: 'Small',
          sku: 'BLU-S',
          price: '25.00',
        },
        {
          id: 'gid://shopify/ProductVariant/789',
          title: 'Medium',
          sku: 'BLU-M',
          price: '25.00',
        },
      ],
      images: [
        {
          id: 'gid://shopify/ProductImage/111',
          url: 'https://cdn.shopify.com/image1.jpg',
          altText: 'Front view of blue t-shirt',
        },
      ],
    };

    const chunks = ProductTransformer.toChunks(product, 'shop-123');

    expect(chunks).toHaveLength(2); // 1 main chunk + 1 image chunk
    expect(chunks[0].content).toContain('Blue Cotton T-Shirt');
    expect(chunks[0].content).toContain('FashionCo');
    expect(chunks[0].content).toContain('Small (SKU: BLU-S, $25.00)');
    expect(chunks[0].shouldEmbed).toBe(true);

    expect(chunks[1].content).toContain('Front view of blue t-shirt');
    expect(chunks[1].shouldEmbed).toBe(false);
  });
});

describe('PolicyTransformer', () => {
  it('should transform short policy into single chunk', () => {
    const policy: PolicyDocument = {
      policyType: 'return',
      title: 'Return Policy',
      body: 'We accept returns within 30 days of purchase.',
      url: '/policies/returns',
    };

    const chunks = PolicyTransformer.toChunks(policy, 'shop-123');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain('Return Policy');
    expect(chunks[0].content).toContain('30 days');
    expect(chunks[0].metadata.policyType).toBe('return');
  });

  it('should split long policy into multiple chunks', () => {
    const longBody = 'This is a sentence. '.repeat(100); // ~2000 chars

    const policy: PolicyDocument = {
      policyType: 'terms',
      title: 'Terms of Service',
      body: longBody,
      url: '/policies/terms',
    };

    const chunks = PolicyTransformer.toChunks(policy, 'shop-123');

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, idx) => {
      expect(chunk.sequence).toBe(idx);
      expect(chunk.content.length).toBeLessThanOrEqual(1100); // Title + max chunk
    });
  });
});

describe('PageTransformer', () => {
  it('should transform page with summary and body', () => {
    const page: PageDocument = {
      id: 'gid://shopify/Page/123',
      title: 'About Us',
      handle: 'about-us',
      bodySummary: 'Learn about our company history and values.',
      body: 'We are a sustainable fashion brand founded in 2020...',
      seo: {
        title: 'About Us | FashionCo',
        description: 'Learn about our mission',
      },
    };

    const chunks = PageTransformer.toChunks(page, 'shop-123');

    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toContain('About Us');
    expect(chunks[0].content).toContain('Learn about our company');
    expect(chunks[1].content).toContain('sustainable fashion');
    expect(chunks[1].metadata.seoTitle).toBe('About Us | FashionCo');
  });

  it('should handle page with only summary', () => {
    const page: PageDocument = {
      id: 'gid://shopify/Page/456',
      title: 'FAQ',
      handle: 'faq',
      bodySummary: 'Frequently asked questions',
      body: '',
    };

    const chunks = PageTransformer.toChunks(page, 'shop-123');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain('Frequently asked questions');
  });
});
