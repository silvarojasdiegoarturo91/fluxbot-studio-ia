import type { Prisma } from "@prisma/client";
import prisma from "../db.server";

export type AdminLanguage = "es" | "en";
export type BotLanguage = "es" | "en";
export type BotGoal = "SALES" | "SUPPORT" | "SALES_SUPPORT";
export type ResponseStyle = "CONCISE" | "BALANCED" | "DETAILED";
export type BotTone = "professional" | "friendly" | "concise" | "sales";

export interface EnabledCapabilities {
  answerProducts: boolean;
  answerPolicies: boolean;
  answerOrders: boolean;
  recommendProducts: boolean;
  captureLeads: boolean;
}

export interface WidgetBranding {
  primaryColor: string;
  launcherPosition: "bottom-right" | "bottom-left";
  avatarStyle: "assistant" | "spark" | "store";
  launcherLabel: string;
}

export interface MerchantAdminConfig {
  adminLanguage: AdminLanguage;
  primaryBotLanguage: BotLanguage;
  supportedLanguages: BotLanguage[];
  botName: string;
  botTone: BotTone;
  botGoal: BotGoal;
  responseStyle: ResponseStyle;
  welcomeMessage: string;
  enabledCapabilities: EnabledCapabilities;
  widgetBranding: WidgetBranding;
  onboardingCompleted: boolean;
  onboardingStep: number;
  updatedAt: string;
}

const DEFAULT_ADMIN_CONFIG: MerchantAdminConfig = {
  adminLanguage: "es",
  primaryBotLanguage: "es",
  supportedLanguages: ["es"],
  botName: "Asistente IA",
  botTone: "professional",
  botGoal: "SALES_SUPPORT",
  responseStyle: "BALANCED",
  welcomeMessage: "Hola, estoy aqui para ayudarte con productos, pedidos y dudas frecuentes.",
  enabledCapabilities: {
    answerProducts: true,
    answerPolicies: true,
    answerOrders: true,
    recommendProducts: true,
    captureLeads: false,
  },
  widgetBranding: {
    primaryColor: "#008060",
    launcherPosition: "bottom-right",
    avatarStyle: "assistant",
    launcherLabel: "Asistente",
  },
  onboardingCompleted: false,
  onboardingStep: 1,
  updatedAt: new Date().toISOString(),
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeLanguage(value: unknown, fallback: AdminLanguage): AdminLanguage {
  return value === "es" || value === "en" ? value : fallback;
}

function normalizeBotGoal(value: unknown, fallback: BotGoal): BotGoal {
  return value === "SALES" || value === "SUPPORT" || value === "SALES_SUPPORT"
    ? value
    : fallback;
}

function normalizeResponseStyle(value: unknown, fallback: ResponseStyle): ResponseStyle {
  return value === "CONCISE" || value === "BALANCED" || value === "DETAILED"
    ? value
    : fallback;
}

function normalizeBotTone(value: unknown, fallback: BotTone): BotTone {
  return value === "professional" || value === "friendly" || value === "concise" || value === "sales"
    ? value
    : fallback;
}

function normalizeEnabledCapabilities(value: unknown, fallback: EnabledCapabilities): EnabledCapabilities {
  const record = asRecord(value);
  return {
    answerProducts: asBoolean(record.answerProducts, fallback.answerProducts),
    answerPolicies: asBoolean(record.answerPolicies, fallback.answerPolicies),
    answerOrders: asBoolean(record.answerOrders, fallback.answerOrders),
    recommendProducts: asBoolean(record.recommendProducts, fallback.recommendProducts),
    captureLeads: asBoolean(record.captureLeads, fallback.captureLeads),
  };
}

function normalizeWidgetBranding(value: unknown, fallback: WidgetBranding): WidgetBranding {
  const record = asRecord(value);
  const launcherPosition =
    record.launcherPosition === "bottom-left" || record.launcherPosition === "bottom-right"
      ? record.launcherPosition
      : fallback.launcherPosition;

  const avatarStyle =
    record.avatarStyle === "assistant" ||
    record.avatarStyle === "spark" ||
    record.avatarStyle === "store"
      ? record.avatarStyle
      : fallback.avatarStyle;

  return {
    primaryColor: asString(record.primaryColor, fallback.primaryColor),
    launcherPosition,
    avatarStyle,
    launcherLabel: asString(record.launcherLabel, fallback.launcherLabel),
  };
}

function normalizeAdminConfig(value: unknown): MerchantAdminConfig {
  const record = asRecord(value);

  const fallbackLanguage = normalizeLanguage(
    record.primaryBotLanguage,
    DEFAULT_ADMIN_CONFIG.adminLanguage,
  );
  const globalLanguage = normalizeLanguage(record.adminLanguage, fallbackLanguage);

  const onboardingStepRaw = Number(record.onboardingStep ?? DEFAULT_ADMIN_CONFIG.onboardingStep);
  const onboardingStep = Number.isFinite(onboardingStepRaw)
    ? Math.max(1, Math.min(7, Math.floor(onboardingStepRaw)))
    : DEFAULT_ADMIN_CONFIG.onboardingStep;

  return {
    adminLanguage: globalLanguage,
    primaryBotLanguage: globalLanguage,
    supportedLanguages: [globalLanguage],
    botName: asString(record.botName, DEFAULT_ADMIN_CONFIG.botName),
    botTone: normalizeBotTone(record.botTone, DEFAULT_ADMIN_CONFIG.botTone),
    botGoal: normalizeBotGoal(record.botGoal, DEFAULT_ADMIN_CONFIG.botGoal),
    responseStyle: normalizeResponseStyle(record.responseStyle, DEFAULT_ADMIN_CONFIG.responseStyle),
    welcomeMessage: asString(record.welcomeMessage, DEFAULT_ADMIN_CONFIG.welcomeMessage),
    enabledCapabilities: normalizeEnabledCapabilities(
      record.enabledCapabilities,
      DEFAULT_ADMIN_CONFIG.enabledCapabilities,
    ),
    widgetBranding: normalizeWidgetBranding(record.widgetBranding, DEFAULT_ADMIN_CONFIG.widgetBranding),
    onboardingCompleted: asBoolean(record.onboardingCompleted, DEFAULT_ADMIN_CONFIG.onboardingCompleted),
    onboardingStep,
    updatedAt: asString(record.updatedAt, new Date().toISOString()),
  };
}

function mergeAdminConfig(
  current: MerchantAdminConfig,
  patch: Partial<MerchantAdminConfig>,
): MerchantAdminConfig {
  const next: MerchantAdminConfig = {
    ...current,
    ...patch,
    enabledCapabilities: {
      ...current.enabledCapabilities,
      ...(patch.enabledCapabilities || {}),
    },
    widgetBranding: {
      ...current.widgetBranding,
      ...(patch.widgetBranding || {}),
    },
  };

  const requestedGlobalLanguage = normalizeLanguage(
    patch.adminLanguage ?? patch.primaryBotLanguage,
    current.adminLanguage,
  );
  next.adminLanguage = requestedGlobalLanguage;
  next.primaryBotLanguage = requestedGlobalLanguage;
  next.supportedLanguages = [requestedGlobalLanguage];

  next.botGoal = normalizeBotGoal(next.botGoal, current.botGoal);
  next.responseStyle = normalizeResponseStyle(next.responseStyle, current.responseStyle);
  next.botTone = normalizeBotTone(next.botTone, current.botTone);

  next.onboardingStep = Math.max(1, Math.min(7, Math.floor(Number(next.onboardingStep || current.onboardingStep))));
  next.updatedAt = new Date().toISOString();

  return next;
}

export async function getMerchantAdminConfig(shopId: string): Promise<MerchantAdminConfig> {
  const [shop, chatbotConfig] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: shopId },
      select: { metadata: true },
    }),
    prisma.chatbotConfig.findUnique({
      where: { shopId },
      select: {
        name: true,
        tone: true,
        language: true,
        isActive: true,
      },
    }),
  ]);

  const metadata = asRecord(shop?.metadata);
  const configFromMetadata = normalizeAdminConfig(metadata.adminSetup);
  const globalLanguage = normalizeLanguage(chatbotConfig?.language, configFromMetadata.adminLanguage);

  return {
    ...configFromMetadata,
    adminLanguage: globalLanguage,
    primaryBotLanguage: globalLanguage,
    supportedLanguages: [globalLanguage],
    botName: chatbotConfig?.name || configFromMetadata.botName,
    botTone: normalizeBotTone(chatbotConfig?.tone, configFromMetadata.botTone),
    onboardingCompleted: configFromMetadata.onboardingCompleted,
    onboardingStep: configFromMetadata.onboardingStep,
  };
}

export async function saveMerchantAdminConfig(
  shopId: string,
  patch: Partial<MerchantAdminConfig>,
): Promise<MerchantAdminConfig> {
  const [shop, currentConfig] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: shopId },
      select: { metadata: true },
    }),
    getMerchantAdminConfig(shopId),
  ]);

  const merged = mergeAdminConfig(currentConfig, patch);

  const metadata = asRecord(shop?.metadata);
  const nextMetadata = {
    ...metadata,
    adminSetup: merged,
  };

  await Promise.all([
    prisma.shop.update({
      where: { id: shopId },
      data: {
        metadata: nextMetadata as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.chatbotConfig.upsert({
      where: { shopId },
      create: {
        shopId,
        name: merged.botName,
        tone: merged.botTone,
        language: merged.primaryBotLanguage,
        isActive: true,
        enableProactive: merged.enabledCapabilities.recommendProducts,
        enableHandoff: merged.botGoal !== "SALES",
      },
      update: {
        name: merged.botName,
        tone: merged.botTone,
        language: merged.primaryBotLanguage,
        enableProactive: merged.enabledCapabilities.recommendProducts,
        enableHandoff: merged.botGoal !== "SALES",
      },
    }),
  ]);

  return merged;
}
