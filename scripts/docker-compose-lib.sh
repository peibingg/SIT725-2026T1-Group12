#!/usr/bin/env bash
# Shared compose paths (same default project name → stop the other file before up).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FULL="${ROOT}/docker-compose.yml"
COMPOSE_HOST="${ROOT}/docker-compose.host-mongo.yml"

docker_compose_down_other() {
  local active="$1"
  if [ "$active" = "full" ]; then
    docker compose -f "$COMPOSE_HOST" down --remove-orphans 2>/dev/null || true
  else
    docker compose -f "$COMPOSE_FULL" down --remove-orphans 2>/dev/null || true
  fi
}

docker_compose_down_all() {
  docker compose -f "$COMPOSE_FULL" down --remove-orphans 2>/dev/null || true
  docker compose -f "$COMPOSE_HOST" down --remove-orphans 2>/dev/null || true
}
