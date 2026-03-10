import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIEmbeddingProvider } from '../../../app/services/embeddings.server';

// Mock global fetch
global.fetch = vi.fn();

describe('Embeddings Service', () => {
  describe('OpenAIEmbeddingProvider', () => {
    let provider: OpenAIEmbeddingProvider;
    const mockApiKey = 'sk-test-key-123';

    beforeEach(() => {
      vi.clearAllMocks();
      provider = new OpenAIEmbeddingProvider(mockApiKey);
    });

    it('should throw error when API key is missing', () => {
      expect(() => new OpenAIEmbeddingProvider('')).toThrow('OpenAI API key is required');
    });

    it('should return correct model name', () => {
      expect(provider.getModel()).toBe('text-embedding-3-small');
    });

    it('should return correct dimensions', () => {
      expect(provider.getDimensions()).toBe(1536);
    });

    describe('embed', () => {
      it('should successfully embed single text', async () => {
        const mockEmbedding = new Array(1536).fill(0).map((_, i) => i * 0.001);
        
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ embedding: mockEmbedding, index: 0 }]
          })
        });

        const result = await provider.embed('Test text');

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.openai.com/v1/embeddings',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${mockApiKey}`
            },
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              input: 'Test text',
              encoding_format: 'float'
            })
          })
        );

        expect(result).toEqual(mockEmbedding);
        expect(result.length).toBe(1536);
      });

      it('should handle API errors gracefully', async () => {
        (global.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({
            error: { message: 'Invalid API key' }
          })
        });

        await expect(provider.embed('Test')).rejects.toThrow('OpenAI error: Invalid API key');
      });

      it('should handle network errors', async () => {
        (global.fetch as any).mockRejectedValueOnce(new Error('Network failure'));

        await expect(provider.embed('Test')).rejects.toThrow('Network failure');
      });

      it('should handle empty text', async () => {
        const mockEmbedding = new Array(1536).fill(0);
        
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ embedding: mockEmbedding }]
          })
        });

        const result = await provider.embed('');
        expect(result).toBeDefined();
      });
    });

    describe('embedBatch', () => {
      it('should successfully embed multiple texts', async () => {
        const mockEmbeddings = [
          new Array(1536).fill(0.1),
          new Array(1536).fill(0.2),
          new Array(1536).fill(0.3)
        ];
        
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              { embedding: mockEmbeddings[0], index: 0 },
              { embedding: mockEmbeddings[1], index: 1 },
              { embedding: mockEmbeddings[2], index: 2 }
            ]
          })
        });

        const texts = ['Text 1', 'Text 2', 'Text 3'];
        const result = await provider.embedBatch(texts);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.openai.com/v1/embeddings',
          expect.objectContaining({
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              input: texts,
              encoding_format: 'float'
            })
          })
        );

        expect(result).toEqual(mockEmbeddings);
        expect(result.length).toBe(3);
      });

      it('should sort embeddings by index', async () => {
        const mockEmbeddings = [
          new Array(1536).fill(0.1),
          new Array(1536).fill(0.2),
          new Array(1536).fill(0.3)
        ];
        
        // Return embeddings in wrong order
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              { embedding: mockEmbeddings[2], index: 2 },
              { embedding: mockEmbeddings[0], index: 0 },
              { embedding: mockEmbeddings[1], index: 1 }
            ]
          })
        });

        const result = await provider.embedBatch(['A', 'B', 'C']);

        // Should be sorted correctly
        expect(result[0]).toEqual(mockEmbeddings[0]);
        expect(result[1]).toEqual(mockEmbeddings[1]);
        expect(result[2]).toEqual(mockEmbeddings[2]);
      });

      it('should handle batch API errors', async () => {
        (global.fetch as any).mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            error: { message: 'Rate limit exceeded' }
          })
        });

        await expect(provider.embedBatch(['A', 'B'])).rejects.toThrow('OpenAI error: Rate limit exceeded');
      });

      it('should handle empty batch', async () => {
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] })
        });

        const result = await provider.embedBatch([]);
        expect(result).toEqual([]);
      });

      it('should handle large batches', async () => {
        const largeTexts = new Array(100).fill('test');
        const mockEmbeddings = largeTexts.map((_, i) => 
          new Array(1536).fill(i * 0.01)
        );
        
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockEmbeddings.map((emb, idx) => ({ 
              embedding: emb, 
              index: idx 
            }))
          })
        });

        const result = await provider.embedBatch(largeTexts);
        expect(result.length).toBe(100);
      });
    });
  });
});
