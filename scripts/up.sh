#!/usr/bin/env bash
#
# up.sh — bring the whole repo up in one go.
#
# Idempotent. On first run it: ensures the `homelab` network, generates the
# Postgres superuser password, starts the shared Postgres, mints a prod database
# + role per app, writes apps/<app>/.env.production with the secrets it can
# generate (DATABASE_URL, MCP tokens, health's encryption key + VAPID keypair),
# then builds and starts all three apps. Re-running it leaves any existing
# .env.production untouched and just rebuilds/restarts.
#
# Third-party credentials (Oura, Withings, Google, Enable Banking, Vision, ntfy)
# are left blank — fill them in apps/<app>/.env.production, see docs/ENVIRONMENT.md,
# then `docker compose up -d`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log()  { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

gen_hex() { openssl rand -hex 32; }
gen_b64() { openssl rand -base64 32; }

# set_env <file> <KEY> <VALUE> — replace KEY=... in place, or append it.
# `|` is the sed delimiter; we escape only the chars special on the RHS (& | \).
# Generated values (hex, base64, base64url, postgres URLs) contain none of [&|\].
set_env() {
  local file="$1" key="$2" val="$3" esc
  esc=$(printf '%s' "$val" | sed -e 's/[&|\\]/\\&/g')
  if grep -qE "^${key}=" "$file"; then
    sed -i -E "s|^${key}=.*|${key}=${esc}|" "$file"
  else
    printf '%s=%s\n' "$key" "$val" >>"$file"
  fi
}

# ---------------------------------------------------------------------------
log "Preflight"
command -v docker >/dev/null   || die "docker not found"
docker compose version >/dev/null 2>&1 || die "docker compose v2 not found"
command -v openssl >/dev/null  || die "openssl not found"

# ---------------------------------------------------------------------------
log "Ensuring docker network 'homelab'"
docker network inspect homelab >/dev/null 2>&1 || docker network create homelab

# ---------------------------------------------------------------------------
PG_ENV="infra/postgres/.env"
if [[ ! -f "$PG_ENV" ]]; then
  log "Creating $PG_ENV (generating POSTGRES_PASSWORD)"
  cp infra/postgres/.env.example "$PG_ENV"
  set_env "$PG_ENV" POSTGRES_PASSWORD "$(gen_b64)"
fi

log "Starting shared Postgres (infra/postgres)"
docker compose -f infra/postgres/compose.yaml up -d

log "Waiting for Postgres to accept connections"
ready=""
for _ in $(seq 1 60); do
  if docker exec postgres pg_isready -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[[ "$ready" == 1 ]] || die "Postgres did not become ready in time"

# ---------------------------------------------------------------------------
provision_app() {
  local app="$1" prod="apps/$1/.env.production" example="apps/$1/.env.production.example"
  if [[ -f "$prod" ]]; then
    log "$prod already exists — leaving it untouched"
    return
  fi
  log "Provisioning '$app': minting database + writing $prod"
  cp "$example" "$prod"

  # Mint role + database (idempotent) and capture the app-container DATABASE_URL.
  local out url
  out="$(infra/postgres/scripts/create-service.sh "$app")"
  url="$(printf '%s\n' "$out" | grep -Eo 'postgresql://[^[:space:]]+@postgres:5432/[^[:space:]]+' | head -1 || true)"
  if [[ -z "$url" || "$url" == *"<existing-password>"* ]]; then
    warn "could not auto-capture DATABASE_URL for '$app' (role likely pre-existed). Fill $prod manually."
  else
    set_env "$prod" DATABASE_URL "$url"
  fi

  # Generated secrets per app (third-party keys stay blank for the user).
  case "$app" in
    tasks)   set_env "$prod" MCP_BEARER_TOKEN "$(gen_hex)" ;;
    finance) set_env "$prod" FINANCE_MCP_TOKEN "$(gen_hex)" ;;
    health)
      set_env "$prod" MCP_BEARER_TOKEN "$(gen_b64)"
      set_env "$prod" TOKEN_ENCRYPTION_KEY "$(gen_b64)"
      local vapid
      vapid="$(npx --yes web-push generate-vapid-keys --json 2>/dev/null || true)"
      if [[ -n "$vapid" ]]; then
        set_env "$prod" VAPID_PUBLIC_KEY  "$(printf '%s' "$vapid" | grep -oP '"publicKey":"\K[^"]+' || true)"
        set_env "$prod" VAPID_PRIVATE_KEY "$(printf '%s' "$vapid" | grep -oP '"privateKey":"\K[^"]+' || true)"
      else
        warn "could not generate VAPID keys (npx web-push). Push stays disabled until set."
      fi
      ;;
  esac
}

for app in tasks finance health; do provision_app "$app"; done

# Enable Banking key placeholder so finance's read-only mount never fails to start.
if [[ ! -f apps/finance/eb-finance.pem ]]; then
  touch apps/finance/eb-finance.pem
  log "Created empty apps/finance/eb-finance.pem placeholder (replace to use Enable Banking)"
fi

# ---------------------------------------------------------------------------
log "Building + starting apps (migrations run on each container's boot)"
docker compose up -d --build

log "Up. Apps on the host:"
printf '  health   -> http://localhost:3000\n'
printf '  tasks    -> http://localhost:3001\n'
printf '  finance  -> http://localhost:3002\n'
printf '\nNext: fill any third-party credentials in apps/<app>/.env.production\n'
printf 'then re-run: docker compose up -d   (see docs/ENVIRONMENT.md)\n'
