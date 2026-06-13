# CLAUDE.md — health

Single-user health dashboard + MCP server. Unifies wearable pulls (Oura,
Withings, Fitbit Air via the Google Health API) with manual logs (food,
water, stimulants, supplements, lifting). All root CLAUDE.md conventions
apply; this file adds only the health domain.

## App-specific deps
Prisma, zod, @tanstack/react-query, vaul, shadcn/ui, lucide-react,
@modelcontextprotocol/sdk, croner, web-push, @serwist/next, @zxing/browser,
recharts, vitest.

## Layering (strict)
- ALL business logic in `src/server/services/`. Route handlers under
  `src/app/api/`, MCP tools in `src/mcp/`, and scheduler jobs are thin
  adapters over the same service functions — never duplicate logic.
- Zod schemas in `src/lib/schemas/` are the single source of truth for
  every input, reused by route handlers AND MCP tool inputs.
- One day-bucketing chokepoint: `dayOf(date)` in `src/lib/dates.ts`
  returns the civil date in Europe/Amsterdam. Every `day` column is set
  through it. Never bucket by UTC.

## Domain guardrails (non-negotiable)
- Wearable calorie expenditure is a RELATIVE TREND SIGNAL (wrist EE error
  ~27–90%). UI copy, chart labels, and MCP tool descriptions say "trend"
  or "estimate" — never present device kcal as truth. Doubly so for
  lifting sessions, where wrist HR/motion is an especially poor proxy.
- NEVER compute, store, or display intake − expenditure ("net calories",
  "energy balance", "deficit"). Not in views, UI, MCP tools, or
  notifications. Intake and expenditure are separate honest panels.
- Sync = UPSERT keyed on external_id / day. Absence upstream never
  deletes local rows. The local DB is the source of truth; vendor APIs
  are feeds that may break or disappear.
- Food entries SNAPSHOT macros at log time (computed from the product
  cache or entered manually). Never recompute history from the cache.
- Manual logging must stay ultra-low-friction: ≤ 2 taps in the UI, one
  tool call via MCP. Treat ergonomics as a functional requirement.
- Water target is deterministic and implemented exactly once (the
  daily_summary SQL view + the summary service):
  target_ml(day) = settings['water.baseTargetMl']
                 + Σ(day's stimulant amount_mg) × settings['water.mlPerMgStimulant'].
- Rotating OAuth tokens (Withings, Google) live AES-256-GCM-encrypted in
  the oauth_tokens table — never in env, never logged. Withings refresh
  tokens are single-use: persist the new pair atomically before using it.

## Environment
See .env.example. DATABASE_URL is health_dev locally and health in prod,
both minted by infra/postgres/scripts/create-service.sh.

## Definition of done (per phase)
Root definition (pnpm --filter health typecheck && lint && test green)
+ migrations applied to health_dev + the phase's acceptance check
verified. Pure logic (date bucketing, water target, macro math, token
crypto) must have vitest coverage.
