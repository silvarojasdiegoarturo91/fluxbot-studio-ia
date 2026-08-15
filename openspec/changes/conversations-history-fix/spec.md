# Delta Spec: conversations-history-fix

## Domain: proxy-chat-integration-test (NEW)
## Domain: conversations-history (NEW)

---

## ADDED Requirements

### Requirement: REQ-CONV-001 — Proxy Chat Persists Conversation

The proxy route MUST create a new `Conversation` row in `fluxbot_dev.conversations`
when it receives a valid POST with a known shop domain. The test MUST run in-process
without an active Shopify CLI tunnel. The test MUST use the real `fluxbot_dev`
PostgreSQL database — Prisma MUST NOT be mocked.

#### Scenario: Happy path — new conversation created

- GIVEN `NODE_ENV=test` and shop `quickstart-c8cc9986.myshopify.com` exists (or will be upserted)
- WHEN a POST is sent to `/apps/fluxbot/chat` with a valid `message` (HMAC bypassed in test mode)
- THEN response status is `200`
- AND a row appears in `fluxbot_dev.conversations` for that shop domain

#### Scenario: Unknown shop is auto-upserted (not 404)

- GIVEN shop domain is NOT in `fluxbot_dev.shops` but the proxy request has a valid signature (or unsigned dev bypass)
- WHEN POST sent with `shop=unknown-store.myshopify.com` and valid `message`
- THEN response status is `200`
- AND a shop row is auto-created for that domain (see REQ-CONV-002)
- AND a conversation row is inserted referencing the new shop

> Note: 404 applies only when an explicit `conversationId` does not belong to the authenticated shop.

#### Scenario: Missing message returns 400

- GIVEN a valid shop domain
- WHEN POST sent to `/apps/fluxbot/chat` without a `message` field
- THEN response status is `400`
- AND no conversation row is inserted

#### Scenario: Existing conversationId does not create duplicate

- GIVEN conversation `id = "conv-abc"` already exists in `fluxbot_dev.conversations`
- WHEN POST sent with `conversationId = "conv-abc"` and valid `message`
- THEN response status is `200`
- AND no new conversation row is created (count for that id remains 1)

---

### Requirement: REQ-CONV-002 — Shop Auto-Upsert on First Proxy Hit

The proxy route MUST upsert the shop in `fluxbot_dev.shops` before creating a
conversation. If the shop exists, it MUST NOT duplicate it. If it does not exist,
it MUST create it with `domain` and `status = ACTIVE`.

#### Scenario: Shop exists — no duplicate created

- GIVEN `quickstart-c8cc9986.myshopify.com` is already in `fluxbot_dev.shops`
- WHEN proxy receives a valid POST for that shop
- THEN shop row count for that domain remains 1
- AND existing shop record is used for the conversation

#### Scenario: Shop does not exist — auto-created with minimal fields

- GIVEN no row for `new-shop.myshopify.com` in `fluxbot_dev.shops`
- WHEN proxy receives valid POST with `shop=new-shop.myshopify.com`
- THEN new shop row inserted with `domain = "new-shop.myshopify.com"` and `status = ACTIVE`
- AND conversation is created referencing the new shop

---

### Requirement: REQ-CONV-003 — Local Conversation Seed Script

The project MUST provide an idempotent seed script runnable via `npm run seed:conversations`
that populates `fluxbot_dev` with at least 2 conversations per known shop (≥ 3 messages
each, alternating USER/ASSISTANT roles).

#### Scenario: Seed populates conversations for known shops

- GIVEN the seed script runs via `npm run seed:conversations`
- WHEN the script completes without error
- THEN `fluxbot_dev.conversations` has ≥ 2 conversations for `quickstart-c8cc9986.myshopify.com`
- AND ≥ 2 conversations for `test-2-grow.myshopify.com`
- AND each conversation has ≥ 3 messages with mixed USER/ASSISTANT roles

#### Scenario: Re-running seed does not duplicate data

- GIVEN conversations exist from a prior seed run
- WHEN `npm run seed:conversations` is run again
- THEN no duplicate conversation or message rows are created
- AND total row count equals the count after the first run

---

### Requirement: REQ-CONV-004 — Conversation Detail Navigation and Rendering

The list MUST provide a React Router `Link` per conversation. The detail loader
MUST return HTTP 200. `normalizeMessage` MUST handle invalid dates without throwing.

#### Scenario: Navigation from list to detail

- GIVEN at least one conversation in `fluxbot_dev.conversations`
- WHEN merchant clicks "Ver" for a conversation
- THEN browser navigates to `/app/conversations/{id}` via React Router `Link`
- AND no crash occurs

#### Scenario: Detail loader returns messages

- GIVEN conversation `id = "conv-xyz"` with 3 messages in DB
- WHEN GET to `/app/conversations/conv-xyz`
- THEN loader responds HTTP 200
- AND response includes all 3 messages for that conversation

#### Scenario: normalizeMessage handles invalid date

- GIVEN a message with `null`, `undefined`, or non-parseable `createdAt`
- WHEN `normalizeMessage` processes that message
- THEN no `RangeError: Invalid time value` is thrown
- AND a safe fallback value is returned for the date field
