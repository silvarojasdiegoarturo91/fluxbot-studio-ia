# Feature Specification: Phase 1 E2E Chat Test — Unblock DB Dependency

**Feature Branch**: `005-e2e-chat-test`  
**OpenSpec ID**: REQ-OPEN-005  
**Created**: 2026-04-09  
**Status**: Draft  
**Priority**: Low  
**Owner**: Frontend (`fluxbot-studio-ia`)

## Context

`test/phase1/chat-e2e.test.ts` is the E2E integration test for the Phase 1 chat flow (user sends message → gateway → IA backend → response stored). It currently fails in all CI environments because it requires a live PostgreSQL at `localhost:5432`. The test is `blocked` in `.openspec.json`. This spec covers unblocking it with two parallel approaches: (A) mock the DB layer so the test runs without Postgres, or (B) add a Vitest setup that spins up a real Postgres using `testcontainers`.

---

## User Scenarios & Testing

### User Story 1 — Test runs in CI without infrastructure setup (Priority: P1)

A developer opens a pull request. The CI pipeline runs `npm test`. All 55 test files pass — including `chat-e2e.test.ts` — without requiring a running PostgreSQL server in the pipeline.

**Why this priority**: Unblocking CI unblocks the team. Currently, every PR shows a red test that cannot be fixed by the PR author without infrastructure access.

**Independent Test**: Run `npm test` from `apps/shopify-admin-app/` in a clean environment with no Postgres → all tests pass.

**Acceptance Scenarios**:

1. **Given** no PostgreSQL is running, **When** `npm test` executes, **Then** `chat-e2e.test.ts` passes (via mocking or in-memory DB).
2. **Given** the test passes, **When** `npm run test:coverage` runs, **Then** code coverage for Phase 1 chat routes is captured.
3. **Given** the mock approach is used, **When** the actual DB call would fail, **Then** the mock returns a deterministic fixture that reflects real DB contract.

---

### User Story 2 — Developer can also run the test against a real DB (Priority: P2)

When a developer has PostgreSQL available (locally or via Docker), they can run the test in "real DB" mode to validate actual Prisma queries, not just mocks.

**Why this priority**: Mocks are good for CI speed but can drift from reality. Real-DB mode catches Prisma query issues.

**Independent Test**: Set `DB_TEST_MODE=real` → run `npm test` with Postgres running → test uses actual DB.

**Acceptance Scenarios**:

1. **Given** `DATABASE_URL` points to a running Postgres and `DB_TEST_MODE=real`, **When** the test runs, **Then** it uses a real DB transaction (rolled back after test).
2. **Given** `DB_TEST_MODE` is unset or `mock`, **When** the test runs, **Then** it uses Prisma mocks.

---

### Edge Cases

- What if the mock Prisma client drifts from the real schema? Solution: generate the mock from the Prisma schema types automatically.
- What if `testcontainers` approach is too slow for the test suite? Use `vitest.globalSetup` to start the container once and reuse across all tests in the phase1 suite.
- What happens if the IA backend mock returns an unexpected shape? Test must fail with a clear assertion error, not a type error.

---

## Requirements

### Functional Requirements

- **FR-001**: `chat-e2e.test.ts` MUST pass in an environment where `DATABASE_URL` is not set or points to a non-existent server, using Prisma mock.
- **FR-002**: Prisma mock MUST be implemented using `vitest-mock-extended` or `jest-mock-extended` pattern, typed against the generated Prisma client.
- **FR-003**: The `iaClient` HTTP calls in the test MUST be intercepted using `msw` (Mock Service Worker) in Node mode, returning fixture responses.
- **FR-004**: A `DB_TEST_MODE=real` env flag MUST allow bypassing mocks and using a real DB (with transaction rollback after each test).
- **FR-005**: The test MUST verify the full Phase 1 chat flow: message received → Conversation created → ConversationMessage created → IA backend called → response returned.
- **FR-006**: All existing 68 Phase 0 tests MUST continue to pass unchanged.

### Key Entities

- **Conversation**: Created on first message for a session.
- **ConversationMessage**: Each turn persisted with role, content, latencyMs.
- **IAGateway**: The HTTP client calling `IA_BACKEND_URL/api/v1/chat` — must be intercepted by MSW.

## Success Criteria

- **SC-001**: `npm test` shows 55/55 test files passing (0 failures) in a fresh environment with no Postgres.
- **SC-002**: `chat-e2e.test.ts` tests all cover: new conversation creation, message persistence, IA backend call, response shape.
- **SC-003**: Phase 0 suite remains 68/68 green.
- **SC-004**: `DB_TEST_MODE=real` with Postgres running also produces all-green results.
- **SC-005**: REQ-OPEN-005 status updated to `completed` in `.openspec.json`.

## Assumptions

- `msw` v2 in Node mode is compatible with the current Vitest version (`^3.0`) — verify before implementing.
- The Prisma mock approach is preferred over `testcontainers` for CI speed; `testcontainers` is optional for local dev.
- The test file (`test/phase1/chat-e2e.test.ts`) already has the test structure; this spec is about fixing the infrastructure, not rewriting the test logic.
- No changes to production code are required — this is purely a test infrastructure change.

## Implementation Notes

- Install: `pnpm add -D msw vitest-mock-extended` in `apps/shopify-admin-app/`
- MSW handler: `apps/shopify-admin-app/test/mocks/ia-backend.handlers.ts`
- Prisma mock: `apps/shopify-admin-app/test/mocks/prisma.mock.ts` — exports `prismaMock` typed as `DeepMockProxy<PrismaClient>`
- Vitest setup: `apps/shopify-admin-app/test/setup.ts` — calls `mockReset(prismaMock)` before each test
- MSW server: `apps/shopify-admin-app/test/setup.ts` — starts MSW Node server before all tests
- `vitest.config.ts`: add `setupFiles: ['./test/setup.ts']`
