# Phase 1 Setup Guide

> Canonical status source: [STATUS_MATRIX.md](./STATUS_MATRIX.md). This document is historical context.

## Prerequisites Checklist

Before running Phase 1, ensure you have:

- ✅ PostgreSQL 14+ installed and running
- ✅ Node.js 20+ installed
- ✅ Shopify Partner account with app created
- ✅ At least one AI provider API key (OpenAI recommended)
- ✅ ngrok or similar tunnel for development

---

## Step 1: PostgreSQL Setup

### Option A: Local PostgreSQL (Development)

```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql

# In psql shell:
CREATE DATABASE fluxbot_dev;
CREATE USER fluxbot_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE fluxbot_dev TO fluxbot_user;
GRANT ALL ON SCHEMA public TO fluxbot_user;
\q
```

### Option B: Docker PostgreSQL

```bash
# Create docker-compose.yml in project root
cat > docker-compose.yml <<EOF
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: fluxbot_dev
      POSTGRES_USER: fluxbot_user
      POSTGRES_PASSWORD: your_secure_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
EOF

# Start PostgreSQL
docker-compose up -d

# Verify it's running
docker-compose ps
```

---

## Step 2: Configure Environment Variables

Edit `apps/shopify-admin-app/.env.local`:

```bash
# Copy from template if needed
cp apps/shopify-admin-app/.env.example apps/shopify-admin-app/.env.local

# Edit with your values
nano apps/shopify-admin-app/.env.local
```

### Required Variables:

```env
# Shopify (from Partners Dashboard)
SHOPIFY_API_KEY=your_api_key_from_partners
SHOPIFY_API_SECRET=your_secret_from_partners
SHOPIFY_APP_URL=https://your-subdomain.ngrok-free.app

# Database (match your setup from Step 1)
DATABASE_URL=postgresql://fluxbot_user:your_secure_password@localhost:5432/fluxbot_dev

# AI Provider (get from OpenAI)
OPENAI_API_KEY=sk-your-actual-openai-key
AI_PROVIDER=openai

# Session Secret (generate with: openssl rand -base64 32)
SESSION_SECRET=your_generated_session_secret_here
```

---

## Step 3: Run Database Migrations

```bash
cd apps/shopify-admin-app

# Generate Prisma client
npm run prisma:generate

# Create and apply migrations
npm run prisma:migrate:dev --name init_phase1

# Verify schema
npx prisma studio --schema ../../infra/prisma/schema.prisma
```

**Expected output:**
- 22 tables created
- Prisma Studio opens at http://localhost:5555

---

## Step 4: Verify Installation

### Test Database Connection

```bash
# Test Prisma connection
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.shop.findMany()
  .then(shops => {
    console.log('✅ Database connected:', shops.length, 'shops found');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Database error:', err.message);
    process.exit(1);
  });
"
```

### Run Phase 1 Tests

```bash
# Run all tests (Phase 0 + Phase 1)
npm test

# Run only Phase 1 E2E tests
npm test -- test/phase1

# Expected: All 68 Phase 0 tests + Phase 1 E2E tests passing
```

---

## Step 5: Start Development Server

```bash
# Terminal 1: Start ngrok
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok-free.app)
# Update SHOPIFY_APP_URL in .env.local

# Terminal 2: Start app
npm run dev

# Expected output:
# ✔ Prisma client generated
# ✔ Database connected
# ✔ Server running on http://localhost:3000
# ✔ Shopify OAuth ready
```

---

## Step 6: Install App in Test Store

1. Go to Partners Dashboard → Your App → Test on development store
2. Select your development store
3. Approve installation
4. You should see the admin dashboard

---

## Step 7: Test Chat Endpoint

```bash
# Create a test conversation
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "X-Shop-Domain: your-store.myshopify.com" \
  -d '{
    "message": "Hello, what products do you have?",
    "locale": "en"
  }'

# Expected response:
# {
#   "success": true,
#   "conversationId": "uuid-here",
#   "message": "AI response here",
#   "confidence": 0.85
# }
```

---

## Troubleshooting

### Database Connection Errors

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection manually
psql -h localhost -U fluxbot_user -d fluxbot_dev

# If "peer authentication failed":
# Edit /etc/postgresql/16/main/pg_hba.conf
# Change: local all all peer
# To:     local all all md5
sudo systemctl restart postgresql
```

### Prisma Migration Errors

```bash
# Reset database (CAUTION: deletes all data)
npm run prisma:migrate:reset --schema ../../infra/prisma/schema.prisma

# Re-run migrations
npm run prisma:migrate:dev --schema ../../infra/prisma/schema.prisma
```

### AI Provider Errors

```bash
# Test OpenAI key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Should return list of models
```

### Shopify OAuth Errors

1. Verify SHOPIFY_APP_URL matches ngrok URL exactly
2. Check scopes in .env.local match Partners Dashboard
3. Ensure app is not blocked by browser (disable ad blockers)
4. Try incognito mode

---

## Next Steps

After successful setup:

1. ✅ Run initial catalog sync (implement in admin UI)
2. ✅ Test widget installation in theme
3. ✅ Configure AI prompts and behavior
4. ✅ Test end-to-end chat flow

---

## Quick Verification Commands

```bash
# Check all services
npm run dev                    # Dev server should start
npm test                       # All tests should pass
npx prisma studio              # Database viewer should open

# Check environment
node -e "console.log(process.env.DATABASE_URL)"
node -e "console.log(process.env.OPENAI_API_KEY?.substring(0, 10))"
```

---

## Phase 1 Completion Checklist

- [ ] PostgreSQL installed and running
- [ ] Database created with 22 tables
- [ ] .env.local configured with real credentials
- [ ] Prisma migrations applied successfully
- [ ] Phase 0 tests passing (68/68)
- [ ] Phase 1 E2E tests passing
- [ ] Chat API endpoint responding
- [ ] App installed in development store
- [ ] Admin dashboard loading

**When all checked: Phase 1 is complete! 🎉**
