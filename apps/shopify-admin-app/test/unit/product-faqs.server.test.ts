import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../../app/db.server", () => ({
  default: {
    productProjection: {
      findFirst: mockFindFirst,
      update: mockUpdate,
    },
  },
}));

describe("product-faqs.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns default metadata when none exists", async () => {
    const { getProductAdminMetadata } = await import("../../app/services/product-faqs.server");
    const metadata = getProductAdminMetadata(null);

    expect(metadata.disabled).toBe(false);
    expect(metadata.tags).toEqual([]);
    expect(metadata.collections).toEqual([]);
    expect(metadata.faqs).toEqual([]);
  });

  it("appends FAQ and persists metadata", async () => {
    mockFindFirst.mockResolvedValue({
      id: "projection-1",
      metadata: {
        tags: ["summer"],
        collections: ["featured"],
        disabled: false,
        faqs: [],
      },
    });
    mockUpdate.mockResolvedValue({});

    const { appendProductFaq } = await import("../../app/services/product-faqs.server");

    await appendProductFaq({
      shopId: "shop-1",
      productProjectionId: "projection-1",
      category: "dimensions",
      question: "What size is it?",
      answer: "It measures 20cm.",
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const updatePayload = mockUpdate.mock.calls[0][0];
    expect(updatePayload.where.id).toBe("projection-1");
    expect(updatePayload.data.metadata.faqs).toHaveLength(1);
    expect(updatePayload.data.metadata.faqs[0].question).toBe("What size is it?");
  });

  it("sets product disabled flag in metadata", async () => {
    mockFindFirst.mockResolvedValue({
      id: "projection-1",
      metadata: {
        disabled: false,
        faqs: [],
      },
    });
    mockUpdate.mockResolvedValue({});

    const { setProductDisabled } = await import("../../app/services/product-faqs.server");

    await setProductDisabled({
      shopId: "shop-1",
      productProjectionId: "projection-1",
      disabled: true,
    });

    const updatePayload = mockUpdate.mock.calls[0][0];
    expect(updatePayload.data.metadata.disabled).toBe(true);
  });

  it("removes FAQ by id", async () => {
    mockFindFirst.mockResolvedValue({
      id: "projection-1",
      metadata: {
        disabled: false,
        faqs: [
          {
            id: "faq-1",
            category: "shipping",
            question: "When does it ship?",
            answer: "In 2 days",
            createdAt: "2026-05-01T10:00:00.000Z",
            updatedAt: "2026-05-01T10:00:00.000Z",
          },
          {
            id: "faq-2",
            category: "returns",
            question: "Can I return it?",
            answer: "Yes",
            createdAt: "2026-05-01T10:00:00.000Z",
            updatedAt: "2026-05-01T10:00:00.000Z",
          },
        ],
      },
    });
    mockUpdate.mockResolvedValue({});

    const { removeProductFaq } = await import("../../app/services/product-faqs.server");

    await removeProductFaq({
      shopId: "shop-1",
      productProjectionId: "projection-1",
      faqId: "faq-1",
    });

    const updatePayload = mockUpdate.mock.calls[0][0];
    expect(updatePayload.data.metadata.faqs).toHaveLength(1);
    expect(updatePayload.data.metadata.faqs[0].id).toBe("faq-2");
  });
});
