# tasks

Single-user, self-hosted Todoist-style task app + MCP server. Mobile-first PWA
for humans; an MCP server over Streamable HTTP for agents (Hermes, Claude Code).
See [`CLAUDE.md`](./CLAUDE.md) for domain rules and the repo root `CLAUDE.md`
for platform conventions.

## Develop

```bash
# from the repo root
pnpm --filter tasks dev        # Next.js on http://localhost:3000
pnpm --filter tasks typecheck  # tsc --noEmit
pnpm --filter tasks lint
pnpm --filter tasks test       # vitest (pure logic)
pnpm --filter tasks smoke      # service-layer end-to-end (tasks_dev only)
pnpm --filter tasks mcp-smoke  # MCP end-to-end over HTTP (needs `dev` running)
```

`.env` is minted from `.env.example`; `DATABASE_URL` must point at `tasks_dev`
locally and `MCP_BEARER_TOKEN` must be set (`openssl rand -hex 32`).

## MCP server

- Endpoint: `POST /api/mcp` — Streamable HTTP, stateless. It is the only path
  that serves MCP (SSE is disabled).
- Auth: every request needs `Authorization: Bearer <MCP_BEARER_TOKEN>`,
  compared in constant time; anything else gets `401`.
- Tools (thin wrappers over the service layer): `create_task`, `list_tasks`,
  `get_task`, `update_task`, `complete_task`, `reopen_task`, `move_task`,
  `list_projects`, `create_project`, `add_comment`. Projects/sections/labels
  are addressed by name (case-insensitive); unknown labels are created, unknown
  projects/sections error. Priority `1` = highest … `4` = default. `due_iso`
  takes `YYYY-MM-DD` (all-day) or a full datetime (timed); an offset-less
  datetime is read in `Europe/Amsterdam`.

### Connect an agent

```bash
# Production (behind Cloudflare Access; the MCP path authenticates with the bearer)
claude mcp add --transport http tasks https://tasks.<your-domain>/api/mcp \
  --header "Authorization: Bearer $MCP_BEARER_TOKEN"

# Local dev (against `pnpm --filter tasks dev`)
claude mcp add --transport http tasks-dev http://localhost:3000/api/mcp \
  --header "Authorization: Bearer <MCP_BEARER_TOKEN from apps/tasks/.env>"
```

Verify the connection with `claude mcp list`, or from another agent call
`list_projects`.
