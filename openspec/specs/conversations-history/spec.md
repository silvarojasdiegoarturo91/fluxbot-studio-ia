# Conversations History Specification

## Purpose

Ensure merchants can view, seed, and navigate conversation history in the Shopify
Admin dashboard. Covers local seed fixtures, list rendering, and detail view
stability including safe date handling.

## Requirements

### Requirement: REQ-CONV-003 — Local Conversation Seed Script

The project MUST provide a seed script that populates `fluxbot_dev.conversations`
and associated `messages` with realistic data. The script MUST be idempotent
(upsert semantics — no delete+insert). It MUST be runnable with a single npm command.

#### Scenario: Seed populates conversations for known shops

- GIVEN the seed script is run via `npm run seed:conversations`
- WHEN the script completes without error
- THEN `fluxbot_dev.conversations` contains at least 2 conversations for `quickstart-c8cc9986.myshopify.com`
- AND at least 2 conversations for `test-2-grow.myshopify.com`
- AND each conversation has ≥ 3 messages with alternating `USER` and `ASSISTANT` roles

#### Scenario: Re-running seed does not duplicate data

- GIVEN conversations already exist from a previous seed run
- WHEN `npm run seed:conversations` is run again
- THEN no duplicate conversation or message rows are created
- AND the total row count is the same as after the first run

---

### Requirement: REQ-CONV-004 — Conversation Detail Navigation and Rendering

The conversations list MUST render a working navigation link per row. Clicking
"Ver" MUST navigate to the detail route without a full-page crash. The detail
loader MUST return HTTP 200 with messages. The `normalizeMessage` utility MUST
handle invalid or missing date values without throwing a `RangeError`.

#### Scenario: Navigation from list to detail

- GIVEN at least one conversation exists in `fluxbot_dev.conversations`
- WHEN the merchant clicks the "Ver" link for a conversation in the list
- THEN the browser navigates to `/app/conversations/{id}` via React Router `Link`
- AND no full-page error or crash occurs

#### Scenario: Detail loader returns messages

- GIVEN a conversation with `id = "conv-xyz"` and 3 messages exists in the DB
- WHEN a GET is made to `/app/conversations/conv-xyz`
- THEN the loader responds with HTTP 200
- AND the response includes all 3 messages for that conversation

#### Scenario: normalizeMessage handles invalid date

- GIVEN a message row with a `null`, `undefined`, or non-parseable `createdAt` value
- WHEN `normalizeMessage` processes that message
- THEN no `RangeError: Invalid time value` is thrown
- AND a safe fallback value (empty string or epoch) is returned for the date field
