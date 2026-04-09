/**
 * @fluxbot/sync-service
 *
 * Standalone sync service for Shopify catalog, webhook and delta sync operations.
 * Core implementation lives in the Remix app (apps/shopify-admin-app/app/services/sync-service.server.ts).
 * This package provides the shared types, contracts and a lightweight process entrypoint
 * that can be run as a separate worker process when needed.
 */

// ─── Shared types ────────────────────────────────────────────────────────────

export type KnowledgeSourceType =
  | "CATALOG"
  | "POLICIES"
  | "PAGES"
  | "BLOG"
  | "FAQ"
  | "CUSTOM";

export type SyncStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type SyncJobType =
  | "initial:catalog"
  | "initial:policies"
  | "initial:pages"
  | "delta:products"
  | "delta:policies"
  | "delta:pages";

export interface SyncJobResult {
  jobId: string;
  status: SyncStatus;
  processedItems: number;
  failedItems: number;
  durationMs: number;
}

export interface WebhookPayloadProduct {
  id: string | number;
  title?: string;
  body_html?: string;
  description?: string;
  vendor?: string;
  product_type?: string;
  handle?: string;
  variants?: Array<{ id: string | number; title?: string; sku?: string; price?: string }>;
  images?: Array<{ id: string | number; src?: string; url?: string; alt?: string; altText?: string }>;
}

export interface WebhookPayloadPage {
  id: string | number;
  title?: string;
  handle?: string;
  body_html?: string;
  body_summary?: string;
  seo_title?: string;
  seo_description?: string;
}

// ─── Service entrypoint ───────────────────────────────────────────────────────

export interface SyncServiceConfig {
  /** How many PENDING jobs to process per scheduler tick (default: 2) */
  batchSize?: number;
  /** Interval between scheduler ticks in ms when running as a standalone process (default: 30000) */
  tickIntervalMs?: number;
}

export function initSyncService(config: SyncServiceConfig = {}): {
  config: Required<SyncServiceConfig>;
  description: string;
} {
  const resolved: Required<SyncServiceConfig> = {
    batchSize: config.batchSize ?? 2,
    tickIntervalMs: config.tickIntervalMs ?? 30_000,
  };

  console.log("[SyncService] Initialized", resolved);

  return {
    config: resolved,
    description:
      "Shopify sync service — catalog, policies, pages. " +
      "Jobs are created in the frontend repo and processed by sync-worker.server.ts. " +
      "Use this package for shared types and the standalone process entrypoint.",
  };
}
