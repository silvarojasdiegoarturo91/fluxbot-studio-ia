#!/bin/bash
set -e

COMPOSE_FILE="docker-compose.test.yml"
COMPOSE_CMD="docker-compose -f $COMPOSE_FILE"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

case ${1:-start} in
  start)
    echo -e "${YELLOW}🚀 Starting test database...${NC}"
    $COMPOSE_CMD up -d
    sleep 3
    if docker-compose -f $COMPOSE_FILE exec -T postgres-test pg_isready -U test -d test_db > /dev/null 2>&1; then
      echo -e "${GREEN}✅ Test database ready${NC}"
      echo "Connection: postgresql://test:test@localhost:5433/test_db"
    else
      echo -e "${RED}❌ Failed to start${NC}"
      exit 1
    fi
    ;;
  stop)
    echo -e "${YELLOW}🛑 Stopping test database...${NC}"
    $COMPOSE_CMD down
    echo -e "${GREEN}✅ Stopped${NC}"
    ;;
  reset)
    echo -e "${YELLOW}🔄 Resetting test database...${NC}"
    $COMPOSE_CMD down
    docker volume rm fluxbot-studio-ia_postgres-test-data 2>/dev/null || true
    $COMPOSE_CMD up -d
    sleep 3
    export DATABASE_URL="postgresql://test:test@localhost:5433/test_db"
    npx prisma migrate deploy --schema=infra/prisma/schema.prisma || true
    echo -e "${GREEN}✅ Reset complete${NC}"
    ;;
  logs)
    $COMPOSE_CMD logs -f postgres-test
    ;;
  *)
    echo "Usage: $0 {start|stop|reset|logs}"
    exit 1
    ;;
esac
