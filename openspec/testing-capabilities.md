# Testing Capabilities — fluxbot-studio-ia-shopify

**Strict TDD Mode**: enabled
**Detected**: 2026-08-16
**Persistence**: openspec (files). Engram not available in this runtime.

## Test Runner

- Command: `npm --workspace @fluxbot/shopify-admin-app run test` (equivalent: `npm test` inside `apps/shopify-admin-app`)
- Framework: Vitest 2.1.8 (v8 coverage, jsdom + node env match globs via `environmentMatchGlobs`)
- Config: `apps/shopify-admin-app/vitest.config.ts`
- Watch/UI: `test:watch` (vitest), `test:ui` (vitest --ui)

## Test Layers

| Layer | Available | Tool |
| ----------- | --------- | ----------- |
| Unit | ✅ | Vitest + @testing-library/react (jsdom) — `test/unit/`, `test/components/`, `app/routes/**/*.test` |
| Integration | ✅ | Vitest + real Postgres test (5433) / Redis (6380) via `docker-compose.test.yml` — `test/integration/`, `test/contracts/` |
| E2E | ✅ | Playwright 1.59 (chromium) — `tests/e2e/` on port 3002, test DB 5433 |

## Coverage

- Available: ✅
- Command: `npm --workspace @fluxbot/shopify-admin-app run test:coverage` (`vitest run --coverage`, v8, text/json/html)
- Coverage excludes: node_modules, build, .react-router, .shopify, test/, tests/e2e/, scripts/, app/generated/, configs, d.ts

## QA Gate

- Command: `npm run qa:gate` (repo root)
- Pipeline: `contracts:check` → `openspec:validate:strict` → `build` → `lint` → `typecheck` → `test:app-store-compliance` → `test`
- Full: `qa:gate:full` adds `test:e2e`; `qa:smoke` runs `test:e2e:smoke:ci`

## Quality Tools

| Tool | Available | Command |
| ------------ | --------- | -------------- |
| Linter | ✅ | `npm --workspace @fluxbot/shopify-admin-app run lint` (ESLint 8, cached) |
| Type checker | ✅ | `npm --workspace @fluxbot/shopify-admin-app run typecheck` (react-router typegen + tsc --noEmit) |
| Formatter | ✅ (no root script) | Prettier 3.6.2 available as devDependency; run via `npx prettier` |

## E2E Details

- Config: `apps/shopify-admin-app/playwright.config.ts` (testDir `./tests/e2e`, testMatch `**/*.spec.ts`)
- Server: `dev:e2e` — `NODE_ENV=test react-router dev` on port 3002; CI uses `E2E_SKIP_SERVER=1`
- Projects: chromium only; fullyParallel, retries 1 in CI, HTML + list reporters, trace/screenshot/video on failure
- Suites: `tests/e2e/{chatbot,dashboard,onboarding,regression,smoke}/` + factories, fixtures, helpers, setup

## Strict TDD Resolution

- No explicit strict TDD marker/config found in repo agent files.
- Test runner exists (Vitest) → fallback default `strict_tdd: true`.
- Previous change `conversations-history-fix` used RED-first tasks ("Phase 1: Foundation — RED tests") — consistent with TDD.
- Global runtime marker present (`gentle-ai:strict-tdd-mode` enabled) → honored.
