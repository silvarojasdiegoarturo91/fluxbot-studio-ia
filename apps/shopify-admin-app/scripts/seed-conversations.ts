/**
 * Seed script: seed-conversations.ts
 *
 * Populates fluxbot_dev with realistic conversation data for local development.
 * Idempotent: running it multiple times produces the same result (upsert by ID).
 *
 * Usage (from apps/shopify-admin-app/):
 *   npx tsx scripts/seed-conversations.ts
 *   npm run seed:conversations
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ?? "postgresql://fluxbot:dev_password@localhost:5432/fluxbot_dev",
    },
  },
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEED_SHOPS = [
  { id: "seed-shop-quickstart", domain: "quickstart-c8cc9986.myshopify.com" },
  { id: "seed-shop-test2grow", domain: "test-2-grow.myshopify.com" },
] as const;

type SeedConversation = {
  id: string;
  shopId: string;
  channel: string;
  locale: string;
  status: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    confidence: number | null;
    tokensUsed: number | null;
  }>;
};

const SEED_CONVERSATIONS: SeedConversation[] = [
  // --- quickstart shop — conversation 1 ---
  {
    id: "seed-conv-qs-001",
    shopId: "seed-shop-quickstart",
    channel: "SHOPIFY_PROXY",
    locale: "es",
    status: "RESOLVED",
    messages: [
      {
        id: "seed-msg-qs-001-01",
        role: "USER",
        content: "Hola, ¿tienen envío a Córdoba?",
        confidence: null,
        tokensUsed: null,
      },
      {
        id: "seed-msg-qs-001-02",
        role: "ASSISTANT",
        content: "Sí, enviamos a todo el país. El envío a Córdoba demora entre 3 y 5 días hábiles.",
        confidence: 0.94,
        tokensUsed: 180,
      },
      {
        id: "seed-msg-qs-001-03",
        role: "USER",
        content: "¿Cuánto cuesta?",
        confidence: null,
        tokensUsed: null,
      },
      {
        id: "seed-msg-qs-001-04",
        role: "ASSISTANT",
        content: "El costo de envío a Córdoba es de $1200 para compras menores a $5000. Compras superiores tienen envío gratis.",
        confidence: 0.91,
        tokensUsed: 210,
      },
    ],
  },
  // --- quickstart shop — conversation 2 ---
  {
    id: "seed-conv-qs-002",
    shopId: "seed-shop-quickstart",
    channel: "SHOPIFY_PROXY",
    locale: "es",
    status: "ACTIVE",
    messages: [
      {
        id: "seed-msg-qs-002-01",
        role: "USER",
        content: "Quiero ver el abrigo negro talle M",
        confidence: null,
        tokensUsed: null,
      },
      {
        id: "seed-msg-qs-002-02",
        role: "ASSISTANT",
        content: "Encontré el Abrigo Negro Classic en talle M. Precio: $18.500. Tenés stock disponible. ¿Querés que te comparta el link?",
        confidence: 0.88,
        tokensUsed: 156,
      },
      {
        id: "seed-msg-qs-002-03",
        role: "USER",
        content: "Sí, mandame el link",
        confidence: null,
        tokensUsed: null,
      },
      {
        id: "seed-msg-qs-002-04",
        role: "ASSISTANT",
        content: "Acá tenés el link al producto: https://quickstart-c8cc9986.myshopify.com/products/abrigo-negro-classic",
        confidence: 0.97,
        tokensUsed: 88,
      },
    ],
  },
  // --- test-2-grow shop — conversation 1 ---
  {
    id: "seed-conv-t2g-001",
    shopId: "seed-shop-test2grow",
    channel: "SHOPIFY_PROXY",
    locale: "es",
    status: "RESOLVED",
    messages: [
      {
        id: "seed-msg-t2g-001-01",
        role: "USER",
        content: "¿Puedo cambiar mi pedido #2042?",
        confidence: null,
        tokensUsed: null,
      },
      {
        id: "seed-msg-t2g-001-02",
        role: "ASSISTANT",
        content: "Revisé el pedido #2042. Está en estado 'Enviado', por lo que ya no es posible modificarlo. Podés iniciar una devolución cuando lo recibas.",
        confidence: 0.76,
        tokensUsed: 224,
      },
      {
        id: "seed-msg-t2g-001-03",
        role: "USER",
        content: "¿Cómo hago para devolver?",
        confidence: null,
        tokensUsed: null,
      },
      {
        id: "seed-msg-t2g-001-04",
        role: "ASSISTANT",
        content: "Para iniciar una devolución, accedé a 'Mis pedidos' en tu cuenta y hacé clic en 'Solicitar devolución'. Tenés hasta 30 días desde la entrega.",
        confidence: 0.89,
        tokensUsed: 190,
      },
    ],
  },
  // --- test-2-grow shop — conversation 2 ---
  {
    id: "seed-conv-t2g-002",
    shopId: "seed-shop-test2grow",
    channel: "SHOPIFY_PROXY",
    locale: "es",
    status: "ACTIVE",
    messages: [
      {
        id: "seed-msg-t2g-002-01",
        role: "USER",
        content: "Busco algo para regalar a una mamá, presupuesto $10000",
        confidence: null,
        tokensUsed: null,
      },
      {
        id: "seed-msg-t2g-002-02",
        role: "ASSISTANT",
        content: "¡Qué lindo regalo! Te recomiendo el Set de Aromaterapia ($8500) o la Bufanda de Cachemira ($9800). ¿Querés más info de alguno?",
        confidence: 0.85,
        tokensUsed: 168,
      },
      {
        id: "seed-msg-t2g-002-03",
        role: "USER",
        content: "La bufanda suena bien, ¿qué colores tienen?",
        confidence: null,
        tokensUsed: null,
      },
      {
        id: "seed-msg-t2g-002-04",
        role: "ASSISTANT",
        content: "La Bufanda de Cachemira está disponible en Bordo, Beige, Azul marino y Gris perla. Todas con envío gratis por ser mayor a $5000.",
        confidence: 0.93,
        tokensUsed: 144,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Seed logic
// ---------------------------------------------------------------------------

async function seedShops(): Promise<Map<string, string>> {
  console.log("Seeding shops...");
  // Returns a map of domain → actual DB shop id
  const domainToId = new Map<string, string>();

  for (const shop of SEED_SHOPS) {
    const result = await prisma.shop.upsert({
      where: { domain: shop.domain },
      create: {
        domain: shop.domain,
        accessToken: "",   // sentinel — OAuth install overwrites with real token
        status: "ACTIVE",
      },
      update: {
        status: "ACTIVE",
        // Never touch accessToken — protect real tokens
      },
    });
    domainToId.set(shop.domain, result.id);
    console.log(`  ✓ Shop upserted: ${shop.domain} (id: ${result.id})`);
  }

  return domainToId;
}

async function seedConversations(domainToShopId: Map<string, string>): Promise<void> {
  console.log("Seeding conversations...");
  const now = new Date();

  for (const conv of SEED_CONVERSATIONS) {
    // Resolve the actual shop ID from the DB (not the seed constant)
    const shopDomain = SEED_SHOPS.find((s) => s.id === conv.shopId)?.domain;
    if (!shopDomain) {
      console.warn(`  ⚠ No domain found for shopId ${conv.shopId} — skipping`);
      continue;
    }
    const realShopId = domainToShopId.get(shopDomain);
    if (!realShopId) {
      console.warn(`  ⚠ Shop not in DB for domain ${shopDomain} — skipping`);
      continue;
    }
    // Upsert conversation by stable ID
    await prisma.conversation.upsert({
      where: { id: conv.id },
      create: {
        id: conv.id,
        shopId: realShopId,
        channel: conv.channel as any,
        locale: conv.locale,
        status: conv.status as any,
        startedAt: now,
        lastMessageAt: now,
      },
      update: {
        status: conv.status as any,
        lastMessageAt: now,
      },
    });

    // Upsert each message by stable ID
    let offsetSecs = 0;
    for (const msg of conv.messages) {
      const createdAt = new Date(now.getTime() + offsetSecs * 1000);
      offsetSecs += 5;

      await prisma.conversationMessage.upsert({
        where: { id: msg.id },
        create: {
          id: msg.id,
          conversationId: conv.id,
          role: msg.role as any,
          content: msg.content,
          confidence: msg.confidence,
          tokensUsed: msg.tokensUsed,
          createdAt,
        },
        update: {
          content: msg.content,
          confidence: msg.confidence,
          tokensUsed: msg.tokensUsed,
        },
      });
    }

    console.log(`  ✓ Conversation seeded: ${conv.id} (${conv.messages.length} messages)`);
  }
}

async function main(): Promise<void> {
  console.log("=== FluxBot: seed-conversations ===");
  console.log(`Database: ${process.env.DATABASE_URL ?? "postgresql://fluxbot:dev_password@localhost:5432/fluxbot_dev"}`);
  console.log("");

  const domainToShopId = await seedShops();
  await seedConversations(domainToShopId);

  // Summary
  const seededDomains = SEED_SHOPS.map((s) => s.domain);
  const seededShops = await prisma.shop.findMany({ where: { domain: { in: seededDomains } } });
  const seededShopIds = seededShops.map((s) => s.id);
  const convCount = await prisma.conversation.count({ where: { id: { in: SEED_CONVERSATIONS.map((c) => c.id) } } });
  const msgCount = await prisma.conversationMessage.count({
    where: { conversationId: { in: SEED_CONVERSATIONS.map((c) => c.id) } },
  });

  console.log("");
  console.log("=== Seed complete ===");
  console.log(`  Shops:         ${seededShopIds.length}`);
  console.log(`  Conversations: ${convCount}`);
  console.log(`  Messages:      ${msgCount}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
