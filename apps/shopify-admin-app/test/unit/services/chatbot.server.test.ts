import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callChatbotApi } from '../../../app/services/chatbot.server';

// Mock global fetch
global.fetch = vi.fn();

describe('Chatbot Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CHATBOT_API_URL = 'https://test-api.com/chat';
    process.env.CHATBOT_API_KEY = 'test-key-123';
  });

  describe('callChatbotApi', () => {
    it('should successfully call chatbot API with correct parameters', async () => {
      const mockResponse = {
        reply: 'Hello! How can I help you?',
        confidence: 0.95
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await callChatbotApi('Hello', { tone: 'friendly' });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.com/chat',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key-123'
          },
          body: JSON.stringify({
            query: 'Hello',
            customization: { tone: 'friendly' }
          })
        })
      );

      expect(result).toEqual(mockResponse);
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const result = await callChatbotApi('Test message', {});

      expect(result).toEqual({
        error: 'Failed to connect to chatbot service'
      });
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await callChatbotApi('Test', {});

      expect(result).toEqual({
        error: 'Failed to connect to chatbot service'
      });
    });

    it('should use default URL when env variable not set', async () => {
      delete process.env.CHATBOT_API_URL;

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply: 'test' })
      });

      await callChatbotApi('Test', {});

      expect(global.fetch).toHaveBeenCalledWith(
        'https://tu-api-de-chatbot.com/api',
        expect.anything()
      );
    });

    it('should handle empty message', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply: 'Please provide a message' })
      });

      const result = await callChatbotApi('', {});

      expect(result).toBeDefined();
    });

    it('should handle complex settings object', async () => {
      const complexSettings = {
        tone: 'professional',
        language: 'es',
        context: {
          shopDomain: 'test.myshopify.com',
          customerId: '123'
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply: 'Response' })
      });

      await callChatbotApi('Test', complexSettings);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            query: 'Test',
            customization: complexSettings
          })
        })
      );
    });
  });
});
