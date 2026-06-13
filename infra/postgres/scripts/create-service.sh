#!/usr/bin/env bash
set -euo pipefail

# Mint an isolated database + owner role for one service on the shared server.
#
# Usage: ./create-service.sh <name>
#   e.g. ./create-service.sh tasks && ./create-service.sh tasks_dev
#
# Creates role <name>_app (LOGIN, CREATEDB) and database <name> owned by it,
# with CONNECT revoked from PUBLIC so no other service's role can reach it.
# Safe to re-run: existing role/database are skipped with a warning.

NAME="${1:?usage: $0 <service-name>   e.g. tasks, tasks_dev}"

if [[ ! "$NAME" =~ ^[a-z][a-z0-9_]*$ ]]; then
  echo "error: service name must match ^[a-z][a-z0-9_]*$ (got: $NAME)" >&2
  exit 1
fi

ROLE="${NAME}_app"
CONTAINER="postgres"

if ! docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
  echo "error: container '$CONTAINER' is not running (docker compose up -d first)" >&2
  exit 1
fi

psql_super() {
  docker exec "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tAq -c "$1"
}

ROLE_EXISTS="$(psql_super "SELECT 1 FROM pg_roles WHERE rolname = '$ROLE'")"
DB_EXISTS="$(psql_super "SELECT 1 FROM pg_database WHERE datname = '$NAME'")"

PASSWORD=""
if [[ -n "$ROLE_EXISTS" ]]; then
  echo "warning: role $ROLE already exists — keeping its current password" >&2
else
  # tr makes the base64 URL-safe so the password can be pasted into
  # DATABASE_URL without percent-encoding.
  PASSWORD="$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=')"
  psql_super "CREATE ROLE \"$ROLE\" LOGIN PASSWORD '$PASSWORD'" >/dev/null
  # Prisma `migrate dev` creates a temporary shadow database.
  psql_super "ALTER ROLE \"$ROLE\" CREATEDB" >/dev/null
  echo "created role $ROLE"
fi

if [[ -n "$DB_EXISTS" ]]; then
  echo "warning: database $NAME already exists — skipping create + grants" >&2
else
  psql_super "CREATE DATABASE \"$NAME\" OWNER \"$ROLE\"" >/dev/null
  # Real isolation: other services' roles cannot connect to this database.
  psql_super "REVOKE CONNECT ON DATABASE \"$NAME\" FROM PUBLIC" >/dev/null
  psql_super "GRANT CONNECT ON DATABASE \"$NAME\" TO \"$ROLE\"" >/dev/null
  echo "created database $NAME (owner $ROLE, PUBLIC connect revoked)"
fi

PW_DISPLAY="${PASSWORD:-<existing-password>}"
echo
echo "DATABASE_URL (app container, homelab network):"
echo "  postgresql://$ROLE:$PW_DISPLAY@postgres:5432/$NAME?connection_limit=5"
echo "DATABASE_URL (localhost dev):"
echo "  postgresql://$ROLE:$PW_DISPLAY@localhost:5432/$NAME?connection_limit=5"
