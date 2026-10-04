#!/bin/bash
set -euo pipefail

# ==============================================================================
# Lichess puzzle catalogue — STAGE 2, LOAD (spec §13)
# docs/PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md
# ==============================================================================
# Usage: scripts/lichess-puzzles-load.sh <release-dir>/manifest.json
#
# Loads a release prepared by `npm run puzzles:prepare -w apps/api` (the
# catalogue.tsv.zst beside the manifest) into lichess_puzzles, through psql in
# the Postgres container. Resume = re-run: staging is rebuilt from the file,
# and every band upsert writes nothing for a row that is already identical.
#
#   0  flock — a second run exits at once
#   1  preflight: manifest + artifact checksum, migration present, disk, not in
#      the backup window, resource gate; record the release row
#   2  staging: UNLOGGED copy of the file (rebuilt every run)
#   3  promote band by band (one transaction each), re-checking the gate between
#   4  retire ids the release no longer contains
#   5  VACUUM (FREEZE, ANALYZE)
#   6  mark the release loaded, drop staging, report
#
# Stop a load: Ctrl-C / kill, then re-run (or DROP TABLE lichess_puzzles_staging).
# Remove all catalogue data: TRUNCATE lichess_puzzles. Neither touches puzzles,
# attempts or ratings.
#
# Environment (defaults suit the production box):
#   DB_CONTAINER (nexa_postgres)  DB_USER / DB_NAME (POSTGRES_USER / POSTGRES_DB from .env)
#   API_HEALTH_URL (http://localhost:3001/health/ready; empty = skip the latency gate)
#   BLACKOUT_UTC (19:30-21:30 — the nightly backup; empty = none)
#   GATE_MAX_LOAD (1.5)  GATE_RESUME_LOAD (1.2)  GATE_MIN_MEM_AVAILABLE_PCT (20)
#   GATE_POLL_SECONDS (60)  GATE_API_ABORT_MINUTES (15)  BAND_SLEEP_SECONDS (2)
#   LOAD_LOG (<repo>/lichess-load.log)  LOCK_FILE (/var/lock/nexa-lichess-load.lock)
# ==============================================================================

export PATH="/home/ubuntu/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

DB_CONTAINER="${DB_CONTAINER:-nexa_postgres}"
DB_USER="${DB_USER:-${POSTGRES_USER:-postgres}}"
DB_NAME="${DB_NAME:-${POSTGRES_DB:-nexa_chess}}"
API_HEALTH_URL="${API_HEALTH_URL-http://localhost:3001/health/ready}"
BLACKOUT_UTC="${BLACKOUT_UTC-19:30-21:30}"
GATE_MAX_LOAD="${GATE_MAX_LOAD:-1.5}"
GATE_RESUME_LOAD="${GATE_RESUME_LOAD:-1.2}"
GATE_MIN_MEM_AVAILABLE_PCT="${GATE_MIN_MEM_AVAILABLE_PCT:-20}"
GATE_POLL_SECONDS="${GATE_POLL_SECONDS:-60}"
GATE_API_ABORT_MINUTES="${GATE_API_ABORT_MINUTES:-15}"
BAND_SLEEP_SECONDS="${BAND_SLEEP_SECONDS:-2}"
LOAD_LOG="${LOAD_LOG:-$ROOT_DIR/lichess-load.log}"
LOCK_FILE="${LOCK_FILE:-/var/lock/nexa-lichess-load.lock}"

SUPPORTED_FORMAT_VERSION=1
# Must equal CATALOGUE_TSV_COLUMNS in apps/api/src/puzzle/catalogue/lichess-prepare.core.ts.
TSV_COLUMNS='id fen moves rating ratingDeviation popularity nbPlays themes openingTags gameUrl ratingBand randKey contentHash passesQualityGate'
MAX_REJECT_RATIO=0.001

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOAD_LOG"; }
die() { log "ABORT: $*"; exit 1; }

psql_db() {
  docker exec -i -e PGOPTIONS=--client-min-messages=warning "$DB_CONTAINER" psql -X -q -tA -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" "$@"
}

# ── 0. One load at a time ─────────────────────────────────────────────────────
MANIFEST="${1:-}"
[ -n "$MANIFEST" ] || { echo "Usage: $0 <release-dir>/manifest.json"; exit 1; }
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Another catalogue load holds $LOCK_FILE — exiting."; exit 1; }

STARTED_AT=$(date +%s)
PAUSES=()

# ── 1. Preflight ─────────────────────────────────────────────────────────────
[ -f "$MANIFEST" ] || die "manifest not found: $MANIFEST"
RELEASE_DIR="$(cd "$(dirname "$MANIFEST")" && pwd)"
CATALOGUE="$RELEASE_DIR/$(jq -r '.files.catalogue.name' "$MANIFEST")"
[ -f "$CATALOGUE" ] || die "catalogue file not found: $CATALOGUE"

RELEASE_ID=$(jq -r '.preparedSha256' "$MANIFEST")
FORMAT_VERSION=$(jq -r '.formatVersion' "$MANIFEST")
DUMP_DATE=$(jq -r '.lichessDumpDate' "$MANIFEST")
SOURCE_SHA=$(jq -r '.sourceSha256' "$MANIFEST")
VALID_ROWS=$(jq -r '.rows.valid' "$MANIFEST")
TOTAL_ROWS=$(jq -r '.rows.total' "$MANIFEST")
REJECTED_ROWS=$(jq -r '.rows.rejected' "$MANIFEST")
GATE_ROWS=$(jq -r '.rows.passesQualityGate' "$MANIFEST")
TSV_BYTES=$(jq -r '.files.catalogue.uncompressedBytes' "$MANIFEST")
COMPRESSED_SHA=$(jq -r '.files.catalogue.sha256' "$MANIFEST")
MANIFEST_COLUMNS=$(jq -r '.columns | join(" ")' "$MANIFEST")

[[ "$RELEASE_ID" =~ ^[0-9a-f]{64}$ ]] || die "manifest preparedSha256 is not a sha256: $RELEASE_ID"
[[ "$DUMP_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "manifest lichessDumpDate is not YYYY-MM-DD: $DUMP_DATE"
[ "$FORMAT_VERSION" = "$SUPPORTED_FORMAT_VERSION" ] || die "unsupported formatVersion $FORMAT_VERSION (this script loads $SUPPORTED_FORMAT_VERSION)"
[ "$MANIFEST_COLUMNS" = "$TSV_COLUMNS" ] || die "manifest columns differ from this script's: $MANIFEST_COLUMNS"
awk -v r="$REJECTED_ROWS" -v t="$TOTAL_ROWS" -v m="$MAX_REJECT_RATIO" 'BEGIN { exit !(t > 0 && r / t <= m) }' \
  || die "release rejected $REJECTED_ROWS of $TOTAL_ROWS rows (> ${MAX_REJECT_RATIO}) — prepare refused it"

log "Release $RELEASE_ID (Lichess dump $DUMP_DATE, $VALID_ROWS rows) → $DB_CONTAINER/$DB_NAME"
log "Verifying artifact checksums …"
[ "$(sha256sum "$CATALOGUE" | cut -d' ' -f1)" = "$COMPRESSED_SHA" ] || die "catalogue.tsv.zst sha256 differs from the manifest (corrupt download?)"
[ "$(zstd -dc "$CATALOGUE" | sha256sum | cut -d' ' -f1)" = "$RELEASE_ID" ] || die "uncompressed TSV sha256 differs from preparedSha256"

docker ps --format '{{.Names}}' | grep -Eq "^${DB_CONTAINER}\$" || die "database container '$DB_CONTAINER' is not running"
[ "$(psql_db -c "SELECT to_regclass('public.lichess_puzzles') IS NOT NULL AND to_regclass('public.lichess_catalogue_releases') IS NOT NULL")" = "t" ] \
  || die "catalogue tables missing — deploy the puzzle_catalogue migration first"

DATA_DIR=$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /)
[ -d "$DATA_DIR" ] || DATA_DIR=/
free_bytes() { df --output=avail -B1 "$DATA_DIR" | tail -1 | tr -d ' '; }
FREE=$(free_bytes)
[ "$FREE" -gt $((TSV_BYTES * 3)) ] || die "only $FREE bytes free on $DATA_DIR; need > 3 × $TSV_BYTES"

in_blackout() {
  [ -n "$BLACKOUT_UTC" ] || return 1
  local now from to
  now=$(date -u +%H%M); from=${BLACKOUT_UTC%-*}; to=${BLACKOUT_UTC#*-}
  from=${from/:/}; to=${to/:/}
  [ "$((10#$now))" -ge "$((10#$from))" ] && [ "$((10#$now))" -lt "$((10#$to))" ]
}
in_blackout && die "inside the backup window ($BLACKOUT_UTC UTC) — run later"

# ── Resource gate (spec §13) ─────────────────────────────────────────────────
health_sample() {
  curl -s -o /dev/null -m 10 -w '%{time_total}' "$API_HEALTH_URL" 2>/dev/null || echo 10
}
health_median() {
  local samples=()
  for _ in 1 2 3 4 5; do samples+=("$(health_sample)"); done
  printf '%s\n' "${samples[@]}" | sort -n | sed -n 3p
}

API_BASELINE=""
if [ -n "$API_HEALTH_URL" ]; then
  [ "$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$API_HEALTH_URL" || true)" = "200" ] \
    || die "$API_HEALTH_URL is not answering 200 (set API_HEALTH_URL= to skip the latency gate)"
  API_BASELINE=$(health_median)
  # Floor the baseline so a 3 ms idle reading doesn't make 7 ms count as a slowdown.
  API_BASELINE=$(awk -v b="$API_BASELINE" 'BEGIN { print (b < 0.05 ? 0.05 : b) }')
  log "API health baseline ${API_BASELINE}s"
fi

LOAD_PAUSED=0
API_SLOW_SINCE=""
GATE_REASONS=""
# Sets GATE_REASONS ("" = green). Runs in the main shell, not $(…), so a die()
# here really aborts and the pause / latency state survives between calls.
# $1 = bytes of TSV still to promote (disk gate).
check_gate() {
  local remaining_bytes=$1 reasons=() live load mem_pct median threshold
  live=$(psql_db -c "SELECT count(*) FROM classes WHERE status IN ('LIVE', 'IN_PROGRESS')")
  [ "$live" = "0" ] || reasons+=("$live live class(es)")

  load=$(cut -d' ' -f1 /proc/loadavg)
  threshold=$GATE_MAX_LOAD
  # Hysteresis: once paused, wait for the lower resume threshold (never above the pause one).
  [ "$LOAD_PAUSED" = "1" ] && threshold=$(awk -v r="$GATE_RESUME_LOAD" -v m="$GATE_MAX_LOAD" 'BEGIN { print (r < m ? r : m) }')
  if awk -v l="$load" -v t="$threshold" 'BEGIN { exit !(l >= t) }'; then
    reasons+=("load average $load (≥ $threshold)"); LOAD_PAUSED=1
  else
    LOAD_PAUSED=0
  fi

  mem_pct=$(awk '/MemTotal/ { t = $2 } /MemAvailable/ { a = $2 } END { printf "%d", a * 100 / t }' /proc/meminfo)
  [ "$mem_pct" -ge "$GATE_MIN_MEM_AVAILABLE_PCT" ] || reasons+=("only ${mem_pct}% memory available")

  if [ -n "$API_BASELINE" ]; then
    median=$(health_median)
    if awk -v m="$median" -v b="$API_BASELINE" 'BEGIN { exit !(m >= 2 * b) }'; then
      reasons+=("API health ${median}s (baseline ${API_BASELINE}s)")
      [ -n "$API_SLOW_SINCE" ] || API_SLOW_SINCE=$(date +%s)
      [ $(( $(date +%s) - API_SLOW_SINCE )) -lt $((GATE_API_ABORT_MINUTES * 60)) ] \
        || die "API latency stayed above 2× baseline for ${GATE_API_ABORT_MINUTES} min"
    else
      API_SLOW_SINCE=""
    fi
  fi

  [ "$(free_bytes)" -gt $((remaining_bytes * 2)) ] || die "disk: $(free_bytes) bytes free, need > 2 × $remaining_bytes"
  in_blackout && reasons+=("backup window $BLACKOUT_UTC UTC")

  local IFS=';'
  GATE_REASONS="${reasons[*]}"
}

wait_for_gate() {
  local remaining_bytes=$1 paused_at=""
  while true; do
    check_gate "$remaining_bytes"
    if [ -z "$GATE_REASONS" ]; then
      if [ -n "$paused_at" ]; then
        log "Resuming after $(( $(date +%s) - paused_at ))s"
      fi
      return
    fi
    if [ -z "$paused_at" ]; then
      paused_at=$(date +%s)
      PAUSES+=("$(date -u +%H:%M:%S) $GATE_REASONS")
    fi
    log "Paused: $GATE_REASONS — re-checking in ${GATE_POLL_SECONDS}s"
    sleep "$GATE_POLL_SECONDS"
  done
}

wait_for_gate "$TSV_BYTES"

MANIFEST_JSON=$(jq -c . "$MANIFEST")
psql_db -v id="$RELEASE_ID" -v fv="$FORMAT_VERSION" -v dump_date="$DUMP_DATE" -v source_sha="$SOURCE_SHA" \
  -v manifest="$MANIFEST_JSON" -v valid="$VALID_ROWS" -v gate="$GATE_ROWS" <<'SQL'
-- Timestamps are naive UTC (CLAUDE.md §3.4), hence AT TIME ZONE 'UTC'.
INSERT INTO lichess_catalogue_releases
  (id, "formatVersion", "lichessDumpDate", "sourceSha256", manifest, "validRows", "qualityGateRows", "loadStartedAt")
VALUES
  (:'id', :fv, :'dump_date'::date, :'source_sha', :'manifest'::jsonb, :valid, :gate, now() AT TIME ZONE 'UTC')
ON CONFLICT (id) DO NOTHING;
SQL

# ── 2. Staging ───────────────────────────────────────────────────────────────
COPY_COLUMNS=$(printf '"%s", ' $TSV_COLUMNS); COPY_COLUMNS=${COPY_COLUMNS%, }
log "Loading staging table …"
psql_db <<SQL
DROP TABLE IF EXISTS lichess_puzzles_staging;
CREATE UNLOGGED TABLE lichess_puzzles_staging (LIKE lichess_puzzles INCLUDING DEFAULTS);
ALTER TABLE lichess_puzzles_staging ALTER COLUMN "releaseId" SET DEFAULT '$RELEASE_ID';
SQL
zstd -dc "$CATALOGUE" | psql_db -c "COPY lichess_puzzles_staging ($COPY_COLUMNS) FROM STDIN"
psql_db <<'SQL'
SET maintenance_work_mem = '256MB';
SET max_parallel_maintenance_workers = 0;
CREATE INDEX ON lichess_puzzles_staging (id);
CREATE INDEX ON lichess_puzzles_staging ("ratingBand");
ANALYZE lichess_puzzles_staging;
SQL
STAGED=$(psql_db -c "SELECT count(*) FROM lichess_puzzles_staging")
[ "$STAGED" = "$VALID_ROWS" ] || die "staging holds $STAGED rows, the manifest says $VALID_ROWS"
log "Staged $STAGED rows"

# ── 3. Promote band by band ──────────────────────────────────────────────────
# Every column but id and releaseId is compared, so an identical row writes
# nothing (resume) and releaseId names the release that last CHANGED a row.
# retiredAt comes from staging as NULL, which un-retires a returning id.
DATA_COLUMNS=(fen moves rating ratingDeviation popularity nbPlays themes openingTags gameUrl ratingBand randKey contentHash passesQualityGate retiredAt)
SET_LIST=""; OLD_LIST=""; NEW_LIST=""
for c in "${DATA_COLUMNS[@]}" releaseId; do SET_LIST+="\"$c\" = EXCLUDED.\"$c\", "; done
for c in "${DATA_COLUMNS[@]}"; do OLD_LIST+="c.\"$c\", "; NEW_LIST+="EXCLUDED.\"$c\", "; done
SET_LIST=${SET_LIST%, }; OLD_LIST=${OLD_LIST%, }; NEW_LIST=${NEW_LIST%, }
ALL_COLUMNS="$COPY_COLUMNS, \"retiredAt\", \"releaseId\""

mapfile -t BANDS < <(psql_db -c 'SELECT DISTINCT "ratingBand" FROM lichess_puzzles_staging ORDER BY 1')
INSERTED=0; UPDATED=0; BAND_INDEX=0
for band in "${BANDS[@]}"; do
  remaining=$(( TSV_BYTES * (${#BANDS[@]} - BAND_INDEX) / ${#BANDS[@]} ))
  wait_for_gate "$remaining"
  result=$(psql_db <<SQL
SET synchronous_commit = off;
SET statement_timeout = 0;
SET lock_timeout = '5s';
WITH up AS (
  INSERT INTO lichess_puzzles AS c ($ALL_COLUMNS)
  SELECT $ALL_COLUMNS FROM lichess_puzzles_staging
  WHERE "ratingBand" = $band
  ORDER BY "randKey", id
  ON CONFLICT (id) DO UPDATE SET $SET_LIST
  WHERE ($OLD_LIST) IS DISTINCT FROM ($NEW_LIST)
  RETURNING (xmax = 0) AS inserted
)
SELECT count(*) FILTER (WHERE inserted) || ' ' || count(*) FILTER (WHERE NOT inserted) FROM up;
SQL
  )
  read -r band_inserted band_updated <<<"$result"
  INSERTED=$((INSERTED + band_inserted)); UPDATED=$((UPDATED + band_updated))
  BAND_INDEX=$((BAND_INDEX + 1))
  log "Band $band ($BAND_INDEX/${#BANDS[@]}): +$band_inserted new, $band_updated changed"
  sleep "$BAND_SLEEP_SECONDS"
done

# ── 4. Retire ids this release no longer contains ────────────────────────────
RETIRED=$(psql_db <<'SQL'
WITH r AS (
  UPDATE lichess_puzzles c
  SET "retiredAt" = now() AT TIME ZONE 'UTC', "passesQualityGate" = false
  WHERE c."retiredAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM lichess_puzzles_staging s WHERE s.id = c.id)
  RETURNING 1
)
SELECT count(*) FROM r;
SQL
)
log "Retired $RETIRED rows"

# ── 5. Vacuum ────────────────────────────────────────────────────────────────
log "VACUUM (FREEZE, ANALYZE) …"
psql_db <<'SQL'
SET maintenance_work_mem = '256MB';
VACUUM (FREEZE, ANALYZE, PARALLEL 0) lichess_puzzles;
SQL

# ── 6. Done ──────────────────────────────────────────────────────────────────
psql_db -v id="$RELEASE_ID" <<'SQL'
UPDATE lichess_catalogue_releases SET "loadCompletedAt" = now() AT TIME ZONE 'UTC' WHERE id = :'id';
DROP TABLE lichess_puzzles_staging;
SQL

DURATION=$(( $(date +%s) - STARTED_AT ))
UNCHANGED=$(( VALID_ROWS - INSERTED - UPDATED ))
log "Load complete: release $RELEASE_ID"
log "  rows      $VALID_ROWS staged — $INSERTED inserted, $UPDATED updated, $UNCHANGED unchanged, $RETIRED retired"
log "  duration  ${DURATION}s ($(( VALID_ROWS / (DURATION > 0 ? DURATION : 1) )) rows/s)"
if [ ${#PAUSES[@]} -eq 0 ]; then
  log "  pauses    none"
else
  for p in "${PAUSES[@]}"; do log "  pause     $p"; done
fi
