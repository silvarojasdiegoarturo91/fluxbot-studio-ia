import type { LoaderFunctionArgs } from "react-router";
import { Form, redirect, useLoaderData } from "react-router";

import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Embedded loads can include shop, host, and/or embedded params at "/".
  // Forward to /app preserving all query params so App Bridge gets the expected context.
  const isEmbeddedBootstrap =
    url.searchParams.has("shop") ||
    url.searchParams.has("host") ||
    url.searchParams.get("embedded") === "1";

  if (isEmbeddedBootstrap) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  const configuredShop =
    process.env.SHOPIFY_SHOP || process.env.SHOPIFY_DEV_STORE_URL;

  // In local development, skip manual shop input and start OAuth directly.
  if (process.env.NODE_ENV !== "production" && configuredShop) {
    throw redirect(`/auth/login?shop=${encodeURIComponent(configuredShop)}`);
  }

  return { showForm: Boolean(login) };
};

export default function Index() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>FluxBot Studio IA</h1>
      <p>Enter your shop domain to continue.</p>
      {showForm ? (
        <Form method="post" action="/auth/login">
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
          <button style={{ marginTop: "0.75rem" }} type="submit">
            Log in
          </button>
        </Form>
      ) : null}
    </main>
  );
}
