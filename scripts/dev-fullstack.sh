#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_REPO_PATH="${IA_BACKEND_REPO_PATH:-${ROOT_DIR}/../fluxbot-studio-back-ia}"
BACKEND_HEALTH_URL="${IA_BACKEND_HEALTH_URL:-http://127.0.0.1:3001/health}"
BACKEND_START_TIMEOUT_SECONDS="${IA_BACKEND_START_TIMEOUT_SECONDS:-45}"

backend_started_by_script=0
backend_pid=""

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

echo "[dev:fullstack] Checking IA backend repository path..."
if [[ ! -d "${BACKEND_REPO_PATH}" ]]; then
  echo "[dev:fullstack] IA backend repository not found at: ${BACKEND_REPO_PATH}"
  echo "[dev:fullstack] Set IA_BACKEND_REPO_PATH to the correct path and retry."
  exit 1
fi

if curl -fsS "${BACKEND_HEALTH_URL}" >/dev/null 2>&1; then
  echo "[dev:fullstack] IA backend already healthy at ${BACKEND_HEALTH_URL}."
else
  echo "[dev:fullstack] Starting IA backend from ${BACKEND_REPO_PATH}..."
  npm --prefix "${BACKEND_REPO_PATH}" run dev &
  backend_pid=$!
  backend_started_by_script=1
fi

echo "[dev:fullstack] Waiting for IA backend health check..."
if ! wait_for_backend_ready; then
  echo "[dev:fullstack] IA backend did not become healthy at ${BACKEND_HEALTH_URL}."
  exit 1
fi

echo "[dev:fullstack] IA backend ready. Starting Shopify frontend..."
cd "${ROOT_DIR}"
npm --workspace @fluxbot/shopify-admin-app run dev
