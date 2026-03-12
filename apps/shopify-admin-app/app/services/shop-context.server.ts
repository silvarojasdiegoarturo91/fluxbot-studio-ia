import prisma from "../db.server";

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

export async function ensureShopRecord(context: ShopContext): Promise<{ id: string; domain: string }> {
  const createAccessToken = context.accessToken || "__pending_access_token__";

  const updateData: {
    status: "ACTIVE";
    accessToken?: string;
    scope?: string;
    isOnline?: boolean;
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

  return prisma.shop.upsert({
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
}

export async function ensureShopForSession(session: unknown): Promise<{ id: string; domain: string } | null> {
  const context = extractShopContextFromSession(session);
  if (!context) {
    return null;
  }

  return ensureShopRecord(context);
}
