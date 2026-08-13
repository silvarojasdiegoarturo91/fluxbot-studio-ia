/**
 * Unit Tests: Embeddings Service — Gemini/Anthropic adapters and the
 * EmbeddingsService factory, storage and retrieval paths.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnthropicEmbeddingProvider,
  GeminiEmbeddingProvider,
} from "../../../app/services/embeddings.server";

const {
  mockGetConfig,
  mockChunkFindMany,
  mockChunkCount,
  mockEmbeddingUpsert,
  mockEmbeddingFindMany,
  mockEmbeddingCount,
  mockEmbeddingGroupBy,
} = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockChunkFindMany: vi.fn(),
  mockChunkCount: vi.fn(),
  mockEmbeddingUpsert: vi.fn(),
  mockEmbeddingFindMany: vi.fn(),
  mockEmbeddingCount: vi.fn(),
  mockEmbeddingGroupBy: vi.fn(),
}));

vi.mock("../../../app/config.server", () => ({
  getConfig: mockGetConfig,
}));

vi.mock("../../../app/db.server", () => ({
  default: {
    knowledgeChunk: {
      findMany: mockChunkFindMany,
      count: mockChunkCount,
    },
    embeddingRecord: {
      upsert: mockEmbeddingUpsert,
      findMany: mockEmbeddingFindMany,
      count: mockEmbeddingCount,
      groupBy: mockEmbeddingGroupBy,
    },
  },
}));

function mockFetchEmbedding(values: number[], index = 0) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: [{ embedding: values, index }],
    }),
  };
}

describe("GeminiEmbeddingProvider", () => {
  const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/models/embedding-001:embedContent";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when constructed without an API key", () => {
    
    expect(() => new GeminiEmbeddingProvider("")).toThrow("Gemini API key is required");
  });

  it("exposes model and dimensions", () => {
    
    const provider = new GeminiEmbeddingProvider("gemini-key");
    expect(provider.getModel()).toBe("models/embedding-001");
    expect(provider.getDimensions()).toBe(768);
  });

  it("embeds a single text through the Gemini API", async () => {
    
    const provider = new GeminiEmbeddingProvider("gemini-key");
    const values = [0.1, 0.2, 0.3];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ embedding: { values } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider.embed("hello");

    expect(fetchMock).toHaveBeenCalledWith(
      `${GEMINI_URL}?key=gemini-key`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody).toMatchObject({
      model: "models/embedding-001",
      content: { parts: [{ text: "hello" }] },
    });
    expect(result).toEqual(values);
  });

  it("maps Gemini API errors", async () => {
    
    const provider = new GeminiEmbeddingProvider("gemini-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: { message: "quota exceeded" } }),
      }),
    );

    await expect(provider.embed("hello")).rejects.toThrow("Gemini error: quota exceeded");
  });

  it("embeds batches in groups of five with bounded concurrency", async () => {
    
    const provider = new GeminiEmbeddingProvider("gemini-key");
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      const text = body.content.parts[0].text;
      return {
        ok: true,
        status: 200,
        json: async () => ({ embedding: { values: [text.length] } }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const texts = ["a", "bb", "ccc", "dddd", "eeeee", "ffffff"];
    const results = await provider.embedBatch(texts);

    expect(results).toHaveLength(6);
    // One fetch per text; texts are grouped into two sequential batches of five.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

describe("AnthropicEmbeddingProvider", () => {
  it("throws when constructed without an API key", () => {
    
    expect(() => new AnthropicEmbeddingProvider("")).toThrow("Anthropic API key is required");
  });

  it("exposes model and dimensions", () => {
    
    const provider = new AnthropicEmbeddingProvider("anthropic-key");
    expect(provider.getModel()).toBe("claude-3-5-sonnet-20241022");
    expect(provider.getDimensions()).toBe(1024);
  });

  it("rejects embeddings since the Anthropic API is not available", async () => {
    
    const provider = new AnthropicEmbeddingProvider("anthropic-key");

    await expect(provider.embed("hello")).rejects.toThrow("not yet available");
    await expect(provider.embedBatch(["a", "b"])).rejects.toThrow("not yet available");
  });
});

describe("EmbeddingsService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function freshModule() {
    return import("../../../app/services/embeddings.server");
  }

  describe("getProvider factory", () => {
    it("builds an OpenAI provider from config", async () => {
      mockGetConfig.mockReturnValue({
        ai: { provider: "openai", openai: { apiKey: "sk-1" } },
      });
      const { EmbeddingsService } = await freshModule();
      const provider = EmbeddingsService.getProvider();
      expect(provider.constructor.name).toBe("OpenAIEmbeddingProvider");
    });

    it("builds a Gemini provider from config", async () => {
      mockGetConfig.mockReturnValue({
        ai: { provider: "gemini", gemini: { apiKey: "gem-1" } },
      });
      const { EmbeddingsService } = await freshModule();
      const provider = EmbeddingsService.getProvider();
      expect(provider.constructor.name).toBe("GeminiEmbeddingProvider");
    });

    it("falls back to OpenAI for anthropic when openai config exists", async () => {
      mockGetConfig.mockReturnValue({
        ai: { provider: "anthropic", openai: { apiKey: "sk-fallback" } },
      });
      const { EmbeddingsService } = await freshModule();
      const provider = EmbeddingsService.getProvider();
      expect(provider.constructor.name).toBe("OpenAIEmbeddingProvider");
    });

    it("throws for anthropic when no openai fallback config exists", async () => {
      mockGetConfig.mockReturnValue({
        ai: { provider: "anthropic" },
      });
      const { EmbeddingsService } = await freshModule();
      expect(() => EmbeddingsService.getProvider()).toThrow(
        "No embedding provider available for Anthropic fallback",
      );
    });

    it("throws for unknown providers", async () => {
      mockGetConfig.mockReturnValue({
        ai: { provider: "ollama" },
      });
      const { EmbeddingsService } = await freshModule();
      expect(() => EmbeddingsService.getProvider()).toThrow("Unknown AI provider: ollama");
    });

    it("caches the provider instance between calls", async () => {
      mockGetConfig.mockReturnValue({
        ai: { provider: "openai", openai: { apiKey: "sk-1" } },
      });
      const { EmbeddingsService } = await freshModule();
      expect(EmbeddingsService.getProvider()).toBe(EmbeddingsService.getProvider());
    });

    it("getEmbeddingsProvider delegates to the factory", async () => {
      mockGetConfig.mockReturnValue({
        ai: { provider: "openai", openai: { apiKey: "sk-1" } },
      });
      const { getEmbeddingsProvider } = await freshModule();
      expect(getEmbeddingsProvider().constructor.name).toBe("OpenAIEmbeddingProvider");
    });
  });

  describe("embed / embedBatch", () => {
    it("embeds a single text and estimates input tokens", async () => {
      mockGetConfig.mockReturnValue({
        ai: { provider: "openai", openai: { apiKey: "sk-1" } },
      });
      const values = [0.5, 0.5];
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchEmbedding(values)));

      const { EmbeddingsService } = await freshModule();
      const result = await EmbeddingsService.embed("hello");

      expect(result.text).toBe("hello");
      expect(result.embedding).toEqual(values);
      expect(result.model).toBe("text-embedding-3-small");
      expect(result.dimension).toBe(1536);
      expect(result.inputTokens).toBe(Math.ceil("hello".length / 4));
    });

    it("embeds multiple texts and maps results by index", async () => {
      mockGetConfig.mockReturnValue({
        ai: { provider: "openai", openai: { apiKey: "sk-1" } },
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              { embedding: [1], index: 0 },
              { embedding: [2], index: 1 },
            ],
          }),
        }),
      );

      const { EmbeddingsService } = await freshModule();
      const results = await EmbeddingsService.embedBatch(["a", "b"]);

      expect(results).toHaveLength(2);
      expect(results[1].embedding).toEqual([2]);
      expect(results[0].text).toBe("a");
    });
  });

  describe("embedAndStoreChunks", () => {
    it("returns zero when no chunks match the shop", async () => {
      mockGetConfig.mockReturnValue({
        ai: { provider: "openai", openai: { apiKey: "sk-1" } },
      });
      mockChunkFindMany.mockResolvedValue([]);

      const { EmbeddingsService } = await freshModule();
      const count = await EmbeddingsService.embedAndStoreChunks("shop-1", ["chunk-1"]);

      expect(count).toBe(0);
      expect(mockEmbeddingUpsert).not.toHaveBeenCalled();
    });

    it("embeds and upserts embedding records for each chunk", async () => {
      mockGetConfig.mockReturnValue({
        ai: { provider: "openai", openai: { apiKey: "sk-1" } },
      });
      mockChunkFindMany.mockResolvedValue([
        { id: "chunk-1", content: "one" },
        { id: "chunk-2", content: "two" },
      ]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              { embedding: [1, 0], index: 0 },
              { embedding: [0, 1], index: 1 },
            ],
          }),
        }),
      );

      const { EmbeddingsService } = await freshModule();
      const count = await EmbeddingsService.embedAndStoreChunks("shop-1", ["chunk-1", "chunk-2"]);

      expect(count).toBe(2);
      expect(mockEmbeddingUpsert).toHaveBeenCalledTimes(2);
      expect(mockEmbeddingUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { chunkId: "chunk-1" },
          create: expect.objectContaining({
            chunkId: "chunk-1",
            model: "text-embedding-3-small",
          }),
        }),
      );
    });
  });

  describe("searchSimilar", () => {
    it("returns only records above the similarity threshold, sorted and limited", async () => {
      mockGetConfig.mockReturnValue({
        ai: { provider: "openai", openai: { apiKey: "sk-1" } },
      });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchEmbedding([1, 0])));

      const makeRecord = (id: string, embedding: number[]) => ({
        id,
        embedding,
        chunk: { document: { source: { shopId: "shop-1" } } },
      });
      mockEmbeddingFindMany.mockResolvedValue([
        makeRecord("rec-1", [1, 0]),
        makeRecord("rec-2", [0.99, 0.02]),
        makeRecord("rec-3", [0, 1]),
      ]);

      const { EmbeddingsService } = await freshModule();
      const results = await EmbeddingsService.searchSimilar("shop-1", "query", 2, 0.9);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("rec-1");
      expect(results[0].similarity).toBeGreaterThan(0.99);
      expect(results[1].id).toBe("rec-2");
    });
  });

  describe("cosineSimilarity", () => {
    it("returns zero for mismatched dimensions", async () => {
      const { EmbeddingsService } = await freshModule();
      const similarity = (EmbeddingsService as unknown as {
        cosineSimilarity(v1: number[], v2: number[]): number;
      }).cosineSimilarity([1, 2], [1]);
      expect(similarity).toBe(0);
    });

    it("returns zero for zero-magnitude vectors", async () => {
      const { EmbeddingsService } = await freshModule();
      const similarity = (EmbeddingsService as unknown as {
        cosineSimilarity(v1: number[], v2: number[]): number;
      }).cosineSimilarity([0, 0], [0, 0]);
      expect(similarity).toBe(0);
    });
  });

  describe("getStats", () => {
    it("reports chunk and embedding counts with an embedding percentage", async () => {
      mockChunkCount.mockResolvedValue(10);
      mockEmbeddingCount.mockResolvedValue(7);
      mockEmbeddingGroupBy.mockResolvedValue([
        { model: "text-embedding-3-small", _count: { id: 7 } },
      ]);

      const { EmbeddingsService } = await freshModule();
      const stats = await EmbeddingsService.getStats("shop-1");

      expect(stats.totalChunks).toBe(10);
      expect(stats.embeddedChunks).toBe(7);
      expect(stats.embeddingPercentage).toBeCloseTo(70);
      expect(stats.models).toHaveLength(1);
    });

    it("avoids division by zero when no chunks exist", async () => {
      mockChunkCount.mockResolvedValue(0);
      mockEmbeddingCount.mockResolvedValue(0);
      mockEmbeddingGroupBy.mockResolvedValue([]);

      const { EmbeddingsService } = await freshModule();
      const stats = await EmbeddingsService.getStats("shop-1");

      expect(stats.embeddingPercentage).toBe(0);
    });
  });
});
