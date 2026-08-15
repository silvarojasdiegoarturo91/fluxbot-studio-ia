# Archive Report: conversations-history-fix

**Status**: archived (intentional-with-warnings — partial archive, see below)
**Archived on**: 2026-08-15
**Artifact store**: hybrid (OpenSpec filesystem + Engram)
**Engram observation IDs**: verify-report #159 (`sdd/conversations-history-fix/verify-report`), apply-progress #158 (`sdd/conversations-history-fix/apply-progress`); this report # (self)

## Intentional Partial Archive — Reason

The orchestrator explicitly instructed **not to move or delete the change folder**
(`openspec/changes/conversations-history-fix/`) at archive time — the user wants to
review it before final relocation. Per that override:

- Delta specs WERE synced to main specs (source of truth updated).
- The change folder was NOT moved to `openspec/changes/archive/YYYY-MM-DD-conversations-history-fix/`.
- Status was marked archived in `.openspec.json` (DOC entries completed).
- The archive is recorded as **intentional-with-warnings** per the partial-archive policy.

The change folder remains fully intact at `openspec/changes/conversations-history-fix/`
for review. A follow-up move to the archive directory can be performed later without
re-running verification.

## Final-State Authority

This report reflects the state of the change AT CLOSE, ranked per the Final-State
Authority hierarchy:

1. Persisted tasks artifact — `tasks.md`: 8/8 tasks `[x]`, 0 unchecked (verified in change folder).
2. Explicit final-state facts from the orchestrator launch prompt (most recent account):
   - Implementation completed and pushed to `main` (commits `63b5736`, `71aca87`, `664bff7`).
   - Verify final: PASS with warnings, 0 CRITICALs.
   - Full suite: 2131 tests passing, typecheck clean.
   - Real-DB integration test: 6/6 passing.
   - Seed idempotent: 2 shops, 4 conversations, 16 messages (repeated run identical).
   - Design reconciled with real-DB strategy (docs commit `71aca87`).
3. Intermediate snapshots (valid at their write time, superseded where later evidence exists):
   - `verify-report.md` (obs #159): PASS with warnings; 4/4 requirements, 11/11 scenarios compliant; 0 blockers, 0 CRITICALs.
   - `apply-progress.md` (obs #158): summary format; no formal TDD cycle evidence table (formatting gap only — substantive TDD evidence independently verified).

## What Was Implemented

1. **Shop auto-upsert in proxy chat route** — `app/routes/apps.fluxbot.chat.ts`:
   replaced `prisma.shop.findUnique` + 404 block with `prisma.shop.upsert`
   (`where: {domain}`, `create: {domain, accessToken: "", status: "ACTIVE"}`, `update: {}`),
   so the first widget POST creates the shop row without overwriting real tokens.
2. **Reproducible in-process integration test** — `test/integration/proxy-chat-upsert.integration.test.ts`:
   calls the proxy `action()` directly (no Shopify CLI tunnel), bypasses HMAC via
   `NODE_ENV=test` + absent signature, runs against the REAL `fluxbot_dev` PostgreSQL
   (Prisma NOT mocked per REQ-CONV-001). Covers upsert happy path, no-duplicate,
   400 missing message, existing-conversationId no-dup, plus threat guards
   (401 in production without signature; no token overwrite on upsert).
3. **Idempotent seed script** — `scripts/seed-conversations.ts` + npm script
   `seed:conversations` (tsx); upserts by stable IDs for
   `quickstart-c8cc9986.myshopify.com` and `test-2-grow.myshopify.com`, 2 conversations
   × ≥ 3 messages each with alternating USER/ASSISTANT roles; re-run produces identical
   row counts.
4. **Conversation detail navigation + rendering stability** (previously committed in
   `3a92e23`, `4fdd226`): list rows navigate via React Router `Link`; `normalizeMessage`
   guards invalid/missing `createdAt` against `RangeError: Invalid time value`.

## Requirements Compliance (verified)

| Requirement | Scenario count | Status |
|-------------|----------------|--------|
| REQ-CONV-001 — Proxy Chat Persists Conversation | 4 | ✅ COMPLIANT |
| REQ-CONV-002 — Shop Auto-Upsert on First Proxy Hit | 2 | ✅ COMPLIANT |
| REQ-CONV-003 — Local Conversation Seed Script | 2 | ✅ COMPLIANT |
| REQ-CONV-004 — Conversation Detail Navigation and Rendering | 3 | ✅ COMPLIANT |
| **Total** | **11/11** | **COMPLIANT** |

### Recorded Contradiction / Reconciliation

- The per-domain delta `specs/proxy-chat-integration-test/spec.md` (written 10:41)
  contained the scenario "Unknown shop returns 404". The reconciled root `spec.md`
  (13:07) and the verify-report compliance matrix (obs #159, 13:12) replace it with
  "Unknown shop is auto-upserted (not 404)", coherent with REQ-CONV-002 and with the
  verified implementation (test shop `itest-proxy-upsert.myshopify.com` auto-created;
  404 applies only when an explicit `conversationId` does not belong to the shop).
  The main spec synced at archive time carries the RECONCILED scenario (authoritative
  final state per verify obs #159). The change-folder delta retains its original text;
  both sources and timestamps are recorded here for traceability.

## Tests

- Full suite (real `fluxbot_dev` DB, `DATABASE_URL=... npm test`): **2131 passed,
  76 skipped, 0 failed** (151 files), exit 0 — per verify-report obs #159 and confirmed
  final at close.
- Typecheck: `npx tsc --noEmit` exit 0, clean.
- Focused real-DB integration: `proxy-chat-upsert.integration.test.ts` → 6/6 passed.
- Seed idempotency: run #1 → 2 shops / 4 conversations / 16 messages; run #2 →
  identical counts.
- Coverage: not executed (changed-file scoped run not requested); informational only.

## Delivery State

- **Committed and pushed to `main`**: `63b5736` (fix + seed), `71aca87` (design
  reconciliation), `664bff7` (openspec DOC tracker update); plus earlier `3a92e23`
  and `4fdd226` (Link navigation, normalizeMessage guard).
- Working tree clean at archive time (`git status` empty).
- `.openspec.json`: DOC tracker entries for this change marked `completed`
  (`DOC-63b5736-2026-08-15T11-14-02-201Z`, `DOC-71aca87-2026-08-15T11-18-29-378Z`);
  `project.last_updated` refreshed.

## Main Specs Synced (source of truth)

| Domain | Action | Details |
|--------|--------|---------|
| `openspec/specs/conversations-history/spec.md` | Created (byte-identical copy) | REQ-CONV-003, REQ-CONV-004 |
| `openspec/specs/proxy-chat-integration-test/spec.md` | Created (copy + reconciled scenario) | REQ-CONV-001, REQ-CONV-002 |

- `diff -r` readback (source vs main) for `conversations-history`: empty (byte-identical PASS).
- `diff -r` readback for `proxy-chat-integration-test`: only the reconciled scenario block
  differs (documented above); all other bytes identical.

## Archive Contents

- `proposal.md` ✅
- `specs/conversations-history/spec.md` ✅
- `specs/proxy-chat-integration-test/spec.md` ✅
- `spec.md` (root delta) ✅
- `design.md` ✅ (reconciled with real-DB strategy)
- `tasks.md` ✅ (8/8 tasks complete, 0 unchecked)
- `verify-report.md` ✅ (PASS with warnings, 0 CRITICALs)
- `archive-report.md` ✅ (this file)

## Risks

- The change folder was not moved to the archive directory per explicit instruction;
  a later move is required to finalize the standard OpenSpec archive layout. All
  artifacts remain in the active `changes/` tree until then.
- Design decision D3 and apply-progress formatting gaps (per verify obs #159) are
  non-blocking and resolved at close (design reconciled in `71aca87`; TDD evidence
  independently verified).

## SDD Cycle

Change fully planned, implemented, verified, and archived (partial-archive override
recorded above). Ready for the next change.
