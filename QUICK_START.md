# Quick Start — Next 10 Minutes

## Status
✅ **Monorepo Restructure Complete** — Workspace is built and validated.

### Build Status
```
typecheck: ✅ PASS (zero errors)
build:     ✅ PASS (client + SSR bundles)
workspace: ✅ PASS (12 members linked)
```

---

## What Just Happened

1. **Directory restructure:** 
   - Old flat structure (`/app`, `/services`, `/prisma`) → New monorepo (`/apps/shopify-admin-app/`, `/services/*`, `/packages/*`, `/infra/prisma/`)

2. **Workspace configuration:**
   - npm workspaces enabled at root
   - All 12 scoped packages (@fluxbot/*) discoverable and linked

3. **Build pipeline validated:**
   - TypeScript compilation passes
   - React Router build succeeds
   - Admin app ready to run

---

## What You Need to Do Next

### STEP 1: Set Up PostgreSQL (5 min)

Choose one option:

**Option A: Local Docker (Recommended)**
```bash
# Run PostgreSQL container
docker run --name fluxbot-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=fluxbot \
  -p 5432:5432 \
  -d postgres:16-alpine

# Test connection
psql postgresql://postgres:postgres@localhost:5432/fluxbot
```

**Option B: Managed Cloud**
- Use Railway, Render, AWS RDS, or similar
- Get connection string from dashboard
- Ensure connection is valid from your machine

**Option C: Local psql (if already installed)**
```bash
# Create database
createdb fluxbot
```

### STEP 2: Configure Environment (3 min)

```bash
cd apps/shopify-admin-app
cp .env.example .env.local
```

Edit `.env.local`:
```
# Required: From Shopify Partner Dashboard
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_URL=https://your-ngrok-url.ngrok-free.app
SHOPIFY_SHOP=your-dev-store.myshopify.com

# Required: From PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/fluxbot?schema=public

# Required: Generate random 32+ chars
SESSION_SECRET=generate_random_string_here_at_least_32_characters

# Required: Choose AI provider (openai recommended for MVP)
AI_PROVIDER=openai

# Required: From provider dashboard
OPENAI_API_KEY=sk-...
# OR
ANTHROPIC_API_KEY=sk-ant-...
# OR
GEMINI_API_KEY=...

# Optional but useful
NODE_ENV=development
LOG_LEVEL=info
```

**How to get credentials:**

| Credential | Where to Find |
| --- | --- |
| `SHOPIFY_API_KEY` | Partner Dashboard → Your Apps → App Setup |
| `SHOPIFY_API_SECRET` | Same location, copy "Admin API credentials" |
| `SHOPIFY_APP_URL` | Run `npm run dev` first, Shopify CLI will print ngrok URL |
| `DATABASE_URL` | PostgreSQL connection string (set in step 1) |
| `SESSION_SECRET` | Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `OPENAI_API_KEY` | OpenAI Developer Dashboard → API Keys |

### STEP 3: Run Migrations (2 min)

```bash
cd apps/shopify-admin-app

# Generate Prisma types
npm run prisma:generate

# Create database schema
npm run prisma:migrate:dev
```

When prompted for migration name, type: `initial`

Expected output:
```
✔ Prisma Migrate created the first migration, `./prisma/migrations/...`
✔ Your database is now in sync with your schema.
```

### STEP 4: Start Development Server (1 min)

```bash
# Still in apps/shopify-admin-app directory
npm run dev
```

Expected output:
```
Your app URL: https://..."ngrok-url"...ngrok-free.app/
```

This opens the Shopify admin embedded app.

---

## What Each Step Does

| Step | Purpose | Duration |
| --- | --- | --- |
| 1. PostgreSQL | Creates database to store shop config, conversations, products | 5 min |
| 2. Environment | Shopify API auth, LLM keys, session secret | 3 min |
| 3. Migrations | Applies 22-table schema to PostgreSQL | 2 min |
| 4. Dev Server | Runs admin app with hot reload | Runs until stopped |

---

## Verify It Works

Once dev server is running:

1. **Access Admin Dashboard**
   - Shopify CLI prints URL (copy from terminal)
   - Looks like: `https://your-store.myshopify.com/admin/apps/...`

2. **Check Migrations**
   ```bash
   # In another terminal
   npm run prisma:studio
   ```
   This opens http://localhost:5555 showing all database tables

3. **Verify Network**
   - Admin app loads without errors
   - No red errors in browser console
   - Shopify Bridge initializes successfully

---

## If Something Goes Wrong

### "DATABASE_URL must be a valid connection string"
→ Check PostgreSQL is running: `psql postgresql://...`

### "Cannot find module from @fluxbot/*"
→ Run: `npm install --workspaces` from `/apps/` root

### "ngrok error: auth token required"
→ Shopify CLI will guide you. Run `npm run dev` again after auth.

### "Prisma schema error"
→ Verify schema path: `-schema ../../infra/prisma/schema.prisma`

---

## File Checklist

✅ These should exist after migration:

```
apps/
├── shopify-admin-app/
│   ├── .env.local                          ← You created this
│   ├── app/routes/app._index.tsx           ← Dashboard
│   ├── prisma/migrations/20250308.../      ← Created by migrate:dev
│   └── build/                              ← From npm build
├── package.json                             ← Root workspace
└── node_modules/                            ← npm install result

infra/
└── prisma/
    └── prisma/
        ├── schema.prisma
        └── migrations/                      ← Migration history
```

---

## What's Next After Setup

Once dev server is running smoothly:

1. **Explore Admin Dashboard** (already built)
   - Homepage with quick links
   - Placeholder pages for each feature
   - Ready for content

2. **Create Chat Endpoint** (next task)
   - File: `app/routes/api.chat.tsx`
   - Connects admin app → AI orchestrator → knowledge base

3. **Deploy Storefront Widget**
   - Theme App Extension in `/apps/storefront-widget/`
   - Installable from theme editor

4. **Run First Sync**
   - Fetch products/pages/policies from Shopify
   - Index them as knowledge documents
   - Enable semantic search

---

## Quick Reference Commands

```bash
# Development
npm run dev                    # Start dev server (admin app)
npm run build                  # Production build

# Database
npm run prisma:generate        # Update client types
npm run prisma:migrate:dev     # Apply migrations
npm run prisma:studio          # Open database UI

# Validation
npm run typecheck              # TypeScript check
npm run lint                   # ESLint check

# Workspace
npm install --workspaces       # Install all packages
npm ls --depth=0               # List workspace members
```

---

## Architecture Overview (High Level)

```
Shopify Admin
    ↓
    ├─→ Admin App (React + Polaris)
    │      ↓
    │   (8 Dashboard Pages + API)
    │      ↓
    └─→ Services (Business Logic)
           ├─ AI Orchestrator (Chat + Tools)
           ├─ Ingestion Service (Vector Search)
           └─ Sync Service (Shopify → Knowledge Base)
                  ↓
           PostgreSQL Database
```

You're now at the point where:
- ✅ Frontend is built
- ✅ Services layer exists
- ✅ Database schema designed
- ⏳ Next: Populate knowledge base + test chat endpoint

---

## Questions?

- Check `ARCHITECTURE.md` for detailed docs
- Check `.env.example` for all available options
- Check `AGENTS.md` for engineering guidelines

Good luck! 🚀
