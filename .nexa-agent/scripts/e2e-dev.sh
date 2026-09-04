#!/usr/bin/env bash
#
# Run the Playwright suite against the DEV server.
#
#   .nexa-agent/scripts/e2e-dev.sh [playwright args...]
#
# Reuses the dev stack if it is already up, and only starts one if it is not --
# in which case it leaves it running afterwards. A warm dev server is the normal
# state of this box; tearing it down after every test run would make each run
# pay Nest's and Next's cold start for nothing, and would kill a server someone
# else was using.
#
# PORTS -- THE PART THAT MATTERS
# ------------------------------
# dev is web :3010 / api :3011 (apps/web/.env and apps/api/.env), against the
# vps_dev database.
#
# PRODUCTION is nexa_web :3000 / nexa_api :3001 on this same host -- and those
# are exactly the defaults baked into playwright.config.ts and e2e/fixtures.ts.
# A run that keeps those defaults signs into the production app with the seeded
# accounts and mutates real rows: the specs log in, create batches, join classes
# and post chat messages. So this script sets E2E_BASE_URL and
# NEXT_PUBLIC_API_URL explicitly and refuses outright if either resolves to a
# production port. Failing loudly beats testing the wrong system quietly.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HERE/../agents/_lib"
# shellcheck source=../agents/_lib/guard.sh
. "$LIB/guard.sh"

read_env() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 0
  grep -m1 "^${key}=" "$file" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'' | tr -d '\r'
}

WEB_PORT="${E2E_WEB_PORT:-$(read_env "$NEXA_DEV_ROOT/apps/web/.env" PORT)}"
API_PORT="${E2E_API_PORT:-$(read_env "$NEXA_DEV_ROOT/apps/api/.env" PORT)}"
WEB_PORT="${WEB_PORT:-3010}"
API_PORT="${API_PORT:-3011}"

BASE_URL="http://localhost:${WEB_PORT}"
API_URL="http://localhost:${API_PORT}"

guard_workspace >/dev/null
guard_database
guard_e2e_target "$BASE_URL"
guard_e2e_target "$API_URL"

LOG_DIR="$NEXA_AGENT_DIR/logs/e2e"
mkdir -p "$LOG_DIR"
STAMP="$(date +%Y%m%dT%H%M%S)"

# Any HTTP response means the server is listening. Deliberately NOT `curl -sf`:
# the Nest API has no route at "/" and answers 404, which -f treats as failure,
# so the probe would wait forever on a server that was up the whole time.
is_up() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$1" 2>/dev/null)"
  [ -n "$code" ] && [ "$code" != "000" ]
}

wait_for() {
  local url="$1" name="$2" tries="${3:-90}"
  for _ in $(seq 1 "$tries"); do
    is_up "$url" && { echo "[e2e] $name ready at $url" >&2; return 0; }
    sleep 2
  done
  return 1
}

start_if_needed() {
  local url="$1" name="$2" script="$3" log="$4"
  if is_up "$url"; then
    echo "[e2e] reusing the running dev $name at $url" >&2
    return 0
  fi
  echo "[e2e] dev $name is not up; starting it (log: $log)" >&2
  # setsid so it survives this script -- the dev server is meant to stay warm.
  ( cd "$NEXA_DEV_ROOT" && setsid nohup npm run "$script" >"$log" 2>&1 & )
  if ! wait_for "$url" "$name"; then
    echo "[e2e] dev $name did not come up at $url -- last 30 lines:" >&2
    tail -30 "$log" >&2
    return 1
  fi
}

API_LOG="$LOG_DIR/${STAMP}.api.log"
WEB_LOG="$LOG_DIR/${STAMP}.web.log"

# The API holds the DB connection, so start it first: if it cannot reach
# vps_dev, that is the finding, and there is no point waiting on a web server
# with nothing to talk to.
start_if_needed "$API_URL" "api" "dev:api" "$API_LOG" || exit 1
start_if_needed "$BASE_URL" "web" "dev:web" "$WEB_LOG" || exit 1

echo "[e2e] playwright -> web $BASE_URL, api $API_URL, db vps_dev" >&2
cd "$NEXA_DEV_ROOT"
E2E_BASE_URL="$BASE_URL" \
NEXT_PUBLIC_API_URL="$API_URL" \
  npx playwright test "$@"
RC=$?

echo "[e2e] playwright exited $RC (dev server left running)" >&2
exit $RC
