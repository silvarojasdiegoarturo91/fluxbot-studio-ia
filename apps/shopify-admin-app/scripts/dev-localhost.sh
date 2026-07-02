#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

echo "dev:localhost is deprecated for Shopify embedded preview (localhost certificate errors)."
echo "Switching to the Shopify CLI native tunnel flow automatically..."

exec "$SCRIPT_DIR/dev-shopify-cli.sh"
