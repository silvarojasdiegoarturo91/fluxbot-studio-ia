#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash .claude/skills/shopify-admin/scripts/query.sh 'GRAPHQL_QUERY' [variables-json]

Environment:
  STORE            Shopify store subdomain (e.g. my-store)
  ADMIN_API_TOKEN  Shopify Admin API access token
  SHOPIFY_API_VERSION Optional API version (default: 2026-01)
EOF
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 1
fi

require_env "STORE"
require_env "ADMIN_API_TOKEN"

QUERY="$1"
VARIABLES_JSON="${2:-{}}"
API_VERSION="${SHOPIFY_API_VERSION:-2026-01}"
ENDPOINT="https://${STORE}.myshopify.com/admin/api/${API_VERSION}/graphql.json"

node - "$QUERY" "$VARIABLES_JSON" <<'NODE' | curl -fsS \
  -X POST \
  "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: ${ADMIN_API_TOKEN}" \
  --data-binary @-
const [query, variablesJson] = process.argv.slice(2);
let variables = {};

try {
  variables = JSON.parse(variablesJson);
} catch (error) {
  console.error(`Invalid variables JSON: ${error.message}`);
  process.exit(1);
}

process.stdout.write(JSON.stringify({ query, variables }));
NODE
