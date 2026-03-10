import { iaClient } from "./ia-backend.client";

export interface LlmsTxtOptions {
  shopDomain: string;
  includePolicies?: boolean;
  includeProducts?: boolean;
  maxProducts?: number;
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

export class LlmsTxtService {
  static async generate(options: LlmsTxtOptions): Promise<string> {
    const includePolicies = options.includePolicies !== false;
    const includeProducts = options.includeProducts !== false;
    const maxProducts = Math.min(Math.max(options.maxProducts || 12, 1), 50);

    const shopDomain = normalizeDomain(options.shopDomain);

    return iaClient.llms.generate(
      {
        shopDomain,
        includePolicies,
        includeProducts,
        maxProducts,
      },
      shopDomain,
    );
  }
}
