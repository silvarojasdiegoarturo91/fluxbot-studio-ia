import {
  LoginErrorType,
  type LoginError,
} from "@shopify/shopify-app-react-router/server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";

import { login } from "../shopify.server";

interface LoginErrors {
  shop?: string;
}

function toLoginErrors(loginErrors: LoginError): LoginErrors {
  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain" };
  }

  if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid .myshopify.com domain" };
  }

  return {};
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const hasShopParam = Boolean(url.searchParams.get("shop"));
  const configuredShop = process.env.SHOPIFY_SHOP || process.env.SHOPIFY_DEV_STORE_URL;

  // Dev convenience: if Shopify sends /auth/login without shop, recover automatically.
  if (process.env.NODE_ENV !== "production" && !hasShopParam && configuredShop) {
    throw redirect(`/auth/login?shop=${encodeURIComponent(configuredShop)}`);
  }

  return { errors: toLoginErrors(await login(request)) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return { errors: toLoginErrors(await login(request)) };
};

export default function AuthLogin() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors ?? loaderData.errors;

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Log in</h1>
      <Form method="post">
        <label htmlFor="shop">Shop domain</label>
        <div style={{ marginTop: "0.5rem" }}>
          <input
            id="shop"
            name="shop"
            type="text"
            placeholder="example.myshopify.com"
            autoComplete="on"
            style={{ minWidth: "20rem", padding: "0.5rem" }}
          />
        </div>
        {errors.shop ? (
          <p style={{ color: "#d72c0d", marginTop: "0.5rem" }}>{errors.shop}</p>
        ) : null}
        <button style={{ marginTop: "0.75rem" }} type="submit">
          Continue
        </button>
      </Form>
    </main>
  );
}
