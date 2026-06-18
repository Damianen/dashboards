# Environment & setup guide

How to obtain every environment value the apps need, and how to bring the whole
repo up. One shared PostgreSQL server (`infra/postgres`) backs all apps; each app
(`tasks`, `finance`, `health`) is its own container and owns its own database,
role, and secrets.

---

## 1. Quick start (one command)

```bash
./scripts/up.sh          # or: pnpm up
```

This is idempotent and does everything:

1. creates the `homelab` docker network if missing,
2. generates `infra/postgres/.env` (`POSTGRES_PASSWORD`) and starts the shared Postgres,
3. mints a prod database + role per app (`infra/postgres/scripts/create-service.sh`),
4. writes `apps/<app>/.env.production`, auto-filling the secrets it can generate
   (`DATABASE_URL`, MCP tokens, health's `TOKEN_ENCRYPTION_KEY` + VAPID keypair),
5. builds and starts all three apps (each runs `prisma migrate deploy` on boot).

After it finishes:

| App     | URL                     |
| ------- | ----------------------- |
| health  | http://localhost:3000   |
| tasks   | http://localhost:3001   |
| finance | http://localhost:3002   |
| postgres| localhost:5432          |

The **third-party** credentials (Oura, Withings, Google, Enable Banking, Vision,
ntfy) are left blank — the app boots fine without them and only the related
feature is inactive. Fill the ones you want in `apps/<app>/.env.production`
(sections below), then `docker compose up -d`.

Stop the apps with `./scripts/down.sh` (the shared Postgres is left running).

---

## 2. How env files work here

- `*.env.example` — committed dev template (DB host `localhost`).
- `*.env.production.example` — committed prod template (DB host `postgres`, the
  shared server on the homelab network).
- `.env` / `.env.production` — your real values. **Git-ignored** (`.gitignore`
  lets through only the `*.example` templates), and **kept out of docker images**
  (`.dockerignore`). Never commit them.
- Private keys (`*.pem`, `*.key`) are git-ignored too — Enable Banking's key in
  particular must never be committed.

To configure an app by hand: `cp apps/<app>/.env.example apps/<app>/.env` (dev)
or `cp apps/<app>/.env.production.example apps/<app>/.env.production` (prod), then
fill the blanks.

Every variable is one of four kinds:

- **Generated secret** — you create it with a command (`openssl`, `web-push`).
- **Derived** — `DATABASE_URL`, produced by `create-service.sh`.
- **Third-party credential** — obtained from a vendor portal (steps in §6).
- **Plain config** — a URL, flag, timezone, or User-Agent you just set.

---

## 3. Generated secrets

| Command | Use it for |
| --- | --- |
| `openssl rand -hex 32`    | `MCP_BEARER_TOKEN` (tasks), `FINANCE_MCP_TOKEN` (finance) |
| `openssl rand -base64 32` | `POSTGRES_PASSWORD`, health's `MCP_BEARER_TOKEN`, `TOKEN_ENCRYPTION_KEY` |
| `npx web-push generate-vapid-keys` | health's `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` |

Notes:
- `TOKEN_ENCRYPTION_KEY` must decode to **exactly 32 bytes** — `openssl rand
  -base64 32` does this. It encrypts Withings/Google OAuth tokens at rest; if you
  rotate it, previously stored tokens can no longer be decrypted (re-link those
  integrations).
- MCP tokens are checked with a timing-safe compare on every `POST /api/mcp`.
  Any sufficiently random string works; hex vs base64 is just convention.

---

## 4. DATABASE_URL (derived)

Never hand-write it — mint it. With the shared Postgres running:

```bash
infra/postgres/scripts/create-service.sh tasks_dev   # local dev DB
infra/postgres/scripts/create-service.sh tasks       # prod DB
```

The script creates role `<name>_app` + database `<name>` (with `CONNECT` revoked
from `PUBLIC` for isolation) and prints two ready-to-paste URLs:

- **app container** (`@postgres:5432`) → use in `.env.production`.
- **localhost dev** (`@localhost:5432`) → use in `.env`.

It is safe to re-run; an existing role keeps its password (so it can only print
`<existing-password>` on a re-run — keep the URL from the first run, or drop the
role to re-mint). `scripts/up.sh` captures the prod URL automatically on the
first provisioning of each app.

---

## 5. Per-app reference

### infra/postgres — `infra/postgres/.env`

| Var | Required | How to get it |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | yes | `openssl rand -base64 32`. Superuser password for the shared server. |

### tasks — `apps/tasks/.env(.production)`

| Var | Required | How to get it |
| --- | --- | --- |
| `DATABASE_URL`     | yes | `create-service.sh tasks` (§4) |
| `MCP_BEARER_TOKEN` | yes for MCP | `openssl rand -hex 32` |
| `NTFY_URL`         | optional | ntfy server base URL (§6). Blank ⇒ reminders disabled |
| `NTFY_TOPIC`       | optional | ntfy topic name (§6) |
| `APP_URL`          | optional | public base URL, for reminder click-through (e.g. `https://tasks.<domain>`) |
| `RUN_WORKER`       | prod | `1` so the single container runs the reminder cron. Unset elsewhere to avoid double-fire |
| `TZ`               | yes | `Europe/Amsterdam` |

### finance — `apps/finance/.env(.production)`

| Var | Required | How to get it |
| --- | --- | --- |
| `DATABASE_URL`             | yes | `create-service.sh finance` (§4) |
| `FINANCE_MCP_TOKEN`        | yes for MCP | `openssl rand -hex 32` |
| `EB_APP_ID`                | for bank sync | Enable Banking portal (§6) |
| `EB_PRIVATE_KEY_PATH`      | for bank sync | path **inside** the container, `/run/secrets/eb-finance.pem` (matches the compose mount) |
| `EB_PRIVATE_KEY_HOST_PATH` | for bank sync | host path to the key file the compose mounts read-only |
| `EB_REDIRECT_URL`          | for bank sync | must match the portal, e.g. `https://finance.<domain>/api/eb/callback` |
| `EB_SANDBOX`               | yes | `true` in dev (Mock ASPSP), `false` in prod |
| `EB_API_BASE`              | yes | `https://api.enablebanking.com` |
| `NTFY_URL` / `NTFY_TOPIC`  | optional | budget / re-consent alerts (§6) |
| `APP_BASE_URL`             | optional | public base URL for absolute notification links |
| `TZ`                       | yes | `Europe/Amsterdam` |

### health — `apps/health/.env(.production)`

| Var | Required | How to get it |
| --- | --- | --- |
| `DATABASE_URL`         | yes | `create-service.sh health` (§4) |
| `MCP_BEARER_TOKEN`     | yes for MCP | `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | yes | `openssl rand -base64 32` (exactly 32 bytes) |
| `OURA_PAT`             | for Oura | Oura personal access token (§6) |
| `SYNC_BACKFILL_DAYS`   | yes | first-run backfill window in days (default `90`) |
| `ENABLE_SCHEDULER`     | prod | `true` to run the in-process scheduler |
| `WITHINGS_CLIENT_ID` / `WITHINGS_CLIENT_SECRET` / `WITHINGS_REDIRECT_URI` | for Withings | Withings developer portal (§6) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | for Google Health | Google Cloud Console (§6) |
| `OFF_USER_AGENT`       | for food lookup | a UA string identifying your app, e.g. `health-dashboard/0.1 (you@example.com)` (Open Food Facts requires it) |
| `VISION_API_BASE_URL` / `VISION_API_KEY` / `VISION_MODEL` | for meal-photo / label scan | any OpenAI-compatible vision provider (§6) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | optional | `npx web-push generate-vapid-keys`; subject is `mailto:you@example.com` |
| `APP_BASE_URL`         | optional | public base URL for push deep links |
| `TZ`                   | yes | `Europe/Amsterdam` |

---

## 6. Third-party credential setup

> Redirect/callback URIs must match **exactly** on both sides (the value in your
> env and the value registered in the vendor portal), including http/https, host,
> and path. Use the localhost form for dev, the prod domain for prod.

### Oura (`OURA_PAT`)
1. Sign in at <https://cloud.ouraring.com/>.
2. Open **Personal Access Tokens** and create a token.
3. Paste it as `OURA_PAT`.

### Withings (`WITHINGS_CLIENT_ID/SECRET/REDIRECT_URI`)
1. Register an app at the Withings developer portal
   (<https://developer.withings.com/>).
2. Set the callback to `…/api/oauth/withings/callback` (dev:
   `http://localhost:3000/...`, prod: `https://health.<domain>/...`).
3. Copy the client id + secret into the matching vars; set `WITHINGS_REDIRECT_URI`
   to the same callback you registered.

### Google Health API (`GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`)
1. In the **Google Cloud Console** (<https://console.cloud.google.com/>) create a
   project and enable the relevant Health/Fitness API.
2. Configure the OAuth consent screen, then create an **OAuth 2.0 Client ID** of
   type *Web application*.
3. Add `…/api/oauth/google/callback` as an authorized redirect URI.
4. Copy the client id + secret; set `GOOGLE_REDIRECT_URI` to that callback.

### Enable Banking (`EB_*`, finance)
1. In the Enable Banking control panel (<https://enablebanking.com/>) create a
   **restricted/personal** application → `EB_APP_ID`.
2. Download the application **private key** once. Keep it out of the repo. In
   docker it is mounted read-only at `/run/secrets/eb-finance.pem`
   (`EB_PRIVATE_KEY_PATH`); point `EB_PRIVATE_KEY_HOST_PATH` at the real key file
   on the host (or replace the placeholder `apps/finance/eb-finance.pem`).
3. Register the redirect `…/api/eb/callback` and set `EB_REDIRECT_URL` to match.
4. Keep `EB_SANDBOX=true` (routes to the Mock ASPSP) until the app id + key are
   approved for real banks, then set `false`.

### Vision provider (`VISION_*`, health)
Any **OpenAI-compatible** chat-completions endpoint works (the client is
provider-agnostic). For example, with OpenRouter:
- `VISION_API_BASE_URL=https://openrouter.ai/api/v1`
- `VISION_API_KEY=<key from the provider>`
- `VISION_MODEL=<a current vision-capable model id on that provider>`

Required only for meal-photo and nutrition-label scanning — the vision service
throws if these are unset when that feature is used.

### ntfy (`NTFY_URL`, `NTFY_TOPIC`)
- `NTFY_URL` is the server base (the public `https://ntfy.sh` or your self-hosted
  instance). `NTFY_TOPIC` is the topic notifications publish to. Subscribe to the
  same topic in the ntfy app to receive them. Leave `NTFY_TOPIC` blank to disable.

---

## 7. Naming quirks to know

- finance uses **`FINANCE_MCP_TOKEN`** while tasks and health use
  **`MCP_BEARER_TOKEN`** — set the right one per app.
- tasks uses **`APP_URL`** while finance and health use **`APP_BASE_URL`** for the
  same idea (the app's public base URL).

---

## 8. Running manually & troubleshooting

Manual equivalent of `scripts/up.sh`:

```bash
docker network create homelab                                   # once
docker compose -f infra/postgres/compose.yaml up -d             # shared DB
infra/postgres/scripts/create-service.sh tasks                  # per app
cp apps/tasks/.env.production.example apps/tasks/.env.production # then fill it
docker compose up -d --build                                    # the apps
```

- **Migrations** run automatically on each container's boot
  (`docker-entrypoint.sh` → `prisma migrate deploy`, deploy-only, idempotent).
  Watch them with `docker compose logs -f tasks`.
- **Healthchecks**: `docker compose ps` shows each app's health. Endpoints:
  `GET /api/health` (tasks, finance) and `GET /api/sync/status` (health).
- **Postgres data** lives in the `postgres_pgdata` volume owned by
  `infra/postgres/compose.yaml`. The app stack does not manage it; `down.sh`
  never removes it.
- **Enable Banking mount**: `scripts/up.sh` creates an empty
  `apps/finance/eb-finance.pem` so finance starts even without EB configured.
  Replace it (or set `EB_PRIVATE_KEY_HOST_PATH`) to actually use bank sync.
- **Ports**: health 3000, tasks 3001, finance 3002, postgres 5432 — change the
  `ports:` mappings in the root `compose.yaml` if any clash on your host.
