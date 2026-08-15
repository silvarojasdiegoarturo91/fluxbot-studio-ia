# Proxy Chat Integration Test Specification

## Purpose

Ensure the `/apps/fluxbot/chat` proxy route persists conversations to the local
database in a reproducible, tunnel-free integration test. Covers shop auto-upsert
on first hit and validation of required request fields.

## Requirements

### Requirement: REQ-CONV-001 — Proxy Chat Persists Conversation

The proxy route MUST create a new `Conversation` row in `fluxbot_dev.conversations`
when it receives a valid POST with a known shop domain. The test MUST run in-process
without an active Shopify CLI tunnel. The test MUST use the real `fluxbot_dev`
PostgreSQL database — Prisma MUST NOT be mocked.

#### Scenario: Happy path — new conversation created

- GIVEN `NODE_ENV=test` and shop `quickstart-c8cc9986.myshopify.com` exists (or will be upserted) in `fluxbot_dev.shops`
- WHEN a POST is sent to `/apps/fluxbot/chat` with `shop=quickstart-c8cc9986.myshopify.com` and a valid `message` payload (HMAC signature check bypassed in test mode)
- THEN the response status is `200`
- AND a new row appears in `fluxbot_dev.conversations` with `shopDomain = "quickstart-c8cc9986.myshopify.com"`

#### Scenario: Unknown shop is auto-upserted (not 404)

- GIVEN shop domain is NOT in `fluxbot_dev.shops` but the proxy request has a valid signature (or unsigned dev bypass)
- WHEN POST sent with `shop=unknown-store.myshopify.com` and valid `message`
- THEN response status is `200`
- AND a shop row is auto-created for that domain (see REQ-CONV-002)
- AND a conversation row is inserted referencing the new shop

> Note: 404 applies only when an explicit `conversationId` does not belong to the authenticated shop.

#### Scenario: Missing message returns 400

- GIVEN a valid shop domain
- WHEN a POST is sent to `/apps/fluxbot/chat` without a `message` field
- THEN the response status is `400`
- AND no conversation row is inserted

#### Scenario: Existing conversationId does not create duplicate

- GIVEN a conversation with `id = "conv-abc"` already exists in `fluxbot_dev.conversations`
- WHEN a POST is sent with `conversationId = "conv-abc"` and a valid `message`
- THEN the response status is `200`
- AND no new conversation row is created (total count for that `id` remains 1)

---

### Requirement: REQ-CONV-002 — Shop Auto-Upsert on First Proxy Hit

The proxy route MUST upsert the shop record in `fluxbot_dev.shops` before
attempting to create a conversation. If the shop already exists, it MUST NOT
create a duplicate. If the shop does not exist, it MUST create it with at minimum
`domain` and `status = ACTIVE`.

#### Scenario: Shop exists — no duplicate created

- GIVEN `quickstart-c8cc9986.myshopify.com` is already present in `fluxbot_dev.shops`
- WHEN the proxy receives a valid POST for that shop
- THEN the shop row count for that domain remains 1
- AND the existing shop record is used for the conversation

#### Scenario: Shop does not exist — auto-created with minimal fields

- GIVEN no shop row for `new-shop.myshopify.com` in `fluxbot_dev.shops`
- WHEN the proxy receives a valid POST with `shop=new-shop.myshopify.com`
- THEN a new shop row is inserted with `domain = "new-shop.myshopify.com"` and `status = ACTIVE`
- AND the conversation is successfully created referencing the new shop
