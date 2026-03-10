import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '../../../app/db.server';

describe('Database Service', () => {
  it('should export prisma client', () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma).toBe('object');
  });

  it('should have expected models', () => {
    expect(prisma.shop).toBeDefined();
    expect(prisma.conversation).toBeDefined();
    expect(prisma.conversationMessage).toBeDefined();
    expect(prisma.knowledgeSource).toBeDefined();
    expect(prisma.knowledgeDocument).toBeDefined();
    expect(prisma.knowledgeChunk).toBeDefined();
  });

  describe('Model operations', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should support shop model operations', () => {
      expect(typeof prisma.shop.findMany).toBe('function');
      expect(typeof prisma.shop.findUnique).toBe('function');
      expect(typeof prisma.shop.create).toBe('function');
      expect(typeof prisma.shop.update).toBe('function');
      expect(typeof prisma.shop.delete).toBe('function');
    });

    it('should support conversation model operations', () => {
      expect(typeof prisma.conversation.findMany).toBe('function');
      expect(typeof prisma.conversation.create).toBe('function');
      expect(typeof prisma.conversation.update).toBe('function');
    });

    it('should support knowledge models operations', () => {
      expect(typeof prisma.knowledgeSource.findMany).toBe('function');
      expect(typeof prisma.knowledgeDocument.findMany).toBe('function');
      expect(typeof prisma.knowledgeChunk.findMany).toBe('function');
    });

    it('should support user model operations', () => {
      expect(prisma.user).toBeDefined();
      expect(typeof prisma.user.findMany).toBe('function');
    });

    it('should support chatbotConfig model operations', () => {
      expect(prisma.chatbotConfig).toBeDefined();
      expect(typeof prisma.chatbotConfig.findUnique).toBe('function');
    });

    it('should support consentRecord model operations', () => {
      expect(prisma.consentRecord).toBeDefined();
      expect(typeof prisma.consentRecord.create).toBe('function');
    });

    it('should support webhookEvent model operations', () => {
      expect(prisma.webhookEvent).toBeDefined();
      expect(typeof prisma.webhookEvent.create).toBe('function');
    });

    it('should support syncJob model operations', () => {
      expect(prisma.syncJob).toBeDefined();
      expect(typeof prisma.syncJob.findMany).toBe('function');
    });

    it('should support productProjection model operations', () => {
      expect(prisma.productProjection).toBeDefined();
      expect(typeof prisma.productProjection.findMany).toBe('function');
    });

    it('should support policyProjection model operations', () => {
      expect(prisma.policyProjection).toBeDefined();
      expect(typeof prisma.policyProjection.findMany).toBe('function');
    });

    it('should support orderProjection model operations', () => {
      expect(prisma.orderProjection).toBeDefined();
      expect(typeof prisma.orderProjection.findMany).toBe('function');
    });

    it('should support session model operations', () => {
      expect(prisma.session).toBeDefined();
      expect(typeof prisma.session.findUnique).toBe('function');
    });
  });

  describe('Transaction support', () => {
    it('should support transactions', () => {
      expect(typeof prisma.$transaction).toBe('function');
    });

    it('should support raw queries', () => {
      expect(typeof prisma.$queryRaw).toBe('function');
      expect(typeof prisma.$executeRaw).toBe('function');
    });
  });

  describe('Connection management', () => {
    it('should support disconnect', () => {
      expect(typeof prisma.$disconnect).toBe('function');
    });

    it('should support connect', () => {
      expect(typeof prisma.$connect).toBe('function');
    });
  });
});
