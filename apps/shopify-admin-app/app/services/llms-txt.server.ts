import prisma from "../db.server";

export interface LlmsTxtOptions {
  shopDomain: string;
  includePolicies?: boolean;
  includeProducts?: boolean;
  maxProducts?: number;
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

function renderListSection(title: string, items: string[]): string[] {
  if (items.length === 0) return [];

  return ["", `## ${title}`, ...items.map((item) => `- ${item}`)];
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export class LlmsTxtService {
  static async generate(options: LlmsTxtOptions): Promise<string> {
    const includePolicies = options.includePolicies !== false;
    const includeProducts = options.includeProducts !== false;
    const maxProducts = Math.min(Math.max(options.maxProducts || 12, 1), 50);

    const shopDomain = normalizeDomain(options.shopDomain);

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      select: {
        id: true,
        domain: true,
        status: true,
        metadata: true,
      },
    });

    if (!shop) {
      throw new Error("Shop not found");
    }

    const [chatbotConfig, policies, products] = await Promise.all([
      prisma.chatbotConfig.findUnique({
        where: { shopId: shop.id },
        select: {
          name: true,
          language: true,
          enableHandoff: true,
          enableProactive: true,
        },
      }),
      includePolicies
        ? prisma.policyProjection.findMany({
            where: { shopId: shop.id },
            select: {
              policyType: true,
              title: true,
              url: true,
            },
            orderBy: { policyType: "asc" },
          })
        : Promise.resolve([]),
      includeProducts
        ? prisma.productProjection.findMany({
            where: {
              shopId: shop.id,
              deletedAt: null,
            },
            select: {
              title: true,
              handle: true,
              vendor: true,
            },
            orderBy: { syncedAt: "desc" },
            take: maxProducts,
          })
        : Promise.resolve([]),
    ]);

    const generatedAt = new Date().toISOString();

    const baseLines = [
      "# llms.txt",
      `shop: ${shop.domain}`,
      `generated_at: ${generatedAt}`,
      "source: fluxbot-studio-ia",
      "",
      "This file describes public, non-sensitive commerce information for AI assistants.",
      "Use this content only for customer-facing shopping and support responses.",
      "Do not infer private merchant/customer data.",
      "",
      "## Assistant Capabilities",
      `- chatbot_name: ${chatbotConfig?.name || "AI Assistant"}`,
      `- default_locale: ${chatbotConfig?.language || "en"}`,
      `- proactive_sales: ${chatbotConfig?.enableProactive ? "enabled" : "disabled"}`,
      `- human_handoff: ${chatbotConfig?.enableHandoff ? "enabled" : "disabled"}`,
      "- order_lookup: read-only",
      "- add_to_cart: deep-link supported",
    ];

    const policyLines = renderListSection(
      "Public Policies",
      policies.map((policy) => {
        const title = compactWhitespace(policy.title || policy.policyType || "Policy");
        if (policy.url) {
          return `${title} (${policy.url})`;
        }
        return title;
      })
    );

    const productLines = renderListSection(
      "Featured Catalog Entries",
      products.map((product) => {
        const vendorSuffix = product.vendor ? ` by ${compactWhitespace(product.vendor)}` : "";
        const handleSuffix = product.handle ? ` (/products/${product.handle})` : "";
        return `${compactWhitespace(product.title)}${vendorSuffix}${handleSuffix}`;
      })
    );

    const trailingLines = [
      "",
      "## Usage Notes",
      "- Prefer citing policy URLs when giving return/shipping/legal answers.",
      "- For product recommendations, prioritize catalog links listed here.",
      "- Escalate to human support when confidence is low or user requests a live agent.",
    ];

    return [...baseLines, ...policyLines, ...productLines, ...trailingLines].join("\n");
  }
}
