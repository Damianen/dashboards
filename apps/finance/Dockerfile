# syntax=docker/dockerfile:1
# Build from the REPO ROOT so the pnpm workspace is visible:
#   docker build -f apps/finance/Dockerfile .
# (or `docker compose build` in apps/finance — its context is ../..)

FROM node:26-alpine AS base
# corepack is no longer bundled with node >= 25
RUN npm install -g corepack@latest && corepack enable

FROM base AS builder
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline --filter finance...
# Prisma 7 CLI requires DATABASE_URL even for generate; any value works at build time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN pnpm --filter finance build

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 TZ=Europe/Amsterdam
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
# outputFileTracingRoot = repo root, so the standalone bundle mirrors the
# monorepo layout: server.js sits at apps/finance/server.js.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/finance/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/finance/public ./apps/finance/public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/finance/.next/static ./apps/finance/.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "apps/finance/server.js"]
