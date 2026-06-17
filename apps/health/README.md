# apps/health — deploy & env

Single-user health dashboard + MCP server. Ships as one Docker container on the
shared external `homelab` network, talking to the shared Postgres at host
`postgres:5432`. Domain rules live in [CLAUDE.md](./CLAUDE.md); this file is the
operator guide.

## Where the env file goes

Runtime config is **not** baked into the image — `docker-compose.yml` injects it
at start via `env_file: .env.production`. So the file lives right here:

```
apps/health/.env.production        ← you create this (gitignored, never committed)
apps/health/.env.production.example ← the committed template to copy from
```

```sh
cp apps/health/.env.production.example apps/health/.env.production
# then fill in the blanks (see the table below)
```

## Deploy

```sh
# 1. Mint the prod DB role + database (prints a ready-to-paste DATABASE_URL).
infra/postgres/scripts/create-service.sh health

# 2. Create and fill the env file.
cp apps/health/.env.production.example apps/health/.env.production
$EDITOR apps/health/.env.production

# 3. Build + run (build context is the repo root so the pnpm workspace is visible).
docker compose -f apps/health/docker-compose.yml up -d --build
docker compose -f apps/health/docker-compose.yml ps     # wait for "healthy"
docker logs health                                       # see migrate deploy + startup
```

On start the entrypoint runs `prisma migrate deploy` (deploy only — never reset),
then `node apps/health/server.js`. The Docker healthcheck polls
`GET /api/sync/status`. Add integration keys incrementally and re-run
`up -d` to pick them up — only `DATABASE_URL` is needed for the container to boot.

## Filling `.env.production`

### You generate these yourself
| Key | How |
|---|---|
| `MCP_BEARER_TOKEN` | `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` — **set once, never change** (rotating it makes already-encrypted OAuth tokens undecryptable) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `pnpm --filter health exec web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:you@example.com` |
| `OFF_USER_AGENT` | a string you choose, e.g. `health-dashboard/0.1 (you@example.com)` — Open Food Facts requires it |

### From external providers
| Key | Where |
|---|---|
| `OURA_PAT` | personal access token at cloud.ouraring.com |
| `WITHINGS_CLIENT_ID` / `WITHINGS_CLIENT_SECRET` | Withings developer portal |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth client |

For both OAuth apps, register the **prod** callback URLs in their consoles —
they must exactly match `.env.production`:

```
https://health.<your-domain>/api/oauth/withings/callback
https://health.<your-domain>/api/oauth/google/callback
```

### From infra
| Key | Where |
|---|---|
| `DATABASE_URL` | the password printed by `create-service.sh health` (host `postgres`, db `health`) |

### Already set in the template — just confirm / set your domain
`SYNC_BACKFILL_DAYS=90`, `ENABLE_SCHEDULER=true`, `APP_BASE_URL`,
`WITHINGS_REDIRECT_URI`, `GOOGLE_REDIRECT_URI`, `TZ=Europe/Amsterdam`.

### What's needed when
- **Boot:** only `DATABASE_URL`. Add `MCP_BEARER_TOKEN` + `TOKEN_ENCRYPTION_KEY`
  from day one too.
- **Oura / Withings / Google:** their keys are read only when you connect that
  source or sync runs. `TOKEN_ENCRYPTION_KEY` must exist before any OAuth connect.
- **Push notifications:** the `VAPID_*` keys.

## MCP over LAN

The container publishes `3000:3000`, so Hermes / Claude Code reach the MCP
endpoint directly on the LAN — **not** through the Cloudflare tunnel:

```
POST http://<host>:3000/api/mcp
Authorization: Bearer $MCP_BEARER_TOKEN
```

The web UI is fronted by Cloudflare Access upstream; the bearer check is the only
in-app auth surface. Publishing the port also exposes the UI on the LAN, so keep
the host on a trusted network.
