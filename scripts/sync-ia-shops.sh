#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_APP_DIR="${ROOT_DIR}/apps/shopify-admin-app"
BACKEND_REPO_PATH="${IA_BACKEND_REPO_PATH:-${ROOT_DIR}/../fluxbot-studio-back-ia}"
CLI_SYNC_BACKEND_URL="${IA_BACKEND_URL:-}"
CLI_SYNC_API_KEY="${IA_BACKEND_API_KEY:-}"

load_env_file() {
  local file_path="$1"
  if [[ -f "$file_path" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file_path"
    set +a
  fi
}

set +u
load_env_file "${FRONTEND_APP_DIR}/.env"
load_env_file "${FRONTEND_APP_DIR}/.env.local"
FRONTEND_DATABASE_URL="${DATABASE_URL:-}"
SYNC_BACKEND_URL="${CLI_SYNC_BACKEND_URL:-${IA_BACKEND_URL:-http://127.0.0.1:3001}}"
SYNC_API_KEY="${CLI_SYNC_API_KEY:-${IA_BACKEND_API_KEY:-}}"
unset DATABASE_URL IA_BACKEND_URL IA_BACKEND_API_KEY

if [[ -z "${SYNC_API_KEY}" ]]; then
  load_env_file "${BACKEND_REPO_PATH}/.env"
  SYNC_API_KEY="${IA_BACKEND_API_KEY:-${BACKEND_API_KEY:-${MASTER_API_KEY:-}}}"
  unset DATABASE_URL IA_BACKEND_API_KEY BACKEND_API_KEY MASTER_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY GEMINI_API_KEY NODE_ENV PORT
fi
set -u

if [[ -z "${FRONTEND_DATABASE_URL}" ]]; then
  echo "[shops:sync:ia] DATABASE_URL not found in ${FRONTEND_APP_DIR}/.env(.local)."
  exit 1
fi

if [[ -z "${SYNC_API_KEY}" ]]; then
  echo "[shops:sync:ia] IA backend API key missing. Set IA_BACKEND_API_KEY in frontend env or IA_BACKEND_API_KEY/BACKEND_API_KEY/MASTER_API_KEY in backend env."
  exit 1
fi

shop_lines="$({
  cd "${FRONTEND_APP_DIR}"
  DATABASE_URL="${FRONTEND_DATABASE_URL}" SHOP_DOMAIN_FILTER="${SHOP_DOMAIN_FILTER:-}" node --input-type=module <<'NODE'
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

try {
  const domainFilter = process.env.SHOP_DOMAIN_FILTER?.trim().toLowerCase();
  const shops = await prisma.shop.findMany({
    where: domainFilter ? { domain: domainFilter } : undefined,
    select: {
      id: true,
      domain: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  for (const shop of shops) {
    process.stdout.write(`${shop.id}\t${shop.domain}\n`);
  }
} finally {
  await prisma.$disconnect();
}
NODE
} )"

if [[ -z "${shop_lines}" ]]; then
  if [[ -n "${SHOP_DOMAIN_FILTER:-}" ]]; then
    echo "[shops:sync:ia] No frontend shop found for domain ${SHOP_DOMAIN_FILTER}."
  else
    echo "[shops:sync:ia] No shops found in frontend database."
  fi
  exit 1
fi

synced_count=0
while IFS=$'\t' read -r shop_id shop_domain; do
  [[ -z "${shop_id}" ]] && continue

  response="$({
    curl -sS -w '\n%{http_code}' \
      -X POST "${SYNC_BACKEND_URL%/}/api/v1/shops/sync" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${SYNC_API_KEY}" \
      -H "X-Shop-Domain: ${shop_domain}" \
      -d "{\"shop\":{\"id\":\"${shop_id}\",\"domain\":\"${shop_domain}\"}}"
  } )"

  status_code="${response##*$'\n'}"
  response_body="${response%$'\n'*}"

  if [[ ! "${status_code}" =~ ^2 ]]; then
    echo "[shops:sync:ia] Failed to sync ${shop_domain} (HTTP ${status_code})."
    echo "${response_body}"
    exit 1
  fi

  summary="$(RESPONSE_BODY="${response_body}" node --input-type=module -e "const payload = JSON.parse(process.env.RESPONSE_BODY ?? '{}'); const shop = payload.data.shop; const state = payload.data.created ? 'created' : 'updated'; process.stdout.write(shop.domain + ' (' + state + ')');")"

  echo "[shops:sync:ia] ${summary}"
  synced_count=$((synced_count + 1))
done <<< "${shop_lines}"

echo "[shops:sync:ia] Synchronized ${synced_count} shop reference(s)."