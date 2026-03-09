#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"

cleanup() {
  if [[ -n "${NGROK_PID:-}" ]]; then
    kill "$NGROK_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

# Clear previous runs so ports/watchers don't conflict.
pkill -f "shopify app dev --path $APP_DIR" >/dev/null 2>&1 || true
pkill -f "ngrok http https://localhost:3000" >/dev/null 2>&1 || true
pkill -f "ngrok http 3000" >/dev/null 2>&1 || true
pkill -f "$APP_DIR/node_modules/.bin/react-router dev --host" >/dev/null 2>&1 || true
pkill -f "react-router dev --host" >/dev/null 2>&1 || true
fuser -k 3000/tcp 9293/tcp >/dev/null 2>&1 || true

# Clean transient typegen artifacts that occasionally get stuck between restarts.
rm -rf "$APP_DIR/.react-router/types" >/dev/null 2>&1 || true

ngrok http 3000 >/tmp/fluxbot-ngrok.log 2>&1 &
NGROK_PID=$!

DEV_URL=""
for _ in $(seq 1 25); do
  TUNNELS_JSON="$(curl -s http://127.0.0.1:4040/api/tunnels || true)"

  DEV_URL="$(
    printf "%s" "$TUNNELS_JSON" | node -e '
      let raw = "";
      process.stdin.on("data", c => raw += c);
      process.stdin.on("end", () => {
        try {
          const parsed = JSON.parse(raw);
          const tunnel = (parsed.tunnels || []).find(t => t.proto === "https");
          if (tunnel?.public_url) process.stdout.write(tunnel.public_url);
        } catch {}
      });
    '
  )"

  if [[ -n "$DEV_URL" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$DEV_URL" ]]; then
  echo "Could not obtain ngrok HTTPS URL from http://127.0.0.1:4040/api/tunnels"
  exit 1
fi

echo "Using ngrok URL: $DEV_URL"
node "$SCRIPT_DIR/set-dev-url.mjs" "$DEV_URL"

# Force Vite to resolve HMR against the ngrok public URL instead of localhost.
export SHOPIFY_APP_URL="$DEV_URL"

shopify app dev \
  --path "$APP_DIR" \
  --no-update \
  --tunnel-url "${DEV_URL}:3000" \
  --theme-app-extension-port 9293
