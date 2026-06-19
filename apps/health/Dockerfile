# syntax=docker/dockerfile:1
# Build from the REPO ROOT so the pnpm workspace is visible:
#   docker build -f apps/health/Dockerfile .
# (or `docker compose build` in apps/health — its context is ../..)
#
# Debian-slim (NOT alpine): the container runs `prisma migrate deploy` at start,
# and Prisma 7's schema-engine is a glibc/openssl-3 binary
# (schema-engine-debian-openssl-3.0.x). node:26-slim + openssl gives it libssl.so.3
# and keeps the Node major in step with .nvmrc / apps/tasks.

FROM node:26-slim AS base
# Prisma's schema-engine links against openssl 3; ca-certificates for HTTPS sync.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# corepack is no longer bundled with node >= 25
RUN npm install -g corepack@latest && corepack enable

FROM base AS builder
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline --filter health...
# Prisma 7 CLI parses prisma.config.ts (which reads env DATABASE_URL) during
# `prisma generate`; any syntactically-valid URL works at build time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN pnpm --filter health build

# Self-contained migrate deps only. Deploys the tiny `migrate` package
# (prisma + dotenv) instead of the app's full prod tree, and branches off `base`
# + manifests (not the built app) so this layer caches across source changes —
# it only re-runs when a package.json or the lockfile changes.
FROM base AS deployer
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/health/package.json apps/health/
COPY apps/tasks/package.json apps/tasks/
COPY apps/finance/package.json apps/finance/
COPY packages/migrate/package.json packages/migrate/
RUN pnpm fetch
RUN pnpm --filter migrate deploy --prod --legacy /deploy

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 TZ=Europe/Amsterdam
RUN groupadd --system nodejs && useradd --system --gid nodejs nextjs

# Next.js standalone server. outputFileTracingRoot = repo root, so the bundle
# mirrors the monorepo layout: server.js sits at apps/health/server.js.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/health/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/health/public ./apps/health/public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/health/.next/static ./apps/health/.next/static

# Self-contained migrate dir: a REAL node_modules (so both CJS require and the
# jiti-loaded prisma.config.ts resolve normally) + the schema and migrations.
COPY --from=deployer --chown=nextjs:nodejs /deploy/node_modules ./migrate/node_modules
COPY --from=deployer --chown=nextjs:nodejs /deploy/package.json ./migrate/package.json
COPY --from=builder --chown=nextjs:nodejs /repo/apps/health/prisma ./migrate/prisma
COPY --from=builder --chown=nextjs:nodejs /repo/apps/health/prisma.config.ts ./migrate/prisma.config.ts

COPY --from=builder --chown=nextjs:nodejs /repo/apps/health/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
