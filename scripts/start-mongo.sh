#!/usr/bin/env bash
# Start local MongoDB for development (Homebrew mongod).
set -euo pipefail

DB_PATH="${MONGO_DB_PATH:-$HOME/data/db}"
PORT="${MONGO_PORT:-27017}"
LOG_PATH="${DB_PATH}/mongod.log"

mkdir -p "$DB_PATH"

if lsof -i ":${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "MongoDB already listening on 127.0.0.1:${PORT}"
  exit 0
fi

if ! command -v mongod >/dev/null 2>&1; then
  echo "mongod not found. Install MongoDB (e.g. brew install mongodb-community) or set MONGODB_URI to Atlas."
  exit 1
fi

echo "Starting mongod (dbpath: ${DB_PATH}, port: ${PORT})..."
mongod --dbpath "$DB_PATH" --bind_ip 127.0.0.1 --port "$PORT" --fork --logpath "$LOG_PATH"

sleep 1
if lsof -i ":${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "MongoDB ready on mongodb://127.0.0.1:${PORT}"
else
  echo "MongoDB failed to start. See ${LOG_PATH}"
  exit 1
fi
 