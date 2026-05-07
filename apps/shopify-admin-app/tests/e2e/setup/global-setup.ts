import type { FullConfig } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const TEST_SHOP_DOMAIN = process.env.SHOPIFY_SHOP || 'quickstart-c8cc9986.myshopify.com';

export default async function globalSetup(_config: FullConfig) {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5433/test_db?schema=public',
      },
    },
  });

  try {
    // Upsert the test shop — ensures it exists with all required fields
    await prisma.shop.upsert({
      where: { domain: TEST_SHOP_DOMAIN },
      update: { accessToken: 'e2e-test-access-token' },
      create: {
        domain: TEST_SHOP_DOMAIN,
        accessToken: 'e2e-test-access-token',
        scope: 'read_products,write_products,read_orders,read_customers,read_content,read_locales,read_online_store_pages',
        isOnline: false,
        status: 'ACTIVE',
      },
    });

    console.log(`[global-setup] Test shop seeded: ${TEST_SHOP_DOMAIN}`);
  } catch (error) {
    console.error('[global-setup] Failed to seed test shop:', error);
    // Don't throw — smoke tests (which don't need DB auth) should still run
  } finally {
    await prisma.$disconnect();
  }
}
