# Setup & Launch Checklist

**Status:** ✅ Project Ready for Development  
**Last Update:** March 8, 2025

---

## Pre-Flight Checks (5 min)

- [ ] Node.js 20+ installed (`node --version`)
- [ ] npm 7+ installed (`npm --version`)
- [ ] PostgreSQL available (Docker, managed service, or local)
- [ ] Git repository cloned and up-to-date
- [ ] `.env.local` secrets available (API keys)

---

## Setup Steps (10 min)

### 1. PostgreSQL Setup

**Option A: Docker (Recommended)**
```bash
docker run --name fluxbot-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=fluxbot \
  -p 5432:5432 \
  -d postgres:16-alpine

# Verify
psql postgresql://postgres:postgres@localhost:5432/fluxbot -c "\dt"
```

**Option B: Managed Service**
- Railway, Render, Supabase, AWS RDS, or similar
- Get connection string from dashboard
- Note: Ensure access from your machine

**Option C: Local psql**
```bash
createdb fluxbot
```

### 2. Environment Setup

```bash
cd apps/shopify-admin-app
cp .env.example .env.local
```

**Edit `.env.local`** with:

| Variable | Source | Example |
| --- | --- | --- |
| `SHOPIFY_API_KEY` | Partner Dashboard → Apps Setup | `123456...` |
| `SHOPIFY_API_SECRET` | Partner Dashboard → Apps Setup | `abcdef...` |
| `SHOPIFY_APP_URL` | From `npm run dev` output | `https://abc-123.ngrok-free.app` |
| `SHOPIFY_SHOP` | Your dev store | `test-store.myshopify.com` |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@host/db` |
| `SESSION_SECRET` | Generate random (min 32 chars) | `$(node -e "...")` |
| `AI_PROVIDER` | Choose: openai\|anthropic\|gemini | `openai` |
| `OPENAI_API_KEY` | From api.openai.com | `sk-...` |

### 3. Database Setup

```bash
npm run prisma:generate
npm run prisma:migrate:dev
```

When prompted: → Type `initial` for migration name

**Success indicators:**
```
✔ Prisma Migrate created the first migration
✔ Your database is now in sync with your schema
Database has been created at ./dev.sqlite
```

### 4. Dependencies

```bash
npm install --workspaces
```

**Should show:**
```
added XX packages, and audited XXX packages in Xs
0 vulnerabilities
```

### 5. Validation

```bash
npm run typecheck
npm run build
```

**Should show:**
```
✓ built in X.XXs
✓ X modules transformed
```

---

## Launch (1 min)

```bash
npm run dev
```

**Output should include:**
```
Your app URL: https://your-store.myshopify.com/admin/apps/...
```

**Click that URL** → Opens your admin app in Shopify

---

## Verify It Works (5 min)

### 1. Dashboard Loads
- [ ] Admin app opens without errors
- [ ] 8 pages visible in sidebar
- [ ] No console errors (F12 → Console tab)
- [ ] Polaris buttons clickable

### 2. Database Connected
```bash
npm run prisma:studio
```
- [ ] Opens at http://localhost:5555
- [ ] Shows 22 tables
- [ ] Can browse records

### 3. Workspace Ready
```bash
npm ls --depth=0
```
- [ ] Shows 12 workspace members
- [ ] All @fluxbot/* packages listed
- [ ] No workspace warnings

---

## Next Steps (What to Do Now)

### Immediate (This session)
- [ ] Explore admin dashboard (all 8 pages)
- [ ] Check database schema in Prisma Studio
- [ ] Read ARCHITECTURE.md

### Short-term (This week)
- [ ] Create `/api/chat` endpoint
- [ ] Implement product sync
- [ ] Test semantic search
- [ ] Deploy theme widget

### Medium-term (Next 2 weeks)
- [ ] Behavioral triggers
- [ ] Human handoff
- [ ] Analytics dashboard
- [ ] Order lookup

---

## Troubleshooting

### "Cannot connect to database"
```bash
# Check PostgreSQL is running
psql postgresql://postgres:postgres@localhost:5432/fluxbot -c "SELECT 1"

# Check DATABASE_URL in .env.local
cat .env.local | grep DATABASE_URL
```

### "Cannot find module @fluxbot/*"
```bash
npm install --workspaces
npm ls --depth=0
```

### "Prisma schema not found"
```bash
# Verify path exists
ls -la /infra/prisma/schema.prisma

# Should show: schema.prisma
```

### "ngrok auth required"
```bash
# Shopify CLI will prompt you
npm run dev
# Follow the auth flow
```

### "Build fails with TypeScript errors"
```bash
npm run typecheck
# Read error messages
# Check AGENTS.md for code standards
```

---

## Quick Reference Commands

```bash
# Development
npm run dev           # Start dev server
npm run build         # Production build
npm run typecheck     # TypeScript check
npm run lint          # Code lint

# Database
npm run prisma:generate        # Generate client
npm run prisma:migrate:dev     # Create/apply migration
npm run prisma:studio          # Database UI

# Workspace
npm ls --depth=0               # List packages
npm install --workspaces      # Install all
```

---

## Files to Read Next

1. **QUICK_START.md** — Detailed setup guide
2. **ARCHITECTURE.md** — System design
3. **PROJECT_STATUS.md** — Current status
4. **AGENTS.md** — Code standards

---

## Estimate

| Step | Time | Status |
| --- | --- | --- |
| PostgreSQL | 2 min | ⏳ |
| Environment | 3 min | ⏳ |
| Database | 2 min | ⏳ |
| Dependencies | 3 min | ⏳ |
| Validation | 2 min | ⏳ |
| **Total** | **~12 min** | 🎯 |

---

## Success Criteria

You've successfully set up when:
- ✅ `npm run dev` starts without errors
- ✅ Admin app opens in browser
- ✅ Dashboard loads with all 8 pages
- ✅ `npm run typecheck` returns zero errors
- ✅ `npm run build` completes successfully
- ✅ Prisma Studio shows all 22 tables
- ✅ `npm ls --depth=0` shows 12 workspace members

---

## Support

- Setup help → See QUICK_START.md
- Architecture questions → See ARCHITECTURE.md
- Code standards → See AGENTS.md
- Status info → See PROJECT_STATUS.md

---

**Ready? Let's go! 🚀**

Start with Step 1 above, or if you prefer automated setup, check QUICK_START.md for Docker one-liner.
