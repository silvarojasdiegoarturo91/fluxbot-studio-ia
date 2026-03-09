# Database Migration Guide

## Overview

This guide helps you migrate from the simple session-only SQLite database to the full multi-tenant PostgreSQL schema.

## ⚠️ Breaking Changes

The database schema has been **completely redesigned**:

- **Database**: SQLite → **PostgreSQL**
- **Models**: 1 model (Session) → **22 models** (full domain)
- **Provider**: `sqlite` → `postgresql`

**This is a breaking change.** Existing session data will need to be migrated or recreated.

---

## Prerequisites

### 1. Install PostgreSQL

#### macOS (Homebrew)
\`\`\`bash
brew install postgresql@16
brew services start postgresql@16
\`\`\`

#### Ubuntu/Debian
\`\`\`bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
\`\`\`

#### Windows
Download from [postgresql.org](https://www.postgresql.org/download/windows/)

### 2. Create Database

\`\`\`bash
# Connect to PostgreSQL
psql postgres

# Create database and user
CREATE DATABASE fluxbot_dev;
CREATE USER fluxbot_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE fluxbot_dev TO fluxbot_user;
\q
\`\`\`

### 3. (Recommended) Install pgvector Extension

For vector embeddings support in the future:

\`\`\`bash
# On Ubuntu/Debian
sudo apt install postgresql-16-pgvector

# On macOS
brew install pgvector

# Enable in your database
psql -d fluxbot_dev
CREATE EXTENSION IF NOT EXISTS vector;
\q
\`\`\`

---

## Migration Steps

### Step 1: Backup Current Data (if needed)

If you have existing session data in SQLite:

\`\`\`bash
cd apps

# Export sessions to JSON
npx prisma studio
# Manually export Session table data

# Or use Prisma query
node -e "
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

prisma.session.findMany().then(sessions => {
  fs.writeFileSync('sessions-backup.json', JSON.stringify(sessions, null, 2));
  console.log('Sessions backed up to sessions-backup.json');
  process.exit(0);
});
"
\`\`\`

### Step 2: Update Environment Variables

Update `apps/.env`:

\`\`\`env
# OLD (SQLite)
# DATABASE_URL="file:./dev.sqlite"

# NEW (PostgreSQL)
DATABASE_URL="postgresql://fluxbot_user:your_secure_password@localhost:5432/fluxbot_dev?schema=public"
\`\`\`

### Step 3: Generate Prisma Client

\`\`\`bash
cd apps
npx prisma generate
\`\`\`

This will regenerate the Prisma client with the new PostgreSQL schema.

### Step 4: Run Migrations

#### Option A: Fresh Migration (Recommended for Development)

\`\`\`bash
# Create a new migration
npx prisma migrate dev --name phase1_foundation

# This will:
# - Create the new schema in PostgreSQL
# - Apply all 22 models
# - Generate migration SQL files
\`\`\`

#### Option B: Reset Everything (Clean Slate)

\`\`\`bash
# ⚠️ WARNING: This drops all data
npx prisma migrate reset

# This will:
# - Drop the database
# - Recreate it
# - Run all migrations
# - Seed if you have a seed script
\`\`\`

### Step 5: Verify Migration

\`\`\`bash
# Open Prisma Studio to inspect the database
npx prisma studio

# Or connect directly
psql postgresql://fluxbot_user:your_secure_password@localhost:5432/fluxbot_dev

# List all tables
\dt

# Should see:
# - Session
# - Shop
# - ShopInstallation
# - User
# - ChatbotConfig
# - AIProviderConfig
# - Conversation
# - ConversationMessage
# - ConversationEvent
# - CustomerIdentity
# - KnowledgeSource
# - KnowledgeDocument
# - KnowledgeChunk
# - EmbeddingRecord
# - ProductProjection
# - PolicyProjection
# - OrderProjection
# - ToolInvocation
# - HandoffRequest
# - ConsentRecord
# - AuditLog
# - WebhookEvent
# - SyncJob
\`\`\`

### Step 6: Restore Session Data (if needed)

If you backed up session data and need to restore it:

\`\`\`bash
node -e "
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

const sessions = JSON.parse(fs.readFileSync('sessions-backup.json', 'utf8'));

Promise.all(
  sessions.map(session => prisma.session.create({ data: session }))
).then(() => {
  console.log('Sessions restored');
  process.exit(0);
}).catch(err => {
  console.error('Restore failed:', err);
  process.exit(1);
});
"
\`\`\`

---

## Post-Migration Setup

### 1. Seed Initial Data (Optional)

Create `apps/prisma/seed.ts`:

\`\`\`typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create a test shop
  const shop = await prisma.shop.create({
    data: {
      shopifyDomain: 'test-store.myshopify.com',
      name: 'Test Store',
      status: 'ACTIVE',
      plan: 'FREE',
    },
  });

  // Create chatbot config
  await prisma.chatbotConfig.create({
    data: {
      shopId: shop.id,
      name: 'AI Assistant',
      tone: 'friendly',
      language: 'en',
      status: 'ACTIVE',
    },
  });

  console.log('Seed data created');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
\`\`\`

Add to `package.json`:
\`\`\`json
{
  "prisma": {
    "seed": "node --loader ts-node/esm prisma/seed.ts"
  }
}
\`\`\`

Run seed:
\`\`\`bash
npx prisma db seed
\`\`\`

### 2. Update Application Code

If you have existing code that queries sessions or shops, update it:

\`\`\`typescript
// OLD
const session = await prisma.session.findUnique({ where: { id } });

// NEW (with shop relation)
const session = await prisma.session.findUnique({ 
  where: { id },
  // Sessions are isolated, but you can now join with Shop if needed
});

// Query by shop
const shop = await prisma.shop.findUnique({
  where: { shopifyDomain: 'example.myshopify.com' },
  include: {
    chatbotConfigs: true,
    conversations: true,
  },
});
\`\`\`

---

## Rollback Plan

If you need to rollback to SQLite:

### 1. Restore schema.prisma

\`\`\`bash
git checkout HEAD~1 -- prisma/schema.prisma
\`\`\`

### 2. Update .env

\`\`\`env
DATABASE_URL="file:./dev.sqlite"
\`\`\`

### 3. Regenerate and migrate

\`\`\`bash
npx prisma generate
npx prisma migrate dev
\`\`\`

---

## Production Migration

For production databases:

### 1. Backup Production Data

\`\`\`bash
# PostgreSQL backup
pg_dump -U username -h hostname -d database_name > backup.sql

# Or with Prisma
npx prisma db pull  # Creates a snapshot of current schema
\`\`\`

### 2. Test Migration in Staging

Always test the full migration in a staging environment first.

### 3. Plan Downtime Window

The migration will require app downtime. Plan accordingly:
- Notify users
- Schedule during low-traffic window
- Have rollback plan ready

### 4. Execute Migration

\`\`\`bash
# Run migration non-interactively
npx prisma migrate deploy

# Verify
npx prisma migrate status
\`\`\`

### 5. Monitor Post-Migration

- Check application logs
- Monitor database performance
- Verify data integrity
- Test critical flows

---

## Troubleshooting

### "No such file or directory: dev.sqlite"

This is expected after switching to PostgreSQL. The SQLite file is no longer used.

### "Can't reach database server"

Check:
1. PostgreSQL is running: `pg_isready`
2. Credentials in `DATABASE_URL` are correct
3. Network/firewall allows connection
4. Database exists: `psql -l`

### Migration fails with "relation already exists"

Reset and retry:
\`\`\`bash
npx prisma migrate reset
npx prisma migrate dev
\`\`\`

### Prisma Client out of sync

Regenerate:
\`\`\`bash
npx prisma generate
\`\`\`

### Performance issues

Add indexes for your query patterns:
\`\`\`bash
npx prisma migrate dev --create-only --name add_custom_indexes
# Edit the migration SQL to add indexes
npx prisma migrate dev
\`\`\`

---

## Next Steps

After successful migration:

1. ✅ Verify all tables exist
2. ✅ Test authentication flow
3. ✅ Seed initial shop data if needed
4. ✅ Update application code to use new schema
5. ✅ Set up automated backups
6. ✅ Configure connection pooling for production
7. ✅ Monitor database performance

---

## Additional Resources

- [Prisma PostgreSQL Guide](https://www.prisma.io/docs/concepts/database-connectors/postgresql)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [Prisma Migration Reference](https://www.prisma.io/docs/concepts/components/prisma-migrate)
