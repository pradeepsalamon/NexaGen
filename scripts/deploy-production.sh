#!/bin/bash
set -Eeuo pipefail

# =========================================================
# Nexa Production Deployment Script
# =========================================================
# Usage:
#   ./scripts/deploy-production.sh <COMMIT_SHA> <SERVICE...>   deploy
#   ./scripts/deploy-production.sh --rollback [SERVICE...]      manual rollback
#
#   ./scripts/deploy-production.sh abc1234 web api
#   ./scripts/deploy-production.sh --rollback          (default: what the last
#                                                        deploy changed)
#
# Run from the repository root on the VPS (/opt/nexa-chess/NexaGen).
#
# Rollback
# --------
# Rollback restores IMAGES, it never rebuilds. Rebuilding the previous commit
# takes as long as the deploy that just failed, and its old image is already
# gone (the cleanup step prunes it). So every service keeps two tagged
# generations next to the `latest` tag compose runs:
#
#   <image>:last-good   what is running now and was last seen healthy
#   <image>:previous    the generation before that
#
# A failed deploy (`up` or health check) restores `:last-good` automatically; a
# failed build or migration replaces nothing in the first place. `--rollback`
# steps the last deploy that succeeded but misbehaves back to `:previous` —
# once: it then refuses until another deploy succeeds. $STATE_DIR records the
# deployed commit, the one before it and which services the last deploy
# touched, so the checkout (and with it docker-compose.yml) follows the images.
# Database migrations are NEVER reversed — keep them additive.
#
# Migrations and backups (docs/DEPLOY_ROLLBACK_HARDENING.md)
# ----------------------
# This script is the only thing that migrates production (the API container's
# entrypoint doesn't, MIGRATE_ON_START=false). Before building it refuses a
# database with a failed migration or one the target commit doesn't know, and a
# TENANT_SCOPE_MODE that would drop from enforce. With migrations pending it
# takes a checked backup (scripts/backup_db.sh --predeploy) and aborts if that
# fails. Every rollback, automatic or manual, first classifies the migrations
# the restored code doesn't know (scripts/migration-class.sh) and refuses past
# a class C one: roll forward, or restore the pre-deploy backup.
#
# After the health gate a smoke test goes through nginx (FRONTEND_URL and
# NEXT_PUBLIC_API_URL from .env); a failure rolls back like a failed health check.
#
# Concurrency
# -----------
# GitHub's `concurrency: production` group serialises workflow runs, but not a
# deploy started by hand on the box, and the workflow's own pre-steps run before
# this script. So:
#   - the whole run holds an exclusive flock on $STATE_DIR/deploy.lock;
#   - a commit that is an ancestor of the one already deployed is skipped
#     (out-of-order delivery must never roll production backwards — that is
#     what --rollback is for); FORCE_DEPLOY=1 overrides;
#   - the script runs from a temporary copy of itself, because `git checkout -f`
#     rewrites scripts/deploy-production.sh in place and bash reads a script
#     lazily while executing it.
# =========================================================

if [ -z "${NEXA_DEPLOY_REEXEC:-}" ]; then
  SELF_COPY=$(mktemp /tmp/nexa-deploy.XXXXXX.sh)
  cp "$0" "$SELF_COPY"
  NEXA_DEPLOY_REEXEC="$SELF_COPY" exec bash "$SELF_COPY" "$@"
fi
trap 'rm -f "$NEXA_DEPLOY_REEXEC"' EXIT

usage() {
  echo "Usage: $0 <COMMIT_SHA> <SERVICE...>"
  echo "       $0 --rollback [SERVICE...]"
  exit 1
}

MODE=deploy
if [ "${1:-}" = "--rollback" ]; then
  MODE=rollback
  shift
  SERVICES=("$@")
else
  [ "$#" -ge 2 ] || usage
  COMMIT_SHA=$1
  shift
  SERVICES=("$@")
fi

for SERVICE in "${SERVICES[@]}"; do
  case "$SERVICE" in
    api | web) ;;
    *) echo "Error: unknown service '$SERVICE' (expected api and/or web)."; exit 1 ;;
  esac
done

REPO_DIR=$(git rev-parse --show-toplevel)
cd "$REPO_DIR"

# docker-compose.yml names every container nexa_<service>.
CONTAINER_PREFIX=${CONTAINER_PREFIX:-nexa_}

# Untracked + gitignored, so `git checkout -f` leaves it alone.
STATE_DIR="$REPO_DIR/.deploy"
mkdir -p "$STATE_DIR"

# ---------------------------------------------------------
# Concurrency: one deploy/rollback at a time on this box.
# ---------------------------------------------------------
# Well under the workflow's 45 min SSH timeout, which must also cover the build
# (~5–8 min) and migrations: a run cut off by SSH could stop mid-swap.
LOCK_WAIT_SECONDS=${DEPLOY_LOCK_WAIT_SECONDS:-900}
exec 9>"$STATE_DIR/deploy.lock"
if ! flock -n 9; then
  echo "Another deploy or rollback holds $STATE_DIR/deploy.lock; waiting up to ${LOCK_WAIT_SECONDS}s..."
  if ! flock -w "$LOCK_WAIT_SECONDS" 9; then
    echo "DEPLOYMENT ABORTED: timed out waiting for the deploy lock."
    exit 1
  fi
fi

# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------
log_history() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$STATE_DIR/history.log"
}

read_state() {
  cat "$STATE_DIR/$1" 2>/dev/null || true
}

write_state() {
  echo "$2" > "$STATE_DIR/$1"
}

COMPOSE_PROJECT=$(docker compose config --format json 2>/dev/null | jq -r '.name' 2>/dev/null || true)
if [ -z "$COMPOSE_PROJECT" ] || [ "$COMPOSE_PROJECT" = "null" ]; then
  COMPOSE_PROJECT=$(basename "$REPO_DIR" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')
fi

# compose names a built service's image <project>-<service>, tag `latest`.
image_for() {
  echo "$COMPOSE_PROJECT-$1"
}

image_exists() {
  docker image inspect "$1" > /dev/null 2>&1
}

contains() {
  local needle=$1 item
  shift
  for item in "$@"; do
    [ "$item" = "$needle" ] && return 0
  done
  return 1
}

# ---------------------------------------------------------
# Migration state. psql runs inside the Postgres container with its own
# POSTGRES_USER / POSTGRES_DB, so this script never reads secrets.
# ---------------------------------------------------------
DB_CONTAINER=${DB_CONTAINER:-${CONTAINER_PREFIX}postgres}
MIGRATIONS_DIR=apps/api/prisma/migrations

db_query() {
  docker exec -i "$DB_CONTAINER" sh -c 'psql -X -q -t -A -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<< "$1"
}

applied_migrations() {
  db_query "select migration_name from _prisma_migrations where finished_at is not null and rolled_back_at is null order by 1;"
}

failed_migrations() {
  db_query "select migration_name from _prisma_migrations where finished_at is null and rolled_back_at is null order by 1;"
}

# Migration folders a commit contains (no checkout needed).
migrations_in_commit() {
  git ls-tree --name-only "$1:$MIGRATIONS_DIR" 2>/dev/null | grep -E '^[0-9]{14}_' | sort || true
}

# Before putting <commit>'s code on this database: classify the applied
# migrations it doesn't know (their SQL must be in the working tree). Returns 1
# when one is class C (or can't be read): that code can't run on this schema.
schema_allows_code_of() {
  local commit=$1 applied known ahead status=0
  if ! applied=$(applied_migrations); then
    echo "Schema check: could not read _prisma_migrations."
    return 1
  fi
  known=$(migrations_in_commit "$commit")
  ahead=$(comm -23 <(sort <<< "$applied" | sed '/^$/d') <(sed '/^$/d' <<< "$known"))
  if [ -z "$ahead" ]; then
    echo "Schema check: $(git rev-parse --short "$commit") knows every applied migration."
    return 0
  fi
  if [ ! -f scripts/migration-class.sh ]; then
    echo "Schema check: scripts/migration-class.sh is missing from this checkout; can't classify."
    return 1
  fi
  echo "Schema check: the database has migrations $(git rev-parse --short "$commit") doesn't know:"
  bash scripts/migration-class.sh $(sed "s#^#$MIGRATIONS_DIR/#" <<< "$ahead") || status=$?
  if [ "$status" = 3 ]; then
    echo "A class C migration is applied: that code can't run on this schema."
    return 1
  fi
  [ "$status" = 0 ] || return 1
  if bash scripts/migration-class.sh $(sed "s#^#$MIGRATIONS_DIR/#" <<< "$ahead") | grep -q '^B'; then
    echo "Warning: class B (new enum values). Screens reading rows that already use a"
    echo "new value will error on the restored code; prefer rolling forward once they exist."
  fi
  return 0
}

# ---------------------------------------------------------
# Smoke test through nginx, the way a user reaches the app.
# ---------------------------------------------------------
env_value() {
  sed -n "s/^$1=//p" .env 2> /dev/null | tail -1 | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//' -e 's#/*$##'
}

# <label> <expected status> <url> [body substring]; 3 tries, 5 s apart.
smoke_check() {
  local label=$1 expected=$2 url=$3 needle=${4:-} attempt status body
  for attempt in 1 2 3; do
    # Sent as the browser does: the API resolves the academy from Origin.
    body=$(curl -s --max-time 10 -H "Origin: $SMOKE_ORIGIN" -w $'\n%{http_code}' "$url" 2> /dev/null || printf '\n000')
    status=${body##*$'\n'}
    body=${body%$'\n'*}
    if [ "$status" = "$expected" ] && { [ -z "$needle" ] || grep -qF -- "$needle" <<< "$body"; }; then
      echo "✓ smoke: $label ($status)"
      return 0
    fi
    [ "$attempt" = 3 ] || sleep 5
  done
  echo "✗ smoke: $label: got $status, expected $expected${needle:+ with '$needle'} ($url)"
  SMOKE_FAILURE=$label
  return 1
}

SMOKE_FAILURE=""
SMOKE_ORIGIN=""
smoke_test() {
  local web_url api_url
  web_url=$(env_value FRONTEND_URL)
  api_url=$(env_value NEXT_PUBLIC_API_URL)
  if [ -z "$web_url" ] || [ -z "$api_url" ]; then
    echo "Smoke test skipped: FRONTEND_URL or NEXT_PUBLIC_API_URL is not set in .env."
    return 0
  fi
  SMOKE_ORIGIN=$web_url
  echo "Smoke test through nginx ($web_url, $api_url)..."
  smoke_check "home page" 200 "$web_url/" || return 1
  smoke_check "sign-in page" 200 "$web_url/login" || return 1
  smoke_check "API ready" 200 "$api_url/health/ready" || return 1
  # The academy resolves for this host (tenant routing works).
  smoke_check "academy resolves" 200 "$api_url/tenant/public-config" '"tenantId":"' || return 1
  # Signed-out callers are refused, not served and not a 500.
  smoke_check "anonymous refused" 401 "$api_url/auth/me" || return 1
}

# Echoes healthy | unhealthy | timeout for one service's container. A restart
# means a crash loop (a fresh container starts at RestartCount 0), so it fails
# at once instead of waiting out the timeout.
wait_for_service() {
  local container="${CONTAINER_PREFIX}$1"
  local deadline=$((SECONDS + ${HEALTH_TIMEOUT_SECONDS:-180}))
  local has_healthcheck status restarts

  has_healthcheck=$(docker inspect --format='{{if .Config.Healthcheck}}true{{else}}false{{end}}' "$container" 2>/dev/null || echo "missing")
  if [ "$has_healthcheck" = "missing" ]; then
    echo "unhealthy"
    return
  fi

  while [ $SECONDS -lt $deadline ]; do
    restarts=$(docker inspect --format='{{.RestartCount}}' "$container" 2>/dev/null || echo 0)
    if [ "$restarts" != "0" ]; then
      echo "unhealthy"
      return
    fi
    if [ "$has_healthcheck" = "true" ]; then
      status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")
      case "$status" in
        healthy) echo "healthy"; return ;;
        unhealthy | missing) echo "unhealthy"; return ;;
      esac
    else
      # No healthcheck: running for 15s without a restart counts as healthy.
      if [ "$(docker inspect --format='{{.State.Running}} {{.RestartCount}}' "$container" 2>/dev/null)" = "true 0" ]; then
        sleep 15
        [ "$(docker inspect --format='{{.State.Running}} {{.RestartCount}}' "$container" 2>/dev/null)" = "true 0" ] && { echo "healthy"; return; }
        echo "unhealthy"
        return
      fi
    fi
    sleep 5
  done
  echo "timeout"
}

# Checks every given service; sets FAILED_SERVICE on the first that fails.
FAILED_SERVICE=""
check_services() {
  local service result
  FAILED_SERVICE=""
  for service in "$@"; do
    echo "Checking health for ${CONTAINER_PREFIX}$service..."
    result=$(wait_for_service "$service")
    if [ "$result" = "healthy" ]; then
      echo "✓ ${CONTAINER_PREFIX}$service is healthy."
    else
      echo "✗ ${CONTAINER_PREFIX}$service: $result."
      FAILED_SERVICE=$service
      return 1
    fi
  done
}

is_service_healthy_now() {
  local container="${CONTAINER_PREFIX}$1"
  local state
  state=$(docker inspect --format='{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || echo "false")
  [ "$state" = "true healthy" ] || [ "$state" = "true none" ]
}

# Restores <image>:<generation> as <image>:latest for each service, checks out
# the matching commit, recreates the containers and health-checks them.
# Returns 0 if everything came back healthy.
restore_generation() {
  local generation=$1 commit=$2
  shift 2
  local services=("$@")
  local service image restorable=()

  for service in "${services[@]}"; do
    image=$(image_for "$service")
    if image_exists "$image:$generation"; then
      restorable+=("$service")
    else
      echo "✗ No $image:$generation image to restore for $service."
    fi
  done

  if [ "${#restorable[@]}" -eq 0 ]; then
    echo "Nothing to restore — no '$generation' images exist yet (the first"
    echo "successful deploy with this script creates them)."
    return 1
  fi

  if [ -n "$commit" ]; then
    echo "Checking out $generation commit $commit..."
    git checkout -f "$commit"
  else
    echo "No recorded $generation commit; leaving the checkout at $(git rev-parse --short HEAD)."
  fi

  for service in "${restorable[@]}"; do
    image=$(image_for "$service")
    echo "Restoring $image:$generation -> $image:latest"
    docker tag "$image:$generation" "$image:latest"
  done

  echo "Recreating: ${restorable[*]} (+ egress)..."
  status_mark_deploying
  if ! docker compose up -d --no-build "${restorable[@]}" egress; then
    echo "✗ docker compose up failed while restoring."
    return 1
  fi

  check_services "${restorable[@]}" || return 1
  [ "${#restorable[@]}" -eq "${#services[@]}" ]
}

# ---------------------------------------------------------
# Status page (docs/SERVICE_STATUS.md). While nginx can't reach the app it
# serves deploy/status-pages/page.html; `deploying.json` makes that page say
# "updating" instead of "down". Skipped quietly where the directory is missing.
# ---------------------------------------------------------
STATUS_DIR="${NEXA_STATUS_DIR:-/var/www/nexa-status}/${NEXA_STATUS_ENV:-prod}"

status_mark_deploying() {
  [ -d "$STATUS_DIR" ] && [ -w "$STATUS_DIR" ] || return 0
  printf '{"since":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATUS_DIR/.deploying.json.tmp" \
    && mv -f "$STATUS_DIR/.deploying.json.tmp" "$STATUS_DIR/deploying.json" || true
}

status_clear_deploying() {
  rm -f "$STATUS_DIR/deploying.json" 2> /dev/null || true
}

# Copies the checked-out commit's page so the swap already shows the new wording.
status_sync_pages() {
  [ -d "$STATUS_DIR" ] && [ -w "$STATUS_DIR" ] || return 0
  local file
  for file in page.html api-unavailable.json; do
    [ -f "deploy/status-pages/$file" ] || continue
    cp "deploy/status-pages/$file" "$STATUS_DIR/.$file.tmp" && mv -f "$STATUS_DIR/.$file.tmp" "$STATUS_DIR/$file" || true
  done
}

trap 'status_clear_deploying; rm -f "$NEXA_DEPLOY_REEXEC"' EXIT

print_failure_logs() {
  [ -n "$1" ] || return 0
  echo "Recent logs for ${CONTAINER_PREFIX}$1:"
  docker logs --tail 50 "${CONTAINER_PREFIX}$1" 2>&1 || true
}

# Snapshot whatever is healthy right now as `:last-good`. On the first run the
# checkout is the best record of what produced it.
snapshot_running() {
  local service image running_image
  for service in "${SERVICES[@]}"; do
    image=$(image_for "$service")
    if is_service_healthy_now "$service"; then
      running_image=$(docker inspect --format='{{.Image}}' "${CONTAINER_PREFIX}$service")
      docker tag "$running_image" "$image:last-good"
      echo "Snapshot: healthy ${CONTAINER_PREFIX}$service image tagged $image:last-good"
    elif image_exists "$image:last-good"; then
      echo "Snapshot: ${CONTAINER_PREFIX}$service is not healthy; keeping the existing $image:last-good"
    else
      echo "Snapshot: ${CONTAINER_PREFIX}$service is not healthy and there is no $image:last-good — automatic rollback is unavailable for it."
    fi
  done
  if [ -z "$(read_state last-good-commit)" ]; then
    write_state last-good-commit "$(git rev-parse HEAD)"
  fi
}

# =========================================================
# Manual rollback
# =========================================================
if [ "$MODE" = "rollback" ]; then
  FROM_COMMIT=$(read_state last-good-commit)
  TO_COMMIT=$(read_state previous-commit)
  read -r -a LAST_DEPLOY_SERVICES <<< "$(read_state last-deploy-services)"

  if [ -z "$TO_COMMIT" ] || [ "${#LAST_DEPLOY_SERVICES[@]}" -eq 0 ]; then
    echo "Nothing to roll back: no successful deploy is recorded since the last"
    echo "rollback (or since this script started tracking deploys)."
    exit 1
  fi
  [ "${#SERVICES[@]}" -gt 0 ] || SERVICES=("${LAST_DEPLOY_SERVICES[@]}")
  for SERVICE in "${SERVICES[@]}"; do
    if ! contains "$SERVICE" "${LAST_DEPLOY_SERVICES[@]}"; then
      echo "Error: the last deploy did not change $SERVICE (it changed: ${LAST_DEPLOY_SERVICES[*]})."
      exit 1
    fi
  done

  echo "========================================"
  echo "MANUAL ROLLBACK: ${SERVICES[*]}"
  echo "========================================"
  echo "From: $FROM_COMMIT"
  echo "To:   $TO_COMMIT"

  # The working tree is still $FROM_COMMIT, so the newer migrations' SQL is here.
  if contains api "${SERVICES[@]}" && ! schema_allows_code_of "$TO_COMMIT"; then
    if [ "${ROLLBACK_PAST_CONTRACT:-}" = "1" ]; then
      echo "ROLLBACK_PAST_CONTRACT=1: rolling back anyway."
    else
      log_history "rollback REFUSED (schema ahead, class C) services=${SERVICES[*]} from=$FROM_COMMIT to=$TO_COMMIT"
      echo "========================================"
      echo "ROLLBACK REFUSED"
      echo "========================================"
      echo "Roll forward with a fix, or restore the pre-deploy backup"
      echo "(docs/DATABASE_RESTORE.md § 'Restore after a bad deploy')."
      exit 1
    fi
  fi

  if restore_generation previous "$TO_COMMIT" "${SERVICES[@]}"; then
    # What runs now is the previous generation; it becomes last-good.
    for SERVICE in "${SERVICES[@]}"; do
      IMAGE=$(image_for "$SERVICE")
      docker tag "$IMAGE:previous" "$IMAGE:last-good"
    done
    write_state last-good-commit "$TO_COMMIT"
    rm -f "$STATE_DIR/previous-commit" "$STATE_DIR/last-deploy-services"
    log_history "rollback ok services=${SERVICES[*]} from=$FROM_COMMIT to=$TO_COMMIT"
    echo "========================================"
    echo "ROLLBACK SUCCESSFUL"
    echo "========================================"
    echo "Note: database migrations were NOT reversed."
    echo "The next push to main deploys normally."
    exit 0
  fi

  print_failure_logs "$FAILED_SERVICE"
  log_history "rollback FAILED services=${SERVICES[*]} from=$FROM_COMMIT to=$TO_COMMIT"
  echo "========================================"
  echo "ROLLBACK FAILED — production needs manual attention"
  echo "========================================"
  exit 2
fi

# =========================================================
# Deploy
# =========================================================
echo "Starting deployment for commit: $COMMIT_SHA"
echo "Target services: ${SERVICES[*]}"

PREV_COMMIT=$(git rev-parse HEAD)
echo "Current checkout before deployment: $PREV_COMMIT"

echo "Fetching latest changes..."
git fetch origin main
COMMIT_SHA=$(git rev-parse --verify "$COMMIT_SHA^{commit}")

# Out-of-order guard: never deploy a commit older than the one already live.
DEPLOYED_COMMIT=$(read_state last-good-commit)
if [ -n "$DEPLOYED_COMMIT" ] && [ "$COMMIT_SHA" != "$DEPLOYED_COMMIT" ] \
  && git merge-base --is-ancestor "$COMMIT_SHA" "$DEPLOYED_COMMIT" 2>/dev/null; then
  if [ "${FORCE_DEPLOY:-}" = "1" ]; then
    echo "FORCE_DEPLOY=1: deploying $COMMIT_SHA although newer $DEPLOYED_COMMIT is live."
  else
    echo "Skipping: $COMMIT_SHA is older than the deployed $DEPLOYED_COMMIT."
    echo "Use --rollback to go back deliberately, or FORCE_DEPLOY=1 to override."
    log_history "skip stale commit=$COMMIT_SHA deployed=$DEPLOYED_COMMIT"
    exit 0
  fi
fi

snapshot_running

# Nothing has been replaced yet: put the checkout and `latest` tags back.
abort_before_swap() {
  local reason=$1
  echo "========================================"
  echo "DEPLOYMENT ABORTED: $reason"
  echo "========================================"
  echo "No containers were replaced — the running version keeps serving."
  echo "Restoring the checkout to $PREV_COMMIT."
  git checkout -f "$PREV_COMMIT"
  # A freshly built `latest` must not be picked up by an unrelated restart.
  for SERVICE in "${SERVICES[@]}"; do
    IMAGE=$(image_for "$SERVICE")
    if image_exists "$IMAGE:last-good"; then docker tag "$IMAGE:last-good" "$IMAGE:latest"; fi
  done
  log_history "deploy ABORTED ($reason) commit=$COMMIT_SHA services=${SERVICES[*]}${BACKUP_KEY:+ backup=$BACKUP_KEY}"
  exit 1
}

# Restores :last-good after a failed deploy, then exits non-zero either way.
rollback_failed_deploy() {
  local reason=$1
  echo "========================================"
  echo "DEPLOYMENT FAILED: $reason"
  echo "========================================"
  print_failure_logs "$FAILED_SERVICE"
  echo ""
  # Never put old code on a schema it can't run on (class C applied just now).
  local good_commit
  good_commit=$(read_state last-good-commit)
  if [ -n "${PENDING:-}" ] && [ -n "$good_commit" ] && ! schema_allows_code_of "$good_commit"; then
    log_history "deploy FAILED ($reason) commit=$COMMIT_SHA services=${SERVICES[*]}; NOT rolled back (schema ahead, class C) backup=${BACKUP_KEY:-none}"
    echo "========================================"
    echo "NOT ROLLED BACK — production needs manual attention"
    echo "========================================"
    echo "The previous code can't run on the migrated schema. Roll forward with a"
    echo "fix, or restore the pre-deploy backup ${BACKUP_KEY:-<none recorded>}"
    echo "(docs/DATABASE_RESTORE.md § 'Restore after a bad deploy')."
    exit 2
  fi
  echo "Rolling back ${SERVICES[*]} to last-good images..."
  if restore_generation last-good "$(read_state last-good-commit)" "${SERVICES[@]}"; then
    log_history "deploy FAILED ($reason) commit=$COMMIT_SHA services=${SERVICES[*]}; rolled back to $(read_state last-good-commit)"
    echo "========================================"
    echo "ROLLED BACK — previous version is serving"
    echo "========================================"
    echo "Note: database migrations were NOT reversed."
    exit 1
  fi
  print_failure_logs "$FAILED_SERVICE"
  log_history "deploy FAILED ($reason) commit=$COMMIT_SHA services=${SERVICES[*]}; ROLLBACK FAILED"
  echo "========================================"
  echo "ROLLBACK FAILED — production needs manual attention"
  echo "========================================"
  exit 2
}

echo "Checking out target commit $COMMIT_SHA..."
git checkout -f "$COMMIT_SHA"

# =========================================================
# Pre-build checks (API only: web never touches the database)
# =========================================================
PENDING=""
BACKUP_KEY=""
if contains api "${SERVICES[@]}"; then
  echo "Checking the database's migration state..."
  APPLIED=$(applied_migrations) || abort_before_swap "could not read _prisma_migrations"
  FAILED_MIGRATIONS=$(failed_migrations) || abort_before_swap "could not read _prisma_migrations"
  if [ -n "$FAILED_MIGRATIONS" ]; then
    abort_before_swap "the database has a failed migration: $(tr '\n' ' ' <<< "$FAILED_MIGRATIONS")(docs/DATABASE_RESTORE.md § 'A failed migration')"
  fi
  KNOWN=$(migrations_in_commit "$COMMIT_SHA")
  UNKNOWN=$(comm -23 <(sort <<< "$APPLIED" | sed '/^$/d') <(sed '/^$/d' <<< "$KNOWN"))
  if [ -n "$UNKNOWN" ]; then
    abort_before_swap "the database has migrations this commit doesn't know: $(tr '\n' ' ' <<< "$UNKNOWN")"
  fi
  PENDING=$(comm -13 <(sort <<< "$APPLIED" | sed '/^$/d') <(sed '/^$/d' <<< "$KNOWN"))
  if [ -n "$PENDING" ]; then
    echo "Pending migrations (rollback class, docs/DEPLOY_ROLLBACK_HARDENING.md):"
    bash scripts/migration-class.sh $(sed "s#^#$MIGRATIONS_DIR/#" <<< "$PENDING") || true
  else
    echo "No pending migrations."
  fi

  # Academy isolation must never loosen as a side effect of a deploy (a lost
  # .env line falls back to compose's default, audit).
  RUNNING_SCOPE=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${CONTAINER_PREFIX}api" 2> /dev/null | sed -n 's/^TENANT_SCOPE_MODE=//p')
  NEW_SCOPE=$(docker compose config --format json 2> /dev/null | jq -r '.services.api.environment.TENANT_SCOPE_MODE // empty')
  echo "TENANT_SCOPE_MODE: running=${RUNNING_SCOPE:-unset} after deploy=${NEW_SCOPE:-unset}"
  if [ "$RUNNING_SCOPE" = "enforce" ] && [ "$NEW_SCOPE" != "enforce" ] && [ "${ALLOW_TENANT_SCOPE_CHANGE:-}" != "1" ]; then
    abort_before_swap "TENANT_SCOPE_MODE would drop from enforce to '${NEW_SCOPE:-unset}' (fix .env, or ALLOW_TENANT_SCOPE_CHANGE=1 on the box)"
  fi
fi

# Tags Sentry errors with the commit that produced them (compose reads it).
export SENTRY_RELEASE="$COMMIT_SHA"

# A failed build replaces no running container, but a service that did build
# before another failed has a new `latest`; put that back with the checkout.
echo "Building services: ${SERVICES[*]}..."
if ! docker compose build "${SERVICES[@]}"; then
  abort_before_swap "build failed"
fi

# =========================================================
# Migration Phase
# =========================================================
# New API code must never serve traffic against an un-migrated database, and a
# migration that cannot apply must not take the running API down with it. So
# migrations run here, from a throwaway container off the NEW image, while the
# current API is still up — and only after a checked backup. The container
# entrypoint never migrates in production (MIGRATE_ON_START=false).
if [ -n "$PENDING" ]; then
  echo "Taking the pre-deploy backup..."
  if ! BACKUP_OUTPUT=$(bash scripts/backup_db.sh --predeploy "$(git rev-parse --short "$COMMIT_SHA")" "$STATE_DIR/backups" 2>&1); then
    tail -n 20 <<< "$BACKUP_OUTPUT"
    abort_before_swap "pre-deploy backup failed"
  fi
  tail -n 6 <<< "$BACKUP_OUTPUT"
  BACKUP_KEY=$(sed -n 's/^BACKUP_KEY=//p' <<< "$BACKUP_OUTPUT" | tail -1)
  [ -n "$BACKUP_KEY" ] || abort_before_swap "pre-deploy backup printed no key"
  log_history "backup ok commit=$COMMIT_SHA backup=$BACKUP_KEY"

  echo "Applying database migrations (before swapping the running API)..."
  if ! docker compose run --rm api npx prisma migrate deploy; then
    echo "The database is in whatever state Prisma reached; inspect it with:"
    echo "  docker compose run --rm api npx prisma migrate status"
    echo "Runbook: docs/DATABASE_RESTORE.md § 'A failed migration'. Backup: $BACKUP_KEY"
    abort_before_swap "migrations failed"
  fi
  echo "Migrations applied."
fi

# Start the affected services. Also reconcile `egress`: nothing `depends_on` it,
# so a targeted `up -d web api` never creates or updates it, and recordings fail
# silently ("no response from egress"). `livekit`/`redis`/`postgres` are covered
# by api's depends_on.
#
# `up` itself fails when web's depends_on sees an unhealthy api ("dependency
# failed to start"), so it is a rollback trigger, not just the health check.
echo "Starting services: ${SERVICES[*]} (+ egress)..."
status_sync_pages
status_mark_deploying
if ! docker compose up -d "${SERVICES[@]}" egress; then
  for SERVICE in "${SERVICES[@]}"; do
    is_service_healthy_now "$SERVICE" || { FAILED_SERVICE=$SERVICE; break; }
  done
  rollback_failed_deploy "docker compose up failed"
fi

# =========================================================
# Health Check Phase
# =========================================================
if ! check_services "${SERVICES[@]}"; then
  rollback_failed_deploy "${CONTAINER_PREFIX}$FAILED_SERVICE did not become healthy"
fi
if ! smoke_test; then
  rollback_failed_deploy "smoke test failed: $SMOKE_FAILURE"
fi
status_clear_deploying

# =========================================================
# Promote: this deploy is the new last-good.
# =========================================================
for SERVICE in "${SERVICES[@]}"; do
  IMAGE=$(image_for "$SERVICE")
  if image_exists "$IMAGE:last-good" \
    && [ "$(docker image inspect --format='{{.Id}}' "$IMAGE:last-good")" != "$(docker image inspect --format='{{.Id}}' "$IMAGE:latest")" ]; then
    docker tag "$IMAGE:last-good" "$IMAGE:previous"
  fi
  docker tag "$IMAGE:latest" "$IMAGE:last-good"
done
OLD_GOOD_COMMIT=$(read_state last-good-commit)
if [ -n "$OLD_GOOD_COMMIT" ] && [ "$OLD_GOOD_COMMIT" != "$COMMIT_SHA" ]; then
  write_state previous-commit "$OLD_GOOD_COMMIT"
fi
write_state last-good-commit "$COMMIT_SHA"
write_state last-deploy-services "${SERVICES[*]}"
log_history "deploy ok commit=$COMMIT_SHA services=${SERVICES[*]} backup=${BACKUP_KEY:-none}"

# =========================================================
# Cleanup Phase
# =========================================================
echo "========================================"
echo "DEPLOYMENT SUCCESSFUL"
echo "========================================"
echo "Cleaning up dangling images and build cache..."
# Only dangling images go: `:last-good` and `:previous` are tagged, so the
# rollback generations survive.
# Build cache: kept until the disk runs low. It saves the dependency install
# (and the API's Stockfish compile) on the next build — measured 2026-10-31,
# API 297s → 167s, web 442s → 324s; a full prune made every deploy as slow as
# `--no-cache`. On Engine 29's containerd image store the cache total also
# counts the layers of every live image, so size caps (`--reserved-space`,
# `--max-used-space 10GB`) and `--filter until=72h` all left most of it behind
# (2026-10-25: until=72h reclaimed 0B). So the trigger is free disk space, and
# when it fires all unused cache goes — rollback uses the tagged images, never
# the cache. `DEPLOY_PRUNE_MIN_FREE_GB` (default 40) sets the threshold.
if [ "${DEPLOY_SKIP_PRUNE:-}" != "1" ]; then
  docker image prune -f
  docker system df | grep -E '^(TYPE|Build Cache)' || true
  min_free_gb="${DEPLOY_PRUNE_MIN_FREE_GB:-40}"
  free_gb=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
  if [ -z "$free_gb" ] || [ "$free_gb" -lt "$min_free_gb" ]; then
    echo "Free disk ${free_gb:-unknown}GB < ${min_free_gb}GB: pruning build cache."
    docker builder prune -f | tail -1 || true
    docker system df | grep -E '^Build Cache' || true
  else
    echo "Free disk ${free_gb}GB >= ${min_free_gb}GB: keeping build cache."
  fi
fi

echo "Deployment complete."
exit 0
