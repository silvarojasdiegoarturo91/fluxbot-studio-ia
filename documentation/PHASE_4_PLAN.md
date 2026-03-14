# Phase 4: MVP Completion + Production Readiness

> Canonical status source: [STATUS_MATRIX.md](../STATUS_MATRIX.md). This document is historical context.

**Status:** Planning Phase (commencing immediately)  
**Objective:** Complete remaining MVP gaps and prepare for production deployment  
**Duration Estimate:** 3-4 days of development  
**Tests Target:** 637 → 700+ (completing all missing test suites)  

---

## 1. MVP Gap Analysis

### What's Working ✅

| Component | Status | Test Coverage | 
|-----------|--------|----------------|
| Event Tracking & Analytics | ✅ Complete | 27+ tests |
| Intent Detection | ✅ Complete | 11+ tests |
| Trigger Evaluation | ✅ Complete | 36+ tests |
| Proactive Messaging | ✅ Complete | 47+ tests |
| Chat Endpoint | ✅ Complete | 15+ tests |
| Admin UI (Polaris) | ✅ Complete | 22+ tests |
| Storefront Widget (TAE) | ✅ Complete | 8+ tests |
| Callback Security (HMAC/Signatures) | ✅ Complete | 13+ tests |
| Operations Metrics & DLQ | ✅ Complete | 13+ tests |
| Order Lookup (read-only) | ✅ Complete | integrated |
| **SUBTOTAL** | **✅ 9/12**| **637 tests** |

### Critical Gaps ❌

| Gap | Impact | Justification | 
|-----|--------|----------------|
| **RAG/Vector Retrieval** | 🔴 HIGH | Chat cannot search catalog semantically; falls back to static responses |
| **Consent/GDPR** | 🔴 HIGH | App cannot be listed in Shopify App Store without consent management |
| **Multilingual L10N** | 🟡 MEDIUM | Basic locale passthrough works; no real i18n framework for prompts/UI |
| **Sync Service Integration** | 🟡 MEDIUM | Sync code exists but webhook integration not fully wired |
| **Bulk Operations** | 🟡 MEDIUM | Large catalogs need GraphQL bulk API for efficient sync |

---

## 2. Phase 4 Roadmap (3 Sprints)

### Sprint 4.1: Vector Search & RAG Completion (1 day)

**Objectives:**
- ✅ Implement pgvector similarity search queries
- ✅ Complete retrieval service with reranking
- ✅ Integrate retrieval into chat pipeline
- ✅ Add tests for RAG end-to-end

**New Files:**
1. `app/services/vector-retrieval.server.ts` (200 LOC)
   - `searchCatalog(query, filters, limit)` - pgvector similarity search
   - `rerankerScores(results, query)` - optional reranking
   - `buildContext(results)` - format for LLM injection

2. `app/services/rag-builder.server.ts` (150 LOC)
   - `buildCatalogContext(query)` - retrieval + formatting
   - `buildPoliciesContext(topic)` - policy lookup
   - `buildConversationContext(history)` - rolling window

3. `test/integration/vector-retrieval.test.ts` (50+ tests)
   - Similarity search accuracy
   - Reranking logic
   - Context formatting
   - Edge cases (no results, low scores)

**Architecture:**
```
Chat Message
    ↓
[Extract Intent + Query]
    ↓
[Vector Search on Products + Policies]
    ↓
[Rerank + Select Top K]
    ↓
[Build RAG Context]
    ↓
[Inject into System Prompt]
    ↓
[LLM Generation (grounded)]
    ↓
Response to User
```

**Database Operations:**
```sql
-- pgvector similarity search (cosine)
SELECT id, name, embedding <-> $1::vector AS distance
FROM embeddings
WHERE document_type = 'product'
ORDER BY distance ASC
LIMIT 5;

-- Filtered search (structured + semantic)
SELECT id, name, embedding <-> $1::vector AS distance
FROM embeddings
WHERE document_type = 'product'
  AND metadata->>'price' < $2
  AND metadata->>'collection' = $3
ORDER BY distance ASC
LIMIT 5;
```

---

### Sprint 4.2: Consent & GDPR Compliance (1 day)

**Objectives:**
- ✅ Implement consent recording
- ✅ Implement data export
- ✅ Implement data deletion (right to be forgotten)
- ✅ Add consent middleware to chat

**New Files:**
1. `app/services/consent-management.server.ts` (250 LOC)
   - `recordConsentEvent(shopId, conversationId, customerId, action)` - log consents
   - `getConsent(shopId, customerId)` - check current consent status
   - `revokeConsent(shopId, customerId, reason)` - explicit revocation
   - `exportConversationData(shopId, customerId)` - GDPR data export
   - `deleteConversationData(shopId, customerId)` - right to be forgotten

2. `app/routes/api.compliance.consent.ts` (120 LOC)
   - POST /api/compliance/consent - record consent
   - GET /api/compliance/consent - check status
   - DELETE /api/compliance/consent - revoke

3. `app/routes/api.compliance.export.ts` (100 LOC)
   - POST /api/compliance/export - request data export
   - GET /api/compliance/export/:jobId - check export status

4. `app/routes/api.compliance.delete.ts` (80 LOC)
   - POST /api/compliance/delete - request deletion
   - GET /api/compliance/delete/:jobId - track deletion job

5. `app/routes/app.privacy.tsx` (updated) (150 LOC)
   - Replace "Coming Soon" with functional consent panel
   - Manual consent recording for merchant
   - Export button + link to data export job
   - Delete button + confirmation

6. `test/integration/consent-management.test.ts` (40+ tests)
   - Recording, retrieval, revocation
   - Data export format
   - Data deletion verification
   - Audit trail

**Database Additions:**
```prisma
model ConsentRecord {
  id        String   @id @default(uuid())
  shopId    String
  customerId String?  // null for anonymous
  action    String   // CONSENT_GIVEN, CONSENT_REVOKED, DATA_EXPORTED, DATA_DELETED
  metadata  Json?    // context, reason, location
  timestamp DateTime @default(now())
  
  @@index([shopId, timestamp])
  @@index([customerId, timestamp])
}

model DataExportJob {
  id        String   @id @default(uuid())
  shopId    String
  customerId String?
  status    String   // PENDING, IN_PROGRESS, COMPLETED, ERROR
  result    String?  // S3 URL or error message
  createdAt DateTime @default(now())
  expiresAt DateTime
  
  @@index([shopId, status])
}

model DataDeletionJob {
  id          String   @id @default(uuid())
  shopId      String
  customerId  String?
  status      String   // PENDING, IN_PROGRESS, COMPLETED, ERROR
  deletedCount Int?
  createdAt   DateTime @default(now())
  
  @@index([shopId, status])
}
```

**Privacy by Design:**
- No training on user data without explicit opt-in
- Conversation data encrypted at rest
- Automatic deletion after 90 days (unless opted for longer)
- Audit logging of all data access
- PII redaction in system logs
- Regional data residency options (EU/US)

---

### Sprint 4.3: Multilingual L10N + Sync Integration (1 day)

**Objectives:**
- ✅ Implement real i18n framework
- ✅ Add language auto-detection
- ✅ Localize all UI strings
- ✅ Wire up webhook-driven sync

**New Files:**
1. `app/services/localization.server.ts` (200 LOC)
   - `getTranslation(key, locale)` - lookup translated string
   - `detectLanguage(text)` - auto-detect from user message
   - `formatPrice(amount, locale)` - locale-aware formatting
   - `formatDate(date, locale)` - locale-aware dates
   - Supported locales: en, es, fr, de, it, pt, ja, zh

2. `app/locales/index.ts` (500+ LOC)
   - `en.json` - English strings (prompts, UI, errors)
   - `es.json` - Spanish  
   - `fr.json` - French
   - `de.json` - German
   - And 5 more languages

3. `app/routes/webhooks.product-updated.ts` (120 LOC)
   - Webhook handler for product updates
   - Triggers re-embedding only for changed products
   - Logs sync status

4. `app/routes/webhooks.shop-installed.ts` (100 LOC)
   - Initial sync trigger on app install
   - Starts background job for catalog load
   - Sets webhook subscriptions

5. `test/integration/localization.test.ts` (30+ tests)
   - Language detection
   - String lookup
   - Format functions
   - Fallback behavior

**Locales Configuration:**
```typescript
export const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English', region: 'US' },
  { code: 'es', name: 'Español', region: 'ES' },
  { code: 'fr', name: 'Français', region: 'FR' },
  { code: 'de', name: 'Deutsch', region: 'DE' },
  { code: 'it', name: 'Italiano', region: 'IT' },
  { code: 'pt', name: 'Português', region: 'BR' },
  { code: 'ja', name: '日本語', region: 'JP' },
  { code: 'zh', name: '中文', region: 'CN' },
  { code: 'ar', name: 'العربية', region: 'SA' },
  { code: 'ru', name: 'Русский', region: 'RU' },
];

// Example locale file (en.json)
{
  "chat": {
    "welcome": "Hi! 👋 How can I help you today?",
    "thinking": "Let me think about that...",
    "sorry": "I'm not sure about that. Would you like to speak with a human?",
    "handoff_prompt": "Connecting you to our team..."
  },
  "system_prompts": {
    "shopping_assistant": "You are a friendly shopping assistant for {{shop_name}}. Help customers find products, answer questions about policies, and recover abandoned carts. Be concise and helpful.",
    "support_agent": "You are a customer support agent for {{shop_name}}. Answer questions about orders, shipping, returns, and policies. Be empathetic and solve problems quickly."
  },
  "errors": {
    "not_found": "I couldn't find that product. Would you like to search again?",
    "out_of_stock": "Unfortunately, {{product}} is out of stock. Similar options: {{alternatives}}",
    "no_results": "No results found for '{{query}}'. Try a different search?"
  }
}
```

---

## 3. Integration Architecture

### Complete Chat Flow (After Phase 4)

```
┌─ Storefront Widget ─────────────────────┐
│ User: "Show me blue winter coats"       │
└──────────→ /api/chat (POST) ────────────┘
              ↓
    ┌─────────────────────────┐
    │ 1. Authentication Check  │
    │    (shop verification)   │
    └─────────────→───────────┘
              ↓
    ┌─────────────────────────┐
    │ 2. Language Detection   │
    │    (auto or passed)      │
    └─────────────→───────────┘
              ↓
    ┌─────────────────────────┐
    │ 3. Intent Classification│
    │    (product search?)     │
    └─────────────→───────────┘
              ↓
    ┌─────────────────────────┐
    │ 4. RAG Vector Search    │ ← [NEW]
    │    (blue coats filtered)│
    │    Top 5 results        │
    └─────────────→───────────┘
              ↓
    ┌─────────────────────────┐
    │ 5. Consent Check        │ ← [NEW]
    │    (may use data?)       │
    └─────────────→───────────┘
              ↓
    ┌─────────────────────────┐
    │ 6. Build RAG Context    │ ← [NEW]
    │    (product cards)       │
    └─────────────→───────────┘
              ↓
    ┌─────────────────────────┐
    │ 7. Prepare System Prompt│
    │    (i18n localized)      │ ← [IMPROVED]
    │    (with RAG context)    │
    └─────────────→───────────┘
              ↓
    ┌─────────────────────────┐
    │ 8. Call LLM (OpenAI)    │
    │    Generate response    │
    └─────────────→───────────┘
              ↓
    ┌─────────────────────────┐
    │ 9. Format Response      │
    │    (localized text)      │
    │    (product cards)       │
    └─────────────→───────────┘
              ↓
    ┌─────────────────────────┐
    │ 10. Save Conversation   │
    │     Log intent & action  │
    │     Record analytics     │
    └─────────────→───────────┘
              ↓
┌──────────────────────────────────┐
│ Widget: "Here are blue coats:    │
│ [card] Wool Coat — $89.99        │
│ [card] Puffer Coat — $129.99     │
│ Would you like to see more?"     │
└──────────────────────────────────┘
```

### Webhook Flow (For Catalog Sync)

```
┌─ Shopify (Product Update) ─┐
│ Event: product/update      │
│ Triggered by merchant      │
└──────────→──────────────────┘
              ↓
┌───────────────────────────────┐
│ POST /webhooks/product-updated│
│ Verify HMAC signature         │
│ Extract product ID            │
└──────────────→────────────────┘
              ↓
┌───────────────────────────────┐
│ Fetch updated product         │
│ from Shopify Admin API        │
│ (title, desc, images, price) │
└──────────────→────────────────┘
              ↓
┌───────────────────────────────┐
│ Generate embeddings           │
│ (OpenAI text-embedding-3-small)
│ for title + description       │
└──────────────→────────────────┘
              ↓
┌───────────────────────────────┐
│ Update embeddings table       │
│ (upsert by productId)         │
│ with new vector              │
└──────────────→────────────────┘
              ↓
┌───────────────────────────────┐
│ Log sync event                │
│ Metrics for observability     │
└──────────────→────────────────┘
```

---

## 4. Database Schema Additions

```prisma
// Phase 4 additions

model ConsentRecord {
  id         String   @id @default(uuid())
  shopId     String
  customerId String?
  action     String   // CONSENT_GIVEN, REVOKED, EXPORTED, DELETED
  metadata   Json?
  createdAt  DateTime @default(now())
  
  shop       Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)
  
  @@index([shopId, createdAt])
  @@index([customerId])
}

model DataExportJob {
  id         String   @id @default(uuid())
  shopId     String
  customerId String?
  status     String   // PENDING, IN_PROGRESS, COMPLETED, ERROR
  result     String?  // S3 URL
  createdAt  DateTime @default(now())
  expiresAt  DateTime
  
  shop       Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)
  
  @@index([shopId, status])
}

model DataDeletionJob {
  id          String   @id @default(uuid())
  shopId      String
  customerId  String?
  status      String   // PENDING, IN_PROGRESS, COMPLETED, ERROR
  deletedCount Int?
  createdAt   DateTime @default(now())
  
  shop        Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)
  
  @@index([shopId, status])
}

// Update Shop model to include relations
model Shop {
  // ... existing fields ...
  
  consentRecords    ConsentRecord[]
  exportJobs        DataExportJob[]
  deletionJobs      DataDeletionJob[]
}
```

---

## 5. Testing Strategy

### New Test Files (63+ tests)

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `vector-retrieval.test.ts` | 18 | Vector search, reranking, context building |
| `rag-builder.test.ts` | 15 | RAG context composition, fallbacks |
| `consent-management.test.ts` | 18 | Record, export, delete flows |
| `localization.test.ts` | 12 | Language detection, translation, formatting |

**Total Phase 4 Tests:** 63  
**Cumulative Total:** 637 + 63 = **700 tests** ✅

### Test Validation Steps

```bash
# 1. Run Phase 0 (foundation - must not break)
npm test test/phase0  # Expect: 68/68 passing

# 2. Run Phase 1-3 (existing features)
npm test test/integration test/unit test/components  # Expect: 637/637 passing

# 3. Run Phase 4 (new features)
npm test test/integration/vector-retrieval.test.ts  # 18 tests
npm test test/integration/rag-builder.test.ts  # 15 tests
npm test test/integration/consent-management.test.ts  # 18 tests
npm test test/integration/localization.test.ts  # 12 tests

# 4. Full suite
npm test  # Expect: 700/700 passing
```

---

## 6. Deployment Readiness Checklist

### Before Shipping to Production

**Code Quality:**
- [ ] 700/700 tests passing
- [ ] 0 TypeScript errors
- [ ] No security warnings (OWASP top 10)
- [ ] All Phase 0 tests still green

**Features:**
- [ ] Chat works with RAG context
- [ ] Consent flow implemented
- [ ] Data export/delete working
- [ ] Multilingual prompts hardcoded
- [ ] Webhook sync integrated

**Documentation:**
- [ ] README updated with Phase 4 components
- [ ] API contracts documented
- [ ] Database schema migrations completed
- [ ] Deployment RUNBOOK created
- [ ] CHANGELOG updated

**Security:**
- [ ] HMAC verification for webhooks
- [ ] CORS properly configured
- [ ] PII redaction in logs
- [ ] Database encryption at rest
- [ ] Secrets rotated

**Performance:**
- [ ] Vector search < 200ms
- [ ] Chat response < 3000ms (including LLM)
- [ ] Webhook processing < 5000ms
- [ ] Database queries indexed
- [ ] Caching layer for embeddings

**Monitoring:**
- [ ] Error tracking configured
- [ ] Observability logs structured
- [ ] Metrics exposed (latency, errors, throughput)
- [ ] Alerts configured for failures
- [ ] Dashboard for health checks

---

## 7. Estimated Timeline

| Sprint | Component | Duration | Target Completion |
|--------|-----------|----------|-------------------|
| 4.1 | RAG / Vector Retrieval | 1 day | End of day 1 |
| 4.2 | Consent / GDPR | 1 day | End of day 2 |
| 4.3 | L10N / Webhook Sync | 1 day | End of day 3 |
| 4.4 | Full Testing + Polish | 0.5-1 day | End of day 4 |

**Phase 4 Start:** Immediately (day 0)  
**Phase 4 Complete:** Day 3-4  
**MVP Ready for Production:** Day 4 evening

---

## 8. Success Criteria

✅ **Phase 4 is COMPLETE when:**

1. **700/700 tests passing** (including 63 new Phase 4 tests)
2. **Zero TypeScript errors**
3. **All Phase 0 tests still passing** (no regressions)
4. **RAG retrieval working end-to-end**
   - Vector search returns relevant products
   - Context properly formatted for LLM
   - Chat uses context in responses
5. **Consent management functional**
   - Can record/revoke/check consent
   - Data export generates GDPR-compliant JSON
   - Data deletion removes all traces
6. **Multilingual support live**
   - 10+ languages supported
   - Language auto-detection working
   - All UI strings localized
7. **Webhook integration complete**
   - Product updates trigger re-indexing
   - Catalog stays fresh
   - Sync status tracked

---

## 9. What This Achieves

After Phase 4, the MVP will be:

✅ **Feature-complete** - All core chatbot functions working  
✅ **Production-ready** - Security, compliance, monitoring in place  
✅ **Scalable** - RAG architecture supports 1000+ products  
✅ **International** - 10+ languages supported  
✅ **Compliant** - GDPR/privacy requirements met  
✅ **Tested** - 700 tests covering all critical paths  
✅ **Deployable** - Clear runbook for production launch  

---

## 10. Next Actions (Immediate)

1. ✅ Review this plan
2. ⏳ Sprint 4.1: Implement vector retrieval service
3. ⏳ Sprint 4.2: Implement consent management
4. ⏳ Sprint 4.3: Add localization + webhook sync
5. ⏳ Full testing & production deployment

**Ready to begin?** Starting with Sprint 4.1 (Vector Retrieval).

