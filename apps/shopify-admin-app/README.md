# FluxBot Studio IA - Shopify AI Chatbot App

AI-powered chatbot application for Shopify stores featuring:
- 🤖 **Intelligent Chat**: RAG-based answers grounded in your catalog and policies
- 🛍️ **Sales Support**: Product recommendations and conversational commerce
- 📦 **Order Lookup**: Help customers track orders securely
- 🌍 **Multilingual**: Support customers in their language
- 🔒 **Privacy-First**: GDPR-compliant by design
- 📊 **Analytics**: Track conversations, conversions, and customer satisfaction

## Architecture

This is a **multi-tenant Shopify app** built with:
- **Admin App**: Remix + React Router 7 + Polaris (embedded in Shopify Admin)
- **Storefront Widget**: Theme App Extension with chat launcher and modal
- **Backend**: Node.js with PostgreSQL, Redis, and BullMQ
- **AI Layer**: Provider-agnostic (OpenAI, Anthropic, Gemini) with RAG pipeline
- **Knowledge Base**: Automated sync from Shopify catalog, pages, and policies

Full architecture documentation: [Architecture Plan](/memories/session/plan.md)

## Current Status

Status is maintained in one place only: [`STATUS_MATRIX.md`](/STATUS_MATRIX.md).

Snapshot:
- ✅ Phase 1 complete: shell Shopify + gateway IA + order lookup read-only
- ✅ Phase 2 closure started: add-to-cart + human handoff backend delivered
- ✅ Phase 2 migration: intent + trigger decisioning now run remote-only through the IA gateway
- ✅ Phase 2 migration: recommendation quality pipeline is now remote-only from frontend runtime
- ✅ Phase 3 `llms.txt`: generated in backend IA and published by frontend routes
- ✅ Phase 4/5: enterprise compliance, regional deployment controls, legal holds, SIEM export/connectors
- ✅ Phase 6: separation closure checklist completed (remote-first gateway + compatibility path + aligned route execution tests)
- ✅ Phase 2 through Phase 6 are closed in this repo; capability-by-capability status lives in `../../STATUS_MATRIX.md`

## Prerequisites

- Node.js 20+
- PostgreSQL 14+ (with pgvector extension recommended)
- Redis 7+
- Shopify Partner account
- AI provider API key (OpenAI, Anthropic, or Gemini)

## Quick Start

### 1. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 2. Configure Environment

\`\`\`bash
cp .env.example .env
\`\`\`

Edit `.env` with your credentials:

\`\`\`env
# Shopify
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_URL=https://your-production-domain.example.com

# Database (PostgreSQL required for production)
DATABASE_URL=postgresql://user:password@localhost:5432/fluxbot_dev

# Redis
REDIS_URL=redis://localhost:6379

# IA Backend (remote mode recommended for production)
IA_EXECUTION_MODE=remote
IA_BACKEND_URL=https://your-ia-backend.example.com
IA_BACKEND_API_KEY=your_ia_backend_api_key

# Session
SESSION_SECRET=your_random_32_char_secret_here
\`\`\`

### 3. Setup Database

\`\`\`bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# View database in Prisma Studio (optional)
npx prisma studio
\`\`\`

### 4. Start Development Server

\`\`\`bash
npm run dev
\`\`\`

This will:
- Start the React Router dev server
- Launch Shopify CLI tunnel
- Open your default browser to install the app

### Local/Production target safety

This repo is hard-locked to the **local Shopify app**:
- Local app name: `fluxbot-studio`
- Local app client ID: `8c36112e98ce36be869eb0dc5efdd572`

Commands `npm run dev`, `npm run dev:shopify-cli`, `npm run dev:localhost`, and `npm run deploy` run a guard (`guard:local-target`) that fails fast if:
- `shopify.app.toml` is not the local app
- `SHOPIFY_API_KEY` does not match the local app client ID

Use a separate production workspace/config for the production app (`fluxbot-studio-ia-shopify`) to avoid cross-deploys.

Local development should use `npm run dev` or the root `scripts/dev-shopify-admin-local.sh` wrapper. Shopify CLI owns the dev tunnel URL and cleans stale dev previews before startup. Do not persist `ngrok` or `trycloudflare` URLs into `shopify.app.toml`; those URLs are temporary and cause `ERR_NGROK_3200` or offline preview errors after reinstalling the app.

### Local IA backend routing for agents

The storefront widget always sends chat through `/apps/fluxbot/chat` (App Proxy).  
To execute IA against the separate local backend (`fluxbot-studio-back-ia`), set:

\`\`\`env
IA_EXECUTION_MODE=remote
IA_BACKEND_URL=http://127.0.0.1:3001
IA_BACKEND_API_KEY=your_local_shared_key
\`\`\`

Recommended startup commands from workspace root:

\`\`\`bash
scripts/dev-shopify-admin-local.sh
# or full workspace
scripts/dev-all.sh
\`\`\`

### OpenSpec / SpecKit governance (required)

When changing catalog sync, proxy routing, or widget behavior, validate from workspace root:

\`\`\`bash
npm run openspec:validate:strict
npm run openspec:conflicts
npm run speckit:check
\`\`\`

### Dedicated Shopify app for CI

To avoid collisions between local and GitHub Actions, CI must use a separate Shopify app and store.

Required GitHub repository secrets:
- `SHOPIFY_CI_API_KEY`
- `SHOPIFY_CI_API_SECRET`
- `SHOPIFY_CI_SHOP` (e.g. `ci-store.myshopify.com`)

`unit.yml` and `e2e.yml` are configured to use these `SHOPIFY_CI_*` secrets only, and include a hard guard that fails if CI accidentally uses the local app key (`8c36112e98ce36be869eb0dc5efdd572`).

How to keep CI on the updated app config:
1. Create/update the dedicated CI app in Shopify Partner Dashboard.
2. Keep `SHOPIFY_CI_API_KEY` / `SHOPIFY_CI_API_SECRET` / `SHOPIFY_CI_SHOP` secrets updated in GitHub.
3. Any push to this repo triggers CI with those CI credentials, so tests always run against the current dedicated CI app context.

### 5. Install in Development Store

- Follow the Shopify CLI prompts to install the app
- Complete OAuth flow
- Access the admin app at `shopify-app-url/app`

### 6. Enable Storefront Widget

1. Go to **Online Store → Themes → Customize**
2. Click **App embeds** (bottom left)
3. Enable "AI Chat Launcher"
4. Configure position, color, and welcome message
5. Save and preview your storefront

## Project Structure

\`\`\`
apps/
├── app/
│   ├── routes/                  # React Router routes
│   │   ├── app._index.tsx       # Admin dashboard
│   │   ├── app.tsx              # Admin layout
│   │   └── auth.*.tsx           # OAuth handlers
│   ├── services/                # Business logic
│   ├── config.server.ts         # Environment validation
│   ├── db.server.ts             # Prisma client
│   └── shopify.server.ts        # Shopify SDK setup
├── extensions/
│   └── chat-widget/             # Theme App Extension
│       ├── blocks/
│       │   └── chat_launcher.liquid
│       ├── assets/
│       │   ├── chat-launcher.js
│       │   └── chat-launcher.css
│       └── shopify.extension.toml
├── prisma/
│   ├── schema.prisma            # Full domain model (22 entities)
│   └── migrations/
├── .env.example                 # Environment template
├── package.json
└── shopify.app.toml             # App manifest
\`\`\`

## Database Schema

Multi-tenant PostgreSQL schema with 22 entities:

**Tenant & Auth**: Shop, ShopInstallation, User, Session  
**Configuration**: ChatbotConfig, AIProviderConfig  
**Conversations**: Conversation, ConversationMessage, ConversationEvent, CustomerIdentity  
**Knowledge**: KnowledgeSource, KnowledgeDocument, KnowledgeChunk, EmbeddingRecord  
**Commerce**: ProductProjection, PolicyProjection, OrderProjection  
**Orchestration**: ToolInvocation, HandoffRequest  
**Compliance**: ConsentRecord, AuditLog  
**Sync**: WebhookEvent, SyncJob

See `prisma/schema.prisma` for full details.

## Available Scripts

\`\`\`bash
npm run dev          # Start development with Shopify CLI
npm run build        # Build for production
npm start            # Start production server
npm run setup        # Generate Prisma client + run migrations
npm run deploy       # Deploy to Shopify
npm run lint         # Run ESLint
npm run typecheck    # TypeScript type checking
npx prisma studio    # Open database GUI
\`\`\`

## Shopify API

- **Version**: 2026-01 (January 2026)
- **Scopes**: 
  - Catalog: `read_products`, `write_products`
  - Orders: `read_orders`
  - Customers: `read_customers`
  - Content: `read_content`, `read_policies`, `read_online_store_pages`
  - Locales: `read_locales`

## Feature Status

Status is maintained in one place only: `../../STATUS_MATRIX.md`.

Current repo-local snapshot:
- ✅ Phase 1: embedded app shell, widget, gateway integration, order lookup
- ✅ Phase 2: proactive dispatch split, add-to-cart, handoff, remote intent/trigger decisioning, remote quality pipeline
- ✅ Phase 3: omnichannel bridge/callback operations, `llms.txt` publication, campaign CRUD/dispatch surfaces
- ✅ Phase 4/5: enterprise compliance, regional deployment controls, legal holds, SIEM export/connectors

## Feature-Folder Specifications

Requirements can also be maintained per feature folder (front/shared), using:

- `../../specs/features/<feature-slug>/requirements.md`

Baseline examples:

- `../../specs/features/onboarding/requirements.md`
- `../../specs/features/shop-lifecycle/requirements.md`
- `../../specs/features/admin-storefront-config-sync/requirements.md`

Keep `STATUS_MATRIX.md` as canonical status source, and use feature folders for detailed capability requirements.

## UX Requirements (pending)

- After the merchant completes onboarding, the app must redirect automatically to the home dashboard (`/app`, i.e. "Panel"), while store synchronization starts in the background without blocking navigation.
- If the merchant uninstalls and then reinstalls the app, onboarding is required again before returning to normal operation (the uninstall webhook resets onboarding state).
- The dashboard shown after onboarding must explicitly display completed onboarding tasks (e.g., "X de Y tareas completadas") so progress is clear at first glance.
- Onboarding step 4 must describe only real behavior: clicking **Activate** saves onboarding config and triggers asynchronous **shop reference registration** (`/api/v1/shops/sync`). It must not claim catalog/policy sync if that specific process is not started in this step.
- In the dashboard right after onboarding, the **Set up AI agent** area must include the **Entrenar IA** task card (with "Más información" and "Ir a configuración"), and this is where synchronization/training status is communicated.
- If that synchronization/training was already executed, the same panel task must appear as completed (not pending), so merchants immediately see it as done.
- Admin widget settings and storefront widget rendering must stay in parity: any admin change (for example brand color, launcher position, texts, icon/avatar style) must be reflected consistently in storefront output.

## Testing

\`\`\`bash
# Run tests (when test suite is added)
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
\`\`\`

## Deployment

### Production Requirements

1. **Database**: PostgreSQL 14+ with pgvector extension
2. **Redis**: For caching, queues, and rate limiting
3. **Environment**: All variables in `.env.example` must be set
4. **Webhooks**: Shopify must reach the app at `/api/webhooks`

### Deploy to Production

\`\`\`bash
# Set SHOPIFY_APP_URL to your public production URL first
export SHOPIFY_APP_URL=https://your-production-domain.example.com

# Build the app
npm run build

# Sync the Shopify manifest to SHOPIFY_APP_URL and deploy app config/extensions
npm run deploy

# Start the production server on your host
npm run setup && npm start

# Or use Docker
docker build -t fluxbot-studio-ia-shopify .
docker run -p 3000:3000 --env-file .env fluxbot-studio-ia-shopify
\`\`\`

## Troubleshooting

### Chat widget not appearing
- Ensure app embed is enabled in theme customizer
- Check browser console for JavaScript errors
- Verify API endpoint is accessible

### Database connection errors
- Ensure PostgreSQL is running
- Verify `DATABASE_URL` in `.env`
- Run `npx prisma migrate deploy`

### AI responses failing
- Check AI provider API key is valid
- Verify `AI_PROVIDER` matches configured provider
- Check network connectivity to AI provider

### Shopify authentication issues
- Ensure `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` match Partner Dashboard
- For local development, restart with `npm run dev` or `scripts/dev-shopify-admin-local.sh` so Shopify CLI refreshes the dev preview URL
- For production, verify `SHOPIFY_APP_URL` matches the production domain before deploy
- Clear browser cookies and reinstall app

## Documentation

- [Status Matrix](../STATUS_MATRIX.md) - Canonical implementation status
- [Architecture Plan](/memories/session/plan.md) - Complete system design
- [Copilot Instructions](../.github/copilot-instructions.md) - Development guidelines

## Support & Contributing

This is a production-grade Shopify app. For questions or issues:

1. Check [STATUS_MATRIX.md](../STATUS_MATRIX.md) for current status
2. Review architecture plan for design decisions
3. Ensure all prerequisites are met
4. Verify environment configuration

## License

Proprietary - All rights reserved.
