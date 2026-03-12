/**
 * Marketing Campaign Service — Phase 3
 *
 * Responsibilities:
 *  - CRUD for MarketingCampaign records
 *  - Multilingual template resolution (locale fallback chain)
 *  - Campaign dispatch (renders message for a session + locale, persists CampaignDispatchEvent)
 *  - Basic frequency capping check before dispatch
 */

import prisma from '../db.server';
import { SUPPORTED_LOCALES } from './localization.server';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
export type CampaignScheduleType = 'IMMEDIATE' | 'SCHEDULED' | 'RECURRING';

export interface CampaignCreateInput {
  name: string;
  description?: string;
  scheduleType?: CampaignScheduleType;
  cronExpression?: string;
  scheduledAt?: Date;
  startAt?: Date;
  endAt?: Date;
  /** { "en": "template text {{var}}", "es": "plantilla {{var}}" } */
  localeTemplates?: Record<string, string>;
  targetLocales?: string[];
  triggerIds?: string[];
  audienceFilter?: Record<string, unknown>;
  frequencyCap?: number;
  campaignWindowMs?: number;
}

export interface CampaignUpdateInput extends Partial<CampaignCreateInput> {
  status?: CampaignStatus;
}

export interface CampaignDispatchInput {
  sessionId: string;
  visitorId?: string;
  locale?: string;
  channel?: string;
  /** Template variables for interpolation, e.g. { productName: "Blue Coat" } */
  variables?: Record<string, string>;
}

export interface CampaignDispatchResult {
  dispatched: boolean;
  reason?: string;
  renderedMessage?: string;
  locale?: string;
  dispatchEventId?: string;
}

type MarketingCampaignDelegate = {
  findMany: (...args: any[]) => Promise<any[]>;
  findFirst: (...args: any[]) => Promise<any>;
  create: (...args: any[]) => Promise<any>;
  update: (...args: any[]) => Promise<any>;
  delete: (...args: any[]) => Promise<any>;
};

type CampaignDispatchEventDelegate = {
  count: (...args: any[]) => Promise<number>;
  create: (...args: any[]) => Promise<any>;
};

function getMarketingCampaignDelegate(
  requiredMethods: Array<keyof MarketingCampaignDelegate>,
): MarketingCampaignDelegate {
  const delegate = (prisma as unknown as { marketingCampaign?: Partial<MarketingCampaignDelegate> })
    .marketingCampaign;

  const missingMethod = requiredMethods.find((method) => typeof delegate?.[method] !== 'function');
  if (missingMethod) {
    throw new Error(
      `[CampaignService] Prisma delegate unavailable (missing marketingCampaign.${String(missingMethod)}). Run \`npm run prisma:generate\` and restart the app.`,
    );
  }

  return delegate as MarketingCampaignDelegate;
}

function getCampaignDispatchEventDelegate(
  requiredMethods: Array<keyof CampaignDispatchEventDelegate>,
): CampaignDispatchEventDelegate {
  const delegate = (prisma as unknown as { campaignDispatchEvent?: Partial<CampaignDispatchEventDelegate> })
    .campaignDispatchEvent;

  const missingMethod = requiredMethods.find((method) => typeof delegate?.[method] !== 'function');
  if (missingMethod) {
    throw new Error(
      `[CampaignService] Prisma delegate unavailable (missing campaignDispatchEvent.${String(missingMethod)}). Run \`npm run prisma:generate\` and restart the app.`,
    );
  }

  return delegate as CampaignDispatchEventDelegate;
}

// ─── Locale helpers ──────────────────────────────────────────────────────────

const SUPPORTED_LOCALE_CODES = new Set(SUPPORTED_LOCALES.map((l) => l.code));

/**
 * Resolve best locale template using fallback chain:
 *   exact match → language prefix → 'en'
 */
export function resolveLocaleTemplate(
  templates: Record<string, string>,
  requestedLocale: string,
): { template: string; resolvedLocale: string } | null {
  if (!templates || Object.keys(templates).length === 0) return null;

  // 1. Exact match (e.g. "es-MX")
  if (templates[requestedLocale]) {
    return { template: templates[requestedLocale], resolvedLocale: requestedLocale };
  }

  // 2. Language-only prefix (e.g. "es-MX" → "es")
  const lang = requestedLocale.split('-')[0];
  if (lang !== requestedLocale && templates[lang]) {
    return { template: templates[lang], resolvedLocale: lang };
  }

  // 3. Any other supported locale that matches the language prefix
  for (const code of SUPPORTED_LOCALE_CODES) {
    if (code.startsWith(lang) && templates[code]) {
      return { template: templates[code], resolvedLocale: code };
    }
  }

  // 4. English fallback
  if (templates['en']) {
    return { template: templates['en'], resolvedLocale: 'en' };
  }

  // 5. First available
  const firstKey = Object.keys(templates)[0];
  return firstKey ? { template: templates[firstKey], resolvedLocale: firstKey } : null;
}

/**
 * Interpolate template variables: replaces {{varName}} tokens.
 * Sanitizes values — strips < > to prevent XSS-type injections.
 */
export function interpolateTemplate(
  template: string,
  variables: Record<string, string> = {},
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = variables[key];
    if (val === undefined || val === null) return `{{${key}}}`;
    // Strip angle-brackets to prevent HTML injection in message text
    return String(val).replace(/[<>]/g, '');
  });
}

// ─── Campaign CRUD ────────────────────────────────────────────────────────────

export async function listCampaigns(shopId: string) {
  const campaigns = getMarketingCampaignDelegate(['findMany']);

  return campaigns.findMany({
    where: { shopId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      scheduleType: true,
      scheduledAt: true,
      startAt: true,
      endAt: true,
      targetLocales: true,
      triggerIds: true,
      frequencyCap: true,
      totalDispatched: true,
      totalConverted: true,
      lastDispatchedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getCampaign(shopId: string, campaignId: string) {
  const campaigns = getMarketingCampaignDelegate(['findFirst']);

  return campaigns.findFirst({
    where: { id: campaignId, shopId },
  });
}

export async function createCampaign(shopId: string, input: CampaignCreateInput) {
  const campaigns = getMarketingCampaignDelegate(['create']);

  return campaigns.create({
    data: {
      shopId,
      name: input.name,
      description: input.description,
      scheduleType: input.scheduleType ?? 'IMMEDIATE',
      cronExpression: input.cronExpression,
      scheduledAt: input.scheduledAt,
      startAt: input.startAt,
      endAt: input.endAt,
      localeTemplates: (input.localeTemplates ?? {}) as object,
      targetLocales: input.targetLocales ?? [],
      triggerIds: input.triggerIds ?? [],
      audienceFilter: (input.audienceFilter ?? undefined) as object | undefined,
      frequencyCap: input.frequencyCap ?? 1,
      campaignWindowMs: input.campaignWindowMs ?? 86400000,
    },
  });
}

export async function updateCampaign(
  shopId: string,
  campaignId: string,
  input: CampaignUpdateInput,
) {
  const campaigns = getMarketingCampaignDelegate(['findFirst', 'update']);

  const existing = await campaigns.findFirst({
    where: { id: campaignId, shopId },
    select: { id: true },
  });
  if (!existing) return null;

  return campaigns.update({
    where: { id: campaignId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.scheduleType !== undefined && { scheduleType: input.scheduleType }),
      ...(input.cronExpression !== undefined && { cronExpression: input.cronExpression }),
      ...(input.scheduledAt !== undefined && { scheduledAt: input.scheduledAt }),
      ...(input.startAt !== undefined && { startAt: input.startAt }),
      ...(input.endAt !== undefined && { endAt: input.endAt }),
      ...(input.localeTemplates !== undefined && {
        localeTemplates: input.localeTemplates as object,
      }),
      ...(input.targetLocales !== undefined && { targetLocales: input.targetLocales }),
      ...(input.triggerIds !== undefined && { triggerIds: input.triggerIds }),
      ...(input.audienceFilter !== undefined && {
        audienceFilter: input.audienceFilter as object,
      }),
      ...(input.frequencyCap !== undefined && { frequencyCap: input.frequencyCap }),
      ...(input.campaignWindowMs !== undefined && { campaignWindowMs: input.campaignWindowMs }),
    },
  });
}

export async function deleteCampaign(shopId: string, campaignId: string) {
  const campaigns = getMarketingCampaignDelegate(['findFirst', 'delete']);

  const existing = await campaigns.findFirst({
    where: { id: campaignId, shopId },
    select: { id: true },
  });
  if (!existing) return null;
  return campaigns.delete({ where: { id: campaignId } });
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export async function dispatchCampaign(
  shopId: string,
  campaignId: string,
  input: CampaignDispatchInput,
): Promise<CampaignDispatchResult> {
  const campaigns = getMarketingCampaignDelegate(['findFirst', 'update']);
  const dispatchEvents = getCampaignDispatchEventDelegate(['count', 'create']);

  const campaign = await campaigns.findFirst({
    where: { id: campaignId, shopId },
  });

  if (!campaign) {
    return { dispatched: false, reason: 'Campaign not found.' };
  }

  if (campaign.status !== 'ACTIVE') {
    return { dispatched: false, reason: `Campaign is ${campaign.status.toLowerCase()}, not ACTIVE.` };
  }

  const now = new Date();
  if (campaign.startAt && now < campaign.startAt) {
    return { dispatched: false, reason: 'Campaign has not started yet.' };
  }
  if (campaign.endAt && now > campaign.endAt) {
    return { dispatched: false, reason: 'Campaign has ended.' };
  }

  // Frequency cap check
  if (campaign.frequencyCap > 0 && input.sessionId) {
    const windowStart = new Date(now.getTime() - campaign.campaignWindowMs);
    const recentCount = await dispatchEvents.count({
      where: {
        campaignId,
        sessionId: input.sessionId,
        dispatchedAt: { gte: windowStart },
      },
    });
    if (recentCount >= campaign.frequencyCap) {
      return {
        dispatched: false,
        reason: `Frequency cap reached (${campaign.frequencyCap} per ${campaign.campaignWindowMs / 1000}s window).`,
      };
    }
  }

  // Resolve locale template
  const locale = input.locale ?? 'en';
  const templates = (campaign.localeTemplates ?? {}) as Record<string, string>;
  const resolved = resolveLocaleTemplate(templates, locale);

  if (!resolved) {
    return {
      dispatched: false,
      reason: 'No locale template available for this campaign.',
    };
  }

  const rendered = interpolateTemplate(resolved.template, input.variables ?? {});

  // Persist dispatch event
  const event = await dispatchEvents.create({
    data: {
      campaignId,
      shopId,
      sessionId: input.sessionId,
      visitorId: input.visitorId,
      locale: resolved.resolvedLocale,
      renderedMessage: rendered,
      channel: input.channel ?? 'WEB_CHAT',
    },
  });

  // Update counters
  await campaigns.update({
    where: { id: campaignId },
    data: {
      totalDispatched: { increment: 1 },
      lastDispatchedAt: now,
    },
  });

  return {
    dispatched: true,
    renderedMessage: rendered,
    locale: resolved.resolvedLocale,
    dispatchEventId: event.id,
  };
}
