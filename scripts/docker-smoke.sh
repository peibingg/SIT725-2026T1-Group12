#!/usr/bin/env bash
# Smoke test: compose up → GET /api/health → compose down
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/docker-compose-lib.sh
source "$ROOT/scripts/docker-compose-lib.sh"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker-smoke: skip — docker not installed"
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  echo "docker-smoke: skip — docker daemon not running"
  exit 0
fi

export SESSION_SECRET="${SESSION_SECRET:-docker-smoke-test-secret-not-for-production}"
export PORT="${PORT:-3000}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"

cleanup() {
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

echo "docker-smoke: building and starting stack ($COMPOSE_FILE)..."
if [ "$COMPOSE_FILE" = "docker-compose.host-mongo.yml" ]; then
  docker_compose_down_other host
else
  docker_compose_down_other full
fi
docker compose -f "$COMPOSE_FILE" up --build -d --remove-orphans

echo "docker-smoke: waiting for ${HEALTH_URL} ..."
ok=0
for i in $(seq 1 30); do
  if curl -sf "$HEALTH_URL" | grep -q '"mongoose":true'; then
    ok=1
    break
  fi
  sleep 2
done

if [ "$ok" -ne 1 ]; then
  echo "docker-smoke: FAILED — health check did not pass in time"
  docker compose -f "$COMPOSE_FILE" logs app
  exit 1
fi

echo "docker-smoke: OK"
curl -sf "$HEALTH_URL"
echo
