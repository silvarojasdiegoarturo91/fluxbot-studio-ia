# Design: Conversations History Fix

## Technical Approach

Fix two blocking bugs via three targeted changes:
1. **Shop auto-upsert** in the proxy `action` — replace `findUnique → 404` with `upsert` so the first widget POST creates the shop row.
2. **Integration test** calling `action()` directly in-process (no tunnel) with HMAC bypass via `NODE_ENV=test` and no `signature` query param.
3. **Seed script** using Prisma client directly for idempotent local data.

Bug 2 (detail navigation crash) is already committed; the seed script makes it verifiable.

---

## Architecture Decisions

| # | Decision | Options | Choice | Rationale |
|---|----------|---------|--------|-----------|
| 1 | HMAC bypass in test | A: no signature (NODE_ENV bypass) / B: sign with real secret / C: inject verifier | **A — no signature** | `verifyShopifyProxyRequest` already returns `true` when signature is absent and `NODE_ENV !== "production"`. `setup.ts` forces `NODE_ENV=test`. No new abstraction needed; production path unchanged. |
| 2 | Shop not-found behavior | 404 (current) / auto-upsert for any proxy hit | **Auto-upsert for HMAC-verified domains** | HMAC verification guarantees Shopify signed the request → domain is real. `accessToken` is `String` (non-nullable) → store sentinel `""`. Schema allows it; the field is populated on OAuth install. Upsert keeps existing rows intact. |
| 3 | Test strategy | Vitest + real HTTP server / Vitest calling `action()` in-process | **Call `action()` in-process** | Matches existing pattern in `widget-chat-proxy-route.test.ts`. Fast, no server needed. Prisma is **mocked** (vi.mock) to avoid DB dependency in CI; a separate db-integration test covers real DB. |
| 4 | Seed script | `tsx` CLI / `ts-node` | **`tsx`** (already in devDeps) with `prisma.$transaction` upserts | Idempotent by conversation ID. No HTTP; direct Prisma client. |

---

## Data Flow

### Fixed Proxy POST Flow

```
Widget POST /apps/fluxbot/chat?shop=<domain>
  │
  ├─ verifyShopifyProxyRequest()
  │    ├─ signature absent + NODE_ENV=test → ✅ (test only)
  │    └─ signature present → HMAC verify (production)
  │
  ├─ shopDomain from ?shop= query param
  │
  ├─ prisma.shop.upsert(where: {domain}, create: {domain, accessToken:"", status:ACTIVE})
  │    └─ returns existing or newly-created Shop
  │
  ├─ getMerchantAdminConfig(shop.id)
  │
  ├─ conversationId present?
  │    ├─ YES → findUnique(id) → 404 if not found / not same shop
  │    └─ NO  → prisma.conversation.create({shopId, channel:SHOPIFY_PROXY, ...})
  │
  ├─ gateway.chat(...)
  │
  ├─ prisma.conversationMessage.create × 2 (USER + ASSISTANT)
  ├─ prisma.conversation.update(lastMessageAt)
  └─ Response 200 { conversationId, message, ... }
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/routes/apps.fluxbot.chat.ts` | Modify | Replace `prisma.shop.findUnique` + 404 with `prisma.shop.upsert` (lines ~549-552) |
| `test/integration/proxy-chat-upsert.integration.test.ts` | Create | In-process integration test: 4 scenarios from REQ-CONV-001 + REQ-CONV-002 |
| `scripts/seed-conversations.ts` | Create | Idempotent seed: 2 shops × 3 conversations × 4 messages |
| `package.json` (shopify-admin-app) | Modify | Add `"seed:conversations": "tsx scripts/seed-conversations.ts"` |

**Not changed:** `shopify-proxy-auth.server.ts`, Prisma schema, existing unit tests, IA backend, `normalizeMessage` (already fixed in commits 3a92e23 / 4fdd226).

---

## Interfaces / Contracts

### Proxy action — shop lookup (modified section only)

```typescript
// Before (line ~549)
const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
if (!shop) {
  return json({ success: false, error: "Shop not found" }, { status: 404 }, traceId);
}

// After
const shop = await prisma.shop.upsert({
  where: { domain: shopDomain },
  create: { domain: shopDomain, accessToken: "", status: "ACTIVE" },
  update: {},  // never overwrite real tokens
});
```

### Seed script entry point

```typescript
// scripts/seed-conversations.ts
async function main(): Promise<void>  // top-level; exits 0 on success, 1 on error

const SEED_SHOPS = [
  { domain: "quickstart-c8cc9986.myshopify.com" },
  { domain: "test-2-grow.myshopify.com" },
];
// Uses prisma.shop.upsert, prisma.conversation.upsert (by id), prisma.conversationMessage.upsert (by id)
```

### Integration test structure

```typescript
// test/integration/proxy-chat-upsert.integration.test.ts
// Mocks: db.server, ia-gateway.server, admin-config.server
// Does NOT mock shopify-proxy-auth.server (uses real function with no signature)
import { action } from "../../app/routes/apps.fluxbot.chat";

function makeProxyRequest(body: unknown, shopDomain = "quickstart-c8cc9986.myshopify.com"): Request
// URL has no `signature` param → verifyShopifyProxyRequest returns true under NODE_ENV=test

describe("proxy chat upsert — REQ-CONV-001 + REQ-CONV-002")
  it("creates conversation and shop row when shop is new")  // RED → GREEN
  it("reuses existing shop, no duplicate")
  it("returns 400 for missing message")
  it("returns 200 for existing conversationId without creating duplicate")
```

---

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (existing) | HMAC guard, error paths | `test/unit/routes/apps.fluxbot.chat.test.ts` — already mocks `verifyShopifyProxyRequest`; no change needed |
| Integration (new) | Shop upsert + conversation create | `test/integration/proxy-chat-upsert.integration.test.ts` — real auth function, Prisma mocked |
| Unit (new) | `normalizeMessage` invalid date | `test/unit/routes/app.conversations.$id.test.ts` — add scenario for `null`/`undefined` `createdAt` |
| Seed | Idempotency | Run `seed:conversations` twice, assert row counts equal |

**Run command:**
```bash
# All tests (from apps/shopify-admin-app):
npm test

# Target only new integration test:
npx vitest run test/integration/proxy-chat-upsert.integration.test.ts

# Seed:
npm run seed:conversations
```

---

## Threat Matrix

This change modifies the Shopify App Proxy routing boundary. Applicable rows:

| Threat | Applicable | Safe behavior | Planned RED test |
|--------|------------|---------------|-----------------|
| HMAC bypass in non-production | Applicable | bypass allowed only when `NODE_ENV !== "production"` AND signature absent — production always verifies | Test with `NODE_ENV=production` + no signature → expect 401 |
| Auto-upsert with unverified domain | N/A | HMAC verification gates all proxy requests; upsert only after HMAC passes | — |
| Token overwrite on upsert | Applicable | `update: {}` in upsert — never overwrites existing `accessToken` | Verify existing shop accessToken unchanged after upsert |

---

## Migration / Rollout

No migration required. `accessToken: ""` is a valid sentinel — the field exists, the constraint is satisfied, and the OAuth install flow overwrites it with a real token. Existing shops in production already have real tokens; the `update: {}` clause ensures they are never overwritten.

---

## Open Questions

- None blocking. All 4 design decisions resolved above.
