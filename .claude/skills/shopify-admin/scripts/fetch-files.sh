#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
QUERY_SCRIPT="${SCRIPT_DIR}/query.sh"

LIMIT=20
FILE_TYPE="ALL"

usage() {
  cat <<'EOF'
Usage:
  bash .claude/skills/shopify-admin/scripts/fetch-files.sh [--limit N] [--type IMAGE|VIDEO|DOCUMENT|ALL]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit)
      LIMIT="${2:-}"
      shift 2
      ;;
    --type)
      FILE_TYPE="${2:-}"
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

case "${FILE_TYPE}" in
  IMAGE|VIDEO|DOCUMENT|ALL)
    ;;
  *)
    echo "--type must be one of IMAGE, VIDEO, DOCUMENT, ALL" >&2
    exit 1
    ;;
esac

GRAPHQL_QUERY=$(cat <<'EOF'
query FetchFiles($limit: Int!, $query: String) {
  files(first: $limit, query: $query, sortKey: UPDATED_AT, reverse: true) {
    edges {
      node {
        __typename
        ... on GenericFile {
          id
          alt
          createdAt
          updatedAt
          fileStatus
          url
          mimeType
          originalFileSize
        }
        ... on MediaImage {
          id
          alt
          createdAt
          updatedAt
          fileStatus
          image {
            url
            width
            height
          }
        }
        ... on Video {
          id
          alt
          createdAt
          updatedAt
          fileStatus
          sources {
            url
            mimeType
            format
            height
            width
          }
          preview {
            image {
              url
            }
          }
        }
      }
    }
  }
}
EOF
)

SHOPIFY_QUERY=""
if [[ "${FILE_TYPE}" != "ALL" ]]; then
  SHOPIFY_QUERY="media_type:${FILE_TYPE}"
fi

VARIABLES_JSON=$(node - "$LIMIT" "$SHOPIFY_QUERY" <<'NODE'
const [limit, query] = process.argv.slice(2);
process.stdout.write(JSON.stringify({ limit: Number(limit), query: query || null }));
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

  const files = (parsed.data?.files?.edges ?? []).map(({ node }) => node);
  console.log(JSON.stringify(files, null, 2));
});
NODE
