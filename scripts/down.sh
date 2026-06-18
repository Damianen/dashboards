#!/usr/bin/env bash
#
# down.sh — stop the app stack. The shared Postgres (infra/postgres) is left
# running by default, since it is separate infra that may back other things.
# Pass any extra `docker compose down` flags through, e.g. --rmi local.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

docker compose down "$@"

echo "Apps stopped. Shared Postgres left running."
echo "  Stop Postgres too:  docker compose -f infra/postgres/compose.yaml down"
echo "  (Postgres data lives in the 'postgres_pgdata' volume and is NOT removed.)"
