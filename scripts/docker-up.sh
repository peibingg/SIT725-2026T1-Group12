#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/docker-compose-lib.sh
source "$ROOT/scripts/docker-compose-lib.sh"

cd "$ROOT"
docker_compose_down_other full
exec docker compose -f "$COMPOSE_FULL" up --build -d --remove-orphans "$@"
