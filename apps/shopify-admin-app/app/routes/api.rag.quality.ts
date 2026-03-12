/**
 * RAG Quality Policy API — Phase 2
 *
 * GET  /api/rag/quality  — Returns the current RAG quality policy for the authenticated shop.
 * PUT  /api/rag/quality  — Updates the quality policy (minScore, rerankStrategy).
 *
 * Fields stored in ChatbotConfig:
 *   confidenceThreshold  → minScore forwarded to the backend quality pipeline
 *
 * The rerankStrategy is accepted and returned but not yet persisted (handled by the
 * backend in fluxbot-studio-back-ia until a dedicated schema field is added).
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import type { RerankStrategy } from '../services/ia-backend.server';

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

const VALID_RERANK_STRATEGIES: RerankStrategy[] = [
  'cross_encoder',
  'reciprocal_rank_fusion',
  'bm25_hybrid',
  'none',
];

function isValidRerankStrategy(value: unknown): value is RerankStrategy {
  return typeof value === 'string' && (VALID_RERANK_STRATEGIES as string[]).includes(value);
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;

  const config = await prisma.chatbotConfig.findFirst({
    where: { shop: { domain: shopId } },
    select: {
      confidenceThreshold: true,
    },
  });

  return json({
    minScore: config?.confidenceThreshold ?? 0.6,
    rerankStrategy: 'cross_encoder' as RerankStrategy,
    topK: null as number | null,
  });
}

// ─── PUT ─────────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'PUT') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shopId = session.shop;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  // Validate minScore
  if ('minScore' in input) {
    const val = input.minScore;
    if (typeof val !== 'number' || val < 0 || val > 1) {
      return json({ error: 'minScore must be a number between 0 and 1' }, { status: 422 });
    }
  }

  // Validate rerankStrategy (accepted but not persisted until backend field is ready)
  if ('rerankStrategy' in input && !isValidRerankStrategy(input.rerankStrategy)) {
    return json(
      { error: `rerankStrategy must be one of: ${VALID_RERANK_STRATEGIES.join(', ')}` },
      { status: 422 },
    );
  }

  const minScore = typeof input.minScore === 'number' ? input.minScore : undefined;

  const shop = await prisma.shop.findFirst({ where: { domain: shopId }, select: { id: true } });
  if (!shop) {
    return json({ error: 'Shop not found' }, { status: 404 });
  }

  const updated = await prisma.chatbotConfig.upsert({
    where: { shopId: shop.id },
    create: {
      shopId: shop.id,
      confidenceThreshold: minScore ?? 0.6,
    },
    update: {
      ...(minScore !== undefined && { confidenceThreshold: minScore }),
    },
    select: { confidenceThreshold: true },
  });

  return json({
    minScore: updated.confidenceThreshold,
    rerankStrategy: (isValidRerankStrategy(input.rerankStrategy)
      ? input.rerankStrategy
      : 'cross_encoder') as RerankStrategy,
    topK: typeof input.topK === 'number' ? input.topK : null,
  });
}
