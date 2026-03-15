import { createHmac, timingSafeEqual } from "crypto";

function buildCanonicalProxyMessage(searchParams: URLSearchParams): string {
  const grouped = new Map<string, string[]>();

  for (const [key, value] of searchParams.entries()) {
    if (key === "hmac" || key === "signature") {
      continue;
    }

    const values = grouped.get(key);
    if (values) {
      values.push(value);
    } else {
      grouped.set(key, [value]);
    }
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => `${key}=${values.join(",")}`)
    .join("");
}

export function verifyShopifyProxyRequest(
  request: Request,
  options?: { allowUnsignedInDevelopment?: boolean },
): boolean {
  const url = new URL(request.url);
  const signature = url.searchParams.get("signature") || url.searchParams.get("hmac");

  if (!signature) {
    return Boolean(options?.allowUnsignedInDevelopment) && process.env.NODE_ENV !== "production";
  }

  const secret = process.env.SHOPIFY_API_SECRET || "";
  if (!secret) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(buildCanonicalProxyMessage(url.searchParams))
    .digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}