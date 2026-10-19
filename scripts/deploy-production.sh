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
LOCK_WAIT_SECONDS=${DEPLOY_LOCK_WAIT_SECONDS:-2400}
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
  if ! docker compose up -d --no-build "${restorable[@]}" egress; then
    echo "✗ docker compose up failed while restoring."
    return 1
  fi

  check_services "${restorable[@]}" || return 1
  [ "${#restorable[@]}" -eq "${#services[@]}" ]
}

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

# Restores :last-good after a failed deploy, then exits non-zero either way.
rollback_failed_deploy() {
  local reason=$1
  echo "========================================"
  echo "DEPLOYMENT FAILED: $reason"
  echo "========================================"
  print_failure_logs "$FAILED_SERVICE"
  echo ""
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

# Tags Sentry errors with the commit that produced them (compose reads it).
export SENTRY_RELEASE="$COMMIT_SHA"

# A failed build replaces no running container, but a service that did build
# before another failed has a new `latest`; put that back with the checkout.
echo "Building services: ${SERVICES[*]}..."
if ! docker compose build "${SERVICES[@]}"; then
  echo "========================================"
  echo "DEPLOYMENT ABORTED: build failed"
  echo "========================================"
  echo "No containers were replaced. Restoring the checkout to $PREV_COMMIT."
  git checkout -f "$PREV_COMMIT"
  # The freshly built `latest` must not be picked up by an unrelated restart.
  for SERVICE in "${SERVICES[@]}"; do
    IMAGE=$(image_for "$SERVICE")
    image_exists "$IMAGE:last-good" && docker tag "$IMAGE:last-good" "$IMAGE:latest"
  done
  log_history "deploy ABORTED (build) commit=$COMMIT_SHA services=${SERVICES[*]}"
  exit 1
fi

# =========================================================
# Migration Phase
# =========================================================
# New API code must never serve traffic against an un-migrated database, and a
# migration that cannot apply must not take the running API down with it.
#
# `entrypoint.sh` also runs `migrate deploy` on container start, but by then the
# old container is already gone. So apply migrations here first, from a
# throwaway container built off the NEW image, while the current API is still
# up. `migrate deploy` is idempotent, so the entrypoint's run becomes a no-op
# and stays as a safety net for manual container starts.
if contains api "${SERVICES[@]}"; then
  echo "Applying database migrations (before swapping the running API)..."

  if ! docker compose run --rm api npx prisma migrate deploy; then
    echo "========================================"
    echo "DEPLOYMENT ABORTED: migrations failed"
    echo "========================================"
    echo "No containers were replaced — the previous API is still serving."
    echo "The database is in whatever state Prisma reached; inspect it with:"
    echo "  docker compose run --rm api npx prisma migrate status"
    echo ""
    echo "Restoring the working tree to $PREV_COMMIT to match the running containers..."
    git checkout -f "$PREV_COMMIT"
    # The freshly built `latest` must not be picked up by an unrelated restart.
    for SERVICE in "${SERVICES[@]}"; do
      IMAGE=$(image_for "$SERVICE")
      image_exists "$IMAGE:last-good" && docker tag "$IMAGE:last-good" "$IMAGE:latest"
    done
    log_history "deploy ABORTED (migrations) commit=$COMMIT_SHA services=${SERVICES[*]}"
    exit 1
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
log_history "deploy ok commit=$COMMIT_SHA services=${SERVICES[*]}"

# =========================================================
# Cleanup Phase
# =========================================================
echo "========================================"
echo "DEPLOYMENT SUCCESSFUL"
echo "========================================"
echo "Cleaning up dangling images and build cache..."
# Only dangling images go: `:last-good` and `:previous` are tagged, so the
# rollback generations survive.
# Build cache: `--reserved-space 2GB` alone exited 0 without removing anything
# on Engine 29 / buildx 0.36 (52GB of week-old layers survived a dozen deploys),
# so prune by age, then cap the total. Output stays visible in the deploy log.
if [ "${DEPLOY_SKIP_PRUNE:-}" != "1" ]; then
  docker image prune -f
  docker builder prune -f --filter until=72h || true
  docker builder prune -f --max-used-space 10GB || docker builder prune -f --keep-storage 10GB || true
fi

echo "Deployment complete."
exit 0
