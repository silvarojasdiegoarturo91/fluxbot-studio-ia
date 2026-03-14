#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_APP_DIR="${ROOT_DIR}/apps/shopify-admin-app"
BACKEND_REPO_PATH="${IA_BACKEND_REPO_PATH:-${ROOT_DIR}/../fluxbot-studio-back-ia}"
BACKEND_HEALTH_URL="${IA_BACKEND_HEALTH_URL:-http://127.0.0.1:3001/health}"
BACKEND_START_TIMEOUT_SECONDS="${IA_BACKEND_START_TIMEOUT_SECONDS:-45}"
FULLSTACK_IA_BACKEND_API_KEY="${FULLSTACK_IA_BACKEND_API_KEY:-}"

backend_started_by_script=0
backend_pid=""

FRONTEND_DATABASE_URL=""
FRONTEND_IA_BACKEND_URL=""
FRONTEND_SERVICE_API_KEY=""
BACKEND_DATABASE_URL=""
BACKEND_SERVICE_API_KEY=""

load_env_file() {
  local file_path="$1"
  if [[ -f "${file_path}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${file_path}"
    set +a
  fi
}

capture_frontend_env() {
  set +u
  load_env_file "${FRONTEND_APP_DIR}/.env"
  load_env_file "${FRONTEND_APP_DIR}/.env.local"

  FRONTEND_DATABASE_URL="${DATABASE_URL:-}"
  FRONTEND_IA_BACKEND_URL="${IA_BACKEND_URL:-http://127.0.0.1:3001}"
  FRONTEND_SERVICE_API_KEY="${IA_BACKEND_API_KEY:-}"

  # Prevent inherited shell state from leaking into process startup.
  unset DATABASE_URL IA_BACKEND_URL IA_BACKEND_API_KEY BACKEND_API_KEY MASTER_API_KEY
  set -u
}

capture_backend_env() {
  set +u
  load_env_file "${BACKEND_REPO_PATH}/.env"

  BACKEND_DATABASE_URL="${DATABASE_URL:-}"
  BACKEND_SERVICE_API_KEY="${IA_BACKEND_API_KEY:-${BACKEND_API_KEY:-${MASTER_API_KEY:-}}}"

  # Prevent inherited shell state from leaking into process startup.
  unset DATABASE_URL IA_BACKEND_API_KEY BACKEND_API_KEY MASTER_API_KEY
  set -u
}

database_name_from_url() {
  local db_url="$1"
  if [[ -z "${db_url}" ]]; then
    printf 'unknown'
    return
  fi

  printf '%s' "${db_url}" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#'
}

cleanup() {
  if [[ "${backend_started_by_script}" -eq 1 ]] && [[ -n "${backend_pid}" ]]; then
    echo "[dev:fullstack] Stopping IA backend (pid ${backend_pid})..."
    kill "${backend_pid}" 2>/dev/null || true
    wait "${backend_pid}" 2>/dev/null || true
  fi
}

wait_for_backend_ready() {
  local attempt=1
  while [[ "${attempt}" -le "${BACKEND_START_TIMEOUT_SECONDS}" ]]; do
    if curl -fsS "${BACKEND_HEALTH_URL}" >/dev/null 2>&1; then
      return 0
    fi

    if [[ "${backend_started_by_script}" -eq 1 ]] && [[ -n "${backend_pid}" ]] && ! kill -0 "${backend_pid}" 2>/dev/null; then
      echo "[dev:fullstack] IA backend process exited before becoming healthy."
      return 1
    fi

    sleep 1
    attempt=$((attempt + 1))
  done

  return 1
}

trap cleanup EXIT INT TERM

echo "[dev:fullstack] Root: ${ROOT_DIR}"

capture_frontend_env

echo "[dev:fullstack] Checking IA backend repository path..."
if [[ ! -d "${BACKEND_REPO_PATH}" ]]; then
  echo "[dev:fullstack] IA backend repository not found at: ${BACKEND_REPO_PATH}"
  echo "[dev:fullstack] Set IA_BACKEND_REPO_PATH to the correct path and retry."
  exit 1
fi

capture_backend_env

SERVICE_API_KEY="${FULLSTACK_IA_BACKEND_API_KEY:-${BACKEND_SERVICE_API_KEY:-${FRONTEND_SERVICE_API_KEY:-}}}"

echo "[dev:fullstack] Frontend DB: $(database_name_from_url "${FRONTEND_DATABASE_URL}")"
echo "[dev:fullstack] Backend DB: $(database_name_from_url "${BACKEND_DATABASE_URL}")"

if curl -fsS "${BACKEND_HEALTH_URL}" >/dev/null 2>&1; then
  echo "[dev:fullstack] IA backend already healthy at ${BACKEND_HEALTH_URL}."
else
  echo "[dev:fullstack] Starting IA backend from ${BACKEND_REPO_PATH}..."
  backend_env_cmd=(
    env
    -u DATABASE_URL
    -u IA_BACKEND_API_KEY
    -u BACKEND_API_KEY
    -u MASTER_API_KEY
  )

  if [[ -n "${BACKEND_DATABASE_URL}" ]]; then
    backend_env_cmd+=("DATABASE_URL=${BACKEND_DATABASE_URL}")
  fi

  if [[ -n "${SERVICE_API_KEY}" ]]; then
    backend_env_cmd+=(
      "IA_BACKEND_API_KEY=${SERVICE_API_KEY}"
      "BACKEND_API_KEY=${SERVICE_API_KEY}"
      "MASTER_API_KEY=${SERVICE_API_KEY}"
    )
  fi

  "${backend_env_cmd[@]}" npm --prefix "${BACKEND_REPO_PATH}" run dev &
  backend_pid=$!
  backend_started_by_script=1
fi

echo "[dev:fullstack] Waiting for IA backend health check..."
if ! wait_for_backend_ready; then
  echo "[dev:fullstack] IA backend did not become healthy at ${BACKEND_HEALTH_URL}."
  exit 1
fi

echo "[dev:fullstack] IA backend ready. Starting Shopify frontend..."

if [[ -z "${FRONTEND_DATABASE_URL}" ]]; then
  echo "[dev:fullstack] Missing DATABASE_URL in ${FRONTEND_APP_DIR}/.env(.local)."
  exit 1
fi

frontend_env_cmd=(
  env
  -u DATABASE_URL
  -u IA_BACKEND_URL
  -u IA_BACKEND_API_KEY
  -u BACKEND_API_KEY
  -u MASTER_API_KEY
  "DATABASE_URL=${FRONTEND_DATABASE_URL}"
  "IA_BACKEND_URL=${FRONTEND_IA_BACKEND_URL}"
)

if [[ -n "${SERVICE_API_KEY}" ]]; then
  frontend_env_cmd+=("IA_BACKEND_API_KEY=${SERVICE_API_KEY}")
else
  echo "[dev:fullstack] Warning: IA backend API key not found in frontend or backend env files."
fi

cd "${ROOT_DIR}"
"${frontend_env_cmd[@]}" npm --workspace @fluxbot/shopify-admin-app run dev
