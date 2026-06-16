# finance

Personal finance dashboard. Syncs transactions from two banks (ING NL,
Revolut) via the **Enable Banking** PSD2 API into Postgres on a schedule, and
shows them as an infinite list. See `CLAUDE.md` for the domain rules and the
root `CLAUDE.md` for platform conventions.

This slice wires **connect → sync → list**. The full schema (categories,
budgets, recurring series, notifications) exists for later slices but no
service touches it yet. Out of scope here: categorization, internal transfers,
budgets, MCP.

## Develop

```bash
pnpm --filter finance dev        # http://localhost:3000
pnpm --filter finance typecheck  # tsc --noEmit
pnpm --filter finance lint
pnpm --filter finance test       # vitest (pure logic: mapping, sync window, dates)
pnpm --filter finance smoke      # fixture-driven sync against finance_dev only
```

The dev DB (`finance_dev`) and prod DB (`finance`) are provisioned by
`infra/postgres/scripts/create-service.sh`. Migrations run against `finance_dev`
only (`pnpm --filter finance exec prisma migrate dev`); never against `finance`.

## Enable Banking setup

Register a **restricted/personal** application at
<https://enablebanking.com> and fill `.env`:

| Var | Meaning |
| --- | --- |
| `EB_APP_ID` | Application id → JWT `kid`. |
| `EB_PRIVATE_KEY_PATH` | Path to the app's private `.pem` (kept outside the repo / `/run/secrets/...` in the container). |
| `EB_REDIRECT_URL` | Must match a whitelisted redirect, e.g. `http://localhost:3000/api/eb/callback`. |
| `EB_SANDBOX` | `true` routes every connect to EB's **Mock ASPSP** for testing. |
| `EB_API_BASE` | `https://api.enablebanking.com` (sandbox shares the host). |

Auth is an RS256 JWT signed with the private key on every request. Nothing
works until `EB_APP_ID` + the key are present; until then sync is a logged
no-op and the Settings page says so.

## Connect a bank & verify the live sync (sandbox)

This needs a registered EB app + key (see above); the unit tests and `smoke`
do **not**. With `EB_SANDBOX=true`:

1. `pnpm --filter finance dev`, open `/settings`, click **Connect ING** (or
   Revolut). You're redirected to the EB **Mock ASPSP** consent screen.
2. Approve it — EB redirects back to `/api/eb/callback`, which creates the
   session and stores the connection + accounts. Settings shows **Connected**
   and the consent `valid_until`.
3. Hit **Sync now** (Settings button or the FAB). The first sync backfills up
   to ~12 months; later runs fetch a 3-day overlap window. Watch `[sync]` logs.
4. Open `/transactions` to see the list (booking date, counterparty/description,
   sign-coloured amount, account badge).

## Scheduling

`src/instrumentation.ts` registers a node-cron job (`0 */6 * * *`,
Europe/Amsterdam) that calls `syncAll()` — at most 4 unattended fetches per
account per day (PSD2). The user-present "Sync now" is exempt.
