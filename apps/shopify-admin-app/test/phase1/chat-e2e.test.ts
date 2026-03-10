import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import prisma from "../../app/db.server";

/**
 * Phase 1 E2E Test Suite: Chat Flow
 * 
 * Tests the complete chat flow from message to response:
 * - Conversation creation
 * - Message storage
 * - AI orchestration integration
 * - Response generation
 */

describe("Phase 1 E2E: Chat Flow", () => {
  let testShop: any;
  
  beforeAll(async () => {
    // Create test shop
    testShop = await prisma.shop.create({
      data: {
        domain: "test-e2e.myshopify.com",
        accessToken: "test_token",
        status: "ACTIVE",
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    if (testShop) {
      await prisma.shop.delete({
        where: { id: testShop.id },
      });
    }
  });

  describe("Conversation Management", () => {
    it("should create a new conversation", async () => {
      const conversation = await prisma.conversation.create({
        data: {
          shopId: testShop.id,
          channel: "WEB_CHAT",
          status: "ACTIVE",
          locale: "en",
          visitorId: "visitor_123",
        },
      });

      expect(conversation).toBeDefined();
      expect(conversation.shopId).toBe(testShop.id);
      expect(conversation.channel).toBe("WEB_CHAT");
      expect(conversation.status).toBe("ACTIVE");
    });

    it("should store conversation messages", async () => {
      const conversation = await prisma.conversation.create({
        data: {
          shopId: testShop.id,
          channel: "WEB_CHAT",
          status: "ACTIVE",
        },
      });

      const userMessage = await prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          content: "Hello, I need help finding a product",
        },
      });

      const assistantMessage = await prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: "I'd be happy to help you find a product!",
          confidence: 0.95,
        },
      });

      expect(userMessage.role).toBe("USER");
      expect(assistantMessage.role).toBe("ASSISTANT");
      expect(assistantMessage.confidence).toBe(0.95);
    });

    it("should retrieve conversation history", async () => {
      const conversation = await prisma.conversation.create({
        data: {
          shopId: testShop.id,
          channel: "WEB_CHAT",
          status: "ACTIVE",
        },
      });

      // Create multiple messages
      await prisma.conversationMessage.createMany({
        data: [
          {
            conversationId: conversation.id,
            role: "USER",
            content: "What's your return policy?",
          },
          {
            conversationId: conversation.id,
            role: "ASSISTANT",
            content: "Our return policy allows returns within 30 days.",
            confidence: 0.92,
          },
        ],
      });

      const result = await prisma.conversation.findUnique({
        where: { id: conversation.id },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result!.messages).toHaveLength(2);
      expect(result!.messages[0].role).toBe("USER");
      expect(result!.messages[1].role).toBe("ASSISTANT");
    });
  });

  describe("Knowledge Base Integration", () => {
    it("should create knowledge source", async () => {
      const source = await prisma.knowledgeSource.create({
        data: {
          shopId: testShop.id,
          sourceType: "CATALOG",
          name: "Product Catalog",
          isActive: true,
        },
      });

      expect(source).toBeDefined();
      expect(source.sourceType).toBe("CATALOG");
    });

    it("should store document with chunks", async () => {
      const source = await prisma.knowledgeSource.create({
        data: {
          shopId: testShop.id,
          sourceType: "POLICIES",
          name: "Store Policies",
        },
      });

      const document = await prisma.knowledgeDocument.create({
        data: {
          sourceId: source.id,
          externalId: "policy_return",
          title: "Return Policy",
          language: "en",
          chunks: {
            create: [
              {
                sequence: 0,
                content: "We offer 30-day returns on all items.",
                tokenCount: 10,
              },
              {
                sequence: 1,
                content: "Items must be in original condition with tags.",
                tokenCount: 12,
              },
            ],
          },
        },
        include: {
          chunks: true,
        },
      });

      expect(document.chunks).toHaveLength(2);
      expect(document.chunks[0].sequence).toBe(0);
      expect(document.chunks[1].sequence).toBe(1);
    });

    it("should store embeddings for chunks", async () => {
      const source = await prisma.knowledgeSource.create({
        data: {
          shopId: testShop.id,
          sourceType: "CATALOG",
          name: "Products",
        },
      });

      const document = await prisma.knowledgeDocument.create({
        data: {
          sourceId: source.id,
          title: "Test Product",
          language: "en",
        },
      });

      const chunk = await prisma.knowledgeChunk.create({
        data: {
          documentId: document.id,
          sequence: 0,
          content: "Premium cotton t-shirt",
          tokenCount: 5,
        },
      });

      const embedding = await prisma.embeddingRecord.create({
        data: {
          chunkId: chunk.id,
          provider: "openai",
          model: "text-embedding-3-small",
          embedding: [0.1, 0.2, 0.3], // Mock embedding vector
          dimension: 3,
        },
      });

      expect(embedding).toBeDefined();
      expect(embedding.provider).toBe("openai");
      expect(embedding.dimension).toBe(3);
    });
  });

  describe("Tool Invocations & Orchestration", () => {
    it("should record tool usage", async () => {
      const conversation = await prisma.conversation.create({
        data: {
          shopId: testShop.id,
          channel: "WEB_CHAT",
          status: "ACTIVE",
        },
      });

      const message = await prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: "I found 3 products matching your search.",
        },
      });

      const toolInvocation = await prisma.toolInvocation.create({
        data: {
          messageId: message.id,
          toolName: "searchProducts",
          input: { query: "cotton t-shirt", limit: 10 },
          output: { results: [], count: 3 },
          success: true,
          durationMs: 150,
        },
      });

      expect(toolInvocation.toolName).toBe("searchProducts");
      expect(toolInvocation.success).toBe(true);
      expect(toolInvocation.durationMs).toBe(150);
    });

    it("should handle handoff requests", async () => {
      const conversation = await prisma.conversation.create({
        data: {
          shopId: testShop.id,
          channel: "WEB_CHAT",
          status: "ACTIVE",
        },
      });

      const handoff = await prisma.handoffRequest.create({
        data: {
          shopId: testShop.id,
          conversationId: conversation.id,
          reason: "Customer requests complex technical support",
          status: "pending",
        },
      });

      expect(handoff.status).toBe("pending");
      expect(handoff.reason).toContain("technical support");

      // Update conversation status
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: "ESCALATED" },
      });

      const updated = await prisma.conversation.findUnique({
        where: { id: conversation.id },
      });

      expect(updated!.status).toBe("ESCALATED");
    });
  });

  describe("Commerce Projections", () => {
    it("should cache product data", async () => {
      const product = await prisma.productProjection.create({
        data: {
          shopId: testShop.id,
          productId: "gid://shopify/Product/123",
          handle: "cotton-tshirt",
          title: "Premium Cotton T-Shirt",
          description: "Soft and comfortable",
          vendor: "Test Brand",
          productType: "Apparel",
          variants: [
            {
              id: "gid://shopify/ProductVariant/456",
              title: "Small / Blue",
              price: "29.99",
            },
          ],
        },
      });

      expect(product.handle).toBe("cotton-tshirt");
      expect(product.variants).toHaveLength(1);
    });

    it("should cache policy data", async () => {
      const policy = await prisma.policyProjection.create({
        data: {
          shopId: testShop.id,
          policyType: "refund",
          title: "Refund Policy",
          body: "Full refunds within 30 days of purchase.",
          url: "https://example.com/policies/refund",
        },
      });

      expect(policy.policyType).toBe("refund");
      expect(policy.body).toContain("30 days");
    });

    it("should cache order data", async () => {
      const order = await prisma.orderProjection.create({
        data: {
          shopId: testShop.id,
          orderId: "gid://shopify/Order/789",
          orderNumber: "1001",
          customerId: "gid://shopify/Customer/123",
          email: "customer@example.com",
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
          totalPrice: "59.99",
          lineItems: [
            {
              title: "Premium Cotton T-Shirt",
              quantity: 2,
              price: "29.99",
            },
          ],
        },
      });

      expect(order.orderNumber).toBe("1001");
      expect(order.financialStatus).toBe("paid");
    });
  });

  describe("Compliance & Privacy", () => {
    it("should record consent", async () => {
      const consent = await prisma.consentRecord.create({
        data: {
          shopId: testShop.id,
          visitorId: "visitor_456",
          consentType: "CHAT_STORAGE",
          granted: true,
          ipAddress: "192.168.1.1",
          userAgent: "Mozilla/5.0",
        },
      });

      expect(consent.granted).toBe(true);
      expect(consent.consentType).toBe("CHAT_STORAGE");
    });

    it("should log audit trail", async () => {
      const auditLog = await prisma.auditLog.create({
        data: {
          shopId: testShop.id,
          userId: "user_123",
          action: "conversation.create",
          entityType: "Conversation",
          entityId: "conv_456",
          changes: { status: "ACTIVE" },
        },
      });

      expect(auditLog.action).toBe("conversation.create");
      expect(auditLog.entityType).toBe("Conversation");
    });
  });

  describe("Sync & Webhooks", () => {
    it("should queue webhook events", async () => {
      const webhook = await prisma.webhookEvent.create({
        data: {
          shopId: testShop.id,
          topic: "products/update",
          payload: {
            id: 123,
            title: "Updated Product",
          },
          processed: false,
        },
      });

      expect(webhook.topic).toBe("products/update");
      expect(webhook.processed).toBe(false);
    });

    it("should track sync jobs", async () => {
      const syncJob = await prisma.syncJob.create({
        data: {
          shopId: testShop.id,
          jobType: "initial:catalog",
          status: "PENDING",
          totalItems: 100,
          processedItems: 0,
        },
      });

      expect(syncJob.status).toBe("PENDING");
      expect(syncJob.totalItems).toBe(100);

      // Update progress
      await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: "RUNNING",
          processedItems: 50,
          progress: 0.5,
        },
      });

      const updated = await prisma.syncJob.findUnique({
        where: { id: syncJob.id },
      });

      expect(updated!.status).toBe("RUNNING");
      expect(updated!.progress).toBe(0.5);
    });
  });
});
