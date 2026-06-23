---
name: shopify-cli
description: "Comprehensive guide for Shopify CLI app development lifecycle. Use when working with Shopify apps: initializing projects, managing TOML configurations, running local development with `shopify app dev`, deploying extensions, setting up multi-environment workflows (dev/staging/prod), or automating CI/CD pipelines. Includes operational guidance for common tasks like environment setup, config validation, webhook testing, and deployment automation."
compatibility: Requires Node.js and Shopify CLI.
metadata:
  author: eibrahimov/claude-skills
  license: Apache-2.0
  version: "1.0.0"
---

# Shopify CLI for App Development

Shopify CLI manages the app lifecycle through configuration-as-code. App settings live in TOML files under version control.

## Quick Start

```bash
shopify app init
shopify app config link
shopify app dev
shopify app deploy
```

## Configuration As Code

`shopify.app.toml` key structure:

```toml
name = "My App"
client_id = "abc123..."
application_url = "https://myapp.com"
embedded = true

[access_scopes]
scopes = "read_products,write_orders"

[auth]
redirect_urls = ["https://myapp.com/api/auth/callback"]

[webhooks]
api_version = "2024-01"

[[webhooks.subscriptions]]
topics = ["app/uninstalled"]
uri = "/webhooks"
```

Key fields:

- `name`: display name in Shopify admin.
- `client_id`: app identifier from Partner Dashboard.
- `application_url`: main app URL.
- `embedded`: whether the app renders in Shopify admin.
- `access_scopes.scopes`: comma-separated permissions.
- `auth.redirect_urls`: OAuth callback URLs.
- `webhooks.subscriptions`: webhook endpoints.

Warning: changing an app handle permanently changes its Shopify admin URL and can break existing bookmarks.

## Development Workflow

`shopify app dev` creates an isolated preview on the selected dev store:

- Changes are visible only on that dev store.
- Config and extensions sync in real time.
- App URL updates are preview-only and do not modify TOML.
- The preview persists after stopping until `shopify app dev clean`.

Networking options:

- Cloudflare tunnel: default, standard development.
- Localhost: `shopify app dev --use-localhost` for simple frontend work without webhooks.
- Custom tunnel: `shopify app dev --tunnel-url <url>` for ngrok or corporate firewall cases.

Team workflow:

1. Share one development app and commit `shopify.app.toml`.
2. Each developer uses a personal dev store.
3. Run `shopify app dev` and select the personal dev store.
4. Keep preview changes isolated to avoid team conflicts.

## Multi-Environment Setup

Use named config files from one codebase:

```text
shopify.app.toml
shopify.app.staging.toml
shopify.app.production.toml
```

Create environment configs:

```bash
shopify app config link
shopify app config link
```

Switch environments:

```bash
shopify app config use staging
shopify app deploy --config production
```

## Deployment

`shopify app deploy` creates an immutable app version: a snapshot of config and extensions.

```bash
shopify app deploy
shopify app deploy --no-release
shopify app release --version <version>
shopify app versions list
```

Deploy pushes config and extensions only. Deploy the web app separately to its hosting provider.

For non-interactive CI/CD deployments:

```bash
shopify app deploy --config production --force
```

## Common Tasks

Add a permission scope:

1. Edit `shopify.app.toml` and add the scope to `access_scopes.scopes`.
2. Run `shopify app dev`; scope changes are auto-accepted on dev stores.
3. Deploy staging with `shopify app deploy --config staging`.
4. Deploy production with `shopify app deploy --config production`.

Add webhook subscriptions:

```toml
[[webhooks.subscriptions]]
topics = ["orders/create", "orders/updated"]
uri = "/webhooks/orders"
```

Test webhooks locally:

```bash
shopify app webhook trigger --topic orders/create --address http://localhost:3000/webhooks
```

Clean up a dev store:

```bash
shopify app dev clean
```

Warning: `dev clean` deletes data tied to preview-only extensions, such as discounts using unreleased functions.

## Troubleshooting

Tunnel issues:

```bash
shopify app dev --tunnel-url https://your-ngrok-url.ngrok.io
```

Permission denied on dev store: access scope changes require reinstallation or `shopify app dev`, which auto-accepts scopes on dev stores.

Extension not appearing:

1. Check extension registration with `shopify app info`.
2. Verify extension TOML in the `extensions/` directory.
3. Restart `shopify app dev` if the extension was added during the session.
