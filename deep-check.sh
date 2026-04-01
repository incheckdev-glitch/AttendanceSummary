#!/usr/bin/env bash
set -euo pipefail

API_URL="${1:-https://api.incheck360.com/}"
WS_HOST="${2:-websocket.incheck360.com}"
WS_PATH="${3:-/}"
OUT_DIR="${4:-./deep-check-output}"
API_HOST="$(echo "$API_URL" | sed -E 's#https?://([^/]+)/?.*#\1#')"

mkdir -p "$OUT_DIR"

log() { printf '\n[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }
run() {
  local name="$1"; shift
  log "$name"
  {
    echo "> $*"
    "$@"
  } >"$OUT_DIR/${name// /_}.txt" 2>&1 || true
  echo "Saved: $OUT_DIR/${name// /_}.txt"
}

log "Starting deep check"
{
  echo "API_URL=$API_URL"
  echo "API_HOST=$API_HOST"
  echo "WS_HOST=$WS_HOST"
  echo "WS_PATH=$WS_PATH"
} | tee "$OUT_DIR/context.txt"

run "dns_api" getent ahosts "$API_HOST"
run "dns_ws" getent ahosts "$WS_HOST"

run "curl_api_headers" curl -sS -I --max-time 15 "$API_URL"
run "curl_api_get" curl -sS -D - --max-time 20 "$API_URL"

run "openssl_api_tls" openssl s_client -connect "$API_HOST:443" -servername "$API_HOST"
run "openssl_ws_tls" openssl s_client -connect "$WS_HOST:443" -servername "$WS_HOST"

run "ws_handshake" bash -lc "{
  printf 'GET $WS_PATH HTTP/1.1\r\n';
  printf 'Host: $WS_HOST\r\n';
  printf 'Upgrade: websocket\r\n';
  printf 'Connection: Upgrade\r\n';
  printf 'Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==\r\n';
  printf 'Sec-WebSocket-Version: 13\r\n';
  printf '\r\n';
} | openssl s_client -quiet -connect $WS_HOST:443 -servername $WS_HOST"

log "Done. Review files in $OUT_DIR"
