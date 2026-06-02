#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
REQUESTED_DEV_STORE="${SHOPIFY_SHOP:-${SHOPIFY_DEV_STORE_URL:-}}"
REQUESTED_DEV_STORES="${SHOPIFY_DEV_STORES:-}"

load_env_file() {
  local file_path="$1"
  if [[ -f "${file_path}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${file_path}"
    set +a
  fi
}

set +u
load_env_file "${APP_DIR}/.env"
load_env_file "${APP_DIR}/.env.local"
set -u

DEV_STORE="${REQUESTED_DEV_STORE:-${SHOPIFY_SHOP:-${SHOPIFY_DEV_STORE_URL:-}}}"
DEV_STORES="${REQUESTED_DEV_STORES:-${SHOPIFY_DEV_STORES:-}}"

# In native Shopify CLI dev mode the CLI owns the public app URL. A stale
# SHOPIFY_APP_URL in .env.local keeps other stores pointing to dead previews.
unset SHOPIFY_APP_URL
unset APP_URL

normalize_store() {
  local store="$1"
  store="${store#http://}"
  store="${store#https://}"
  store="${store%%/*}"
  printf '%s' "$store"
}

split_stores() {
  local raw="$1"
  raw="${raw//,/ }"
  printf '%s\n' $raw
}

if [[ -n "${DEV_STORE}" ]]; then
  DEV_STORE="$(normalize_store "${DEV_STORE}")"
elif [[ -n "${DEV_STORES}" ]]; then
  DEV_STORE="$(split_stores "${DEV_STORES}" | head -n 1)"
  DEV_STORE="$(normalize_store "${DEV_STORE}")"
fi

CLEAN_STORES=()
if [[ -n "${DEV_STORES}" ]]; then
  while IFS= read -r store; do
    [[ -z "${store}" ]] && continue
    CLEAN_STORES+=("$(normalize_store "${store}")")
  done < <(split_stores "${DEV_STORES}")
fi

if [[ -n "${DEV_STORE}" ]]; then
  found_active_store=0
  for store in "${CLEAN_STORES[@]:-}"; do
    if [[ "${store}" == "${DEV_STORE}" ]]; then
      found_active_store=1
      break
    fi
  done
  if [[ "${found_active_store}" -eq 0 ]]; then
    CLEAN_STORES=("${DEV_STORE}" "${CLEAN_STORES[@]:-}")
  fi
  export SHOPIFY_SHOP="${DEV_STORE}"
  export SHOPIFY_DEV_STORE_URL="${DEV_STORE}"
  export SHOPIFY_DEV_STORES="${CLEAN_STORES[*]}"
fi

if [[ -n "${DEV_STORE}" ]]; then
  echo "Using dev store: ${DEV_STORE}"
  if [[ "${SHOPIFY_CLEAN_DEV_PREVIEW:-0}" == "1" && "${#CLEAN_STORES[@]}" -gt 1 ]]; then
    echo "Cleaning stale previews for stores: ${CLEAN_STORES[*]}"
  fi
else
  echo "No SHOPIFY_SHOP/SHOPIFY_DEV_STORE_URL set; Shopify CLI will use the configured dev store."
fi

node "$SCRIPT_DIR/sync-dev-store-url.mjs" "${DEV_STORE}"

SHOPIFY_DEV_ARGS=(
  app
  dev
  --path "$APP_DIR"
  --skip-dependencies-installation
)

if find "$APP_DIR/extensions" -mindepth 2 -name "shopify.extension.toml" -print -quit 2>/dev/null | grep -q .; then
  SHOPIFY_DEV_ARGS+=(--theme-app-extension-port 9293)
fi

if [[ -n "${DEV_STORE}" ]]; then
  SHOPIFY_DEV_ARGS+=(--store "$DEV_STORE")
fi

# Clear previous local dev processes so ports/watchers do not conflict.
pkill -f "shopify app dev --path $APP_DIR" >/dev/null 2>&1 || true
pkill -f "$APP_DIR/node_modules/.bin/react-router dev --host" >/dev/null 2>&1 || true
pkill -f "react-router dev --host" >/dev/null 2>&1 || true
fuser -k 3000/tcp 9293/tcp >/dev/null 2>&1 || true

# Clean transient typegen artifacts that occasionally get stuck between restarts.
rm -rf "$APP_DIR/.react-router/types" >/dev/null 2>&1 || true

echo "Starting Shopify CLI native dev flow."
echo "Shopify CLI will create its default tunnel and update the dev preview URLs."

if [[ "${SHOPIFY_CLEAN_DEV_PREVIEW:-0}" == "1" ]]; then
  for store in "${CLEAN_STORES[@]:-}"; do
    [[ -z "${store}" ]] && continue
    echo "Cleaning stale Shopify dev preview for ${store}..."
    shopify app dev clean --path "$APP_DIR" --store "$store" >/dev/null 2>&1 || true
  done
fi

shopify "${SHOPIFY_DEV_ARGS[@]}"
