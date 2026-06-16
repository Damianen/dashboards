# CLAUDE.md — tasks

Single-user Todoist-style task app + MCP server. All root CLAUDE.md
conventions apply; this file adds only the tasks domain.

## App-specific deps
chrono-node, fractional-indexing, dnd-kit, vaul, TanStack Query, shadcn/ui,
vitest, node-cron (reminder worker). Recurrence (RFC 5545) is hand-rolled in
src/lib/recurrence/ — DST-safe wall-clock math, no rrule lib.

## Domain semantics
- `prisma/schema.prisma` is authoritative — read its header comments before
  touching anything data-related. Never modify it without asking.
- Ordering: fractional-indexing strings via generateKeyBetween. Never
  renumber rows in bulk.
- Priority: 1 = p1 (highest) … 4 = p4 (default).
- Recurrence: `rrule` holds RFC 5545; `recursFromCompletion` = Todoist
  "every!" semantics. Completing a recurring task advances `dueAt` and
  inserts a CompletionLog row — `completedAt` stays null. Only
  non-recurring completes set `completedAt`. ALL completes go through one
  chokepoint function in the task service.
- Dates stored UTC. `hasDueTime=false` means all-day, interpreted in the
  task's `timezone` (default Europe/Amsterdam).
- Every mutation writes an ActivityEvent.

## Environment (.env.example)
DATABASE_URL (tasks_dev locally, tasks in prod — both minted by
infra/postgres/scripts/create-service.sh), MCP_BEARER_TOKEN, NTFY_URL,
NTFY_TOPIC, TZ=Europe/Amsterdam.
