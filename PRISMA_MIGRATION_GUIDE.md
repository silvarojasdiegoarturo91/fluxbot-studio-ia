# Prisma Migration Error Prevention Guide

## The Problem

```
PrismaClientValidationError: 
Invalid `prisma.shop.update()` invocation:
Unknown argument `onboardingCompletedAt`
```

This error occurs when:
1. The Prisma schema includes `onboardingCompletedAt` field
2. But the database doesn't have this column
3. The migration wasn't executed

**Root Cause:** Prisma migrations weren't applied to the database before the app started.

---

## Solution: Apply Migrations

### Quick Fix (Development)

```bash
# From project root
npx prisma migrate deploy --schema=infra/prisma/schema.prisma

# Then regenerate the client
npx prisma generate --schema=infra/prisma/schema.prisma

# Verify it worked
npm run test
```

### For Production

```bash
# 1. Verify database connection
export DATABASE_URL="postgresql://user:pass@host/dbname"

# 2. Apply migrations
npx prisma migrate deploy --schema=infra/prisma/schema.prisma

# 3. Verify the column exists
npx prisma db execute --stdin --schema=infra/prisma/schema.prisma << SQL
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'shops'
  AND column_name = 'onboardingCompletedAt'
) as field_exists;
SQL

# Should output: field_exists = true
```

---

## Prevention: Tests & Validation

### 1. Automated Tests (NEW)

Three test suites now validate migrations:

#### `test/integration/prisma-schema-validation.test.ts`
- Validates that `onboardingCompletedAt` field exists
- Tests all CRUD operations on the field
- Verifies indexes are created
- **Run before deployment:**
  ```bash
  npm run test -- prisma-schema-validation.test.ts
  ```

#### `test/integration/onboarding-action-database.test.ts`
- Tests the exact operation that was failing
- Validates onboarding completion scenarios
- Tests reinstall/reset scenarios
- **Run before deployment:**
  ```bash
  npm run test -- onboarding-action-database.test.ts
  ```

#### `test/integration/pre-deployment-migration-validation.test.ts`
- Validates all migrations are present
- Checks migration SQL files
- Documents deployment procedures
- **Run in CI/CD:**
  ```bash
  npm run test -- pre-deployment-migration-validation.test.ts
  ```

### 2. Migration Validation Script

```bash
# Run this to validate and apply migrations
./scripts/validate-migrations.sh
```

What it does:
1. ✅ Validates Prisma schema
2. ✅ Checks migration status
3. ✅ Applies pending migrations
4. ✅ Regenerates Prisma client
5. ✅ Verifies `onboardingCompletedAt` exists
6. ✅ Verifies performance index exists

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Pre-Deployment Validation

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  validate-migrations:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      
      - run: npm ci
      
      - run: |
          export DATABASE_URL="postgresql://test:test@localhost:5432/testdb"
          npx prisma migrate deploy --schema=infra/prisma/schema.prisma
      
      - run: npm run test -- prisma-schema-validation.test.ts
      - run: npm run test -- onboarding-action-database.test.ts
```

---

## Developer Workflow

### When You Pull New Code

```bash
# 1. Update dependencies
npm install

# 2. Apply any new migrations
npx prisma migrate dev --schema=infra/prisma/schema.prisma

# 3. Regenerate client
npx prisma generate --schema=infra/prisma/schema.prisma

# 4. Run tests
npm run test

# 5. Start development
npm run dev
```

### If You Get the Error

```bash
# Scenario 1: Database is completely fresh
npx prisma migrate deploy --schema=infra/prisma/schema.prisma

# Scenario 2: Migrations got corrupted
npx prisma migrate resolve --rolled-back 20260506223346_add_onboarding_tracking
npx prisma migrate dev --schema=infra/prisma/schema.prisma

# Scenario 3: Database is way out of sync
npx prisma db push --force-reset --schema=infra/prisma/schema.prisma
```

---

## What the Migration Does

**Migration:** `20260506223346_add_onboarding_tracking`

**SQL Operations:**
```sql
-- Add the onboarding completion timestamp column
ALTER TABLE "shops" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Create index for fast queries about onboarding status
CREATE INDEX "idx_shops_onboarding_completed_at" ON "shops"("onboardingCompletedAt");
```

**Results:**
- ✅ New column: `shops.onboardingCompletedAt` (nullable DateTime)
- ✅ New index: `idx_shops_onboarding_completed_at` for performance
- ✅ Allows tracking when users completed onboarding
- ✅ Supports reinstall detection (null = not completed)

---

## Verification Checklist

- [ ] `npx prisma migrate status` shows no pending migrations
- [ ] `onboardingCompletedAt` column exists in database
- [ ] `idx_shops_onboarding_completed_at` index exists
- [ ] `npm run test -- prisma-schema-validation.test.ts` passes
- [ ] `npm run test -- onboarding-action-database.test.ts` passes
- [ ] App starts without "Unknown argument" errors
- [ ] `prisma.shop.update({ data: { onboardingCompletedAt: new Date() } })` works

---

## Common Errors & Solutions

### Error: `Unknown argument \`onboardingCompletedAt\``
**Cause:** Migration not applied
**Fix:** Run `npx prisma migrate deploy --schema=infra/prisma/schema.prisma`

### Error: `Schema not found`
**Cause:** Wrong schema path
**Fix:** Use `--schema=infra/prisma/schema.prisma`

### Error: `Connection refused`
**Cause:** DATABASE_URL not set or database not running
**Fix:** Set DATABASE_URL and start database

### Error: `Migration already applied`
**Cause:** Migration is idempotent
**Fix:** This is normal, tests will still pass

---

## Files Related to This Issue

### Migration Files
- `infra/prisma/migrations/20260506223346_add_onboarding_tracking/migration.sql` - The SQL migration

### Schema Files
- `infra/prisma/schema.prisma` - Defines `onboardingCompletedAt` field

### Code Using the Field
- `apps/shopify-admin-app/app/routes/app.onboarding.tsx` - Updates the field
- `apps/shopify-admin-app/app/routes/api.webhooks.ts` - Resets the field
- `apps/shopify-admin-app/app/services/shop-context.server.ts` - Reads the field

### Tests
- `test/integration/prisma-schema-validation.test.ts` - Validates field exists
- `test/integration/onboarding-action-database.test.ts` - Tests CRUD operations
- `test/integration/pre-deployment-migration-validation.test.ts` - Pre-deployment checks

### Scripts
- `scripts/validate-migrations.sh` - Automated validation and application

---

## References

- [Prisma Migrations Docs](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate)
- [Prisma Client Generation](https://www.prisma.io/docs/orm/reference/command-reference#generate)
- [Database Configuration](https://www.prisma.io/docs/orm/reference/connection-urls)
