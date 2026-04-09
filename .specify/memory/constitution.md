# FluxBot Studio — Constitution

## Core Principles

### I. Separated Architecture (NON-NEGOTIABLE)
This repository (`fluxbot-studio-ia`) owns **only** the Shopify frontend layer: embedded admin app, storefront widget, Shopify data projections, compliance, and sync pipelines. All LLM orchestration, embeddings, RAG, and intent detection live in the separate backend repo (`fluxbot-studio-back-ia`). No provider API keys (OpenAI, Anthropic, Gemini) ever enter this repo. Communication is exclusively via `IAGateway` HTTP client pointing to `IA_BACKEND_URL`.

### II. Shopify-First Platform Integration
All Shopify data access goes through Admin GraphQL API with an explicit versioned client. Theme App Extensions / App Embed Blocks are the required mechanism for storefront integration — script tags are explicitly forbidden as a primary approach. Webhooks drive all incremental sync. Bulk operations are used when catalog volume justifies it.

### III. Regression Safety (NON-NEGOTIABLE)
After **every** change to production code, `npm test` must be executed from `apps/shopify-admin-app/`. The Phase 0 suite (68/68 tests) must always pass. A failing Phase 0 test is a blocker — no further changes until the regression is fixed. The complete expected baseline is 971+ tests passing.

### IV. Multi-Tenant by Design
Every database query, service call, and API response is scoped by `shopId`. There is no global state shared between merchants. Prisma queries always include a `where: { shopId }` filter. Logs always include `shopId` in structured fields.

### V. Security and Privacy by Default
Secrets are never hardcoded. PII is minimized in logs and redacted before external transmission. Rate limiting is applied at all public-facing endpoints. Every action that modifies data is audited with a timestamp, actor, and outcome. GDPR compliance is a design constraint, not a post-hoc addition.

### VI. Observability is Mandatory
Every service boundary emits structured logs with: `timestamp`, `level`, `service`, `shopId`, `conversationId`, `requestId`, `action`, `outcome`, `latencyMs`. Errors are never silenced. All domain errors are mapped from infrastructure errors.

### VII. TypeScript Strict Mode
`strict: true` in all TypeScript configs. `any` is forbidden except in isolated adapter boundaries with an explicit comment. Zod validates all external inputs. All function signatures are fully typed.

## Architecture Constraints

- **Frontend stack**: Shopify Remix app, React, Polaris, App Bridge, Prisma + PostgreSQL
- **No LLM code in this repo**: Use `iaClient` from `apps/shopify-admin-app/app/services/ia-backend.client.ts`
- **API versioning**: Shopify Admin GraphQL pinned to `2026-01`; upgrade requires explicit ADR
- **Widget embed**: Theme App Extension with App Embed Block only — Lighthouse impact must stay < 5 points
- **Queue pattern**: Heavy sync jobs use async workers (`sync-worker.server.ts`); no blocking inline processing
- **Error budget**: Phase 0 suite must be green on every commit; Phase 1 E2E may be skipped in CI if DB is unavailable (tracked in REQ-OPEN-005)

## Development Workflow

1. Create feature branch named `NNN-kebab-feature-name` (e.g., `001-storefront-widget`)
2. Fill `.specify/` spec file for the feature before writing code
3. Write failing tests first (unit + integration)
4. Implement until tests pass
5. Run `npm test` — must show 0 failures in Phase 0
6. Commit with conventional commit message + Co-authored-by Copilot trailer
7. Update `.openspec.json` requirement status to `completed` with evidence

## Governance

This constitution supersedes all other development practices in this repository. Amendments require an ADR committed to `documentation/adr/`. The `STATUS_MATRIX.md` in the repo root is the canonical source of truth for phase completion status — not README files or individual docs. All agents and contributors must read `constitution.md` before generating or reviewing code.

**Version**: 1.0.0 | **Ratified**: 2026-04-09 | **Last Amended**: 2026-04-09
