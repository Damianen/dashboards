#!/bin/sh
set -e

# Apply pending migrations before serving. DEPLOY ONLY — never `migrate reset`
# (root CLAUDE.md DB-safety rule). Run from the self-contained migrate dir so
# prisma.config.ts's relative schema/migrations paths resolve and its
# dotenv/prisma-config imports load from a real node_modules. migrate deploy is
# idempotent: already-applied migrations are skipped, so restarts are safe.
echo "[entrypoint] prisma migrate deploy"
cd /app/migrate
node node_modules/prisma/build/index.js migrate deploy

# Start the Next.js standalone server from the bundle root (monorepo-rooted layout).
echo "[entrypoint] starting Next.js"
cd /app
exec node apps/tasks/server.js
