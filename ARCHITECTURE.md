# Fluxbot Studio IA — Monorepo Architecture

**Status:** ✅ **Restructuring Complete** — Production-ready workspace with clean build pipeline.

**Last Updated:** 2025-03-08 | **API Version:** 2026-01 | **Build Status:** PASSING

---

## 1. Project Overview

**Fluxbot Studio IA** is a Shopify AI Chatbot App for conversational commerce, automated support, and semantic product discovery.

### Core Capabilities (MVP)
- **Embedded Admin Dashboard** — Configure chatbot, data sources, and rules
- **Storefront Chat Widget** — Theme App Extension for customer conversations
- **Shopify Integration** — Admin GraphQL API + webhooks for real-time sync
- **AI Orchestration** — Multi-provider LLM support (OpenAI, Anthropic, Gemini)
- **Knowledge Base** — Semantic search over products, pages, and policies
- **Order Lookup** — Query order status and shipping info
- **Analytics** — Track conversions, escalations, and chatbot performance

### Differentiation
- **RAG-grounded responses** — No hallucinations, always cited sources
- **Proactive selling** — Intent detection + behavioral triggers (v2)
- **Compliance-first** — RGPD by design, per-shop data isolation, consent tracking
- **Omnichannel ready** — Architecture supports WhatsApp, email, SMS (v3)

---

## 2. Monorepo Structure

```
apps/
├── shopify-admin-app/          # Embedded admin dashboard + backend
│   ├── app/
│   │   ├── routes/             # 8 feature pages + API endpoints
│   │   ├── services/           # Backend service re-exports
│   │   ├── root.tsx            # App shell
│   │   ├── entry.server.tsx    # Server entry
│   │   └── db.server.ts        # Prisma client singleton
│   ├── build/                  # Vite build output
│   ├── package.json            # @fluxbot/shopify-admin-app
│   ├── tsconfig.json           # TypeScript config
│   ├── .env.example            # Environment template
│   └── shopify.app.toml        # Shopify CLI config
│
├── storefront-widget/          # Theme App Extension
│   ├── extensions/
│   │   └── chat-widget/
│   │       ├── blocks/chat_launcher.liquid
│   │       ├── assets/chat-launcher.{js,css}
│   │       └── shopify.extension.toml
│   └── package.json

services/
├── ai-orchestrator/            # Conversational engine + tools
│   ├── src/ai-orchestration.service.ts
│   └── package.json            # @fluxbot/ai-orchestrator
├── ingestion-service/          # Vector embeddings + RAG
│   ├── src/embeddings.service.ts
│   └── package.json
├── sync-service/               # Shopify data → knowledge base
│   ├── src/sync.service.ts
│   └── package.json
└── analytics-service/          # Chatbot API proxy + metrics
    ├── src/chatbot-proxy.service.ts
    └── package.json

packages/
├── shopify-client/             # GraphQL queries for Admin API
│   ├── src/index.ts            # Typed queries
│   └── package.json
├── shared-types/               # Shared TypeScript types
├── config/                     # Environment validation + config
├── ui/                         # Polaris component exports
├── prompts/                    # Prompt templates and builders
├── observability/              # Logging, tracing, metrics
├── compliance/                 # RGPD, consent, audit logs
└── testing/                    # Test utilities and fixtures

infra/
├── prisma/                     # Database schema + migrations
│   ├── prisma/
│   │   ├── schema.prisma       # 22-entity Shopify data model
│   │   └── migrations/         # Migration history
│   └── package.json
└── docker/                     # Container runtime (placeholder)

package.json                    # Root workspace manifest (npm workspaces)
```

### Workspace Configuration
```json
{
  "workspaces": ["apps/*", "services/*", "packages/*"]
}
```

All 12+ packages are discoverable and linked at `node_modules/.bin` for cross-workspace references.

---

## 3. Technology Stack

### Frontend (Admin App)
- **Framework:** Remix/React Router 7 (file-based routing)
- **UI Kit:** Shopify Polaris v14+
- **State:** App Bridge + session management
- **Build:** Vite + TypeScript (strict mode)

### Backend (Services Layer)
- **Runtime:** Node.js 20+
- **Framework:** Typed services (no HTTP framework yet)
- **Database:** PostgreSQL + Prisma ORM
- **Cache:** Redis (optional, for queue/rate-limit)
- **Observability:** Structured logs + traces (setup in progress)

### AI/ML Stack
- **LLM Providers:** OpenAI, Anthropic, Google Gemini (pluggable)
- **Embeddings:** OpenAI, Google Gemini (pluggable)
- **Vector Search:** Hybrid (semantic + metadata filters)
- **RAG Strategy:** Retrieval → ranking → grounding → generation

### Shopify Integration
- **API:** Admin GraphQL v2026-01
- **Auth:** OAuth + session storage (Prisma)
- **Delivery:** Theme App Extension (Liquid + JS)
- **Webhooks:** Incremental sync via `products/update`, `product/delete`, etc.

---

## 4. Getting Started

### Prerequisites
```bash
# Node.js 20+
node --version

# npm workspaces (built-in with npm 7+)
npm --version

# PostgreSQL running (local or managed)
psql --version
```

### Installation & Setup

#### 1. Install Dependencies
```bash
cd apps/
npm install --workspaces
```

This installs all dependencies for all 12 workspaces and validates linking.

#### 2. Configure Environment
```bash
cp apps/shopify-admin-app/.env.example apps/shopify-admin-app/.env.local
```

Edit `apps/shopify-admin-app/.env.local`:
- Add Shopify API credentials (from Partner Dashboard)
- Set `DATABASE_URL` (PostgreSQL connection string)
- Set AI provider keys (OpenAI, Anthropic, or Gemini)
- Set `SESSION_SECRET` (min 32 random chars)

Example PostgreSQL URL:
```
DATABASE_URL=postgresql://user:password@localhost:5432/fluxbot?schema=public
```

#### 3. Generate Prisma Client
```bash
npm run prisma:generate
```

This generates TypeScript types for the database schema.

#### 4. Run Migrations
```bash
npm run prisma:migrate:dev
```

Creates all 22 tables in PostgreSQL and generates migration record.

#### 5. Start Development Server
```bash
npm run dev
```

Opens admin app at http://localhost:3000 (Shopify CLI tunnel).

---

## 5. Project Phases & Roadmap

### Phase 1: MVP (✅ COMPLETE)
**Focus:** Core chatbot functionality, Shopify integration, knowledge base

- [x] Admin dashboard (8 feature pages)
- [x] Storefront widget (Theme App Extension)
- [x] OAuth + session management
- [x] Product/page/policy sync
- [x] RAG engine (semantic search)
- [x] Chat API (message → response)
- [x] Order lookup (query-only)
- [x] Analytics tracking
- [x] Multi-language support
- [x] RGPD/consent framework

**Build Status:** ✅ TypeScript clean, build passing, workspace ready.

### Phase 2: Proactive & Conversion (⏳ NEXT)
**Focus:** Behavioral triggers, upsell, add-to-cart integration

- [ ] Behavior tracking (dwell time, exit intent, scroll depth)
- [ ] Trigger rules engine
- [ ] Handoff to human (Zendesk, Gorgias, email)
- [ ] Add-to-cart from chat
- [ ] Conversion attribution
- [ ] Dashboard analytics (revenue influenced, conversation ROI)
- [ ] Reranking (better retrieval relevance)

### Phase 3: Omnichannel & Enterprise (🚀 FUTURE)
**Focus:** WhatsApp, email, Slack; advanced automations; compliance

- [ ] WhatsApp Business API integration
- [ ] Email/helpdesk integration
- [ ] Slack bot (internal support)
- [ ] AEO module (`llms.txt`, structured data)
- [ ] RBAC for enterprise merchants
- [ ] Data residency per region
- [ ] Usage-based billing

---

## 6. Key Architecture Decisions

### Decision 1: Multi-Workspace Structure
**Why:** Separate domain services from delivery layer for independent scaling and testing.
- Admin app stays lightweight, focused on UI + routing
- Services are independently deployable and testable
- Packages are shared across services and frontends

### Decision 2: Provider-Agnostic AI
**Why:** Lock-in prevention. Support OpenAI, Anthropic, Gemini with same interface.
```typescript
interface LLMProvider {
  chat(messages, tools): Promise<Response>;
}
// Strategy pattern: OpenAIProvider, AnthropicProvider, GeminiProvider
```

### Decision 3: Prisma for ORM
**Why:** Strong TypeScript support, auto-generated client, built-in migrations.
- Schema is source of truth
- Migrations are tracked and reversible
- Generated types prevent SQL injection

### Decision 4: Theme App Extension (not script tags)
**Why:** Shopify recommends TAE for Online Store 2.0 compatibility.
- Better performance (no global script tag)
- App-specific delivery
- Future support for checkout extensions if needed

### Decision 5: RAG over fine-tuning
**Why:** Merchants own their data; updates should be real-time, not retrain-dependent.
- Retrieval + prompting is faster to implement
- Ground truth in knowledge base
- RGPD-compliant (merchant data not for training)

---

## 7. API Documentation

### Admin Dashboard Routes
```
GET /app                           # Root dashboard
GET /app/data-sources              # Knowledge base config
GET /app/settings                  # Chatbot settings (tone, branding)
GET /app/analytics                 # Metrics dashboard
GET /app/conversations             # Chat transcript browser
GET /app/billing                   # Usage & plan
GET /app/widget-settings           # Theme widget config
GET /app/widget-publish            # Deployment status
GET /app/privacy                   # RGPD & compliance
```

### Storefront API (To Be Implemented)
```
POST /api/chat
  Request: { conversationId, message, sessionId }
  Response: { reply, recommendations, tools, handoff? }

POST /api/orders/:orderNumber
  Request: { verification: phone || email }
  Response: { status, items, tracking, estimatedDelivery }

POST /api/webhooks/shopify
  Handled by sync service for incremental updates
```

### Service Layer (Internal)
```typescript
// AI Orchestrator
AIOrchestrationService.chat(message, context) → Promise<Response>

// Embeddings
EmbeddingsService.search(query, filters, limit) → Promise<Results>

// Sync
SyncService.ingest(shopId, documents) → Promise<Stats>
SyncService.handleWebhook(event) → Promise<void>

// Analytics
AnalyticsService.logEvent(conversationId, event) → void
```

---

## 8. Environment Variables

See `.env.example` in admin app for template.

### Required
```
SHOPIFY_API_KEY              # Partner Dashboard
SHOPIFY_API_SECRET           # Partner Dashboard
SHOPIFY_APP_URL              # ngrok/cloudflare URL
DATABASE_URL                 # PostgreSQL connection
SESSION_SECRET               # min 32 random chars
```

### AI Provider (choose at least one)
```
AI_PROVIDER                  # openai | anthropic | gemini
OPENAI_API_KEY              # For OpenAI
ANTHROPIC_API_KEY           # For Anthropic
GEMINI_API_KEY              # For Google Gemini
```

### Optional
```
REDIS_URL                   # For caching/queueing
LOG_LEVEL                   # debug | info | warn | error
SENTRY_DSN                  # Error tracking
ENABLE_PROACTIVE_TRIGGERS   # Feature flag
ENABLE_HUMAN_HANDOFF        # Feature flag
```

---

## 9. Development Workflow

### Monorepo Commands (from root `/apps/`)

```bash
# Validation
npm run typecheck            # TypeScript validation
npm run build                # Production build
npm run lint                 # ESLint

# Database
npm run prisma:generate      # Generate @prisma/client types
npm run prisma:migrate:dev   # Create/apply migration
npm run prisma:migrate:deploy # Apply production migration
npm run prisma:studio        # Web UI for database explorer

# Running
npm run dev                  # Start dev server with tunnel
npm start                    # Start production server
```

### Per-Workspace Commands

```bash
# From admin app
cd apps/shopify-admin-app
npm run build                # Build just admin app
npm run typecheck            # Type-check admin app

# From a service
cd services/ai-orchestrator
npm run test                 # Run service tests (when implemented)
```

### Code Organization Best Practices

1. **Admin App** (`shopify-admin-app/`)
   - React components only (Polaris)
   - Route handlers for auth + API proxying
   - Service re-exports for backward compatibility
   - No business logic (delegate to services)

2. **Services** (`services/*`)
   - Business logic + domain models
   - Shopify API integration
   - External service adapters (LLM, embeddings)
   - No React dependencies

3. **Packages** (`packages/*`)
   - TypeScript interfaces (shared types)
   - Utility functions (no side effects)
   - Config validation (zod)
   - Logging/tracing setup
   - Test helpers

---

## 10. Security & Compliance

### Data Isolation
- All data partitioned by `shopId` (tenant ID)
- Row-level security in database schema where applicable
- Session storage per merchant

### Secrets Management
- `.env.local` never committed (git-ignored)
- Use env variables from deployment platform
- No API keys hardcoded in source

### Audit Logging
- All user actions logged to `AuditLog` table
- Conversation history stored in `ConversationMessage`
- Consent tracked in `ConsentRecord`

### RGPD Compliance
- Data minimization: only collect what's needed
- Retention policies: define in `schema.prisma`
- Right to deletion: implement in analytics removal
- Data export: implement via admin dashboard

---

## 11. Troubleshooting

### Workspace Issues
```bash
# Validate workspace detection
npm ls --all --depth=0

# Rebuild lock file
rm package-lock.json && npm install --workspaces

# Clear workspace cache
rm -rf node_modules/.package-lock.json
```

### Prisma Issues
```bash
# Regenerate client
npm run prisma:generate

# View current migrations
npx prisma migrate status

# Create empty migration (for manual fixes)
npx prisma migrate dev --name manual_fix
```

### Build Issues
```bash
# Clear Vite cache
rm -rf apps/shopify-admin-app/.vite

# Clear React Router build
rm -rf apps/shopify-admin-app/build

# Rebuild from scratch
npm run build
```

---

## 12. Next Steps

1. **✅ Workspace Setup** — Complete, all workspaces linked
2. **⏳ PostgreSQL Setup** — User must provision database
3. **⏳ Environment Setup** — Copy `.env.example`, set credentials
4. **⏳ Run Migrations** — `npm run prisma:migrate:dev`
5. **⏳ Create Chat Endpoint** — Wire up `/api/chat` route
6. **⏳ Test Locally** — `npm run dev`, access admin + widget
7. **⏳ Deploy Theme Extension** — Publish to theme editor
8. **⏳ Go Live** — Shopify app store submission (optional)

---

## 13. File References

- **Configuration:** `apps/shopify-admin-app/{.env.example,shopify.app.toml,tsconfig.json}`
- **Database Schema:** `infra/prisma/schema.prisma`
- **Admin Routes:** `apps/shopify-admin-app/app/routes/app*.tsx`
- **Services:** `services/*/src/*.service.ts`
- **GraphQL Queries:** `packages/shopify-client/src/index.ts`

---

## 14. Contact & Support

For architectural decisions, consult:
- `AGENTS.md` — Engineering guidelines
- `copilot-instructions.md` — Copilot-specific rules
- Prisma schema comments for field-level docs

---

**Built with ❤️ for Shopify merchants. Questions? Open an issue or check the docs folder.**
