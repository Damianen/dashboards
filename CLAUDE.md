# CLAUDE.md — homelab monorepo

## What this repo is
My personal homelab platform. Each service under `apps/` is a standalone,
single-user, self-hosted web app (mobile-first PWA) that also exposes an
MCP server so my AI agents (Hermes, Claude Code) can operate it. One shared
PostgreSQL server (infra/postgres) backs all of them.

## Layout
- `infra/postgres/` — shared DB server: compose, create-service.sh, backups
- `apps/<service>/` — one folder per service. Each has its own CLAUDE.md,
  Prisma schema + migrations, database, Dockerfile, .env, and MCP token.
- `packages/` — shared workspace packages. Create one only when two apps
  genuinely duplicate code, and ask me first.

## Workspace
pnpm workspaces. From the repo root: `pnpm --filter <app> <script>`,
e.g. `pnpm --filter tasks dev`. TypeScript strict everywhere, no `any`.

## Service isolation (non-negotiable)
- Each app owns exactly one database (plus a `_dev` twin) on the shared
  server, with its own role, schema, and migrations.
- NEVER import another app's Prisma client, models, or services, and never
  query another app's database — even though the code is one import away.
  Apps integrate through their MCP/HTTP APIs only.
- Monorepo ≠ monolith: every app builds and deploys as its own container.
  No shared runtime, no shared server process.

## MCP pattern (every app follows it)
`/api/mcp`, Streamable HTTP, stateless. `Authorization: Bearer` checked
with a timing-safe compare against that app's own token env var. Tools are
thin wrappers over that app's service layer, descriptions written for an
agent. No bulk-delete or destructive admin tools.

## Shared architecture rules
- ALL business logic lives in the app's `src/server/services/`. Server
  actions, route handlers, and MCP tools are thin adapters — never
  duplicate logic across them.
- Zod schemas in the app's `src/lib/schemas/` are the single source of
  truth, reused by server actions AND MCP tool inputs.
- Web UIs contain zero login code — Cloudflare Access protects them
  upstream. The MCP bearer check is the only in-app auth surface.

## Mobile-first rules (all apps)
Design at 390px first, enhance upward. Bottom tab bar + FAB + vaul bottom
sheets — never centered modals on mobile. Touch targets ≥ 44px. `min-h-dvh`
(never 100vh), safe-area-inset padding, no hover-only affordances. Every
mutation optimistic via TanStack Query with rollback on error.

## Database safety
Never run `prisma migrate reset` or destructive SQL against any database
not ending in `_dev`. Ask before any migration that drops columns/tables.

## Definition of done
`pnpm --filter <app> typecheck && lint && test` green for every app you
touched. Pure logic must have vitest coverage. Conventional commits, one
per phase. Default timezone Europe/Amsterdam.
