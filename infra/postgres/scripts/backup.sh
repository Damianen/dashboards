#!/usr/bin/env bash
set -euo pipefail

# Dump every service database to the /backups bind mount (see compose.yaml —
# its host side is the placeholder to point at your USB-synced directory),
# then prune dumps older than RETENTION_DAYS.

CONTAINER="postgres"
RETENTION_DAYS=14
STAMP="$(date +%F)"

DBS="$(docker exec "$CONTAINER" psql -U postgres -d postgres -tAq -c \
  "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres'")"

if [[ -z "$DBS" ]]; then
  echo "no service databases found — nothing to back up"
  exit 0
fi

for db in $DBS; do
  docker exec "$CONTAINER" pg_dump -U postgres -Fc -f "/backups/${db}-${STAMP}.dump" "$db"
  echo "backed up ${db} -> backups/${db}-${STAMP}.dump"
done

# Prune inside the container so this works wherever the host side points.
docker exec "$CONTAINER" find /backups -name '*.dump' -mtime +"$RETENTION_DAYS" -delete
