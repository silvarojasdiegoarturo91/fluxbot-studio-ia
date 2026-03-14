#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_APP_DIR="${ROOT_DIR}/apps/shopify-admin-app"
BACKEND_REPO_PATH="${IA_BACKEND_REPO_PATH:-${ROOT_DIR}/../fluxbot-studio-back-ia}"

FRONTEND_HOST="${SMOKE_FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${SMOKE_FRONTEND_PORT:-3100}"
BACKEND_HOST="${SMOKE_BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${SMOKE_BACKEND_PORT:-3101}"
FRONTEND_BASE_URL="http://${FRONTEND_HOST}:${FRONTEND_PORT}"
BACKEND_BASE_URL="http://${BACKEND_HOST}:${BACKEND_PORT}"
LOG_DIR="$(mktemp -d /tmp/fluxbot-smoke-release.XXXXXX)"

backend_started_by_script=0
frontend_started_by_script=0
backend_pid=""
frontend_pid=""

load_env_file() {
  local file_path="$1"
  if [[ -f "$file_path" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file_path"
    set +a
  fi
}

capture_frontend_env() {
  set +u
  load_env_file "${FRONTEND_APP_DIR}/.env"
  load_env_file "${FRONTEND_APP_DIR}/.env.local"
  FRONTEND_DATABASE_URL="${DATABASE_URL:-}"
  FRONTEND_SESSION_SECRET="${SESSION_SECRET:-}"
  FRONTEND_SHOPIFY_API_KEY="${SHOPIFY_API_KEY:-}"
  FRONTEND_SHOPIFY_API_SECRET="${SHOPIFY_API_SECRET:-}"
  FRONTEND_SCOPES="${SCOPES:-}"
  FRONTEND_SERVICE_API_KEY="${IA_BACKEND_API_KEY:-}"
  unset DATABASE_URL SESSION_SECRET SHOPIFY_API_KEY SHOPIFY_API_SECRET SCOPES IA_BACKEND_API_KEY IA_BACKEND_URL NODE_ENV PORT
  set -u
}

capture_backend_env() {
  set +u
  load_env_file "${BACKEND_REPO_PATH}/.env"
  BACKEND_DATABASE_URL="${DATABASE_URL:-}"
  BACKEND_OPENAI_API_KEY="${OPENAI_API_KEY:-}"
  BACKEND_ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
  BACKEND_GEMINI_API_KEY="${GEMINI_API_KEY:-}"
  BACKEND_SERVICE_API_KEY="${IA_BACKEND_API_KEY:-${BACKEND_API_KEY:-${MASTER_API_KEY:-}}}"
  unset DATABASE_URL OPENAI_API_KEY ANTHROPIC_API_KEY GEMINI_API_KEY IA_BACKEND_API_KEY BACKEND_API_KEY MASTER_API_KEY NODE_ENV PORT
  set -u
}

kill_managed_process() {
  local pid="$1"
  if [[ -z "${pid}" ]]; then
    return
  fi

  kill -- -"${pid}" 2>/dev/null || kill "${pid}" 2>/dev/null || true
  wait "${pid}" 2>/dev/null || true
}

start_managed_session() {
  local log_file="$1"
  local command="$2"

  setsid bash -lc "${command}" >"${log_file}" 2>&1 &
  echo $!
}

validate_health_payload() {
  HEALTH_PAYLOAD="$1" node --input-type=module -e "const payload = JSON.parse(process.env.HEALTH_PAYLOAD ?? '{}'); if (payload.status !== 'ok') { console.error('[smoke:release] Invalid backend health payload.'); process.exit(1); } console.log('[smoke:release] backend health ok @ ' + payload.timestamp);"
}

validate_intent_payload() {
  INTENT_PAYLOAD="$1" node --input-type=module -e "const payload = JSON.parse(process.env.INTENT_PAYLOAD ?? '{}'); if (!payload.success || !payload.analysis?.dominantIntent) { console.error('[smoke:release] Intent validation failed.'); process.exit(1); } console.log('[smoke:release] intent ok -> ' + payload.analysis.dominantIntent + ' (' + payload.analysis.confidence + ')');"
}

validate_triggers_payload() {
  TRIGGERS_PAYLOAD="$1" node --input-type=module -e "const payload = JSON.parse(process.env.TRIGGERS_PAYLOAD ?? '{}'); if (!payload.success || typeof payload.evaluationCount !== 'number' || payload.evaluationCount < 1) { console.error('[smoke:release] Trigger validation failed.'); process.exit(1); } console.log('[smoke:release] triggers ok -> evaluations=' + payload.evaluationCount + ', send=' + payload.sendCount);"
}

validate_chat_payload() {
  CHAT_PAYLOAD="$1" node --input-type=module -e "const payload = JSON.parse(process.env.CHAT_PAYLOAD ?? '{}'); const fallbackPattern = /(hubo un error al procesar|there was an error processing)/i; if (!payload.success || !payload.conversationId || !payload.message || fallbackPattern.test(payload.message)) { console.error('[smoke:release] Chat validation failed.'); process.exit(1); } console.log('[smoke:release] chat ok -> conversation=' + payload.conversationId + ', confidence=' + (payload.confidence ?? 'n/a'));"
}

is_backend_healthy() {
  curl -fsS "${BACKEND_BASE_URL}/health" >/dev/null 2>&1
}

is_frontend_ready() {
  local status_code
  status_code="$(curl -s -o /dev/null -w '%{http_code}' "${FRONTEND_BASE_URL}/" || true)"
  [[ "${status_code}" != "000" ]]
}

wait_for_backend() {
  local attempt=1
  while [[ "${attempt}" -le 60 ]]; do
    if is_backend_healthy; then
      return 0
    fi

    if [[ "${backend_started_by_script}" -eq 1 ]] && [[ -n "${backend_pid}" ]] && ! kill -0 "${backend_pid}" 2>/dev/null; then
      return 1
    fi

    sleep 1
    attempt=$((attempt + 1))
  done

  return 1
}

wait_for_frontend() {
  local attempt=1
  while [[ "${attempt}" -le 60 ]]; do
    if is_frontend_ready; then
      return 0
    fi

    if [[ "${frontend_started_by_script}" -eq 1 ]] && [[ -n "${frontend_pid}" ]] && ! kill -0 "${frontend_pid}" 2>/dev/null; then
      return 1
    fi

    sleep 1
    attempt=$((attempt + 1))
  done

  return 1
}

discover_shop_domain() {
  local discovered
  discovered="$({
    cd "${FRONTEND_APP_DIR}"
    DATABASE_URL="${FRONTEND_DATABASE_URL}" node --input-type=module <<'NODE'
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

try {
  const shop = await prisma.shop.findFirst({
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      domain: true,
    },
  });

  if (shop?.domain) {
    process.stdout.write(shop.domain);
  }
} finally {
  await prisma.$disconnect();
}
NODE
  } )"

  printf '%s' "${discovered}"
}

cleanup() {
  local exit_code=$?

  if [[ "${frontend_started_by_script}" -eq 1 ]] && [[ -n "${frontend_pid}" ]]; then
    kill_managed_process "${frontend_pid}"
  fi

  if [[ "${backend_started_by_script}" -eq 1 ]] && [[ -n "${backend_pid}" ]]; then
    kill_managed_process "${backend_pid}"
  fi

  if [[ "${exit_code}" -ne 0 ]]; then
    if [[ -f "${LOG_DIR}/backend.log" ]]; then
      echo "[smoke:release] Backend log tail:"
      tail -n 40 "${LOG_DIR}/backend.log" || true
    fi
    if [[ -f "${LOG_DIR}/frontend.log" ]]; then
      echo "[smoke:release] Frontend log tail:"
      tail -n 40 "${LOG_DIR}/frontend.log" || true
    fi
  fi

  rm -rf "${LOG_DIR}"
  exit "${exit_code}"
}

trap cleanup EXIT INT TERM

capture_frontend_env
capture_backend_env

SERVICE_API_KEY="${SMOKE_IA_BACKEND_API_KEY:-${FRONTEND_SERVICE_API_KEY:-${BACKEND_SERVICE_API_KEY:-}}}"

if [[ -z "${FRONTEND_DATABASE_URL}" ]]; then
  echo "[smoke:release] Frontend DATABASE_URL is missing."
  exit 1
fi

if [[ -z "${BACKEND_DATABASE_URL}" ]]; then
  echo "[smoke:release] Backend DATABASE_URL is missing."
  exit 1
fi

if [[ -z "${FRONTEND_SESSION_SECRET}" ]]; then
  echo "[smoke:release] SESSION_SECRET is missing in apps/shopify-admin-app/.env(.local)."
  exit 1
fi

if [[ -z "${FRONTEND_SHOPIFY_API_KEY}" || -z "${FRONTEND_SHOPIFY_API_SECRET}" || -z "${FRONTEND_SCOPES}" ]]; then
  echo "[smoke:release] Shopify frontend environment is incomplete."
  exit 1
fi

if [[ -z "${SERVICE_API_KEY}" ]]; then
  echo "[smoke:release] IA backend API key is missing."
  exit 1
fi

if [[ -n "${FRONTEND_SERVICE_API_KEY}" && -n "${BACKEND_SERVICE_API_KEY}" && "${FRONTEND_SERVICE_API_KEY}" != "${BACKEND_SERVICE_API_KEY}" ]]; then
  echo "[smoke:release] Warning: frontend/backend IA backend API keys differ in env files; using the resolved smoke key override."
fi

echo "[smoke:release] Logs -> ${LOG_DIR}"

if is_backend_healthy; then
  echo "[smoke:release] Reusing backend already listening at ${BACKEND_BASE_URL}."
else
  echo "[smoke:release] Building backend..."
  env \
    PORT="${BACKEND_PORT}" \
    NODE_ENV=production \
    DATABASE_URL="${BACKEND_DATABASE_URL}" \
    IA_BACKEND_API_KEY="${SERVICE_API_KEY}" \
    BACKEND_API_KEY="${SERVICE_API_KEY}" \
    MASTER_API_KEY="${SERVICE_API_KEY}" \
    OPENAI_API_KEY="${BACKEND_OPENAI_API_KEY}" \
    ANTHROPIC_API_KEY="${BACKEND_ANTHROPIC_API_KEY}" \
    GEMINI_API_KEY="${BACKEND_GEMINI_API_KEY}" \
    npm --prefix "${BACKEND_REPO_PATH}" run build >/dev/null

  echo "[smoke:release] Starting backend on ${BACKEND_BASE_URL}..."
  backend_pid="$(start_managed_session "${LOG_DIR}/backend.log" "cd '${BACKEND_REPO_PATH}' && exec env PORT='${BACKEND_PORT}' NODE_ENV=production DATABASE_URL='${BACKEND_DATABASE_URL}' IA_BACKEND_API_KEY='${SERVICE_API_KEY}' BACKEND_API_KEY='${SERVICE_API_KEY}' MASTER_API_KEY='${SERVICE_API_KEY}' ALLOW_DYNAMIC_SHOP_CONTEXT=false OPENAI_API_KEY='${BACKEND_OPENAI_API_KEY}' ANTHROPIC_API_KEY='${BACKEND_ANTHROPIC_API_KEY}' GEMINI_API_KEY='${BACKEND_GEMINI_API_KEY}' FRONTEND_WEBHOOK_URL='${FRONTEND_BASE_URL}' npm run start")"
  backend_started_by_script=1
fi

if ! wait_for_backend; then
  echo "[smoke:release] Backend did not become healthy at ${BACKEND_BASE_URL}."
  exit 1
fi

SHOP_DOMAIN="${SMOKE_SHOP_DOMAIN:-$(discover_shop_domain)}"
if [[ -z "${SHOP_DOMAIN}" ]]; then
  echo "[smoke:release] No shop found in frontend database."
  exit 1
fi

echo "[smoke:release] Syncing shop reference for ${SHOP_DOMAIN}..."
IA_BACKEND_URL="${BACKEND_BASE_URL}" IA_BACKEND_API_KEY="${SERVICE_API_KEY}" SHOP_DOMAIN_FILTER="${SHOP_DOMAIN}" bash "${ROOT_DIR}/scripts/sync-ia-shops.sh"

if is_frontend_ready; then
  echo "[smoke:release] Reusing frontend already listening at ${FRONTEND_BASE_URL}."
else
  echo "[smoke:release] Building frontend..."
  env \
    PORT="${FRONTEND_PORT}" \
    NODE_ENV=production \
    DATABASE_URL="${FRONTEND_DATABASE_URL}" \
    SESSION_SECRET="${FRONTEND_SESSION_SECRET}" \
    SHOPIFY_API_KEY="${FRONTEND_SHOPIFY_API_KEY}" \
    SHOPIFY_API_SECRET="${FRONTEND_SHOPIFY_API_SECRET}" \
    SHOPIFY_APP_URL="${FRONTEND_BASE_URL}" \
    SCOPES="${FRONTEND_SCOPES}" \
    IA_EXECUTION_MODE=remote \
    IA_BACKEND_URL="${BACKEND_BASE_URL}" \
    IA_BACKEND_API_KEY="${SERVICE_API_KEY}" \
    npm --prefix "${FRONTEND_APP_DIR}" run build >/dev/null

  echo "[smoke:release] Starting frontend on ${FRONTEND_BASE_URL}..."
  frontend_pid="$(start_managed_session "${LOG_DIR}/frontend.log" "cd '${FRONTEND_APP_DIR}' && exec env PORT='${FRONTEND_PORT}' NODE_ENV=production DATABASE_URL='${FRONTEND_DATABASE_URL}' SESSION_SECRET='${FRONTEND_SESSION_SECRET}' SHOPIFY_API_KEY='${FRONTEND_SHOPIFY_API_KEY}' SHOPIFY_API_SECRET='${FRONTEND_SHOPIFY_API_SECRET}' SHOPIFY_APP_URL='${FRONTEND_BASE_URL}' SCOPES='${FRONTEND_SCOPES}' IA_EXECUTION_MODE=remote IA_BACKEND_URL='${BACKEND_BASE_URL}' IA_BACKEND_API_KEY='${SERVICE_API_KEY}' npm run start")"
  frontend_started_by_script=1
fi

if ! wait_for_frontend; then
  echo "[smoke:release] Frontend did not become ready at ${FRONTEND_BASE_URL}."
  exit 1
fi

health_payload="$(curl -fsS "${BACKEND_BASE_URL}/health")"
validate_health_payload "${health_payload}"

llms_payload="$(curl -fsS "${FRONTEND_BASE_URL}/api/llms-txt?shopDomain=${SHOP_DOMAIN}&refresh=1")"
if [[ "${SMOKE_ALLOW_EMPTY_LLMS:-false}" != "true" ]]; then
  if grep -Eq 'No indexed products available yet\.|No indexed policy documents available yet\.' <<< "${llms_payload}"; then
    echo "[smoke:release] llms.txt is still empty for ${SHOP_DOMAIN}."
    exit 1
  fi
fi
echo "[smoke:release] llms ok -> $(printf '%s' "${llms_payload}" | head -n 1)"

intent_payload="$(curl -fsS -X POST "${FRONTEND_BASE_URL}/api/intent/analyze" -H 'Content-Type: application/json' -d "{\"shopDomain\":\"${SHOP_DOMAIN}\",\"sessionId\":\"smoke-intent-${BACKEND_PORT}\",\"visitorId\":\"visitor-smoke-intent\"}")"
validate_intent_payload "${intent_payload}"

triggers_payload="$(curl -fsS -X POST "${FRONTEND_BASE_URL}/api/triggers/evaluate" -H 'Content-Type: application/json' -d "{\"shopDomain\":\"${SHOP_DOMAIN}\",\"sessionId\":\"smoke-trigger-${BACKEND_PORT}\",\"visitorId\":\"visitor-smoke-trigger\"}")"
validate_triggers_payload "${triggers_payload}"

chat_payload="$(curl -fsS -X POST "${FRONTEND_BASE_URL}/api/chat" -H 'Content-Type: application/json' -H "X-Shop-Domain: ${SHOP_DOMAIN}" -d "{\"message\":\"Necesito ayuda para encontrar un producto\",\"sessionId\":\"smoke-chat-${BACKEND_PORT}\",\"visitorId\":\"visitor-smoke-chat\",\"locale\":\"es\",\"channel\":\"WEB_CHAT\",\"metadata\":{\"shop\":\"${SHOP_DOMAIN}\"}}")"
validate_chat_payload "${chat_payload}"

echo "[smoke:release] PASS for ${SHOP_DOMAIN}"

intent_payload="$(curl -fsS -X POST "${FRONTEND_BASE_URL}/api/intent/analyze" -H 'Content-Type: application/json' -d "{\"shopDomain\":\"${SHOP_DOMAIN}\",\"sessionId\":\"smoke-intent-${BACKEND_PORT}\",\"visitorId\":\"visitor-smoke-intent\"}")"
validate_intent_payload "${intent_payload}"

triggers_payload="$(curl -fsS -X POST "${FRONTEND_BASE_URL}/api/triggers/evaluate" -H 'Content-Type: application/json' -d "{\"shopDomain\":\"${SHOP_DOMAIN}\",\"sessionId\":\"smoke-trigger-${BACKEND_PORT}\",\"visitorId\":\"visitor-smoke-trigger\"}")"
validate_triggers_payload "${triggers_payload}"

chat_payload="$(curl -fsS -X POST "${FRONTEND_BASE_URL}/api/chat" -H 'Content-Type: application/json' -H "X-Shop-Domain: ${SHOP_DOMAIN}" -d "{\"message\":\"Necesito ayuda para encontrar un producto\",\"sessionId\":\"smoke-chat-${BACKEND_PORT}\",\"visitorId\":\"visitor-smoke-chat\",\"locale\":\"es\",\"channel\":\"WEB_CHAT\",\"metadata\":{\"shop\":\"${SHOP_DOMAIN}\"}}")"
validate_chat_payload "${chat_payload}"

echo "[smoke:release] PASS for ${SHOP_DOMAIN}"