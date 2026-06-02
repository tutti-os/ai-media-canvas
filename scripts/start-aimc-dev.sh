#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

PREFERRED_WEB_PORT="${AIMC_WEB_PORT:-3000}"
PREFERRED_SERVER_PORT="${AIMC_SERVER_PORT:-3001}"

port_in_use() {
  local port="$1"
  lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1
}

pick_port() {
  local preferred="$1"
  local label="$2"
  local port="$preferred"

  while port_in_use "$port"; do
    port=$((port + 1))
  done

  if [[ "$port" != "$preferred" ]]; then
    echo "[aimc] ${label} port ${preferred} is busy, using ${port} instead." >&2
  fi

  printf '%s' "$port"
}

pick_server_port() {
  local preferred="$1"
  local web_port="$2"
  local port

  port="$(pick_port "$preferred" "server")"

  while [[ "$port" == "$web_port" ]]; do
    port=$((port + 1))
    while port_in_use "$port"; do
      port=$((port + 1))
    done
  done

  printf '%s' "$port"
}

cleanup() {
  local exit_code=$?

  trap - EXIT INT TERM

  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi

  if [[ -n "${WEB_PID:-}" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
  fi

  if [[ -n "${SERVER_PID:-}" ]]; then
    wait "$SERVER_PID" 2>/dev/null || true
  fi

  if [[ -n "${WEB_PID:-}" ]]; then
    wait "$WEB_PID" 2>/dev/null || true
  fi

  exit "$exit_code"
}

trap cleanup EXIT INT TERM

WEB_PORT="$(pick_port "$PREFERRED_WEB_PORT" "web")"
SERVER_PORT="$(pick_server_port "$PREFERRED_SERVER_PORT" "$WEB_PORT")"

WEB_ORIGIN="http://localhost:${WEB_PORT}"
SERVER_BASE_URL="http://localhost:${SERVER_PORT}"

echo "[aimc] repo: ${ROOT_DIR}"
echo "[aimc] web: ${WEB_ORIGIN}"
echo "[aimc] server: ${SERVER_BASE_URL}"

if [[ ! -f "${ROOT_DIR}/.env.local" ]]; then
  echo "[aimc] warning: ${ROOT_DIR}/.env.local not found; using package defaults and current shell env."
fi

(
  cd "$ROOT_DIR"
  AIMC_WEB_ORIGIN="$WEB_ORIGIN" \
  AIMC_SERVER_PORT="$SERVER_PORT" \
  pnpm --filter @aimc/server dev
) &
SERVER_PID=$!

(
  cd "$ROOT_DIR"
  NEXT_PUBLIC_AIMC_SERVER_BASE_URL="$SERVER_BASE_URL" \
  AIMC_SERVER_BASE_URL="$SERVER_BASE_URL" \
  pnpm --filter @aimc/web exec next dev -p "$WEB_PORT"
) &
WEB_PID=$!

while true; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    wait "$SERVER_PID"
    exit $?
  fi

  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    wait "$WEB_PID"
    exit $?
  fi

  sleep 1
done
