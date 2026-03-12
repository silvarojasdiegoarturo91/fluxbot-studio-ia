/**
 * Sync Worker
 *
 * Processes pending SyncJob records and ingests Shopify data into:
 * - Knowledge documents/chunks (via SyncService)
 * - Product/Policy/Order projections
 */

import prisma from "../db.server";
import {
  ProductTransformer,
  PolicyTransformer,
  PageTransformer,
  SyncService,
  type ProductDocument,
  type PolicyDocument,
  type PageDocument,
} from "../services/sync-service.server";

const ADMIN_API_VERSION = "2026-01";
const PAGE_SIZE = 50;

type ProcessResult = {
  processed: number;
  failed: number;
  jobs: Array<{ id: string; status: "COMPLETED" | "FAILED"; message?: string }>;
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

function toObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function extractNumericId(rawId: string | null | undefined): string | null {
  if (!rawId) return null;
  if (/^\d+$/.test(rawId)) return rawId;

  const gidMatch = rawId.match(/\/(\d+)$/);
  if (gidMatch?.[1]) return gidMatch[1];

  const fallbackMatch = rawId.match(/(\d+)(?!.*\d)/);
  return fallbackMatch?.[1] || null;
}

async function runShopifyGraphql<T>(params: {
  shopDomain: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const endpoint = `https://${params.shopDomain}/admin/api/${ADMIN_API_VERSION}/graphql.json`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": params.accessToken,
    },
    body: JSON.stringify({ query: params.query, variables: params.variables || {} }),
  });

  if (!response.ok) {
    throw new Error(`Shopify GraphQL HTTP ${response.status}`);
  }

  const payload = (await response.json()) as GraphqlResponse<T>;
  if (payload.errors?.length) {
    const firstMessage = payload.errors[0]?.message || "Unknown GraphQL error";
    throw new Error(`Shopify GraphQL error: ${firstMessage}`);
  }

  if (!payload.data) {
    throw new Error("Shopify GraphQL returned no data");
  }

  return payload.data;
}

async function fetchAllProducts(shopDomain: string, accessToken: string): Promise<ProductDocument[]> {
  const query = `#graphql
    query SyncProducts($first: Int!, $after: String) {
      products(first: $first, after: $after, sortKey: UPDATED_AT) {
        edges {
          cursor
          node {
            id
            legacyResourceId
            title
            description
            vendor
            productType
            handle
            variants(first: 20) {
              nodes {
                id
                legacyResourceId
                title
                sku
                price
              }
            }
            images(first: 5) {
              nodes {
                id
                url
                altText
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const products: ProductDocument[] = [];
  let hasNextPage = true;
  let after: string | null = null;

  while (hasNextPage) {
    const data = await runShopifyGraphql<{
      products?: {
        edges?: Array<{ cursor?: string; node?: Record<string, any> }>;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      };
    }>({
      shopDomain,
      accessToken,
      query,
      variables: { first: PAGE_SIZE, after },
    });

    const productsNode = toObject(data.products);
    const edges = Array.isArray(productsNode.edges) ? productsNode.edges : [];

    for (const edge of edges) {
      const node = toObject(edge?.node);
      const productId = String(
        node.legacyResourceId ||
          extractNumericId(typeof node.id === "string" ? node.id : "") ||
          node.id ||
          "",
      );
      if (!productId) continue;

      const variantsContainer = toObject(node.variants);
      const variantsNodes = Array.isArray(variantsContainer.nodes) ? variantsContainer.nodes : [];

      const imagesContainer = toObject(node.images);
      const imagesNodes = Array.isArray(imagesContainer.nodes) ? imagesContainer.nodes : [];

      products.push({
        id: productId,
        title: String(node.title || "Untitled"),
        description: String(node.description || ""),
        vendor: String(node.vendor || ""),
        productType: String(node.productType || ""),
        handle: String(node.handle || ""),
        variants: variantsNodes.map((variantRaw: any) => {
          const variant = toObject(variantRaw);
          const variantId = String(
            variant.legacyResourceId ||
              extractNumericId(typeof variant.id === "string" ? variant.id : "") ||
              variant.id ||
              "",
          );
          return {
            id: variantId,
            title: String(variant.title || "Default"),
            sku: String(variant.sku || ""),
            price: String(variant.price || ""),
          };
        }),
        images: imagesNodes.map((imgRaw: any) => {
          const image = toObject(imgRaw);
          return {
            id: String(image.id || ""),
            url: String(image.url || ""),
            altText: String(image.altText || ""),
          };
        }),
      });
    }

    const pageInfo = toObject(productsNode.pageInfo);
    hasNextPage = Boolean(pageInfo.hasNextPage);
    after = typeof pageInfo.endCursor === "string" ? pageInfo.endCursor : null;
  }

  return products;
}

async function fetchPolicies(shopDomain: string, accessToken: string): Promise<PolicyDocument[]> {
  const query = `#graphql
    query SyncPolicies {
      shop {
        privacyPolicy {
          title
          body
          url
        }
        refundPolicy {
          title
          body
          url
        }
        shippingPolicy {
          title
          body
          url
        }
        termsOfService {
          title
          body
          url
        }
      }
    }
  `;

  const data = await runShopifyGraphql<{
    shop?: {
      privacyPolicy?: Record<string, any> | null;
      refundPolicy?: Record<string, any> | null;
      shippingPolicy?: Record<string, any> | null;
      termsOfService?: Record<string, any> | null;
    };
  }>({ shopDomain, accessToken, query });

  const shop = toObject(data.shop);

  const mappings: Array<{
    key: keyof typeof shop;
    policyType: PolicyDocument["policyType"];
  }> = [
    { key: "privacyPolicy", policyType: "privacy" },
    { key: "refundPolicy", policyType: "return" },
    { key: "shippingPolicy", policyType: "shipping" },
    { key: "termsOfService", policyType: "terms" },
  ];

  const policies: PolicyDocument[] = [];
  for (const mapping of mappings) {
    const raw = toObject(shop[mapping.key]);
    const title = String(raw.title || "").trim();
    const body = String(raw.body || "").trim();

    if (!title && !body) continue;

    policies.push({
      policyType: mapping.policyType,
      title: title || `${mapping.policyType} policy`,
      body,
      url: String(raw.url || ""),
    });
  }

  return policies;
}

async function fetchAllPages(shopDomain: string, accessToken: string): Promise<PageDocument[]> {
  const query = `#graphql
    query SyncPages($first: Int!, $after: String) {
      pages(first: $first, after: $after, sortKey: UPDATED_AT) {
        edges {
          cursor
          node {
            id
            title
            handle
            bodySummary
            body
            seo {
              title
              description
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const pages: PageDocument[] = [];
  let hasNextPage = true;
  let after: string | null = null;

  while (hasNextPage) {
    const data = await runShopifyGraphql<{
      pages?: {
        edges?: Array<{ node?: Record<string, any> }>;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      };
    }>({
      shopDomain,
      accessToken,
      query,
      variables: { first: PAGE_SIZE, after },
    });

    const pagesNode = toObject(data.pages);
    const edges = Array.isArray(pagesNode.edges) ? pagesNode.edges : [];

    for (const edge of edges) {
      const node = toObject(edge?.node);
      const id = String(
        extractNumericId(typeof node.id === "string" ? node.id : "") || node.id || "",
      );
      if (!id) continue;

      const seo = toObject(node.seo);
      pages.push({
        id,
        title: String(node.title || "Untitled page"),
        handle: String(node.handle || ""),
        bodySummary: String(node.bodySummary || ""),
        body: String(node.body || ""),
        seo: {
          title: String(seo.title || ""),
          description: String(seo.description || ""),
        },
      });
    }

    const pageInfo = toObject(pagesNode.pageInfo);
    hasNextPage = Boolean(pageInfo.hasNextPage);
    after = typeof pageInfo.endCursor === "string" ? pageInfo.endCursor : null;
  }

  return pages;
}

async function fetchRecentOrders(shopDomain: string, accessToken: string) {
  const query = `#graphql
    query SyncOrders($first: Int!, $after: String) {
      orders(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
        edges {
          cursor
          node {
            id
            legacyResourceId
            name
            orderNumber
            email
            displayFinancialStatus
            displayFulfillmentStatus
            customer {
              id
              legacyResourceId
            }
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            lineItems(first: 25) {
              nodes {
                title
                quantity
                variant {
                  id
                  legacyResourceId
                }
                product {
                  id
                  legacyResourceId
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const orders: Array<Record<string, any>> = [];
  let hasNextPage = true;
  let after: string | null = null;
  let pagesFetched = 0;

  // Keep order sync bounded for initial catalog jobs.
  while (hasNextPage && pagesFetched < 3) {
    pagesFetched++;

    const data = await runShopifyGraphql<{
      orders?: {
        edges?: Array<{ node?: Record<string, any> }>;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      };
    }>({
      shopDomain,
      accessToken,
      query,
      variables: { first: PAGE_SIZE, after },
    });

    const ordersNode = toObject(data.orders);
    const edges = Array.isArray(ordersNode.edges) ? ordersNode.edges : [];
    for (const edge of edges) {
      orders.push(toObject(edge?.node));
    }

    const pageInfo = toObject(ordersNode.pageInfo);
    hasNextPage = Boolean(pageInfo.hasNextPage);
    after = typeof pageInfo.endCursor === "string" ? pageInfo.endCursor : null;
  }

  return orders;
}

async function syncProducts(jobId: string, shopId: string, shopDomain: string, accessToken: string) {
  const products = await fetchAllProducts(shopDomain, accessToken);

  const chunks = products.flatMap((product) => ProductTransformer.toChunks(product, shopId));
  const chunkCount = chunks.length > 0 ? await SyncService.ingestChunks(shopId, chunks) : 0;

  for (const product of products) {
    await prisma.productProjection.upsert({
      where: {
        shopId_productId: {
          shopId,
          productId: product.id,
        },
      },
      create: {
        shopId,
        productId: product.id,
        handle: product.handle || product.id,
        title: product.title,
        description: product.description,
        vendor: product.vendor,
        productType: product.productType,
        variants: product.variants,
        images: product.images,
        metadata: { source: "sync-worker" },
        syncedAt: new Date(),
      },
      update: {
        handle: product.handle || product.id,
        title: product.title,
        description: product.description,
        vendor: product.vendor,
        productType: product.productType,
        variants: product.variants,
        images: product.images,
        metadata: { source: "sync-worker" },
        deletedAt: null,
        syncedAt: new Date(),
      },
    });
  }

  await SyncService.updateSyncJob(jobId, {
    totalItems: products.length,
    processedItems: products.length,
    progress: 0.85,
    errorMessage: null,
  });

  return { items: products.length, chunks: chunkCount };
}

async function syncPolicies(jobId: string, shopId: string, shopDomain: string, accessToken: string) {
  const policies = await fetchPolicies(shopDomain, accessToken);

  const chunks = policies.flatMap((policy) => PolicyTransformer.toChunks(policy, shopId));
  const chunkCount = chunks.length > 0 ? await SyncService.ingestChunks(shopId, chunks) : 0;

  for (const policy of policies) {
    await prisma.policyProjection.upsert({
      where: {
        shopId_policyType: {
          shopId,
          policyType: policy.policyType,
        },
      },
      create: {
        shopId,
        policyType: policy.policyType,
        title: policy.title,
        body: policy.body,
        url: policy.url || null,
        data: {
          source: "sync-worker",
          title: policy.title,
          body: policy.body,
          url: policy.url,
        },
        syncedAt: new Date(),
      },
      update: {
        title: policy.title,
        body: policy.body,
        url: policy.url || null,
        data: {
          source: "sync-worker",
          title: policy.title,
          body: policy.body,
          url: policy.url,
        },
        syncedAt: new Date(),
      },
    });
  }

  await SyncService.updateSyncJob(jobId, {
    totalItems: policies.length,
    processedItems: policies.length,
    progress: 0.9,
    errorMessage: null,
  });

  return { items: policies.length, chunks: chunkCount };
}

async function syncPages(jobId: string, shopId: string, shopDomain: string, accessToken: string) {
  const pages = await fetchAllPages(shopDomain, accessToken);

  const chunks = pages.flatMap((page) => PageTransformer.toChunks(page, shopId));
  const chunkCount = chunks.length > 0 ? await SyncService.ingestChunks(shopId, chunks) : 0;

  await SyncService.updateSyncJob(jobId, {
    totalItems: pages.length,
    processedItems: pages.length,
    progress: 0.9,
    errorMessage: null,
  });

  return { items: pages.length, chunks: chunkCount };
}

async function syncOrders(shopId: string, shopDomain: string, accessToken: string) {
  const orders = await fetchRecentOrders(shopDomain, accessToken);

  for (const orderRaw of orders) {
    const customer = toObject(orderRaw.customer);
    const customerId = String(
      customer.legacyResourceId ||
        extractNumericId(typeof customer.id === "string" ? customer.id : "") ||
        "",
    );

    const orderId = String(
      orderRaw.legacyResourceId ||
        extractNumericId(typeof orderRaw.id === "string" ? orderRaw.id : "") ||
        orderRaw.id ||
        "",
    );
    if (!orderId) continue;

    const lineItemsContainer = toObject(orderRaw.lineItems);
    const lineNodes = Array.isArray(lineItemsContainer.nodes) ? lineItemsContainer.nodes : [];

    const lineItems = lineNodes.map((rawItem: any) => {
      const item = toObject(rawItem);
      const variant = toObject(item.variant);
      const product = toObject(item.product);

      return {
        title: String(item.title || ""),
        quantity: Number(item.quantity || 0),
        variantId: String(
          variant.legacyResourceId ||
            extractNumericId(typeof variant.id === "string" ? variant.id : "") ||
            "",
        ),
        productId: String(
          product.legacyResourceId ||
            extractNumericId(typeof product.id === "string" ? product.id : "") ||
            "",
        ),
      };
    });

    const totalPrice = String(
      toObject(toObject(orderRaw.totalPriceSet).shopMoney).amount || "",
    );

    await prisma.orderProjection.upsert({
      where: {
        shopId_orderId: {
          shopId,
          orderId,
        },
      },
      create: {
        shopId,
        orderId,
        orderNumber: String(orderRaw.orderNumber || orderRaw.name || orderId),
        customerId: customerId || null,
        email: String(orderRaw.email || "") || null,
        financialStatus: String(orderRaw.displayFinancialStatus || "") || null,
        fulfillmentStatus: String(orderRaw.displayFulfillmentStatus || "") || null,
        totalPrice,
        lineItems,
        data: orderRaw,
        syncedAt: new Date(),
      },
      update: {
        orderNumber: String(orderRaw.orderNumber || orderRaw.name || orderId),
        customerId: customerId || null,
        email: String(orderRaw.email || "") || null,
        financialStatus: String(orderRaw.displayFinancialStatus || "") || null,
        fulfillmentStatus: String(orderRaw.displayFulfillmentStatus || "") || null,
        totalPrice,
        lineItems,
        data: orderRaw,
        syncedAt: new Date(),
      },
    });
  }

  return { items: orders.length };
}

async function claimNextPendingJob() {
  const next = await prisma.syncJob.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!next) return null;

  const claimed = await prisma.syncJob.updateMany({
    where: { id: next.id, status: "PENDING" },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      progress: 0.05,
      errorMessage: null,
    },
  });

  if (claimed.count === 0) return null;

  return prisma.syncJob.findUnique({
    where: { id: next.id },
    include: {
      shop: {
        select: {
          id: true,
          domain: true,
          accessToken: true,
          status: true,
        },
      },
    },
  });
}

async function processJob(job: Awaited<ReturnType<typeof claimNextPendingJob>>) {
  if (!job) {
    return { status: "FAILED" as const, message: "No job to process" };
  }

  if (!job.shop || job.shop.status !== "ACTIVE") {
    throw new Error("Shop missing or inactive");
  }

  if (!job.shop.accessToken) {
    throw new Error("Shop is missing access token");
  }

  const shopId = job.shop.id;
  const shopDomain = job.shop.domain;
  const accessToken = job.shop.accessToken;

  await SyncService.updateSyncJob(job.id, { progress: 0.1 });

  switch (job.jobType) {
    case "initial:catalog": {
      const productsResult = await syncProducts(job.id, shopId, shopDomain, accessToken);
      const ordersResult = await syncOrders(shopId, shopDomain, accessToken);

      await SyncService.updateSyncJob(job.id, {
        totalItems: productsResult.items + ordersResult.items,
        processedItems: productsResult.items + ordersResult.items,
        progress: 0.98,
      });
      break;
    }

    case "delta:products":
      await syncProducts(job.id, shopId, shopDomain, accessToken);
      break;

    case "initial:policies":
    case "delta:policies":
      await syncPolicies(job.id, shopId, shopDomain, accessToken);
      break;

    case "initial:pages":
    case "delta:pages":
      await syncPages(job.id, shopId, shopDomain, accessToken);
      break;

    default:
      throw new Error(`Unsupported sync job type: ${job.jobType}`);
  }

  await SyncService.completeSyncJob(job.id, "COMPLETED");
  return { status: "COMPLETED" as const };
}

/**
 * Process pending sync jobs in FIFO order.
 */
export async function processPendingSyncJobs(limit = 2): Promise<ProcessResult> {
  let processed = 0;
  let failed = 0;
  const jobs: ProcessResult["jobs"] = [];

  for (let i = 0; i < limit; i++) {
    const job = await claimNextPendingJob();
    if (!job) break;

    try {
      await processJob(job);
      processed++;
      jobs.push({ id: job.id, status: "COMPLETED" });
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      await SyncService.updateSyncJob(job.id, {
        status: "FAILED",
        errorMessage: message,
        completedAt: new Date(),
      });
      jobs.push({ id: job.id, status: "FAILED", message });
      console.error(`[SyncWorker] Job ${job.id} failed:`, error);
    }
  }

  return { processed, failed, jobs };
}
