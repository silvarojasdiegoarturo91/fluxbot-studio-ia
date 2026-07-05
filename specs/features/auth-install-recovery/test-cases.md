# Test Cases — Auth Install Recovery

## Scope

This suite validates that Fluxbot does not remain stuck on Shopify's intermediate **"Handling response"** screen across:

1. fresh install from zero,
2. uninstall + reinstall lifecycle,
3. expired-session auth bounce recovery.

## Automated tests

### Unit tests

- **UT-AIR-001** `test/unit/authenticate-admin.server.test.ts`
  - Redirects document requests with expired session to `/auth/session-token`.
  - Preserves required embedded params.
- **UT-AIR-002** `test/unit/authenticate-admin.server.test.ts`
  - Rebuilds `shopify-reload` without recursion (no nested `shopify-reload=`).
- **UT-AIR-003** `test/unit/authenticate-admin.server.test.ts`
  - Keeps non-document requests behavior unchanged (no false redirect).
- **UT-AIR-004** `test/integration/auth-session-token-route.test.ts`
  - Root loader redirects `/?shop=...` directly to `/auth/login?shop=...` for install/reinstall OAuth grant start.

### Integration tests

- **IT-AIR-001** `test/integration/webhooks-lifecycle.test.ts`
  - `app/uninstalled` resets onboarding metadata and completion state.
- **IT-AIR-002** `test/integration/webhooks-lifecycle.test.ts`
  - Unauthenticated webhook requests are rejected (lifecycle safety).
- **IT-AIR-003** `test/unit/services/shop-context.server.test.ts`
  - `ensureShopRecord()` syncs `accessToken` to IA backend and resets onboarding when reinstalling cancelled shops.

### E2E smoke tests

- **E2E-AIR-001** `tests/e2e/smoke/install-auth-flow.spec.ts`
  - Install bootstrap query at `/` forwards correctly to `/app`.
- **E2E-AIR-002** `tests/e2e/smoke/install-auth-flow.spec.ts`
  - `/app` initial install landing responds without 5xx.
- **E2E-AIR-003** `tests/e2e/smoke/install-auth-flow.spec.ts`
  - Reinstall expected onboarding route (`/app/onboarding`) responds without 5xx.

## Manual QA checklist (Shopify real flow)

1. Install app from Partner Dashboard in a clean store.
2. Approve scopes.
3. Confirm app reaches usable Fluxbot UI automatically (no refresh).
4. Uninstall app.
5. Reinstall app and approve scopes again.
6. Confirm onboarding appears and auth does not remain in "Handling response".

## Exit criteria

- Unit + integration + E2E smoke tests pass.
- No reproducible manual case where merchant must refresh after install authorization.
