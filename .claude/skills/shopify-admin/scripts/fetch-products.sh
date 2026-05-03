#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
QUERY_SCRIPT="${SCRIPT_DIR}/query.sh"

LIMIT=10
SEARCH_QUERY=""

usage() {
  cat <<'EOF'
Usage:
  bash .claude/skills/shopify-admin/scripts/fetch-products.sh [--limit N] [--query "term"]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit)
      LIMIT="${2:-}"
      shift 2
      ;;
    --query)
      SEARCH_QUERY="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! [[ "${LIMIT}" =~ ^[1-9][0-9]*$ ]]; then
  echo "--limit must be a positive integer" >&2
  exit 1
fi

GRAPHQL_QUERY=$(cat <<'EOF'
query FetchProducts($limit: Int!, $query: String) {
  products(first: $limit, query: $query, sortKey: UPDATED_AT, reverse: true) {
    edges {
      node {
        id
        title
        handle
        status
        totalInventory
        onlineStoreUrl
        updatedAt
        featuredImage {
          url
          altText
        }
      }
    }
  }
}
EOF
)

VARIABLES_JSON=$(node - "$LIMIT" "$SEARCH_QUERY" <<'NODE'
const [limit, query] = process.argv.slice(2);
const variables = { limit: Number(limit), query: query || null };
process.stdout.write(JSON.stringify(variables));
NODE
)

bash "$QUERY_SCRIPT" "$GRAPHQL_QUERY" "$VARIABLES_JSON" | node <<'NODE'
let raw = "";
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const parsed = JSON.parse(raw);

  if (parsed.errors?.length) {
    console.error(JSON.stringify(parsed, null, 2));
    process.exit(1);
  }

  const userErrors =
    parsed.data?.products?.userErrors ??
    parsed.data?.userErrors ??
    [];

  if (userErrors.length) {
    console.error(JSON.stringify(userErrors, null, 2));
    process.exit(1);
  }

  const products = (parsed.data?.products?.edges ?? []).map(({ node }) => node);
  console.log(JSON.stringify(products, null, 2));
});
NODE
