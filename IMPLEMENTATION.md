# FluxBot Studio IA - Implementation Status

## Overview
AI-powered chatbot for Shopify stores with RAG-based knowledge, proactive sales triggers, order lookup, and GDPR-compliant architecture.

## Architecture Plan
Full architecture document saved in `/memories/session/plan.md`

---

## ✅ COMPLETED (Phase 0: Foundation)

### 1. API Version & Scopes Alignment
- ✅ Updated API version from `October25` to `January26` (2026-01 latest stable)
- ✅ Expanded scopes to support MVP features:
  - `read_products, write_products` - Catalog access
  - `read_orders` - Order lookup
  - `read_customers` - Customer context
  - `read_content, read_policies, read_online_store_pages` - Knowledge base
- ✅ Updated in: `.graphqlrc.ts`, `shopify.server.ts`, `shopify.app.toml`, `shopify.web.toml`

### 2. Environment Configuration
- ✅ Created `.env.example` with all required variables
- ✅ Built `app/config.server.ts` with validation logic:
  - Validates required Shopify credentials
  - Validates AI provider configuration (OpenAI/Anthropic/Gemini)
  - Validates database, Redis, session secrets
  - Feature flags support
  - Observability and rate limiting config
  - Auto-validates in production, fails fast on missing config

### 3. Build Cleanup
- ✅ Updated `.gitignore` to properly exclude:
  - `build/` directory
  - `.react-router/` cache
  - `.env.local`
  - Log files, coverage, IDE folders

---

## ✅ COMPLETED (Phase 1: Data Foundation)

### 4. Comprehensive Prisma Schema
Migrated from SQLite session-only schema to **PostgreSQL multi-tenant domain model** with 22 entities:

#### Tenant & Identity
- ✅ `Shop` - Multi-tenant shop with status, plan, metadata
- ✅ `ShopInstallation` - Billing and feature flags per install
- ✅ `User` - Admin users with roles and permissions
- ✅ `Session` - Preserved Shopify OAuth sessions

#### Configuration
- ✅ `ChatbotConfig` - Bot behavior, tone, language, prompts
- ✅ `AIProviderConfig` - Multi-provider support (OpenAI/Anthropic/Gemini)

#### Conversations
- ✅ `Conversation` - Multi-channel conversations with visitor/customer context
- ✅ `ConversationMessage` - Messages with role, confidence, cost tracking
- ✅ `ConversationEvent` - Behavior events (clicks, scrolls, exits)
- ✅ `CustomerIdentity` - Customer verification and consent

#### Knowledge & RAG
- ✅ `KnowledgeSource` - Catalog, pages, policies, blogs
- ✅ `KnowledgeDocument` - Versioned documents with language support
- ✅ `KnowledgeChunk` - Chunked text with token counts
- ✅ `EmbeddingRecord` - Vector embeddings (JSON for now, pgvector later)

#### Commerce Projections
- ✅ `ProductProjection` - Cached product data
- ✅ `PolicyProjection` - Return/shipping/privacy policies
- ✅ `OrderProjection` - Order status snapshots

#### Orchestration
- ✅ `ToolInvocation` - Audit trail of AI tool calls
- ✅ `HandoffRequest` - Human escalation workflow

#### Compliance
- ✅ `ConsentRecord` - GDPR consent tracking
- ✅ `AuditLog` - Immutable audit trail

#### Sync & Events
- ✅ `WebhookEvent` - Webhook queue with retry logic
- ✅ `SyncJob` - Initial and delta sync tracking

**Key Features:**
- Tenant isolation by `shopId` on all tables
- Proper indexes for query performance
- Soft deletes (`deletedAt`) where needed
- Timestamps (`createdAt`, `updatedAt`)
- Enums for type safety
- Relations with cascade deletes

---

## ✅ COMPLETED (Phase 1: Storefront Widget)

### 5. Theme App Extension - Chat Widget
Complete storefront chat widget implementation:

#### Structure
```
extensions/chat-widget/
├── shopify.extension.toml    # Extension config with settings
├── blocks/
│   └── chat_launcher.liquid   # Liquid template with schema
└── assets/
    ├── chat-launcher.js       # Widget runtime logic
    └── chat-launcher.css      # Responsive styles
```

#### Features Implemented
- ✅ **Launcher Button**: Floating button with smooth animations
- ✅ **Position Control**: Bottom-right or bottom-left (merchant configurable)
- ✅ **Color Customization**: Primary color theming
- ✅ **Chat Window**: Full-featured modal with header, messages, input
- ✅ **Typing Indicator**: Animated dots during AI response
- ✅ **Product Cards**: Display product recommendations inline
- ✅ **Session Persistence**: Conversation ID in sessionStorage
- ✅ **Customer Context**: Logged-in customer ID/email passed to backend
- ✅ **Analytics Tracking**: Page views, chat opened/closed, message sends
- ✅ **Error Handling**: Retry logic with graceful degradation
- ✅ **Accessibility**: ARIA labels, keyboard navigation, screen reader support
- ✅ **Mobile Responsive**: Full-screen on mobile, optimized for touch
- ✅ **Markdown Support**: Links in messages
- ✅ **API Integration**: Ready for `/apps/fluxbot/chat` app proxy endpoint

#### Settings Schema
Merchant can configure:
- Show/hide launcher
- Position (bottom-right/left)
- Primary color
- Welcome message

---

## 📋 NEXT STEPS (Phase 1 Remaining)

### 7. Admin Dashboard Migration
**Current State**: Dashboard uses deprecated `s-*` web components  
**Required**: Migrate to Polaris React components

**Priority**: High (but not blocking MVP chat functionality)

**Tasks**:
- Replace `s-page`, `s-stack`, `s-box`, etc. with Polaris equivalents
- Use `@shopify/polaris` components: `Page`, `Layout`, `Card`, `Button`
- Build proper settings UI for chatbot config
- Create analytics dashboard with real metrics
- Implement onboarding checklist

### 8. Shopify GraphQL Client Package
**Required**: Typed GraphQL operations for catalog/orders/policies

**Tasks**:
- Create `packages/shopify-client/` package
- Define GraphQL queries and mutations
- Run codegen: `npm run graphql-codegen`
- Implement queries:
  - Products & Collections (catalog sync)
  - Policies (return, privacy, shipping, refund)
  - Orders (status lookup)
  - Shop metadata
- Add bulk operations for initial sync

### 9. Sync Service Foundation
**Required**: Initial and incremental sync of Shopify data

**Tasks**:
- Create sync job queue (BullMQ)
- Implement initial catalog sync via bulk operations
- Implement delta sync via webhooks
- Build ingestion pipeline: normalize → chunk → embed → index
- Add sync status tracking in database
- Create webhook handlers for:
  - `PRODUCTS_CREATE/UPDATE/DELETE`
  - `COLLECTIONS_UPDATE`
  - `SHOP_UPDATE`
  - `APP_UNINSTALLED`

### 10. AI Orchestration Layer
**Required**: Intent detection, retrieval, response generation

**Tasks**:
- Build provider-agnostic LLM adapter (OpenAI/Anthropic/Gemini)
- Implement RAG pipeline:
  - Semantic search over embeddings
  - Metadata filtering
  - Reranking
  - Confidence scoring
- Define typed tools:
  - `searchProducts(query, filters)`
  - `getOrderStatus(orderId, verification)`
  - `getStorePolicies(type)`
  - `recommendProducts(context)`
- Implement guardrails and fallback logic
- Build conversation manager
- Add cost/latency tracking

---

## 🔄 Database Migration Required

The Prisma schema has been completely rewritten. To apply:

```bash
cd apps

# Generate Prisma client
npx prisma generate

# Create migration (will prompt for PostgreSQL URL)
npx prisma migrate dev --name phase1_foundation

# Or reset and apply from scratch
npx prisma migrate reset
```

⚠️ **Important**: Update `DATABASE_URL` in `.env` to PostgreSQL before migrating!

Example:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/fluxbot_dev?schema=public
```

---

## 📦 Dependencies to Install

The following packages may be needed for full functionality:

```bash
cd apps

# For environment validation
npm install dotenv

# For queue/job processing (sync service)
npm install bullmq ioredis

# For AI providers
npm install openai @anthropic-ai/sdk @google/generative-ai

# For vector operations (if using local embeddings)
npm install @xenova/transformers

# For observability (optional)
npm install pino pino-pretty
```

---

## 🧪 Testing the Chat Widget

1. **Install the app** in a development store
2. **Enable the extension** in the theme editor:
   - Go to Online Store → Themes → Customize
   - Add App Embed: "AI Chat Launcher"
   - Configure position and color
3. **Test the widget**:
   - Visit storefront
   - Click launcher button
   - Send test message (will fail until backend routes are built)

---

## 🎯 MVP Completion Checklist

### Foundation (✅ Complete)
- [x] API version and scopes
- [x] Environment validation
- [x] Gitignore cleanup
- [x] Prisma schema with full domain model
- [x] Storefront chat widget extension

### Backend Integration (🚧 In Progress)
- [ ] Shopify GraphQL typed client
- [ ] Sync service with webhooks
- [ ] AI orchestration layer
- [ ] App proxy routes for chat API
- [ ] Conversation persistence
- [ ] Order lookup with verification

### Admin UI (🚧 In Progress)
- [ ] Polaris React migration
- [ ] Onboarding flow
- [ ] Settings pages
- [ ] Analytics dashboard
- [ ] Sync status UI

### Advanced Features (⏳ Planned for V2)
- [ ] Proactive triggers
- [ ] Human handoff integration
- [ ] Advanced reranking
- [ ] Conversion attribution
- [ ] Multilingual advanced support

---

## 📚 Documentation

- **Architecture Plan**: `/memories/session/plan.md`
- **Project Analysis**: `/memories/session/project-inspection-findings.md`
- **Schema Analysis**: `/memories/session/fluxbot_schema_analysis.md`
- **Environment Template**: `apps/.env.example`
- **Shopify Extension**: `apps/extensions/chat-widget/`

---

## 🚀 Quick Start for Developers

```bash
# 1. Clone and install
cd apps
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with your Shopify and AI credentials

# 3. Setup database (PostgreSQL)
npx prisma generate
npx prisma migrate dev

# 4. Start development
npm run dev

# 5. Install in dev store and test
# The Shopify CLI will provide a preview URL
```

---

## 📞 Support & Next Actions

**Current Status**: Foundation complete, ready for backend implementation

**Immediate Next Steps**:
1. Implement app proxy routes for chat API
2. Build Shopify GraphQL client
3. Create sync service with webhook handlers
4. Integrate AI provider and RAG pipeline
5. Test end-to-end flow

**Estimated MVP Timeline**:
- Backend integration: 2-3 weeks
- Admin UI migration: 1 week
- Testing & polish: 1 week
- **Total: 4-5 weeks to functional MVP**
