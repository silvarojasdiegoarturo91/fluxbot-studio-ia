/**
 * In-memory Prisma mock for tests that run without a real database.
 *
 * Each model's `create`, `createMany`, `findUnique`, `update`, `delete`
 * operations work against an in-memory Map store, so tests that chain
 * creates → updates → findUnique work correctly without any DB setup.
 *
 * Usage in a test file:
 *   import { prismaMock, resetStores } from '../mocks/prisma-in-memory';
 *   vi.mock('../../app/db.server', () => ({ default: prismaMock }));
 */

import { vi } from "vitest";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const stores: Record<string, Map<string, Record<string, unknown>>> = {};

function getStore(model: string): Map<string, Record<string, unknown>> {
  if (!stores[model]) stores[model] = new Map();
  return stores[model];
}

/** Clear all in-memory data. Call in afterEach / afterAll if needed. */
export function resetStores(): void {
  for (const model of Object.keys(stores)) {
    stores[model].clear();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _tick = 0;
function makeRecord(data: Record<string, unknown>): Record<string, unknown> {
  const now = new Date(Date.now() + _tick++);
  return { id: randomUUID(), createdAt: now, updatedAt: now, ...data };
}

// Relations: parent model → { relationKey → { childModel, fkField } }
const RELATIONS: Record<
  string,
  Record<string, { model: string; fk: string }>
> = {
  Conversation: { messages: { model: "ConversationMessage", fk: "conversationId" } },
  KnowledgeDocument: { chunks: { model: "KnowledgeChunk", fk: "documentId" } },
  ConversationMessage: { toolInvocations: { model: "ToolInvocation", fk: "messageId" } },
};

function createRecord(
  modelName: string,
  data: Record<string, unknown>,
  include?: Record<string, unknown>
): Record<string, unknown> {
  const cleanData: Record<string, unknown> = {};
  const nestedItems: Record<string, Array<Record<string, unknown>>> = {};

  for (const [key, val] of Object.entries(data)) {
    if (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      "create" in (val as Record<string, unknown>)
    ) {
      // Nested create – will be processed after parent id is known
      const raw = (val as Record<string, unknown>).create;
      nestedItems[key] = Array.isArray(raw)
        ? (raw as Array<Record<string, unknown>>)
        : [raw as Record<string, unknown>];
    } else {
      cleanData[key] = val;
    }
  }

  const record = makeRecord(cleanData);
  getStore(modelName).set(record.id as string, record);

  // Process nested creates now that parent id is known
  const nestedResults: Record<string, Array<Record<string, unknown>>> = {};
  for (const [key, items] of Object.entries(nestedItems)) {
    const relation = RELATIONS[modelName]?.[key];
    if (relation) {
      const created = items.map((item, i) =>
        createRecord(relation.model, {
          ...item,
          [relation.fk]: record.id,
          createdAt: new Date(Date.now() + i),
        })
      );
      nestedResults[key] = created;
    }
  }

  // Attach nested to result if include was requested
  if (include) {
    for (const incKey of Object.keys(include)) {
      if (nestedResults[incKey]) {
        (record as Record<string, unknown>)[incKey] = nestedResults[incKey];
      }
    }
  }

  return record;
}

function findUniqueRecord(
  modelName: string,
  where: Record<string, unknown>,
  include?: Record<string, unknown>
): Record<string, unknown> | null {
  const store = getStore(modelName);
  const id = where.id as string | undefined;

  const record = id
    ? store.get(id)
    : Array.from(store.values()).find((r) =>
        Object.entries(where).every(([k, v]) => r[k] === v)
      );

  if (!record) return null;

  const result = { ...record };

  if (include) {
    for (const [incKey, incOptions] of Object.entries(include)) {
      const relation = RELATIONS[modelName]?.[incKey];
      if (!relation) continue;

      let related = Array.from(getStore(relation.model).values()).filter(
        (r) => r[relation.fk] === record.id
      );

      // Apply orderBy if specified
      if (incOptions && typeof incOptions === "object" && "orderBy" in (incOptions as Record<string, unknown>)) {
        const orderBy = (incOptions as Record<string, unknown>).orderBy as Record<string, string>;
        const [field, dir] = Object.entries(orderBy)[0];
        related.sort((a, b) => {
          const aVal = a[field];
          const bVal = b[field];
          const cmp = aVal! < bVal! ? -1 : aVal! > bVal! ? 1 : 0;
          return dir === "asc" ? cmp : -cmp;
        });
      }

      result[incKey] = related;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Model mock factory
// ---------------------------------------------------------------------------

function createModelMock(modelName: string) {
  return {
    create: vi.fn(({ data, include }: { data: Record<string, unknown>; include?: Record<string, unknown> }) =>
      Promise.resolve(createRecord(modelName, data, include))
    ),

    createMany: vi.fn(({ data }: { data: Array<Record<string, unknown>> }) => {
      const items = Array.isArray(data) ? data : [data];
      items.forEach((item, i) =>
        createRecord(modelName, { ...item, createdAt: new Date(Date.now() + i) })
      );
      return Promise.resolve({ count: items.length });
    }),

    findUnique: vi.fn(
      ({ where, include }: { where: Record<string, unknown>; include?: Record<string, unknown> }) =>
        Promise.resolve(findUniqueRecord(modelName, where, include))
    ),

    findFirst: vi.fn(
      ({ where }: { where?: Record<string, unknown> } = {}) => {
        const store = getStore(modelName);
        const record = where
          ? Array.from(store.values()).find((r) =>
              Object.entries(where).every(([k, v]) => r[k] === v)
            )
          : store.values().next().value;
        return Promise.resolve(record ?? null);
      }
    ),

    findMany: vi.fn(({ where }: { where?: Record<string, unknown> } = {}) => {
      const store = getStore(modelName);
      let records = Array.from(store.values());
      if (where) {
        records = records.filter((r) =>
          Object.entries(where).every(([k, v]) => r[k] === v)
        );
      }
      return Promise.resolve(records);
    }),

    update: vi.fn(
      ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const store = getStore(modelName);
        const existing = store.get(where.id as string);
        if (!existing) return Promise.resolve(null);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        store.set(where.id as string, updated);
        return Promise.resolve(updated);
      }
    ),

    upsert: vi.fn(
      ({
        where,
        create,
        update,
      }: {
        where: Record<string, unknown>;
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const store = getStore(modelName);
        const existing = where.id ? store.get(where.id as string) : undefined;
        if (existing) {
          const updated = { ...existing, ...update, updatedAt: new Date() };
          store.set(existing.id as string, updated);
          return Promise.resolve(updated);
        }
        const record = makeRecord(create);
        store.set(record.id as string, record);
        return Promise.resolve(record);
      }
    ),

    delete: vi.fn(({ where }: { where: Record<string, unknown> }) => {
      const store = getStore(modelName);
      const record = store.get(where.id as string);
      if (record) store.delete(where.id as string);
      return Promise.resolve(record ?? null);
    }),

    deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
    count: vi.fn(() => Promise.resolve(0)),
    aggregate: vi.fn(() => Promise.resolve({})),
  };
}

// ---------------------------------------------------------------------------
// Full Prisma mock
// ---------------------------------------------------------------------------

export const prismaMock = {
  shop: createModelMock("Shop"),
  session: createModelMock("Session"),
  user: createModelMock("User"),
  chatbotConfig: createModelMock("ChatbotConfig"),

  conversation: createModelMock("Conversation"),
  conversationMessage: createModelMock("ConversationMessage"),
  conversationEvent: createModelMock("ConversationEvent"),

  knowledgeSource: createModelMock("KnowledgeSource"),
  knowledgeDocument: createModelMock("KnowledgeDocument"),
  knowledgeChunk: createModelMock("KnowledgeChunk"),
  embeddingRecord: createModelMock("EmbeddingRecord"),

  toolInvocation: createModelMock("ToolInvocation"),
  handoffRequest: createModelMock("HandoffRequest"),

  productProjection: createModelMock("ProductProjection"),
  policyProjection: createModelMock("PolicyProjection"),
  orderProjection: createModelMock("OrderProjection"),

  consentRecord: createModelMock("ConsentRecord"),
  auditLog: createModelMock("AuditLog"),

  webhookEvent: createModelMock("WebhookEvent"),
  syncJob: createModelMock("SyncJob"),
  behaviorEvent: createModelMock("BehaviorEvent"),
  conversionEvent: createModelMock("ConversionEvent"),
  proactiveMessage: createModelMock("ProactiveMessage"),
  handoffRequestEvent: createModelMock("HandoffRequestEvent"),

  $connect: vi.fn(() => Promise.resolve()),
  $disconnect: vi.fn(() => Promise.resolve()),
  $transaction: vi.fn(async (fn: unknown) => {
    if (typeof fn === "function")
      return (fn as (p: typeof prismaMock) => Promise<unknown>)(prismaMock);
    return Promise.all(fn as Array<Promise<unknown>>);
  }),
};
