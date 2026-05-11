import type { Prisma } from "@prisma/client";
import prisma from "../db.server";

export interface ProductFaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductAdminMetadata {
  tags: string[];
  collections: string[];
  disabled: boolean;
  faqs: ProductFaqItem[];
}

export interface ManagedProductProjection {
  id: string;
  productId: string;
  title: string;
  handle: string;
  metadata: ProductAdminMetadata;
}

type JsonRecord = Record<string, Prisma.JsonValue>;

function isJsonRecord(value: Prisma.JsonValue | null | undefined): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringArray(value: Prisma.JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function readFaqArray(value: Prisma.JsonValue | undefined): ProductFaqItem[] {
  if (!Array.isArray(value)) return [];

  const items: ProductFaqItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const category = typeof record.category === "string" ? record.category : "";
    const question = typeof record.question === "string" ? record.question : "";
    const answer = typeof record.answer === "string" ? record.answer : "";
    const createdAt = typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString();
    const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : createdAt;

    if (!id || !question || !answer) continue;
    items.push({ id, category, question, answer, createdAt, updatedAt });
  }

  return items;
}

export function getProductAdminMetadata(
  value: Prisma.JsonValue | null | undefined,
): ProductAdminMetadata {
  if (!isJsonRecord(value)) {
    return {
      tags: [],
      collections: [],
      disabled: false,
      faqs: [],
    };
  }

  return {
    tags: readStringArray(value.tags),
    collections: readStringArray(value.collections),
    disabled: value.disabled === true,
    faqs: readFaqArray(value.faqs),
  };
}

export function mergeProductAdminMetadata(
  current: Prisma.JsonValue | null | undefined,
  next: Partial<ProductAdminMetadata>,
): Prisma.JsonObject {
  const currentRecord: Prisma.JsonObject = isJsonRecord(current) ? { ...(current as Prisma.JsonObject) } : {};
  const parsed = getProductAdminMetadata(current);
  const merged: ProductAdminMetadata = {
    tags: next.tags ?? parsed.tags,
    collections: next.collections ?? parsed.collections,
    disabled: next.disabled ?? parsed.disabled,
    faqs: next.faqs ?? parsed.faqs,
  };

  currentRecord.tags = merged.tags;
  currentRecord.collections = merged.collections;
  currentRecord.disabled = merged.disabled;
  currentRecord.faqs = merged.faqs as unknown as Prisma.JsonValue;
  return currentRecord;
}

export async function appendProductFaq(params: {
  shopId: string;
  productProjectionId: string;
  category: string;
  question: string;
  answer: string;
}): Promise<void> {
  const projection = await prisma.productProjection.findFirst({
    where: { id: params.productProjectionId, shopId: params.shopId },
    select: { id: true, metadata: true },
  });

  if (!projection) {
    throw new Error("Product not found");
  }

  const metadata = getProductAdminMetadata(projection.metadata as Prisma.JsonValue | null | undefined);
  const now = new Date().toISOString();

  const nextFaq: ProductFaqItem = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    category: params.category.trim(),
    question: params.question.trim(),
    answer: params.answer.trim(),
    createdAt: now,
    updatedAt: now,
  };

  const nextMetadata = mergeProductAdminMetadata(projection.metadata as Prisma.JsonValue, {
    faqs: [...metadata.faqs, nextFaq],
  });

  await prisma.productProjection.update({
    where: { id: projection.id },
    data: {
      metadata: nextMetadata,
    },
  });
}

export async function removeProductFaq(params: {
  shopId: string;
  productProjectionId: string;
  faqId: string;
}): Promise<void> {
  const projection = await prisma.productProjection.findFirst({
    where: { id: params.productProjectionId, shopId: params.shopId },
    select: { id: true, metadata: true },
  });

  if (!projection) {
    throw new Error("Product not found");
  }

  const metadata = getProductAdminMetadata(projection.metadata as Prisma.JsonValue | null | undefined);
  const nextMetadata = mergeProductAdminMetadata(projection.metadata as Prisma.JsonValue, {
    faqs: metadata.faqs.filter((faq) => faq.id !== params.faqId),
  });

  await prisma.productProjection.update({
    where: { id: projection.id },
    data: {
      metadata: nextMetadata,
    },
  });
}

export async function setProductDisabled(params: {
  shopId: string;
  productProjectionId: string;
  disabled: boolean;
}): Promise<void> {
  const projection = await prisma.productProjection.findFirst({
    where: { id: params.productProjectionId, shopId: params.shopId },
    select: { id: true, metadata: true },
  });

  if (!projection) {
    throw new Error("Product not found");
  }

  const nextMetadata = mergeProductAdminMetadata(projection.metadata as Prisma.JsonValue, {
    disabled: params.disabled,
  });

  await prisma.productProjection.update({
    where: { id: projection.id },
    data: {
      metadata: nextMetadata,
    },
  });
}

export async function getManagedProductProjection(params: {
  shopId: string;
  productProjectionId: string;
}): Promise<ManagedProductProjection | null> {
  const projection = await prisma.productProjection.findFirst({
    where: {
      id: params.productProjectionId,
      shopId: params.shopId,
      deletedAt: null,
    },
    select: {
      id: true,
      productId: true,
      title: true,
      handle: true,
      metadata: true,
    },
  });

  if (!projection) return null;

  return {
    id: projection.id,
    productId: projection.productId,
    title: projection.title,
    handle: projection.handle,
    metadata: getProductAdminMetadata(projection.metadata as Prisma.JsonValue | null | undefined),
  };
}
