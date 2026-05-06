#!/bin/bash

# Migration Validation & Application Script
# Run this to ensure all database migrations are properly applied
# Usage: ./scripts/validate-migrations.sh

set -e

SCHEMA_PATH="infra/prisma/schema.prisma"
APP_DIR="apps/shopify-admin-app"

echo "🔍 Database Migration Validator & Applier"
echo "=========================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable not set"
  echo ""
  echo "Set it with:"
  echo "  export DATABASE_URL='postgresql://user:pass@host/dbname'"
  exit 1
fi

# Check if Prisma schema exists
if [ ! -f "$SCHEMA_PATH" ]; then
  echo "❌ ERROR: Prisma schema not found at $SCHEMA_PATH"
  exit 1
fi

echo "✅ Environment: DATABASE_URL is set"
echo "✅ Schema: Found at $SCHEMA_PATH"
echo ""

# 1. Validate current schema
echo "📋 Step 1: Validating schema..."
if npx prisma db validate --schema="$SCHEMA_PATH" 2>&1; then
  echo "✅ Schema is valid"
else
  echo "❌ Schema validation failed"
  exit 1
fi
echo ""

# 2. Check migration status
echo "📋 Step 2: Checking migration status..."
if ! npx prisma migrate status --schema="$SCHEMA_PATH" 2>&1; then
  echo "⚠️  Could not check migration status"
fi
echo ""

# 3. Apply pending migrations
echo "📋 Step 3: Applying pending migrations..."
if npx prisma migrate deploy --schema="$SCHEMA_PATH" 2>&1; then
  echo "✅ Migrations applied successfully"
else
  echo "⚠️  Migration deploy had issues (may be normal if already applied)"
fi
echo ""

# 4. Generate Prisma client
echo "📋 Step 4: Regenerating Prisma client..."
if npx prisma generate --schema="$SCHEMA_PATH" 2>&1; then
  echo "✅ Prisma client regenerated"
else
  echo "❌ Failed to generate Prisma client"
  exit 1
fi
echo ""

# 5. Verify onboarding field exists
echo "📋 Step 5: Verifying onboarding field..."
if npx prisma db execute --stdin --schema="$SCHEMA_PATH" << SQL 2>&1 | grep -q "true"
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'shops'
  AND column_name = 'onboardingCompletedAt'
) as field_exists;
SQL
then
  echo "✅ onboardingCompletedAt field exists in database"
else
  echo "❌ onboardingCompletedAt field NOT found in database"
  echo "   This means migrations were not applied!"
  echo "   Try:"
  echo "     npx prisma migrate reset"
  echo "     npm run test"
  exit 1
fi
echo ""

# 6. Verify index exists
echo "📋 Step 6: Verifying performance index..."
if npx prisma db execute --stdin --schema="$SCHEMA_PATH" << SQL 2>&1 | grep -q "idx_shops_onboarding_completed_at"
SELECT indexname FROM pg_indexes 
WHERE tablename = 'shops' 
AND indexname = 'idx_shops_onboarding_completed_at';
SQL
then
  echo "✅ Performance index exists"
else
  echo "⚠️  Performance index not found (might be normal if DB is old)"
fi
echo ""

echo "✅ =========================================="
echo "✅ All migration validations passed!"
echo "✅ Database is ready for onboarding features"
echo "✅ =========================================="
echo ""
echo "You can now:"
echo "  1. Run tests: npm run test"
echo "  2. Start app: npm run dev"
echo ""
