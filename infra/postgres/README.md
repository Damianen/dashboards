# infra/postgres — shared PostgreSQL server

One postgres instance for every `apps/*` service. Each service gets its own
database + role (plus a `_dev` twin); CONNECT is revoked from PUBLIC on every
service database, so services cannot reach each other's data.

## Quick start

```sh
docker network create homelab        # once — shared by all app containers
cd infra/postgres
cp .env.example .env                 # then fill POSTGRES_PASSWORD
docker compose up -d
docker compose ps                    # wait for "healthy"
```

App containers join the same external `homelab` network and reach the server
at host `postgres`. Port 5432 is also published on the host for psql from the
LAN — comment out the `ports:` line in `compose.yaml` to disable that.

## Adding a new service

Run `create-service.sh` **twice** per service — apps develop against
`<name>_dev` and deploy against `<name>`:

```sh
./scripts/create-service.sh tasks
./scripts/create-service.sh tasks_dev
```

Each run prints the ready-to-paste `DATABASE_URL` (container + localhost
variants). Copy it straight into the app's `.env` — the password is only
shown once. Re-running is safe: existing roles/databases are skipped with a
warning.

## Backups

`scripts/backup.sh` dumps every service database (`pg_dump -Fc`) into the
`/backups` bind mount and prunes dumps older than 14 days. The host side of
that mount defaults to `./backups` — repoint it in `compose.yaml` at the
directory your nightly USB backup job already copies.

### Automated backups (systemd timer)

Unit files live in `systemd/`. Install them **on the host that runs the
postgres container** — the script drives `docker exec postgres`, so from any
other machine there is nothing to exec into:

```sh
cd infra/postgres
sudo cp systemd/postgres-backup.service systemd/postgres-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now postgres-backup.timer
systemctl list-timers postgres-backup.timer    # verify: NEXT shows 03:30
```

The timer fires nightly at 03:30 with `Persistent=true`, so a run missed
while the host was down happens right after the next boot. Inspect runs with
`journalctl -u postgres-backup.service`, or trigger one by hand with
`sudo systemctl start postgres-backup.service`.

Alternative — cron, same schedule (crontab -e):

```cron
30 3 * * * /home/damian/dev/dashboards/infra/postgres/scripts/backup.sh >> /home/damian/dev/dashboards/infra/postgres/backup.log 2>&1
```

### Restore

```sh
docker exec postgres pg_restore -U postgres -d tasks --clean --if-exists /backups/tasks-2026-06-13.dump
```

(Swap database name and dump file; the database must already exist — recreate
it with `create-service.sh` first if needed.)
