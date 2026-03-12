/**
 * Campaign Dispatch API — Phase 3
 *
 * POST /api/campaigns/:id/dispatch
 *
 * Manually dispatch a marketing campaign to a specific session.
 * The backend IA is responsible for audience-level decisioning;
 * this endpoint handles single-session dispatch on behalf of the storefront widget.
 */

import type { ActionFunctionArgs } from "react-router";
import { cors } from "remix-utils/cors";
import { dispatchCampaign } from '../services/campaign.server';

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return cors(request, json({ error: 'Method not allowed' }, { status: 405 }));
  }

  const campaignId = params.id;
  if (!campaignId) {
    return cors(request, json({ error: 'Missing campaign ID' }, { status: 400 }));
  }

  const shopDomain = request.headers.get('X-Shop-Domain');
  if (!shopDomain) {
    return cors(request, json({ error: 'X-Shop-Domain header required' }, { status: 400 }));
  }

  const { default: prisma } = await import('../db.server');
  const shop = await prisma.shop.findFirst({
    where: { domain: shopDomain },
    select: { id: true },
  });
  if (!shop) {
    return cors(request, json({ error: 'Shop not found' }, { status: 404 }));
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return cors(request, json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  if (typeof body !== 'object' || body === null) {
    return cors(request, json({ error: 'Invalid request body' }, { status: 400 }));
  }

  const input = body as Record<string, unknown>;

  if (typeof input.sessionId !== 'string' || input.sessionId.trim().length === 0) {
    return cors(request, json({ error: 'sessionId is required' }, { status: 422 }));
  }

  const result = await dispatchCampaign(shop.id, campaignId, {
    sessionId: String(input.sessionId),
    visitorId: typeof input.visitorId === 'string' ? input.visitorId : undefined,
    locale: typeof input.locale === 'string' ? input.locale : 'en',
    channel: typeof input.channel === 'string' ? input.channel : 'WEB_CHAT',
    variables:
      typeof input.variables === 'object' && input.variables !== null
        ? (input.variables as Record<string, string>)
        : {},
  });

  const statusCode = result.dispatched ? 200 : 422;
  return cors(request, json(result, { status: statusCode }));
}
