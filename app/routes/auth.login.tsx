import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { login } from "../shopify.server";

const DEFAULT_SHOP = "quickstart-c8cc9986.myshopify.com";

function getShopFromEnv() {
  return process.env.SHOPIFY_SHOP || process.env.SHOPIFY_DEV_STORE_URL || DEFAULT_SHOP;
}

function ensureShopParam(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) return null;

  const shop = getShopFromEnv();
  if (!shop) return null;

  url.searchParams.set("shop", shop);
  return redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "HEAD") {
    return new Response(null, { status: 204 });
  }

  const redirectToShop = ensureShopParam(request);
  if (redirectToShop) return redirectToShop;

  return login(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const redirectToShop = ensureShopParam(request);
  if (redirectToShop) return redirectToShop;

  return login(request);
};

export default function AuthLogin() {
  return null;
}
