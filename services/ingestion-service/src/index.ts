/**
 * @fluxbot/ingestion-service
 *
 * Knowledge ingestion service: chunking, embedding, vector indexing.
 * Core implementation lives in the Remix app (apps/shopify-admin-app/app/services/sync-service.server.ts).
 * This package provides the shared types and contracts for the ingestion pipeline.
 */

// ─── Chunk & document types ───────────────────────────────────────────────────

export interface ChunkData {
  sourceId: string;
  sourceType: string;
  documentId: string;
  sequence: number;
  content: string;
  metadata: Record<string, unknown>;
  language: string;
  /** Whether this chunk should be sent for embedding */
  shouldEmbed: boolean;
}

export interface IngestionResult {
  shopId: string;
  documentsProcessed: number;
  chunksCreated: number;
  chunksSkipped: number;
  durationMs: number;
}

export interface EmbeddingRequest {
  shopId: string;
  chunks: ChunkData[];
  provider?: "OPENAI" | "ANTHROPIC" | "GEMINI";
}

// ─── Chunking strategy types ──────────────────────────────────────────────────

export type ChunkingStrategy = "fixed" | "sentence" | "semantic";

export interface ChunkingConfig {
  strategy: ChunkingStrategy;
  maxTokens: number;
  overlapTokens: number;
}

export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  strategy: "sentence",
  maxTokens: 512,
  overlapTokens: 64,
};

// ─── Service entrypoint ───────────────────────────────────────────────────────

export interface IngestionServiceConfig {
  chunking?: Partial<ChunkingConfig>;
  /** Batch size for embedding requests (default: 100) */
  embeddingBatchSize?: number;
}

export function initIngestionService(config: IngestionServiceConfig = {}): {
  config: { chunking: ChunkingConfig; embeddingBatchSize: number };
  description: string;
} {
  const resolved = {
    chunking: { ...DEFAULT_CHUNKING_CONFIG, ...config.chunking },
    embeddingBatchSize: config.embeddingBatchSize ?? 100,
  };

  console.log("[IngestionService] Initialized", resolved);

  return {
    config: resolved,
    description:
      "Knowledge ingestion service — chunking, embedding, vector indexing. " +
      "Embedding execution is delegated to fluxbot-studio-back-ia via IAGateway.",
  };
}
