/**
 * Single Campaign API — Phase 3
 *
 * GET    /api/campaigns/:id  — Get campaign by ID.
 * PUT    /api/campaigns/:id  — Update campaign.
 * DELETE /api/campaigns/:id  — Delete campaign.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from '../shopify.server';
import {
  getCampaign,
  updateCampaign,
  deleteCampaign,
  type CampaignUpdateInput,
} from '../services/campaign.server';

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

async function resolveShopId(shopDomain: string): Promise<string | null> {
  const { default: prisma } = await import('../db.server');
  const shop = await prisma.shop.findFirst({ where: { domain: shopDomain }, select: { id: true } });
  return shop?.id ?? null;
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const campaignId = params.id;
  if (!campaignId) return json({ error: 'Missing campaign ID' }, { status: 400 });

  const shopId = await resolveShopId(session.shop);
  if (!shopId) return json({ error: 'Shop not found' }, { status: 404 });

  const campaign = await getCampaign(shopId, campaignId);
  if (!campaign) return json({ error: 'Campaign not found' }, { status: 404 });

  return json({ campaign });
}

// ─── PUT / DELETE ─────────────────────────────────────────────────────────────

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const campaignId = params.id;
  if (!campaignId) return json({ error: 'Missing campaign ID' }, { status: 400 });

  const shopId = await resolveShopId(session.shop);
  if (!shopId) return json({ error: 'Shop not found' }, { status: 404 });

  if (request.method === 'DELETE') {
    const deleted = await deleteCampaign(shopId, campaignId);
    if (!deleted) return json({ error: 'Campaign not found' }, { status: 404 });
    return json({ message: 'Campaign deleted' });
  }

  if (request.method === 'PUT') {
    let body: unknown;
    try { body = await request.json(); } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (typeof body !== 'object' || body === null) {
      return json({ error: 'Invalid request body' }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const VALID_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'];
    const VALID_SCHEDULE_TYPES = ['IMMEDIATE', 'SCHEDULED', 'RECURRING'];

    const updateInput: CampaignUpdateInput = {
      ...(typeof input.name === 'string' && { name: input.name.trim() }),
      ...(typeof input.description === 'string' && { description: input.description }),
      ...(typeof input.status === 'string' && VALID_STATUSES.includes(input.status) && {
        status: input.status as CampaignUpdateInput['status'],
      }),
      ...(typeof input.scheduleType === 'string' && VALID_SCHEDULE_TYPES.includes(input.scheduleType) && {
        scheduleType: input.scheduleType as CampaignUpdateInput['scheduleType'],
      }),
      ...(typeof input.cronExpression === 'string' && { cronExpression: input.cronExpression }),
      ...(typeof input.scheduledAt === 'string' && { scheduledAt: new Date(input.scheduledAt) }),
      ...(typeof input.startAt === 'string' && { startAt: new Date(input.startAt) }),
      ...(typeof input.endAt === 'string' && { endAt: new Date(input.endAt) }),
      ...(typeof input.localeTemplates === 'object' && input.localeTemplates !== null && {
        localeTemplates: input.localeTemplates as Record<string, string>,
      }),
      ...(Array.isArray(input.targetLocales) && { targetLocales: input.targetLocales as string[] }),
      ...(Array.isArray(input.triggerIds) && { triggerIds: input.triggerIds as string[] }),
      ...(typeof input.frequencyCap === 'number' && { frequencyCap: input.frequencyCap }),
      ...(typeof input.campaignWindowMs === 'number' && { campaignWindowMs: input.campaignWindowMs }),
    };

    const updated = await updateCampaign(shopId, campaignId, updateInput);
    if (!updated) return json({ error: 'Campaign not found' }, { status: 404 });
    return json({ campaign: updated });
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
