import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { action as chatAction, loader as chatLoader } from '../../app/routes/api.chat';
import { action as webhookAction } from '../../app/routes/api.webhooks';

/**
 * Route Handler Execution Tests
 * Tests that actually execute route handler code with mocked dependencies
 */

// Mock Prisma
vi.mock('../../app/db.server', () => {
  const mockPrisma = {
    shop: {
      findUnique: vi.fn(),
    },
    conversation: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    webhookEvent: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return { default: mockPrisma };
});

// Mock AI Orchestration Service
vi.mock('../../app/services/ai-orchestration.server', () => ({
  AIOrchestrationService: {
    chat: vi.fn(),
  },
}));

// Mock Webhook Handlers
vi.mock('../../app/services/sync-service.server', () => ({
  WebhookHandlers: {
    handleProductUpdate: vi.fn(),
    handleProductDelete: vi.fn(),
    handleCollectionUpdate: vi.fn(),
    handlePageUpdate: vi.fn(),
  },
}));

// Mock cors utility
vi.mock('remix-utils/cors', () => ({
  cors: vi.fn((request, response) => response),
}));

import prisma from '../../app/db.server';
import { AIOrchestrationService } from '../../app/services/ai-orchestration.server';
import { WebhookHandlers } from '../../app/services/sync-service.server';

describe('Route Handler Execution - Chat API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/chat - Action Handler', () => {
    it('should execute chat action and create new conversation', async () => {
      // Mock data
      const mockShop = {
        id: 'shop-123',
        domain: 'test-store.myshopify.com',
        name: 'Test Store',
        accessToken: 'token',
      };

      const mockConversation = {
        id: 'conv-456',
        shopId: 'shop-123',
        channel: 'WEB_CHAT',
        status: 'ACTIVE',
        locale: 'en',
        messages: [],
      };

      const mockChatResponse = {
        message: 'Hello! How can I help you?',
        confidence: 0.95,
        requiresEscalation: false,
        toolsUsed: ['searchKnowledgeBase'],
        sourceReferences: [],
      };

      // Setup mocks
      vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);
      vi.mocked(prisma.conversation.create).mockResolvedValue(mockConversation as any);
      vi.mocked(AIOrchestrationService.chat).mockResolvedValue(mockChatResponse as any);

      // Create request
      const requestBody = {
        message: 'Hello',
        visitorId: 'visitor-789',
        sessionId: 'session-999',
        channel: 'WEB_CHAT',
        locale: 'en',
        metadata: { shop: 'test-store.myshopify.com' },
      };

      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Domain': 'test-store.myshopify.com',
        },
        body: JSON.stringify(requestBody),
      });

      // Execute action
      const response = await chatAction({ request, params: {}, context: {} } as any);

      // Verify response
      expect(response).toBeDefined();
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.conversationId).toBe('conv-456');
      expect(data.message).toBe('Hello! How can I help you?');
      expect(data.confidence).toBe(0.95);

      // Verify mocks were called
      expect(prisma.shop.findUnique).toHaveBeenCalledWith({
        where: { domain: 'test-store.myshopify.com' },
      });
      expect(prisma.conversation.create).toHaveBeenCalled();
      expect(AIOrchestrationService.chat).toHaveBeenCalledWith(
        'shop-123',
        'conv-456',
        'Hello',
        'en'
      );
    });

    it('should execute chat action with existing conversation', async () => {
      const mockShop = {
        id: 'shop-123',
        domain: 'test-store.myshopify.com',
      };

      const mockConversation = {
        id: 'conv-existing',
        shopId: 'shop-123',
        channel: 'WEB_CHAT',
        status: 'ACTIVE',
        messages: [
          { id: 'msg-1', content: 'Previous message', role: 'user', createdAt: new Date() },
        ],
      };

      const mockChatResponse = {
        message: 'Continuing our conversation',
        confidence: 0.88,
        requiresEscalation: false,
        toolsUsed: [],
        sourceReferences: [],
      };

      vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);
      vi.mocked(prisma.conversation.findUnique).mockResolvedValue(mockConversation as any);
      vi.mocked(AIOrchestrationService.chat).mockResolvedValue(mockChatResponse as any);

      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Domain': 'test-store.myshopify.com',
        },
        body: JSON.stringify({
          message: 'Follow up question',
          conversationId: 'conv-existing',
          metadata: { shop: 'test-store.myshopify.com' },
        }),
      });

      const response = await chatAction({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.conversationId).toBe('conv-existing');
      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: 'conv-existing' },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
    });

    it('should handle missing shop error', async () => {
      vi.mocked(prisma.shop.findUnique).mockResolvedValue(null);

      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Domain': 'nonexistent.myshopify.com',
        },
        body: JSON.stringify({
          message: 'Hello',
          metadata: { shop: 'nonexistent.myshopify.com' },
        }),
      });

      const response = await chatAction({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Shop not found');
    });

    it('should handle missing message validation', async () => {
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Domain': 'test-store.myshopify.com',
        },
        body: JSON.stringify({
          message: '',
          metadata: { shop: 'test-store.myshopify.com' },
        }),
      });

      const mockShop = { id: 'shop-123', domain: 'test-store.myshopify.com' };
      vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);

      const response = await chatAction({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Message is required');
    });

    it('should handle internal server errors gracefully', async () => {
      vi.mocked(prisma.shop.findUnique).mockRejectedValue(new Error('Database connection failed'));

      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Domain': 'test-store.myshopify.com',
        },
        body: JSON.stringify({
          message: 'Hello',
          metadata: { shop: 'test-store.myshopify.com' },
        }),
      });

      const response = await chatAction({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Database connection failed');
    });
  });

  describe('GET /api/chat - Loader Handler', () => {
    it('should execute loader and retrieve conversation history', async () => {
      const mockConversation = {
        id: 'conv-123',
        status: 'ACTIVE',
        channel: 'WEB_CHAT',
        startedAt: new Date('2024-01-15T10:00:00Z'),
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            confidence: null,
            createdAt: new Date('2024-01-15T10:00:00Z'),
            toolInvocations: [],
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Hi there!',
            confidence: 0.95,
            createdAt: new Date('2024-01-15T10:00:05Z'),
            toolInvocations: [{ toolName: 'searchKnowledgeBase' }],
          },
        ],
        customerIdentity: {
          customerId: 'cust-456',
          email: 'test@example.com',
        },
      };

      vi.mocked(prisma.conversation.findUnique).mockResolvedValue(mockConversation as any);

      const request = new Request('http://localhost/api/chat?conversationId=conv-123', {
        method: 'GET',
      });

      const response = await chatLoader({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.conversation.id).toBe('conv-123');
      expect(data.conversation.messages.length).toBe(2);
      expect(data.conversation.messages[0].role).toBe('user');
      expect(data.conversation.messages[1].toolsUsed).toEqual(['searchKnowledgeBase']);

      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: 'conv-123' },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            include: { toolInvocations: true },
          },
          customerIdentity: true,
        },
      });
    });

    it('should handle missing conversationId parameter', async () => {
      const request = new Request('http://localhost/api/chat', {
        method: 'GET',
      });

      const response = await chatLoader({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('conversationId required');
    });

    it('should handle conversation not found', async () => {
      vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null);

      const request = new Request('http://localhost/api/chat?conversationId=nonexistent', {
        method: 'GET',
      });

      const response = await chatLoader({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Conversation not found');
    });
  });
});

describe('Route Handler Execution - Webhook API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SHOPIFY_API_SECRET = 'test-secret';
  });

  describe('POST /api/webhooks - Action Handler', () => {
    it('should execute webhook action for product update', async () => {
      const mockShop = {
        id: 'shop-123',
        domain: 'test-store.myshopify.com',
      };

      const mockWebhookEvent = {
        id: 'webhook-456',
        shopId: 'shop-123',
        topic: 'products/update',
        processed: false,
      };

      vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);
      vi.mocked(prisma.webhookEvent.create).mockResolvedValue(mockWebhookEvent as any);
      vi.mocked(prisma.webhookEvent.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(WebhookHandlers.handleProductUpdate).mockResolvedValue(1);

      const webhookPayload = {
        id: 'prod-123',
        title: 'Updated Product',
        vendor: 'Test Vendor',
      };

      const request = new Request('http://localhost/api/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'products/update',
          'X-Shopify-Shop-Domain': 'test-store.myshopify.com',
          'X-Shopify-Hmac-Sha256': 'fake-signature',
        },
        body: JSON.stringify(webhookPayload),
      });

      const response = await webhookAction({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(prisma.shop.findUnique).toHaveBeenCalledWith({
        where: { domain: 'test-store.myshopify.com' },
      });
      expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
        data: {
          shopId: 'shop-123',
          topic: 'products/update',
          payload: webhookPayload,
          processed: false,
        },
      });
      expect(WebhookHandlers.handleProductUpdate).toHaveBeenCalledWith('shop-123', webhookPayload);
      expect(prisma.webhookEvent.updateMany).toHaveBeenCalled();
    });

    it('should execute webhook action for product delete', async () => {
      const mockShop = { id: 'shop-123', domain: 'test-store.myshopify.com' };
      vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);
      vi.mocked(prisma.webhookEvent.create).mockResolvedValue({} as any);
      vi.mocked(prisma.webhookEvent.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(WebhookHandlers.handleProductDelete).mockResolvedValue(undefined);

      const request = new Request('http://localhost/api/webhooks', {
        method: 'POST',
        headers: {
          'X-Shopify-Topic': 'products/delete',
          'X-Shopify-Shop-Domain': 'test-store.myshopify.com',
          'X-Shopify-Hmac-Sha256': 'fake-signature',
        },
        body: JSON.stringify({ id: 'prod-delete-123' }),
      });

      const response = await webhookAction({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(WebhookHandlers.handleProductDelete).toHaveBeenCalledWith('shop-123', { id: 'prod-delete-123' });
    });

    it('should execute webhook action for collection update', async () => {
      const mockShop = { id: 'shop-123', domain: 'test-store.myshopify.com' };
      vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);
      vi.mocked(prisma.webhookEvent.create).mockResolvedValue({} as any);
      vi.mocked(prisma.webhookEvent.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(WebhookHandlers.handleCollectionUpdate).mockResolvedValue(undefined);

      const request = new Request('http://localhost/api/webhooks', {
        method: 'POST',
        headers: {
          'X-Shopify-Topic': 'collections/update',
          'X-Shopify-Shop-Domain': 'test-store.myshopify.com',
          'X-Shopify-Hmac-Sha256': 'fake-signature',
        },
        body: JSON.stringify({ id: 'coll-123', title: 'Summer Collection' }),
      });

      const response = await webhookAction({ request, params: {}, context: {} } as any);
      expect(WebhookHandlers.handleCollectionUpdate).toHaveBeenCalled();
    });

    it('should execute webhook action for page update', async () => {
      const mockShop = { id: 'shop-123', domain: 'test-store.myshopify.com' };
      vi.mocked(prisma.shop.findUnique).mockResolvedValue(mockShop as any);
      vi.mocked(prisma.webhookEvent.create).mockResolvedValue({} as any);
      vi.mocked(prisma.webhookEvent.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(WebhookHandlers.handlePageUpdate).mockResolvedValue(1);

      const request = new Request('http://localhost/api/webhooks', {
        method: 'POST',
        headers: {
          'X-Shopify-Topic': 'pages/update',
          'X-Shopify-Shop-Domain': 'test-store.myshopify.com',
          'X-Shopify-Hmac-Sha256': 'fake-signature',
        },
        body: JSON.stringify({ id: 'page-123', title: 'About Us' }),
      });

      const response = await webhookAction({ request, params: {}, context: {} } as any);
      expect(WebhookHandlers.handlePageUpdate).toHaveBeenCalled();
    });

    it('should handle missing required headers', async () => {
      const request = new Request('http://localhost/api/webhooks', {
        method: 'POST',
        headers: {
          'X-Shopify-Hmac-Sha256': 'fake-signature',
        },
        body: JSON.stringify({}),
      });

      const response = await webhookAction({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required headers');
    });

    it('should handle shop not found', async () => {
      vi.mocked(prisma.shop.findUnique).mockResolvedValue(null);

      const request = new Request('http://localhost/api/webhooks', {
        method: 'POST',
        headers: {
          'X-Shopify-Topic': 'products/update',
          'X-Shopify-Shop-Domain': 'nonexistent.myshopify.com',
          'X-Shopify-Hmac-Sha256': 'fake-signature',
        },
        body: JSON.stringify({}),
      });

      const response = await webhookAction({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Shop not found');
    });

    it('should handle webhook processing errors', async () => {
      vi.mocked(prisma.shop.findUnique).mockRejectedValue(new Error('Database error'));

      const request = new Request('http://localhost/api/webhooks', {
        method: 'POST',
        headers: {
          'X-Shopify-Topic': 'products/update',
          'X-Shopify-Shop-Domain': 'test-store.myshopify.com',
          'X-Shopify-Hmac-Sha256': 'fake-signature',
        },
        body: JSON.stringify({}),
      });

      const response = await webhookAction({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Webhook processing failed');
    });
  });
});
