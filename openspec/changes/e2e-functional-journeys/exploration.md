# Exploration: e2e-functional-journeys

**Artifact store**: openspec (files)
**Scope**: `fluxbot-studio-ia-shopify` (apps/shopify-admin-app E2E layer)
**Date**: 2026-08-16
**Status**: ready-for-proposal

## Current State

The Playwright E2E layer (`apps/shopify-admin-app/tests/e2e/`) exists but only covers **render/smoke depth**:

- `smoke/` (`app-loads`, `pages`, `install-auth-flow`), `dashboard/`, `onboarding/` (3 render-only tests), `chatbot/settings` (render), `regression/` (non-5xx on protected routes) — all shallow.
- `chatbot/widget-config-parity.spec.ts` is the closest to functional: it injects the real widget (`extensions/chat-widget/assets/chat-launcher.js` + CSS) into an inline harness HTML, but **skipped unless `RUN_WIDGET_VISUAL_E2E=1`** and it stubs **all** `window.fetch`.
- There is **no functional journey test**: nothing opens the widget and chats, nothing asserts session persistence, no conversation history test (global-setup does not seed conversations → `/app/conversations` renders `EmptyState`), and onboarding is never completed through the UI.
- Infra: `playwright.config.ts` → testDir `tests/e2e`, single webServer `npm run dev:e2e` (port 3002, `E2E_TEST_MODE=true`, test PG `5433/test_db`, `E2E_SKIP_SERVER=1` in CI), chromium only, retries 1 in CI. `global-setup.ts` upserts test shop (`quickstart-c8cc9986.myshopify.com`) with `COMPLETED_ADMIN_SETUP` in `Shop.metadata.adminSetup` + `ChatbotConfig` + one `ProductProjection` (idempotent).

### Verified chat contract (widget ↔ app)

- Widget POSTs `/apps/fluxbot/chat` with `{ message, conversationId, sessionId, visitorId, locale, traceId, context: { shop, locale, customerId?, customerEmail?, url, referrer } }` + `X-FluxBot-Trace-Id` header.
- App route (`apps.fluxbot.chat.ts`) verifies proxy HMAC (`allowUnsignedInDevelopment` → passes in `NODE_ENV=test`), resolves shop from `?shop=` or `X-Shopify-Shop-Domain`, upserts shop, gets/creates `Conversation` (stale conversationId → sessionId recovery, committed `f8bec88`), calls `getIAGateway().chat` (`IA_EXECUTION_MODE=remote` → `iaClient.chat.send` POST `/api/v1/chat` with `Authorization: Bearer IA_BACKEND_API_KEY` + `X-Shop-Domain`), persists `USER`+`ASSISTANT` messages, global catch returns `success:true` + `safeFallbackMessage`.
- Response contract consumed by widget: `{ success, conversationId, message, confidence, requiresEscalation, actions, metadata.products, sourceReferences, traceId }`. Widget stores `conversationId` in `sessionStorage['fluxbot_conversation_id']` (`saveConversationState`), `visitorId` in `localStorage['fluxbot_visitor_id']`, `sessionId` in `sessionStorage['fluxbot_session_id']`, consent in `localStorage['fluxbot_consent']`.
- Widget timing constraints: 500ms send debounce, 20 msgs/min rate limit, `MAX_RETRIES=3` + endpoint fallback retry, proactive poll every 15s, GDPR consent banner on first visit.

### Verified app-proxy gap (critical for the harness)

`buildProxyHeaders()` sends **no** `X-Shopify-Shop-Domain` header and the widget fetches `/apps/fluxbot/widget-config` with **no `shop` query param**. On a real storefront, Shopify's app proxy injects `?shop=`. A local storefront harness must **emulate that injection** or the real widget-config route returns 400.

### Verified back-ia facts (for N2)

- Auth: `X-Shop-Domain` + `Authorization: Bearer`; expected key = `IA_BACKEND_API_KEY || BACKEND_API_KEY || MASTER_API_KEY`; `ALLOW_DYNAMIC_SHOP_CONTEXT` defaults true outside production → **no IA-DB shop seeding required**.
- `LLMProviderFactory.fromEnvironment()`: `LLM_PROVIDER=MOCK` requires `NODE_ENV=test && ALLOW_MOCK_LLM=true`, else `LLMConfigurationError`. `MockLLMAdapter` returns deterministic text (`Claro, cuéntame un poco más y te ayudo con eso.`).
- Health endpoint: `GET /api/v1/widget/health` (port 3001). No docker-compose; startup `prisma.$connect` exits(1) on DB failure → needs a reachable PG.
- Test pattern already exists for `postgresql://fluxbot_test:fluxbot_test@localhost:5433/fluxbot_ia_test` (`test:chat:training:db` script).
- Frontend `.env.test` already matches: `IA_EXECUTION_MODE=remote`, `IA_BACKEND_URL=http://localhost:3001`, `IA_BACKEND_API_KEY=dev_master_key` (back-ia `.env` has `MASTER_API_KEY=dev_master_key`).

### Adjacent change state

- `conversations-history-fix`: archived intentionally-partial (specs synced to main; folder **not** moved to `archive/`). Contains `proxy-chat-integration-test` spec (REQ-CONV-001, integration-level, real DB). This change is **separate**; do not touch that folder.
- Uncommitted WIP in `apps.fluxbot.chat.ts`: **5 lines of extra logging only** (contentType/bodyKeys/messagePreview/conversationId/sessionId in the action-start log) — no behavior change. Tests must target committed behavior and the file must stay out of this change's commits.

## Affected Areas

- `apps/shopify-admin-app/playwright.config.ts` — webServer becomes an array: app server (port 3002, skip via `E2E_SKIP_SERVER`) + static storefront server (port 3003) + conditional back-ia server (N2).
- `apps/shopify-admin-app/tests/e2e/storefront/storefront.html` — NEW harness page: real launcher DOM (`#fluxbot-chat-launcher`, `#fluxbot-chat-window`, `#fluxbot-chat-form`, `#fluxbot-chat-input`), loads real `chat-launcher.js`/`.css`.
- `apps/shopify-admin-app/tests/e2e/storefront/server.mjs` — NEW ~40-line Node http server: serves harness + widget assets, emulates the Shopify app proxy (injects `?shop=<TEST_SHOP_DOMAIN>` + `X-Shopify-Shop-Domain`, forwards `/apps/fluxbot/*` → `E2E_BASE_URL`).
- `apps/shopify-admin-app/tests/e2e/setup/global-setup.ts` — seed 2–3 idempotent conversations (known IDs, past `startedAt`, USER/ASSISTANT messages, mixed statuses) for the test shop right after shop upsert.
- `apps/shopify-admin-app/tests/e2e/fixtures/index.ts` — add `storefrontPage` fixture; `tests/e2e/fixtures/mocks/widget-contract.ts` — chat-contract mock + route setup.
- `apps/shopify-admin-app/tests/e2e/journeys/visitor-widget.spec.ts` — NEW (N1, CI).
- `apps/shopify-admin-app/tests/e2e/journeys/owner-admin.spec.ts` — NEW (history, settings, widget settings, onboarding).
- `apps/shopify-admin-app/tests/e2e/journeys/visitor-fullstack.spec.ts` — NEW (N2, gated `RUN_FULLSTACK_E2E=1`).
- `apps/shopify-admin-app/package.json` — scripts `test:e2e:journeys`, `test:e2e:fullstack` (+ DB-prep step).
- NOT touched: `apps.fluxbot.chat.ts` (WIP), `apps/storefront-widget/*`, `openspec/changes/conversations-history-fix/`.

## Approaches

### 1. Storefront simulation

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| A. Inline harness + `window.fetch` stub (parity style) | Zero infra; no new ports | Stubs ALL fetch; `about:blank` origin (no real HTTP); cannot assert request payloads via route handlers; no app-proxy realism; retry/fallback paths untestable | Low |
| B. Static server :3003 + app-proxy emulation + `page.route` for chat | Real origin/HTTP; emulates Shopify proxy (`?shop=` injection); payload assertions; **shared harness for N1 and N2**; retry/fallback observable | Extra webServer entry (~40 lines); CI `E2E_SKIP_SERVER` must skip only the app server | Medium |
| C. Same-origin harness in `public/` + `page.route` | No extra server | Test artifact ships in prod build; couples harness to app server; real chat route hit → non-deterministic without backend | Low-Med |

**Recommendation: B.** It is the only option that lets N2 reuse the exact same storefront page (difference is only whether the chat route is mocked).

### 2. Conversation seeding (owner history)

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| A. Extend global-setup (idempotent upsert by known IDs, after shop upsert) | Deterministic for all suites; mirrors existing pattern; zero per-spec boilerplate | Conversations always present → no empty-state coverage (none exists today) | Low |
| B. Per-spec seed helper + `beforeEach` | Scoped control per spec | Duplicated wiring; more code to maintain | Med |
| C. Dedicated seed script + flag | Explicit opt-in | Extra flag/complexity; easy to forget in CI | Med |

**Recommendation: A.**

### 3. N1 chat mock placement

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| A. `page.route` browser interception of `**/apps/fluxbot/chat` with contract-shaped response + stateful conversationId | Deterministic, zero backend, spec-compliant ("Playwright intercepta POST /apps/fluxbot/chat"); request bodies assertable; widget-config stays REAL | Route handler not exercised in N1 (by design; N2 covers it) | Low |
| B. Server-side mock (env hook into `AIOrchestrationService` / gateway) | Exercises the route in N1 | Requires app test-hook plumbing; couples to orchestration; slower; more moving parts | High |

**Recommendation: A.** widget-config stays real through the proxy (deterministic via global-setup seed), so config-parity is exercised with zero mocking.

### 4. N2 back-ia bootstrap

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| A. npm script (`test:e2e:fullstack`) prepares DB (create `fluxbot_ia_test` on 5433 + `prisma migrate deploy`) and Playwright webServer gains a third conditional entry (back-ia on :3001 with `NODE_ENV=test LLM_PROVIDER=MOCK ALLOW_MOCK_LLM=true MASTER_API_KEY=dev_master_key`) | Self-contained per run; CI-ready; lifecycle managed | Playwright owns back-ia lifecycle; failure diagnosis via webServer timeout | Med |
| B. External launcher script (documented) | Full control | Not CI-friendly; drift risk | Low |

**Recommendation: A** (DB-prep step as a small script invoked before Playwright; back-ia as conditional webServer entry gated on `RUN_FULLSTACK_E2E=1`).

## Recommendation

Two-tier fidelity:

- **N1 (CI, mandatory)**: `journeys/visitor-widget.spec.ts` + `journeys/owner-admin.spec.ts`. Storefront harness on :3003 (approach 1B), real widget-config through the proxy, `page.route` chat mock (approach 3A), conversations seeded in global-setup (approach 2A). Owner journey: history list + detail, settings persistence, widget settings → widget-config parity (functional part always on), onboarding completed end-to-end on a **fresh shop** (helper seeds `onboardingCompleted=false`; asserts redirect to `/app`, `ChatbotConfig.onboardingCompleted`, `Shop.metadata.adminSetup`, widget-config payload).
- **N2 (opt-in, `RUN_FULLSTACK_E2E=1`)**: `journeys/visitor-fullstack.spec.ts` reuses the same harness with no chat mock → real widget → real route → real back-ia (MockLLM) → response rendered, then the new conversation visible in `/app/conversations` (server-side persistence proof).

Widget constraints handled: pre-seed consent (`localStorage['fluxbot_consent']`) via `addInitScript`; wait ≥500ms between sends; assert storage keys for persistence; reload page to prove `conversationId` reuse (route handler asserts the second POST carries the same conversationId).

## Risks

- **MEDIUM — WIP in `apps.fluxbot.chat.ts`**: uncommitted 5-line logging diff (verified behavior-neutral). Must remain out of this change's commits; tests target committed behavior (stale-id recovery by sessionId). User should commit/stash before `sdd-apply`.
- **MEDIUM — Partial archive of `conversations-history-fix`**: folder still in `openspec/changes/` (not moved to `archive/`). New change is fully separate; ensure `openspec:validate:strict` passes with both present.
- **MEDIUM — N2 back-ia bootstrap**: needs `fluxbot_ia_test` DB on 5433 + migrations; back-ia `.env` defaults `LLM_PROVIDER=OPENAI` → env overrides mandatory or startup throws `LLMConfigurationError`; Sentry/rate-limit/billing side-effects must not break under `NODE_ENV=test`.
- **MEDIUM — Widget timing/consent behaviors**: 500ms debounce, rate limit, consent banner, proactive poll (15s), retry/fallback — tests that ignore these flake. Pre-seed consent and respect debounce.
- **LOW-MED — Widget asset duplication**: `extensions/chat-widget/assets` exists in both `apps/shopify-admin-app` and `apps/storefront-widget` (currently byte-identical). Harness reads the admin copy (same as parity); drift risk → optional CI parity check as follow-up.
- **LOW — CI runtime**: `workers=1`, more tests + a second server entry lengthen the suite; keep N1 lean (~8–12 tests) and the static server dependency-free.

## Ready for Proposal

Yes. The orchestrator should tell the user: scope is a new `journeys/` E2E suite with a two-tier fidelity model (deterministic N1 in CI via browser-level chat mock + real proxy config; opt-in N2 with the real IA backend on MockLLM), a tiny static storefront server that emulates the Shopify app proxy, conversation seeding in global-setup, and full onboarding completion on a fresh shop. The uncommitted change in `apps.fluxbot.chat.ts` is behavior-neutral (logging only) and will be left untouched.
