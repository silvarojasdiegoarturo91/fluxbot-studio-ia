import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../app/db.server', () => ({
  default: {
    shop: {
      findUnique: vi.fn(),
    },
    embeddingRecord: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../app/services/ia-gateway.server', () => ({
  getIAGateway: vi.fn(),
}));

import prisma from '../../app/db.server';
import { getIAGateway } from '../../app/services/ia-gateway.server';
import { searchCatalog } from '../../app/services/vector-retrieval.server';

const mockShopFindUnique = prisma.shop.findUnique as ReturnType<typeof vi.fn>;
const mockEmbeddingFindMany = prisma.embeddingRecord.findMany as ReturnType<typeof vi.fn>;
const mockGetIAGateway = getIAGateway as ReturnType<typeof vi.fn>;

function createLocalEmbeddingRecord() {
  return {
    chunkId: 'chunk-local-1',
    embedding: new Array(8).fill(0.5),
    chunk: {
      content: 'Blue winter coat',
      metadata: { title: 'Blue Coat', locale: 'en' },
      document: {
        title: 'Blue Coat',
        language: 'en',
        source: {
          sourceType: 'CATALOG',
        },
      },
    },
  };
}

describe('Vector retrieval gateway contract (S8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses IA gateway in remote mode and does not read local embeddings table', async () => {
    process.env.IA_EXECUTION_MODE = 'remote';

    const gateway = {
      searchEmbeddings: vi.fn().mockResolvedValue([
        {
          chunkId: 'chunk-remote-1',
          documentType: 'product',
          title: 'Remote Jacket',
          content: 'Waterproof remote jacket',
          relevance: 0.91,
          metadata: { locale: 'en', productId: 'prod-1' },
        },
      ]),
    };

    mockGetIAGateway.mockReturnValue(gateway as any);
    mockShopFindUnique.mockResolvedValue({ domain: 'test-shop.myshopify.com' });

    const results = await searchCatalog(new Array(8).fill(0.3), {
      limit: 5,
      threshold: 0.2,
      filter: {
        shopId: 'shop-1',
        documentType: 'product',
        locales: ['en'],
      },
    });

    expect(mockEmbeddingFindMany).not.toHaveBeenCalled();
    expect(mockGetIAGateway).toHaveBeenCalledOnce();
    expect(gateway.searchEmbeddings).toHaveBeenCalledWith(
      {
        queryEmbedding: new Array(8).fill(0.3),
        options: {
          limit: 5,
          threshold: 0.2,
          filter: {
            shopId: 'shop-1',
            documentType: 'product',
            locales: ['en'],
          },
        },
      },
      'test-shop.myshopify.com',
    );

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Remote Jacket');
  });

  it('returns empty results in remote mode when shopId is missing', async () => {
    process.env.IA_EXECUTION_MODE = 'remote';

    const gateway = {
      searchEmbeddings: vi.fn(),
    };

    mockGetIAGateway.mockReturnValue(gateway as any);

    const results = await searchCatalog(new Array(8).fill(0.3), {
      limit: 5,
      threshold: 0.2,
      filter: {
        documentType: 'product',
      },
    });

    expect(results).toEqual([]);
    expect(mockShopFindUnique).not.toHaveBeenCalled();
    expect(gateway.searchEmbeddings).not.toHaveBeenCalled();
  });

  it('uses local cosine search when IA_EXECUTION_MODE=local', async () => {
    process.env.IA_EXECUTION_MODE = 'local';

    mockEmbeddingFindMany.mockResolvedValue([createLocalEmbeddingRecord()]);

    const results = await searchCatalog(new Array(8).fill(0.5), {
      limit: 3,
      threshold: 0,
      filter: {
        shopId: 'shop-1',
        documentType: 'product',
      },
    });

    expect(mockEmbeddingFindMany).toHaveBeenCalledOnce();
    expect(mockGetIAGateway).not.toHaveBeenCalled();
    expect(results.length).toBeGreaterThan(0);
  });
});
