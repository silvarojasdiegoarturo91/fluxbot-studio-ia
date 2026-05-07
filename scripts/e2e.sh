#!/usr/bin/env bash
# Run the full E2E test suite locally.
# Usage:
#   ./scripts/e2e.sh           # run all tests
#   ./scripts/e2e.sh smoke     # run only smoke tests
#   ./scripts/e2e.sh ui        # open Playwright UI mode
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO_ROOT/apps/shopify-admin-app"

MODE="${1:-all}"

echo "🐳  Starting test database..."
"$REPO_ROOT/scripts/test-db.sh" start

echo "🔄  Running migrations on test DB..."
cd "$APP_DIR"
DATABASE_URL="postgresql://test:test@localhost:5433/test_db?schema=public" \
  npx prisma migrate deploy --schema ../../infra/prisma/schema.prisma

echo "🚀  Starting app server on :3002..."
NODE_ENV=test \
E2E_TEST_MODE=true \
DATABASE_URL="postgresql://test:test@localhost:5433/test_db?schema=public" \
SHOPIFY_APP_URL="http://localhost:3002" \
SHOPIFY_API_KEY="${SHOPIFY_API_KEY:-8c36112e98ce36be869eb0dc5efdd572}" \
SHOPIFY_API_SECRET="${SHOPIFY_API_SECRET:-}" \
SHOPIFY_SHOP="quickstart-c8cc9986.myshopify.com" \
REDIS_URL="redis://localhost:6380" \
IA_BACKEND_URL="http://localhost:3001" \
IA_BACKEND_API_KEY="dev_master_key" \
PORT=3002 \
npx react-router dev --port 3002 &
SERVER_PID=$!

# Wait for server to be ready
echo "⏳  Waiting for server..."
for i in $(seq 1 30); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/ --max-time 2 2>/dev/null || echo "000")
  if [[ "$STATUS" =~ ^[23] ]] || [[ "$STATUS" == "302" ]]; then
    echo "✅  Server ready (HTTP $STATUS)"
    break
  fi
  echo "   ($i/30) HTTP $STATUS — retrying..."
  sleep 2
done

cleanup() {
  echo "🛑  Stopping server (PID $SERVER_PID)..."
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo ""
echo "🧪  Running E2E tests (mode: $MODE)..."
case "$MODE" in
  smoke)
    E2E_SKIP_SERVER=1 E2E_BASE_URL=http://localhost:3002 \
      DATABASE_URL="postgresql://test:test@localhost:5433/test_db?schema=public" \
      SHOPIFY_SHOP="quickstart-c8cc9986.myshopify.com" \
      npx playwright test tests/e2e/smoke/ --reporter=list
    ;;
  ui)
    E2E_SKIP_SERVER=1 E2E_BASE_URL=http://localhost:3002 \
      DATABASE_URL="postgresql://test:test@localhost:5433/test_db?schema=public" \
      SHOPIFY_SHOP="quickstart-c8cc9986.myshopify.com" \
      npx playwright test --ui
    ;;
  *)
    E2E_SKIP_SERVER=1 E2E_BASE_URL=http://localhost:3002 \
      DATABASE_URL="postgresql://test:test@localhost:5433/test_db?schema=public" \
      SHOPIFY_SHOP="quickstart-c8cc9986.myshopify.com" \
      npx playwright test --reporter=list
    ;;
esac
