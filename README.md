# dashboards

My personal homelab platform — a pnpm monorepo of self-hosted, single-user
PWAs, each also exposing an MCP server, all backed by one shared PostgreSQL.

- `apps/tasks` — Todoist-style tasks (host port **3001**)
- `apps/finance` — personal finance / bank sync (host port **3002**)
- `apps/health` — health dashboard + wearable sync (host port **3000**)
- `infra/postgres` — the shared database server

## Run the whole repo in one go

```bash
./scripts/up.sh      # or: pnpm up
```

Provisions the shared Postgres, mints each app's database, generates the secrets
it can, then builds and starts every app (migrations run on boot). Stop with
`./scripts/down.sh`. The unified stack is defined in the root `compose.yaml`.

## Configure

`./scripts/up.sh` fills the secrets it can generate; third-party credentials
(Oura, Withings, Google, Enable Banking, Vision, ntfy) you add yourself. See
**[docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)** for how to obtain every value.

## Develop a single app

```bash
pnpm --filter <app> dev        # e.g. pnpm --filter tasks dev
```
