# Tasks: Conversations History Fix

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 180–260 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception (not needed — within budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | All 4 changes in one PR | PR 1 | `npx vitest run test/integration/proxy-chat-upsert.integration.test.ts` | `npm run seed:conversations` then verify row counts in psql | Revert `apps.fluxbot.chat.ts` hunk + delete 2 new files + remove `seed:conversations` script from package.json |

---

## Phase 1: Foundation — RED tests (write failing tests first)

- [x] TASK-CONV-001 **RED: integration test for proxy upsert**
  - Create `test/integration/proxy-chat-upsert.integration.test.ts`
  - Mock `db.server`, `ia-gateway.server`, `admin-config.server`; do NOT mock `shopify-proxy-auth.server`
  - 4 `it()` blocks: happy-path upsert, shop no-duplicate, missing message → 400, existing conversationId → 200 no dup
  - Run: `npx vitest run test/integration/proxy-chat-upsert.integration.test.ts` → must FAIL (findUnique throws / returns null)
  - Est. lines: ~90 | Deps: none

- [x] TASK-CONV-002 **RED: normalizeMessage invalid-date test**
  - In `test/unit/routes/app.conversations.$id.test.ts`, add scenario: `createdAt = null` / `undefined` → no `RangeError`
  - Run: `npx vitest run test/unit/routes/app.conversations.\$id.test.ts` → must FAIL or confirm already GREEN (document result)
  - Est. lines: ~15 | Deps: none

---

## Phase 2: Core Implementation — GREEN

- [x] TASK-CONV-003 **GREEN: replace findUnique with upsert in proxy action**
  - File: `apps/shopify-admin-app/app/routes/apps.fluxbot.chat.ts`, lines ~549–552
  - Replace `prisma.shop.findUnique(...)` + 404 block with `prisma.shop.upsert({ where:{domain:shopDomain}, create:{domain:shopDomain, accessToken:"", status:"ACTIVE"}, update:{} })`
  - Run: `npx vitest run test/integration/proxy-chat-upsert.integration.test.ts` → must PASS
  - Run: `npx vitest run test/unit/routes/apps.fluxbot.chat.test.ts` → must stay GREEN (no regression)
  - Est. lines: ~8 | Deps: TASK-CONV-001

- [x] TASK-CONV-004 **GREEN: normalizeMessage invalid-date guard**
  - File: `apps/shopify-admin-app/app/routes/app.conversations.$id.ts` (or utils file containing `normalizeMessage`)
  - Wrap date parsing in try/catch or null-guard; return safe fallback string if `createdAt` is null/undefined/invalid
  - Run: `npx vitest run test/unit/routes/app.conversations.\$id.test.ts` → must PASS
  - Est. lines: ~8 | Deps: TASK-CONV-002

- [x] TASK-CONV-005 **Threat RED: HMAC production bypass guard**
  - In `test/integration/proxy-chat-upsert.integration.test.ts`, add `it("returns 401 when NODE_ENV=production and signature absent")`
  - Set `process.env.NODE_ENV = "production"`, send request without `signature` param, expect 401
  - Run: must PASS against `verifyShopifyProxyRequest` real behavior (no code change expected)
  - Est. lines: ~15 | Deps: TASK-CONV-001

- [x] TASK-CONV-006 **Threat RED: token overwrite guard**
  - In `test/integration/proxy-chat-upsert.integration.test.ts`, add `it("does not overwrite existing accessToken on upsert")`
  - Mock shop already has `accessToken: "real-token"`, run proxy POST for same domain, assert `prisma.shop.upsert` called with `update: {}`
  - Run: must PASS after TASK-CONV-003
  - Est. lines: ~15 | Deps: TASK-CONV-003

---

## Phase 3: Seed Script

- [x] TASK-CONV-007 **Create idempotent seed script**
  - Create `apps/shopify-admin-app/scripts/seed-conversations.ts`
  - Uses `PrismaClient` directly (no HTTP)
  - `SEED_SHOPS = ["quickstart-c8cc9986.myshopify.com", "test-2-grow.myshopify.com"]`
  - 2 conversations × ≥ 3 messages each per shop, alternating USER/ASSISTANT roles
  - All upserts by stable ID — re-run produces identical row count
  - Add to `apps/shopify-admin-app/package.json`: `"seed:conversations": "tsx scripts/seed-conversations.ts"`
  - Run twice, assert same row count (manual verification or add assertion in script exit log)
  - Est. lines: ~80 | Deps: TASK-CONV-003

---

## Phase 4: Regression Gate

- [x] TASK-CONV-008 **Full suite regression check**
  - Run `npm test` from `apps/shopify-admin-app`
  - All 68+ existing tests must pass (Fase 0 contract)
  - Run `npx vitest run test/integration/` to confirm no new integration failures
  - Est. lines: 0 (no code change) | Deps: all previous tasks

---

## Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| Phase 1 | 2 | RED tests (failing) |
| Phase 2 | 4 | GREEN + threat guards |
| Phase 3 | 1 | Seed script |
| Phase 4 | 1 | Regression gate |
| **Total** | **8** | |

**Estimated total changed lines:** ~230 (90 integration test + 15 normalizeMessage test + 30 threat tests + 8 proxy fix + 8 normalizeMessage fix + 80 seed script)

**Files touched:**
1. `test/integration/proxy-chat-upsert.integration.test.ts` — CREATE
2. `test/unit/routes/app.conversations.$id.test.ts` — MODIFY (add scenario)
3. `app/routes/apps.fluxbot.chat.ts` — MODIFY (~8 lines)
4. `app/routes/app.conversations.$id.ts` — MODIFY (~8 lines)
5. `scripts/seed-conversations.ts` — CREATE
6. `package.json` (shopify-admin-app) — MODIFY (add script)
