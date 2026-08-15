# Proposal: Conversations History Fix

## Intent

Merchants cannot see conversation history in the Shopify Admin dashboard, and
when conversations do exist, navigation to the detail view crashes. Two confirmed
bugs block end-to-end validation:

1. **Bug 1 — Proxy not persisting conversations locally**: the storefront widget
   hits `/apps/fluxbot/chat` correctly and HMAC is signed by Shopify, but zero
   rows land in `fluxbot_dev.conversations` during quickstart. The root cause is
   unknown without running the tunnel — we need a reproducible integration test.

2. **Bug 2 — Detail navigation crash**: fixed in commits 3a92e23 (`Button →
   <Link>`) and 4fdd226 (`RangeError: Invalid time value` in `normalizeMessage`),
   but unverifiable locally because Bug 1 leaves the DB empty.

The objective is a working, locally verifiable conversations history with detail
navigation in the Shopify Admin, confirmed by automated tests.

## Scope

### In Scope
- Integration test that reproduces the proxy POST flow without a tunnel (proves
  or disproves the HMAC/shop-lookup path — finds the real root cause of Bug 1)
- Fix whatever the test exposes (shop lookup failure, HMAC secret mismatch,
  missing DB write, routing issue, etc.)
- Local conversation seed script so developers can validate the history UI
  without triggering the widget manually
- End-to-end validation of the `<Link>` fix (Bug 2) using the seeded data,
  including the `normalizeMessage` date guard

### Out of Scope
- Double-write refactor between `fluxbot_dev` and `fluxbot_ia` DBs (known risk,
  not an active bug blocking the UI)
- Changes to the IA backend service
- Production deployment (changes will be validated locally first)

## Capabilities

### New Capabilities
- `proxy-chat-integration-test`: automated test that POSTs to `/apps/fluxbot/chat`
  with a Shopify-signed HMAC request, bypassing the tunnel, and asserts a
  conversation row is created in the DB

### Modified Capabilities
- `conversations-history`: existing history loader and list UI — receives seeded
  data to validate render and navigation; normalizeMessage date guard already
  applied, needs regression coverage

## Approach

1. **Reproduce first**: write a Vitest integration test that constructs a valid
   HMAC-signed proxy request (using the real `SHOPIFY_API_SECRET` from `.env`)
   and POSTs it against the proxy handler in-process. Assert a DB row is created.
   Run this test to expose the exact failure point.

2. **Fix the root cause**: based on test output, patch the proxy route (shop
   lookup, HMAC verification path, DB write, or session resolution). The
   `allowUnsignedInDevelopment` flag is a red herring — Shopify always sends
   HMAC, so the bypass never fires; the real failure is elsewhere.

3. **Seed script**: add a `scripts/seed-conversations.ts` (or npm script) that
   inserts realistic conversation + message rows into `fluxbot_dev` using the
   same schema the proxy writes to. Idempotent — safe to run repeatedly.

4. **Validate Bug 2 fixes**: with seeded data in place, run the admin UI locally,
   confirm the history list renders, click through to detail, and assert no
   `RangeError` or navigation crash. Add a unit test for `normalizeMessage` with
   an invalid date input.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/routes/apps.fluxbot.chat.tsx` (or equivalent proxy route) | Investigation + fix | Root cause of Bug 1 lives here |
| `app/routes/admin.conversations._index.tsx` | Validation | History list — tested with seeded data |
| `app/routes/admin.conversations.$id.tsx` | Validation | Detail view — Link fix + normalizeMessage guard |
| `app/utils/normalizeMessage.ts` (or inline) | Test added | Unit test for invalid date edge case |
| `scripts/seed-conversations.ts` | New | Local seed script |
| `tests/proxy-chat.integration.test.ts` | New | HMAC-signed proxy integration test |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Root cause of Bug 1 is in shop-lookup (shop not in `fluxbot_dev.shops`) | High | Integration test will expose this; fix shop upsert on first proxy hit |
| HMAC secret in `.env.local` differs from the one Shopify uses | Med | Test uses the real secret from env; document how to verify parity |
| Seed script schema drifts from actual proxy write schema | Low | Derive seed from the same Prisma model the proxy uses; one source of truth |
| `normalizeMessage` fix is correct but date guard has an edge case | Low | Unit test covers `null`, `undefined`, empty string, and invalid ISO strings |

## Rollback Plan

- Integration test and seed script are additive (no production risk).
- Proxy fix: revert the specific commit. HMAC verification path has no persistent
  state outside the DB row creation; rolling back removes the write, not data.
- Bug 2 fix commits (3a92e23, 4fdd226) are already in main; if regression appears,
  revert those two commits and re-examine.

## Dependencies

- `SHOPIFY_API_SECRET` must be present in `.env` or `.env.local` to run the
  integration test (already required for the proxy to work)
- Prisma client must be available in the test environment (already in the project)

## Success Criteria

- [ ] Integration test passes: POST to proxy handler creates a row in `fluxbot_dev.conversations`
- [ ] Running `npm run seed:conversations` populates the DB with ≥ 5 conversations
- [ ] Admin history list renders seeded conversations without errors
- [ ] Clicking a conversation row navigates to `/admin/conversations/:id` without crash
- [ ] No `RangeError: Invalid time value` in any message render path
- [ ] Unit test for `normalizeMessage` covers invalid date inputs and passes
- [ ] `npm run qa:gate` green after all changes
