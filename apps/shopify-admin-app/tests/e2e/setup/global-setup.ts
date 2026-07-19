import type { FullConfig } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const TEST_SHOP_DOMAIN =
  process.env.SHOPIFY_SHOP ||
  process.env.SHOPIFY_DEV_STORE_URL ||
  'quickstart-c8cc9986.myshopify.com';
const SMOKE_PRODUCT_ID = 'gid://shopify/Product/999999999999';
const SMOKE_PRODUCT_METADATA = {
  collections: ['Smoke tests'],
  tags: ['e2e'],
  disabled: false,
  faqs: [],
};

function resolveTestDatabaseUrl() {
  const fallback = 'postgresql://test:test@localhost:5433/test_db?schema=public';
  const raw = process.env.DATABASE_URL || fallback;
  return raw.includes('localhost:5433') ? raw : fallback;
}

// adminSetup stored in Shop.metadata.adminSetup — this is what getMerchantAdminConfig reads
const COMPLETED_ADMIN_SETUP = {
  onboardingCompleted: true,
  onboardingStep: 7,
  adminLanguage: 'en',
  primaryBotLanguage: 'en',
  supportedLanguages: ['en'],
  botName: 'Test Bot',
  botTone: 'professional',
  botGoal: 'SALES_SUPPORT',
  responseStyle: 'BALANCED',
  welcomeMessage: 'Hi, how can I help you?',
  enabledCapabilities: {
    answerProducts: true,
    answerPolicies: true,
    answerOrders: true,
    recommendProducts: true,
    captureLeads: false,
  },
  widgetBranding: {
    primaryColor: '#008060',
    launcherPosition: 'bottom-right',
    avatarStyle: 'assistant',
    launcherLabel: 'Assistant',
  },
  updatedAt: new Date().toISOString(),
};

export default async function globalSetup(_config: FullConfig) {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: resolveTestDatabaseUrl(),
        },
      },
    });

  try {
    // Upsert the test shop with completed-onboarding metadata
    const shop = await prisma.shop.upsert({
      where: { domain: TEST_SHOP_DOMAIN },
      update: {
        accessToken: 'e2e-test-access-token',
        metadata: { adminSetup: COMPLETED_ADMIN_SETUP },
      },
      create: {
        domain: TEST_SHOP_DOMAIN,
        accessToken: 'e2e-test-access-token',
        scope: 'read_products,read_orders,read_content,read_online_store_pages,read_themes',
        isOnline: false,
        status: 'ACTIVE',
        metadata: { adminSetup: COMPLETED_ADMIN_SETUP },
      },
    });

    console.log(`[global-setup] Test shop seeded: ${TEST_SHOP_DOMAIN}`);

    // Ensure a ChatbotConfig record exists for the shop (required by routes that call chatbotConfig.upsert)
    const existingConfig = await prisma.chatbotConfig.findUnique({ where: { shopId: shop.id } });
    if (existingConfig) {
      await prisma.chatbotConfig.update({
        where: { shopId: shop.id },
        data: { name: 'Test Bot', language: 'en' },
      });
    } else {
      await prisma.chatbotConfig.create({
        data: {
          shopId: shop.id,
          name: 'Test Bot',
          language: 'en',
          isActive: true,
        },
      });
    }

    console.log('[global-setup] ChatbotConfig seeded with onboarding complete');

    await prisma.productProjection.upsert({
      where: {
        shopId_productId: {
          shopId: shop.id,
          productId: SMOKE_PRODUCT_ID,
        },
      },
      update: {
        handle: 'e2e-smoke-product',
        title: 'E2E Smoke Product',
        description: 'Seed product used by Data Sources smoke tests.',
        vendor: 'FluxBot',
        productType: 'Test',
        deletedAt: null,
        metadata: SMOKE_PRODUCT_METADATA,
      },
      create: {
        shopId: shop.id,
        productId: SMOKE_PRODUCT_ID,
        handle: 'e2e-smoke-product',
        title: 'E2E Smoke Product',
        description: 'Seed product used by Data Sources smoke tests.',
        vendor: 'FluxBot',
        productType: 'Test',
        metadata: SMOKE_PRODUCT_METADATA,
      },
    });

    console.log('[global-setup] ProductProjection seeded for Data Sources smoke tests');
  } catch (error) {
    console.error('[global-setup] Failed to seed test shop:', error);
    // Don't throw — smoke tests (which don't need DB auth) should still run
  } finally {
    await prisma.$disconnect();
  }
}
