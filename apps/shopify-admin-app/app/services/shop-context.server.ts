import type { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { syncShopReferenceToIABackend } from "./shop-backend-sync.server";
import { SyncService, type SyncJobType } from "./sync-service.server";

const INITIAL_SYNC_JOBS: SyncJobType[] = [
  "initial:catalog",
  "initial:policies",
  "initial:pages",
];

export interface ShopContext {
  domain: string;
  accessToken?: string;
  scope?: string;
  isOnline?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function extractShopContextFromSession(session: unknown): ShopContext | null {
  const record = asRecord(session);
  if (!record) {
    return null;
  }

  const domain = asNonEmptyString(record.shop)?.toLowerCase();
  if (!domain) {
    return null;
  }

  return {
    domain,
    accessToken: asNonEmptyString(record.accessToken),
    scope: asNonEmptyString(record.scope),
    isOnline: asBoolean(record.isOnline),
  };
}

async function queueInitialSyncJobs(shopId: string): Promise<void> {
  try {
    for (const jobType of INITIAL_SYNC_JOBS) {
      await SyncService.queueSyncJob(shopId, jobType, 0);
    }
  } catch (err) {
    // Non-fatal: scheduler will retry. Log and continue.
    console.error(`[ShopContext] Failed to queue initial sync jobs for shop ${shopId}:`, err);
  }
}

export async function ensureShopRecord(context: ShopContext): Promise<{ id: string; domain: string }> {
  const createAccessToken = context.accessToken || "__pending_access_token__";

  const updateData: {
    status: "ACTIVE";
    accessToken?: string;
    scope?: string;
    isOnline?: boolean;
    onboardingCompletedAt?: null;
    metadata?: Prisma.InputJsonValue;
  } = {
    status: "ACTIVE",
  };

  if (context.accessToken) {
    updateData.accessToken = context.accessToken;
  }

  if (context.scope) {
    updateData.scope = context.scope;
  }

  if (typeof context.isOnline === "boolean") {
    updateData.isOnline = context.isOnline;
  }

  // Detect whether this is a first-time install or a reinstall before upsert.
  const existingShop = await prisma.shop.findUnique({
    where: { domain: context.domain },
    select: { id: true, status: true, metadata: true },
  });
  const isNewInstall = !existingShop;
  const isReinstall = existingShop && existingShop.status === "CANCELLED";

  // Reset onboarding for new installs and reinstalls
  if (isNewInstall || isReinstall) {
    updateData.onboardingCompletedAt = null;
    const metadata = asRecord(existingShop?.metadata) || {};
    const adminSetup = asRecord(metadata.adminSetup) || {};
    updateData.metadata = {
      ...metadata,
      adminSetup: {
        ...adminSetup,
        onboardingCompleted: false,
        onboardingStep: 1,
      },
    } as Prisma.InputJsonValue;
  }

  const shop = await prisma.shop.upsert({
    where: { domain: context.domain },
    create: {
      domain: context.domain,
      accessToken: createAccessToken,
      scope: context.scope,
      isOnline: context.isOnline ?? false,
      status: "ACTIVE",
    },
    update: updateData,
    select: { id: true, domain: true },
  });

  await syncShopReferenceToIABackend({
    ...shop,
    ...(context.accessToken ? { accessToken: context.accessToken } : {}),
  }, { force: Boolean(context.accessToken) });

  if (isNewInstall || isReinstall) {
    await queueInitialSyncJobs(shop.id);
  }

  return shop;
}

export async function ensureShopForSession(session: unknown): Promise<{ id: string; domain: string } | null> {
  const context = extractShopContextFromSession(session);
  if (!context) {
    return null;
  }

  return ensureShopRecord(context);
}
