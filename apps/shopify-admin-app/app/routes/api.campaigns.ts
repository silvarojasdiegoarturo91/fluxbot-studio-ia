/**
 * Marketing Campaigns API — Phase 3
 *
 * GET  /api/campaigns  — List all campaigns for the authenticated shop.
 * POST /api/campaigns  — Create a new campaign.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from '../shopify.server';
import {
  listCampaigns,
  createCampaign,
  type CampaignCreateInput,
} from '../services/campaign.server';

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await import('../db.server').then((m) =>
    m.default.shop.findFirst({ where: { domain: session.shop }, select: { id: true } }),
  );
  if (!shop) return json({ error: 'Shop not found' }, { status: 404 });

  const campaigns = await listCampaigns(shop.id);
  return json({ campaigns });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);

  let body: unknown;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    return json({ error: 'name is required' }, { status: 422 });
  }

  const shop = await import('../db.server').then((m) =>
    m.default.shop.findFirst({ where: { domain: session.shop }, select: { id: true } }),
  );
  if (!shop) return json({ error: 'Shop not found' }, { status: 404 });

  const createInput: CampaignCreateInput = {
    name: String(input.name).trim(),
    description: typeof input.description === 'string' ? input.description : undefined,
    scheduleType: ['IMMEDIATE', 'SCHEDULED', 'RECURRING'].includes(input.scheduleType as string)
      ? (input.scheduleType as CampaignCreateInput['scheduleType'])
      : 'IMMEDIATE',
    cronExpression: typeof input.cronExpression === 'string' ? input.cronExpression : undefined,
    scheduledAt: typeof input.scheduledAt === 'string' ? new Date(input.scheduledAt) : undefined,
    startAt: typeof input.startAt === 'string' ? new Date(input.startAt) : undefined,
    endAt: typeof input.endAt === 'string' ? new Date(input.endAt) : undefined,
    localeTemplates:
      typeof input.localeTemplates === 'object' && input.localeTemplates !== null
        ? (input.localeTemplates as Record<string, string>)
        : {},
    targetLocales: Array.isArray(input.targetLocales) ? (input.targetLocales as string[]) : [],
    triggerIds: Array.isArray(input.triggerIds) ? (input.triggerIds as string[]) : [],
    frequencyCap: typeof input.frequencyCap === 'number' ? input.frequencyCap : 1,
    campaignWindowMs: typeof input.campaignWindowMs === 'number' ? input.campaignWindowMs : 86400000,
  };

  const campaign = await createCampaign(shop.id, createInput);
  return json({ campaign }, { status: 201 });
}
