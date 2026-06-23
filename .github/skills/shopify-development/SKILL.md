---
name: shopify-development
description: "Build Shopify apps, extensions, and themes using Admin GraphQL API, Shopify CLI, Polaris UI, and Liquid."
risk: unknown
source: community
date_added: "2026-02-27"
---

# Shopify Development Skill

Use this skill when the user asks about:

- Building Shopify apps or extensions
- Creating checkout/admin/POS UI customizations
- Developing themes with Liquid templating
- Integrating with Shopify GraphQL or REST APIs
- Implementing webhooks or billing
- Working with metafields or Shopify Functions

## Routing

- Integrations, merchant tooling, billing: build an app.
- Checkout/admin/POS customization and discount logic: build an extension.
- Storefront design changes and templates: build a theme.
- Backend logic plus storefront UI: build app + theme app extension.

## Core Shopify CLI Commands

```bash
npm install -g @shopify/cli@latest

shopify app init
shopify app dev
shopify app deploy

shopify app generate extension --type checkout_ui_extension
shopify app generate extension --type admin_action
shopify app generate extension --type admin_block
shopify app generate extension --type pos_ui_extension
shopify app generate extension --type function

shopify theme init
shopify theme dev
shopify theme pull --live
shopify theme push --development
```

## Access Scopes

```toml
[access_scopes]
scopes = "read_products,write_products,read_orders,write_orders,read_customers"
```

## GraphQL Baseline Patterns (Admin API 2026-01)

- Product and order pagination via `edges` + `pageInfo`.
- Metafield writes via `metafieldsSet`.
- Always request only required fields.
- Use bulk operations for large sync workloads.

## Webhooks Baseline

```toml
[webhooks]
api_version = "2026-01"

[[webhooks.subscriptions]]
topics = ["orders/create", "orders/updated"]
uri = "/webhooks/orders"

[[webhooks.subscriptions]]
topics = ["products/update"]
uri = "/webhooks/products"

[webhooks.privacy_compliance]
customer_data_request_url = "/webhooks/gdpr/data-request"
customer_deletion_url = "/webhooks/gdpr/customer-deletion"
shop_deletion_url = "/webhooks/gdpr/shop-deletion"
```

## Best Practices

- Prefer GraphQL for new development.
- Validate webhook HMAC signatures.
- Request minimum scopes needed.
- Validate OAuth state and session tokens for embedded apps.
- Apply retry with exponential backoff for rate limits.

## References

- https://shopify.dev/docs
- https://shopify.dev/docs/api/admin-graphql
- https://shopify.dev/docs/api/shopify-cli
- https://polaris.shopify.com
