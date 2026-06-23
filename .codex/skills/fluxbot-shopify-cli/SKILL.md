---
name: fluxbot-shopify-cli
description: Use when working in FluxBot Studio Shopify Admin and the task involves Shopify CLI, Admin preview, Shopify app config validation, store-scoped Shopify CLI operations, or troubleshooting Shopify dev tunnels. Prefer this wrapper over generic Shopify CLI guidance because it applies the local Shopify repo launchers, backend health dependency, store selection, and FluxBot governance first.
compatibility: Requires Node.js, Shopify CLI, and the FluxBot Shopify repo layout.
metadata:
  author: FluxBot Studio
  version: "1.0.0"
---

# FluxBot Shopify CLI

Use this wrapper before generic Shopify CLI instructions inside `fluxbot-studio-ia-shopify`.

## Priority

1. Follow root `copilot-instructions.md`, root `UNIFIED_AGENT_CRITERIA.md`, this repo `AGENTS.md`, and local `.agents` instructions.
2. For generic Shopify CLI behavior, use `shopify-use-shopify-cli`.
3. Use local `shopify-cli` for app lifecycle, TOML, multi-environment, deployment, webhook testing, and CI/CD workflow guidance; project governance and `shopify-use-shopify-cli` remain authoritative for command execution details.

## Local Launchers

From the workspace root, prefer:

```bash
scripts/dev-shopify-admin-local.sh
```

For the complete workspace, use:

```bash
scripts/dev-all.sh
```

For fast restarts, add `--skip-migrations` only after Prisma generate/migrations are already current. For a specific dev store, pass `--shop=<store>.myshopify.com` or set `SHOPIFY_SHOP` / `SHOPIFY_DEV_STORE_URL`.

The Shopify CLI preview URL is the `Install app` or `Using URL` entry in `.dev/logs/shopify.log`. The backend dependency must be healthy at `http://localhost:3001/health`.

## Shopify CLI Rules

- Validate app and extension config from this repo's app root with `shopify app config validate --json`.
- Discover command details with `shopify commands` and `shopify help <command>` when unsure.
- For store operations, authenticate first with `shopify store auth --store <store> --scopes <scopes>`, then run `shopify store execute --store <store> --query '...'`.
- Include `--allow-mutations` only for mutations.
- Use the narrowest scopes that satisfy the operation.

When executing Shopify CLI commands yourself, prefix them with:

```bash
SHOPIFY_CLI_AGENT_INFO="n:codex|v:1.0.0|p:openai" shopify ...
```

## FluxBot Boundaries

- Shopify Admin owns UX/admin configuration, not backend business logic.
- Tenant, token, domain, rate limit, conversation, RAG, and persistence behavior belongs in `fluxbot-studio-back-ia` and contracts.
- Contract changes go through `fluxbot-studio-contracts` before backend and clients.
- Do not invent endpoints or DTOs outside the generated/shared contracts.
