#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${TUTTI_APP_PORT:-}" ]]; then
  echo "TUTTI_APP_PORT is required; the Tutti host allocates the app port." >&2
  exit 64
fi

if [[ ! "${TUTTI_APP_PORT}" =~ ^[0-9]+$ ]]; then
  echo "TUTTI_APP_PORT must be a numeric TCP port." >&2
  exit 64
fi

APP_HOST="${TUTTI_APP_HOST:-127.0.0.1}"
APP_PORT="${TUTTI_APP_PORT}"
PROJECT_ROOT="$(cd "${TUTTI_APP_PACKAGE_DIR:-$(dirname "${BASH_SOURCE[0]}")}/../.." && pwd)"
NODE_DIR="$(cd "$(dirname "${TUTTI_APP_NODE:?TUTTI_APP_NODE is required}")" && pwd)"
COREPACK_CLI="${NODE_DIR}/../lib/node_modules/corepack/dist/corepack.js"

if [[ ! -f "$COREPACK_CLI" ]]; then
  COREPACK_CLI="${NODE_DIR}/corepack"
  if [[ ! -x "$COREPACK_CLI" ]]; then
    echo "Corepack was not found in the managed Node runtime; cannot start the workspace package manager." >&2
    exit 69
  fi
fi

port_in_use() {
  local candidate="$1"

  if ! command -v lsof >/dev/null 2>&1; then
    return 1
  fi

  lsof -iTCP:"$candidate" -sTCP:LISTEN -n -P >/dev/null 2>&1
}

if [[ -n "${AIMC_SERVER_PORT:-}" ]]; then
  server_port="${AIMC_SERVER_PORT}"
else
  server_port="$((APP_PORT + 1))"
  if (( server_port > 65535 )); then
    server_port="$((APP_PORT - 1))"
  fi

  while [[ "$server_port" == "$APP_PORT" ]] || port_in_use "$server_port"; do
    server_port="$((server_port + 1))"
    if (( server_port > 65535 )); then
      server_port="$((APP_PORT - 1))"
    fi
  done
fi

WEB_ORIGIN="http://${APP_HOST}:${APP_PORT}"
SERVER_BASE_URL="http://${APP_HOST}:${server_port}"

if [[ -z "${AIMC_TUTTI_MANAGED_FILES_ROOT:-}" ]]; then
  for candidate_root in \
    "${TUTTI_APP_MANAGED_FILES_ROOT:-}" \
    "${TUTTI_MANAGED_FILES_ROOT:-}" \
    "${TUTTI_APP_FILES_ROOT:-}" \
    "${TUTTI_APP_FILES_DIR:-}" \
    "${TUTTI_FILES_ROOT:-}"; do
    if [[ -n "$candidate_root" ]]; then
      export AIMC_TUTTI_MANAGED_FILES_ROOT="$candidate_root"
      break
    fi
  done
else
  export AIMC_TUTTI_MANAGED_FILES_ROOT
fi

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

run_package_manager() {
  "$TUTTI_APP_NODE" "$COREPACK_CLI" pnpm "$@"
}

SERVER_ENV_FILE_ARG=""
if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
  SERVER_ENV_FILE_ARG="--env-file=../../.env.local"
fi

trap cleanup EXIT INT TERM

echo "[aimc] project root: ${PROJECT_ROOT}"
echo "[aimc] web: ${WEB_ORIGIN}"
echo "[aimc] server: ${SERVER_BASE_URL}"

cd "$PROJECT_ROOT"
run_package_manager --filter @aimc/shared build

(
  cleanup_server() {
    local exit_code=$?

    trap - EXIT INT TERM

    if [[ -n "${SERVER_API_PID:-}" ]] && kill -0 "$SERVER_API_PID" 2>/dev/null; then
      kill "$SERVER_API_PID" 2>/dev/null || true
    fi

    if [[ -n "${WORKER_PID:-}" ]] && kill -0 "$WORKER_PID" 2>/dev/null; then
      kill "$WORKER_PID" 2>/dev/null || true
    fi

    if [[ -n "${SERVER_API_PID:-}" ]]; then
      wait "$SERVER_API_PID" 2>/dev/null || true
    fi

    if [[ -n "${WORKER_PID:-}" ]]; then
      wait "$WORKER_PID" 2>/dev/null || true
    fi

    exit "$exit_code"
  }

  trap cleanup_server EXIT INT TERM

  export HOST="$APP_HOST"
  export AIMC_WEB_ORIGIN="$WEB_ORIGIN"
  export AIMC_SERVER_PORT="$server_port"

  cd "$PROJECT_ROOT/apps/server"
  "$TUTTI_APP_NODE" --watch ${SERVER_ENV_FILE_ARG:+"$SERVER_ENV_FILE_ARG"} --import tsx ./src/server.ts &
  SERVER_API_PID=$!

  AIMC_WORKER_ID="${AIMC_WORKER_ID:-w1}" "$TUTTI_APP_NODE" --watch ${SERVER_ENV_FILE_ARG:+"$SERVER_ENV_FILE_ARG"} --import tsx ./src/worker.ts &
  WORKER_PID=$!

  while true; do
    if ! kill -0 "$SERVER_API_PID" 2>/dev/null; then
      wait "$SERVER_API_PID"
      exit $?
    fi

    if ! kill -0 "$WORKER_PID" 2>/dev/null; then
      wait "$WORKER_PID"
      exit $?
    fi

    sleep 1
  done
) &
SERVER_PID=$!

(
  cd "$PROJECT_ROOT"
  export NEXT_PUBLIC_AIMC_SERVER_BASE_URL="$SERVER_BASE_URL"
  export AIMC_SERVER_BASE_URL="$SERVER_BASE_URL"
  run_package_manager --filter @aimc/web exec next dev -H "$APP_HOST" -p "$APP_PORT"
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
