#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

echo "dev:localhost is deprecated for Shopify embedded preview (localhost certificate errors)."
echo "Switching to ngrok-based dev flow automatically..."

exec "$SCRIPT_DIR/dev-ngrok.sh"
