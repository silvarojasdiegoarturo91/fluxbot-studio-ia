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
SHOPIFY_APP_URL=https://your-ngrok-url.ngrok-free.app

# Database (PostgreSQL required for production)
DATABASE_URL=postgresql://user:password@localhost:5432/fluxbot_dev

# Redis
REDIS_URL=redis://localhost:6379

# AI Provider (choose one)
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

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
4. **Webhooks**: Configure endpoint in Shopify Partner Dashboard

### Deploy to Production

\`\`\`bash
# Build the app
npm run build

# Deploy to your hosting provider
npm run deploy

# Or use Docker
docker build -t fluxbot-studio-ia .
docker run -p 3000:3000 --env-file .env fluxbot-studio-ia
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
- Verify `SHOPIFY_APP_URL` matches your tunnel URL
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
